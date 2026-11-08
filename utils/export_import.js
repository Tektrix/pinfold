const ExportImport = {
  _pluralize(count, singular, plural = singular + 's') {
    const fn = typeof pluralize === 'function'
      ? pluralize
      : require('./storage.js').pluralize;
    return fn(count, singular, plural);
  },

  MAX_IMPORT_CHARS: 20 * 1024 * 1024,
  MAX_IMPORT_TABS: 100000,
  MAX_TITLE_LENGTH: 1000,
  MAX_URL_LENGTH: 8192,
  MAX_TAGS: 50,
  MAX_TAG_LENGTH: 100,

  exportToJSON(groups) {
    const payload = {
      app: 'Pinfold',
      version: 1,
      exportedAt: new Date().toISOString(),
      groupCount: groups.length,
      tabCount: groups.reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0),
      // Explicit field lists: stored tabs may carry previewImage screenshots that must not leak into backups
      groups: groups.map(g => ({
        id: g.id,
        title: g.title,
        createdAt: g.createdAt,
        locked: !!g.locked,
        starred: !!g.starred,
        tags: Array.isArray(g.tags) ? g.tags : [],
        tabs: (g.tabs || []).map(t => ({
          id: t.id,
          title: t.title,
          url: t.url,
          pinned: !!t.pinned,
          createdAt: t.createdAt
        }))
      }))
    };
    return JSON.stringify(payload, null, 2);
  },

  exportToMarkdown(groups) {
    let md = `# Pinfold Saved Tabs Export\n*Exported on ${new Date().toLocaleString()}*\n\n`;

    groups.forEach((group) => {
      // "Untitled" is what the importer turns back into an empty title, so a round trip
      // restores the group's unset name instead of baking in a number.
      const groupName = group.title ? String(group.title).replace(/[\r\n]+/g, ' ') : 'Untitled';
      const dateStr = new Date(group.createdAt).toLocaleDateString();
      const tabCount = group.tabs ? group.tabs.length : 0;

      md += `## ${groupName} (${tabCount} ${this._pluralize(tabCount, 'tab')}) - ${dateStr}\n`;
      if (group.tags && group.tags.length > 0) {
        md += `*Tags: ${group.tags.map(t => `#${t}`).join(', ')}*\n`;
      }
      md += `\n`;

      (group.tabs || []).forEach((tab) => {
        const title = String(tab.title || 'Untitled Tab').replace(/[\[\]]/g, '').replace(/[\r\n]+/g, ' ');
        const url = String(tab.url || '#').replace(/\(/g, '%28').replace(/\)/g, '%29');
        md += `- [${title}](${url})\n`;
      });

      md += `\n---\n\n`;
    });

    return md.trim();
  },

  exportToOneTabFormat(groups) {
    const groupBlocks = groups.map((group) => {
      const lines = (group.tabs || []).map((tab) => {
        const title = tab.title ? ` | ${String(tab.title).replace(/[\r\n]+/g, ' ')}` : '';
        return `${tab.url}${title}`;
      });
      return lines.join('\n');
    });

    return groupBlocks.filter(b => b.trim().length > 0).join('\n\n');
  },

  parseImport(rawContent) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      throw new Error('Import content cannot be empty.');
    }
    if (rawContent.length > this.MAX_IMPORT_CHARS) {
      throw new Error('Import content is too large (maximum 20 MB).');
    }

    const result = this._parseByFormat(rawContent.trim());
    // An import that yields nothing must never reach storage: in Replace mode it would
    // wipe every saved tab.
    if (result.totalTabs === 0) {
      throw new Error('No valid tabs were found to import. Nothing was changed.');
    }
    return result;
  },

  _parseByFormat(trimmed) {
    // Text that starts like JSON is only ever read as JSON. A cut-off or unrelated JSON
    // file used to fall through to the text parser and import junk "tabs".
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {
        throw new Error('This looks like a JSON backup, but it could not be read. It may be incomplete or damaged. Nothing was changed.');
      }
      if (parsed && (parsed.app === 'Tabi' || parsed.app === 'Pinfold') && Array.isArray(parsed.groups)) {
        const groups = this._sanitizeImportedGroups(parsed.groups);
        return { groups, format: 'pinfold_json', totalTabs: this._countTabs(groups) };
      }
      if (Array.isArray(parsed)) {
        const groups = this._sanitizeImportedGroups(parsed);
        return { groups, format: 'json_array', totalTabs: this._countTabs(groups) };
      }
      throw new Error('This JSON is not a Pinfold backup. Nothing was changed.');
    }

    if (trimmed.includes('## ') || (trimmed.includes('- [') && trimmed.includes(']('))) {
      const mdGroups = this._parseMarkdown(trimmed);
      if (mdGroups.length > 0) {
        return {
          groups: mdGroups,
          format: 'markdown',
          totalTabs: this._countTabs(mdGroups)
        };
      }
    }

    const textGroups = this._parseOneTabText(trimmed);
    return {
      groups: textGroups,
      format: 'onetab_text',
      totalTabs: this._countTabs(textGroups)
    };
  },

  _newId(prefix) {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (c && typeof c.randomUUID === 'function') {
      return prefix + c.randomUUID();
    }
    return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 11);
  },

  _isSafeUrl(url) {
    if (!this._safeUrlFn) {
      this._safeUrlFn = typeof isSafeTabUrl === 'function' ? isSafeTabUrl : require('./storage.js').isSafeTabUrl;
    }
    return this._safeUrlFn(url);
  },

  _cleanTitle(value) {
    let s = '';
    if (typeof value === 'string') s = value;
    else if (typeof value === 'number' && Number.isFinite(value)) s = String(value);
    return s.trim().slice(0, this.MAX_TITLE_LENGTH);
  },

  _cleanUrl(value) {
    if (typeof value !== 'string') return null;
    const url = value.trim();
    if (!url || url.length > this.MAX_URL_LENGTH || !this._isSafeUrl(url)) return null;
    return url;
  },

  _cleanTimestamp(value) {
    return (typeof value === 'number' && Number.isFinite(value)) ? value : Date.now();
  },

  _cleanTags(value) {
    if (!Array.isArray(value)) return ['imported'];
    return value
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().slice(0, this.MAX_TAG_LENGTH))
      .slice(0, this.MAX_TAGS);
  },

  // Every tab from every format passes through here; returns null for tabs that must be dropped
  _buildTab(title, url, pinned, createdAt) {
    const cleanUrl = this._cleanUrl(url);
    if (!cleanUrl) return null;
    return {
      id: this._newId('tab_'),
      title: this._cleanTitle(title) || cleanUrl.slice(0, this.MAX_TITLE_LENGTH),
      url: cleanUrl,
      pinned: pinned === true,
      createdAt: this._cleanTimestamp(createdAt)
    };
  },

  _buildGroup(title, fallbackTitle, extra) {
    return {
      id: this._newId('import_'),
      title: this._cleanTitle(title) || fallbackTitle,
      createdAt: this._cleanTimestamp(extra && extra.createdAt),
      locked: !!(extra && extra.locked === true),
      starred: !!(extra && extra.starred === true),
      tags: extra && 'tags' in extra ? this._cleanTags(extra.tags) : ['imported'],
      tabs: []
    };
  },

  _checkTabLimit(count) {
    if (count > this.MAX_IMPORT_TABS) {
      throw new Error(`Import contains too many tabs (maximum ${this.MAX_IMPORT_TABS}).`);
    }
  },

  _extractMarkdownLink(line) {
    const m = line.match(/^[-*]\s*\[([^\]]*)\]\(/);
    if (!m) return null;
    let depth = 0;
    let end = -1;
    for (let i = m[0].length; i < line.length; i++) {
      const ch = line[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) { end = i; break; }
        depth--;
      }
    }
    if (end === -1) return null;
    const url = line.slice(m[0].length, end).trim().replace(/%28/gi, '(').replace(/%29/gi, ')');
    return { title: m[1].trim(), url };
  },

  _parseTagsLine(line) {
    const m = line.match(/^\*Tags:\s*(.*)\*$/);
    if (!m) return null;
    const tags = m[1].split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(t => t.length > 0);
    return tags.length > 0 ? this._cleanTags(tags) : null;
  },

  _parseMarkdown(mdText) {
    const groups = [];
    const lines = mdText.split(/\r?\n/);
    let currentGroup = null;
    let tabCount = 0;

    const finalizeGroup = () => {
      if (currentGroup && currentGroup.tabs.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = null;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
        finalizeGroup();
        const headerText = trimmed.replace(/^#+\s*/, '').replace(/\s*\(\d+\s*tabs?\).*$/i, '').trim();
        // Exports write "Untitled" for a group whose name was never set; keep that group
        // untitled rather than naming it after the placeholder.
        currentGroup = headerText === 'Untitled'
          ? this._buildGroup('', '')
          : this._buildGroup(headerText, 'Imported Group');
        return;
      }

      if (currentGroup) {
        const tags = this._parseTagsLine(trimmed);
        if (tags) {
          currentGroup.tags = tags;
          return;
        }
      }

      const link = this._extractMarkdownLink(trimmed);
      if (link) {
        const tab = this._buildTab(link.title, link.url);
        if (!tab) return;
        this._checkTabLimit(++tabCount);
        if (!currentGroup) {
          currentGroup = this._buildGroup('Imported Markdown Tabs', 'Imported Markdown Tabs');
        }
        currentGroup.tabs.push(tab);
      }
    });

    finalizeGroup();
    return groups;
  },

  _parseOneTabText(text) {
    const blocks = text.split(/\n\s*\n+/);
    const groups = [];
    let tabCount = 0;

    blocks.forEach((block, bIdx) => {
      const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) return;

      const tabs = [];
      lines.forEach((line) => {
        let url = '';
        let title = '';

        // OneTab writes "URL | Title"; split on the first " | " so URLs containing '|' survive
        const sep = line.indexOf(' | ');
        if (sep !== -1) {
          url = line.slice(0, sep).trim();
          title = line.slice(sep + 3).trim();
        } else if (!/\s/.test(line) && this._isSafeUrl(line)) {
          url = line;
        } else if (line.includes('|')) {
          const pipe = line.indexOf('|');
          url = line.slice(0, pipe).trim();
          title = line.slice(pipe + 1).trim();
        } else {
          const urlMatch = line.match(/([a-z][a-z0-9+.-]*:\/\/\S+)/i);
          if (urlMatch) {
            url = urlMatch[1];
            title = line.replace(url, '').trim();
          }
        }

        const tab = this._buildTab(title, url);
        if (tab) {
          this._checkTabLimit(++tabCount);
          tabs.push(tab);
        }
      });

      if (tabs.length > 0) {
        const group = this._buildGroup(blocks.length > 1 ? `Imported Group ${bIdx + 1}` : 'Imported Tabs', 'Imported Tabs');
        group.tabs = tabs;
        groups.push(group);
      }
    });

    return groups;
  },

  _sanitizeImportedGroups(groups) {
    const result = [];
    let tabCount = 0;
    groups.forEach((g) => {
      if (!g || typeof g !== 'object' || !Array.isArray(g.tabs)) return;
      // Groups saved from the browser have no title; the dashboard names them after
      // their tab, so keep them untitled instead of baking in "Imported Group N".
      const group = this._buildGroup(g.title, '', g);
      g.tabs.forEach((t) => {
        if (!t || typeof t !== 'object') return;
        const tab = this._buildTab(t.title, t.url, t.pinned, t.createdAt);
        if (!tab) return;
        this._checkTabLimit(++tabCount);
        group.tabs.push(tab);
      });
      if (group.tabs.length > 0) result.push(group);
    });
    return result;
  },

  _countTabs(groups) {
    return groups.reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0);
  },

  downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExportImport };
} else {
  globalThis.ExportImport = ExportImport;
}
