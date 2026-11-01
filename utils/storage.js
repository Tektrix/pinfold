const DEFAULT_SETTINGS = {
  theme: 'system',
  keepTabOnRestore: false,
  restoreInNewWindow: false,
  pinnedTabsBehavior: 'ignore',
  excludedDomains: [
    'youtube.com',
    'spotify.com',
    'music.youtube.com',
    'meet.google.com',
    'zoom.us'
  ],
  autoOpenDashboardOnCollapse: true,
  confirmTabDelete: true,
  confirmGroupDelete: true,
  openOnNewTab: false,
  capturePreviews: false
};




const STORAGE_KEYS = {
  GROUPS: 'pinfold_groups',
  FOLDERS: 'pinfold_folders',
  SETTINGS: 'pinfold_settings'
};

// Keys used by pre-release builds. migrateLegacyStorage()
// moves them over once; keep this until no install could still have them.
const LEGACY_STORAGE_KEYS = {
  GROUPS: 'tabi_groups',
  FOLDERS: 'tabi_folders',
  SETTINGS: 'tabi_settings',
  STATS: 'tabi_stats'
};

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'pinfold_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// Serialises every read-modify-write of stored data. Web Locks are shared by the
// service worker and all extension pages, so two windows collapsing at once (or a
// collapse during "Delete all") can no longer overwrite each other's changes.
let localLockChain = Promise.resolve();
function withStorageLock(fn) {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request('pinfold-storage', fn);
  }
  const run = localLockChain.then(fn, fn);
  localLockChain = run.catch(() => {});
  return run;
}

const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:', 'chrome:', 'edge:', 'brave:'];

// Only these schemes may be saved, imported or reopened. Blocks javascript:, data:, blob: etc.
function isSafeTabUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    return SAFE_URL_PROTOCOLS.includes(new URL(url).protocol);
  } catch (e) {
    return false;
  }
}

function formatMemory(mb) {
  if (!mb || mb <= 0) return '0 MB';
  if (mb >= 1024) {
    return (mb / 1024).toFixed(1) + ' GB';
  }
  return Math.round(mb) + ' MB';
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function formatFullDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function storageGet(key, fallback) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (res) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(res[key] !== undefined ? res[key] : fallback);
    });
  });
}

function storageGetMany(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (res) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(res || {});
    });
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function buildStoredTab(t, now) {
  return {
    id: generateId(),
    title: t.title || t.url || 'Untitled Tab',
    url: t.url || '',
    previewImage: t.previewImage || '',
    pinned: !!t.pinned,
    createdAt: now
  };
}

const PinfoldStorage = {
  // Reads are lock-free. Every method that writes goes through withStorageLock and
  // re-reads inside the lock, so callers never write back a stale copy.
  async getGroups() {
    return storageGet(STORAGE_KEYS.GROUPS, []);
  },

  async saveGroups(groups) {
    return storageSet({ [STORAGE_KEYS.GROUPS]: groups });
  },

  async addIndividualTabs(rawTabs, options = {}) {
    if (!rawTabs || rawTabs.length === 0) return [];

    return withStorageLock(async () => {
      const now = Date.now();
      const newGroups = rawTabs.map((t, idx) => ({
        id: generateId(),
        title: '',
        createdAt: now - (idx * 10),
        locked: !!options.locked,
        starred: !!options.starred,
        tags: options.tags || [],
        folderId: options.folderId || null,
        windowId: options.windowId || null,
        tabs: [buildStoredTab(t, now)]
      }));

      const groups = await this.getGroups();
      await this.saveGroups([...newGroups, ...groups]);
      return newGroups;
    });
  },

  async updateGroup(groupId, updates) {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      const groupIdx = groups.findIndex(g => g.id === groupId);
      if (groupIdx === -1) return null;

      groups[groupIdx] = { ...groups[groupIdx], ...updates };
      await this.saveGroups(groups);
      return groups[groupIdx];
    });
  },

  async deleteGroup(groupId, force = false) {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      const group = groups.find(g => g.id === groupId);
      if (!group) return false;
      if (group.locked && !force) return false;

      await this.saveGroups(groups.filter(g => g.id !== groupId));
      return true;
    });
  },

  async deleteUnlockedGroups() {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      const locked = groups.filter(g => g.locked);
      await this.saveGroups(locked);
      return groups.length - locked.length;
    });
  },

  async removeTabFromGroup(groupId, tabId, force = false) {
    return this.removeTabsFromGroup(groupId, [tabId], force);
  },

  // Locked groups keep their tabs unless force is set.
  async removeTabsFromGroup(groupId, tabIds, force = false) {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      const group = groups.find(g => g.id === groupId);
      if (!group) return false;
      if (group.locked && !force) return false;

      group.tabs = (group.tabs || []).filter(t => !tabIds.includes(t.id));

      let updatedGroups = groups;
      if (group.tabs.length === 0 && !group.locked) {
        updatedGroups = groups.filter(g => g.id !== groupId);
      }

      await this.saveGroups(updatedGroups);
      return true;
    });
  },

  // Reconcile a bulk restore in one locked write; preserve locked groups and
  // tabs that the browser could not reopen.
  async removeRestoredTabs(tabIds) {
    if (!Array.isArray(tabIds) || tabIds.length === 0) return 0;
    return withStorageLock(async () => {
      const restoredIds = new Set(tabIds);
      const groups = await this.getGroups();
      const updatedGroups = [];
      let removedCount = 0;

      for (const group of groups) {
        if (group.locked || !Array.isArray(group.tabs)) {
          updatedGroups.push(group);
          continue;
        }
        const remaining = group.tabs.filter(tab => !restoredIds.has(tab.id));
        if (remaining.length === group.tabs.length) {
          updatedGroups.push(group);
          continue;
        }
        removedCount += group.tabs.length - remaining.length;
        if (remaining.length > 0) {
          updatedGroups.push({ ...group, tabs: remaining });
        }
      }

      if (removedCount > 0) await this.saveGroups(updatedGroups);
      return removedCount;
    });
  },

  async updateTabTitle(groupId, tabId, newTitle) {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      const group = groups.find(g => g.id === groupId);
      if (!group || !group.tabs) return false;

      const tab = group.tabs.find(t => t.id === tabId);
      if (!tab) return false;

      tab.title = newTitle;
      if (group.tabs.length === 1 && group.title) {
        group.title = newTitle;
      }

      await this.saveGroups(groups);
      return true;
    });
  },

  // Places the tab before (or after) anchorTabId. Anchoring on a tab id instead of a
  // list index keeps drops correct when the rendered list is filtered by a search.
  async moveTab(sourceGroupId, targetGroupId, tabId, anchorTabId = null, placeAfter = false) {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      const sourceGroup = groups.find(g => g.id === sourceGroupId);
      const targetGroup = groups.find(g => g.id === targetGroupId);
      if (!sourceGroup || !targetGroup) return false;
      if (tabId === anchorTabId) return false;

      const tabIndex = sourceGroup.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return false;

      const [tab] = sourceGroup.tabs.splice(tabIndex, 1);
      const anchorIndex = anchorTabId ? targetGroup.tabs.findIndex(t => t.id === anchorTabId) : -1;
      if (anchorIndex === -1) {
        targetGroup.tabs.push(tab);
      } else {
        targetGroup.tabs.splice(placeAfter ? anchorIndex + 1 : anchorIndex, 0, tab);
      }

      let updatedGroups = groups;
      if (sourceGroup !== targetGroup && sourceGroup.tabs.length === 0 && !sourceGroup.locked) {
        updatedGroups = groups.filter(g => g.id !== sourceGroupId);
      }

      await this.saveGroups(updatedGroups);
      return true;
    });
  },

  async importGroups(importedGroups, mode = 'merge') {
    return withStorageLock(async () => {
      if (mode === 'replace') {
        await this.saveGroups(importedGroups);
        return;
      }
      const current = await this.getGroups();
      await this.saveGroups([...importedGroups, ...current]);
    });
  },

  async clearPreviewImages() {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      let cleared = 0;
      groups.forEach(g => (g.tabs || []).forEach(t => {
        if (t.previewImage) {
          t.previewImage = '';
          cleared++;
        }
      }));
      if (cleared > 0) await this.saveGroups(groups);
      return cleared;
    });
  },

  async getSettings() {
    const stored = await storageGet(STORAGE_KEYS.SETTINGS, {});
    return { ...DEFAULT_SETTINGS, ...stored };
  },

  // Merges a partial patch into the stored settings, so pages holding an older copy of
  // the settings can't undo each other's changes.
  async updateSettings(patch) {
    return withStorageLock(async () => {
      const stored = await storageGet(STORAGE_KEYS.SETTINGS, {});
      const merged = { ...stored, ...patch };
      await storageSet({ [STORAGE_KEYS.SETTINGS]: merged });
      return { ...DEFAULT_SETTINGS, ...merged };
    });
  },

  async getFolders() {
    return storageGet(STORAGE_KEYS.FOLDERS, []);
  },

  async saveFolders(folders) {
    return storageSet({ [STORAGE_KEYS.FOLDERS]: folders });
  },

  async addFolder(title, parentId = null) {
    return withStorageLock(async () => {
      const newFolder = {
        id: generateId(),
        title: title || 'New Folder',
        parentId: parentId || null,
        collapsed: false,
        createdAt: Date.now()
      };

      const folders = await this.getFolders();
      folders.push(newFolder);
      await this.saveFolders(folders);
      return newFolder;
    });
  },

  async updateFolder(folderId, updates) {
    return withStorageLock(async () => {
      const folders = await this.getFolders();
      const idx = folders.findIndex(f => f.id === folderId);
      if (idx === -1) return null;

      folders[idx] = { ...folders[idx], ...updates };
      await this.saveFolders(folders);
      return folders[idx];
    });
  },

  // Removes the folder and all of its subfolders; groups anywhere inside move to root.
  async deleteFolder(folderId) {
    return withStorageLock(async () => {
      const folders = await this.getFolders();
      const removedIds = new Set([folderId]);
      let grew = true;
      while (grew) {
        grew = false;
        folders.forEach(f => {
          if (f.parentId && removedIds.has(f.parentId) && !removedIds.has(f.id)) {
            removedIds.add(f.id);
            grew = true;
          }
        });
      }
      await this.saveFolders(folders.filter(f => !removedIds.has(f.id)));

      const groups = await this.getGroups();
      let updated = false;
      groups.forEach(g => {
        if (g.folderId && removedIds.has(g.folderId)) {
          g.folderId = null;
          updated = true;
        }
      });
      if (updated) {
        await this.saveGroups(groups);
      }
      return true;
    });
  },

  async assignGroupToFolder(groupId, folderId) {
    return withStorageLock(async () => {
      const groups = await this.getGroups();
      const grp = groups.find(g => g.id === groupId);
      if (!grp) return false;
      grp.folderId = folderId || null;
      await this.saveGroups(groups);
      return true;
    });
  },

  async clearAllData() {
    return withStorageLock(() => storageRemove([STORAGE_KEYS.GROUPS, STORAGE_KEYS.FOLDERS]));
  },

  // Copies data saved under the legacy keys to the new keys, then removes the old
  // keys. Safe to call on every startup: it never overwrites data that already exists
  // under a new key, and in that case keeps the old key too so nothing is lost.
  async migrateLegacyStorage() {
    return withStorageLock(async () => {
      const legacyKeys = Object.values(LEGACY_STORAGE_KEYS);
      const legacy = await storageGetMany(legacyKeys);
      if (Object.keys(legacy).length === 0) return false;

      const current = await storageGetMany(Object.values(STORAGE_KEYS));
      const toCopy = {};
      const toRemove = [LEGACY_STORAGE_KEYS.STATS];
      ['GROUPS', 'FOLDERS', 'SETTINGS'].forEach(name => {
        const oldKey = LEGACY_STORAGE_KEYS[name];
        if (legacy[oldKey] === undefined) return;
        if (current[STORAGE_KEYS[name]] === undefined) {
          toCopy[STORAGE_KEYS[name]] = legacy[oldKey];
          toRemove.push(oldKey);
        }
        // If both exist, leave the old key alone rather than lose either copy.
      });

      if (Object.keys(toCopy).length > 0) {
        await storageSet(toCopy);
      }
      await storageRemove(toRemove);
      return Object.keys(toCopy).length > 0;
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PinfoldStorage, DEFAULT_SETTINGS, STORAGE_KEYS, generateId, isSafeTabUrl, formatMemory, formatTimeAgo, formatFullDate };
} else {
  globalThis.PinfoldStorage = PinfoldStorage;
  globalThis.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  globalThis.generateId = generateId;
  globalThis.isSafeTabUrl = isSafeTabUrl;
  globalThis.formatMemory = formatMemory;
  globalThis.formatTimeAgo = formatTimeAgo;
  globalThis.formatFullDate = formatFullDate;
}



