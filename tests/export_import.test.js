const test = require('node:test');
const assert = require('node:assert');
const { ExportImport } = require('../utils/export_import.js');

const backup = (groups, app = 'Pinfold') => JSON.stringify({ app, version: 1, groups });

const sampleGroups = () => [
  {
    id: 'grp_1', title: 'Docs', createdAt: 1720000000000, locked: true, starred: true,
    tags: ['react'], folderId: 'f1', secret: 'x',
    tabs: [
      {
        id: 't1', title: 'React', url: 'https://react.dev/blog', pinned: true, createdAt: 1720000000000,
        favIconUrl: 'https://evil.example/fav.png', previewImage: 'data:image/jpeg;base64,AAAA', memoryBytes: 123456
      },
      { id: 't2', title: 'Wiki', url: 'https://en.wikipedia.org/wiki/Foo_(bar)', pinned: false, createdAt: 1720000000000 }
    ]
  },
  {
    id: 'grp_2', title: 'Pipes', createdAt: 1720000100000, tags: [],
    tabs: [{ id: 't3', title: 'Pipe URL', url: 'https://example.com/a|b?q=1|2', createdAt: 1720000100000 }]
  }
];

const allTabs = (groups) => groups.flatMap(g => g.tabs);

test('malicious ids are replaced with fresh ids', () => {
  const evil = 'x"></div><iframe src=javascript:alert(1)>';
  const res = ExportImport.parseImport(backup([{ id: evil, title: 'G', tabs: [{ id: evil, title: 'T', url: 'https://a.com' }] }]));
  assert.strictEqual(res.groups.length, 1);
  assert.notStrictEqual(res.groups[0].id, evil);
  assert.notStrictEqual(res.groups[0].tabs[0].id, evil);
  assert.match(res.groups[0].id, /^[\w-]+$/);
  assert.match(res.groups[0].tabs[0].id, /^[\w-]+$/);
});

test('duplicate ids become unique', () => {
  const g = { id: 'same', title: 'G', tabs: [{ id: 'dup', url: 'https://a.com' }, { id: 'dup', url: 'https://b.com' }] };
  const res = ExportImport.parseImport(backup([g, { ...g }]));
  const groupIds = res.groups.map(x => x.id);
  const tabIds = allTabs(res.groups).map(t => t.id);
  assert.strictEqual(new Set(groupIds).size, 2);
  assert.strictEqual(new Set(tabIds).size, 4);
});

test('dangerous URL schemes are dropped from JSON imports', () => {
  const res = ExportImport.parseImport(backup([
    {
      title: 'Mixed', tabs: [
        { title: 'ok', url: 'https://ok.com' },
        { title: 'js', url: 'javascript:alert(1)' },
        { title: 'data', url: 'data:text/html,<script>alert(1)</script>' },
        { title: 'blob', url: 'blob:https://x.com/123' },
        { title: 'junk', url: 'not a url' }
      ]
    },
    { title: 'AllBad', tabs: [{ url: 'JavaScript:alert(1)' }] }
  ]));
  assert.strictEqual(res.groups.length, 1, 'group with only bad URLs is dropped');
  assert.deepStrictEqual(allTabs(res.groups).map(t => t.url), ['https://ok.com']);
  assert.strictEqual(res.totalTabs, 1);
});

test('dangerous URL schemes are dropped from Markdown imports', () => {
  const md = '## Group (3 tabs)\n\n- [ok](https://ok.com)\n- [js](javascript:alert(1))\n- [data](data:text/html,hi)\n- [blob](blob:https://x.com/1)';
  const res = ExportImport.parseImport(md);
  assert.strictEqual(res.format, 'markdown');
  assert.deepStrictEqual(allTabs(res.groups).map(t => t.url), ['https://ok.com']);
});

test('dangerous URL schemes are dropped from OneTab imports', () => {
  const text = 'https://ok.com | OK\njavascript:alert(1) | JS\ndata:text/html,hi | Data\nblob:https://x.com/1 | Blob\n\njavascript:alert(2) | only bad';
  const res = ExportImport.parseImport(text);
  assert.strictEqual(res.format, 'onetab_text');
  assert.strictEqual(res.groups.length, 1);
  assert.deepStrictEqual(allTabs(res.groups).map(t => t.url), ['https://ok.com']);
});

test('non-string fields are coerced or dropped without throwing', () => {
  const res = ExportImport.parseImport(backup([
    {
      title: { evil: true }, createdAt: 'yesterday', locked: 'false', starred: 1, tags: ['ok', 5, null, { a: 1 }],
      tabs: [
        { title: 12345, url: 'https://num-title.com', createdAt: NaN },
        { title: ['arr'], url: 'https://arr-title.com' },
        { title: 'obj url', url: { href: 'https://x.com' } },
        { title: 'num url', url: 42 },
        null,
        'string-tab'
      ]
    },
    null,
    { title: 'no tabs' }
  ]));
  assert.strictEqual(res.groups.length, 1);
  const g = res.groups[0];
  assert.strictEqual(typeof g.title, 'string');
  assert.ok(Number.isFinite(g.createdAt));
  assert.strictEqual(g.locked, false);
  assert.strictEqual(g.starred, false);
  assert.deepStrictEqual(g.tags, ['ok']);
  assert.strictEqual(g.tabs.length, 2);
  assert.strictEqual(g.tabs[0].title, '12345');
  assert.strictEqual(g.tabs[1].title, 'https://arr-title.com');
  g.tabs.forEach(t => {
    assert.strictEqual(typeof t.title, 'string');
    assert.strictEqual(typeof t.url, 'string');
    assert.ok(Number.isFinite(t.createdAt));
  });
});

test('long titles are capped and overlong URLs dropped', () => {
  const res = ExportImport.parseImport(backup([{
    title: 'G', tabs: [
      { title: 'a'.repeat(5000), url: 'https://ok.com' },
      { title: 'long', url: 'https://x.com/' + 'a'.repeat(9000) }
    ]
  }]));
  assert.strictEqual(res.totalTabs, 1);
  assert.strictEqual(res.groups[0].tabs[0].title.length, 1000);
});

test('previewImage, memoryBytes and favIconUrl are not exported', () => {
  const json = ExportImport.exportToJSON(sampleGroups());
  assert.ok(!json.includes('previewImage'));
  assert.ok(!json.includes('memoryBytes'));
  assert.ok(!json.includes('favIconUrl'));
  assert.ok(!json.includes('secret'));
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.app, 'Pinfold');
  assert.deepStrictEqual(Object.keys(parsed.groups[0]).sort(), ['createdAt', 'id', 'locked', 'starred', 'tabs', 'tags', 'title']);
  assert.deepStrictEqual(Object.keys(parsed.groups[0].tabs[0]).sort(), ['createdAt', 'id', 'pinned', 'title', 'url']);
});

test('previewImage, memoryBytes and favIconUrl are not imported', () => {
  const res = ExportImport.parseImport(backup(sampleGroups()));
  allTabs(res.groups).forEach(t => {
    assert.ok(!('previewImage' in t));
    assert.ok(!('memoryBytes' in t));
    assert.ok(!('favIconUrl' in t));
  });
});

test('JSON export -> import round trip keeps titles, urls and flags', () => {
  const src = sampleGroups();
  const res = ExportImport.parseImport(ExportImport.exportToJSON(src));
  assert.strictEqual(res.format, 'pinfold_json');
  assert.deepStrictEqual(res.groups.map(g => g.title), src.map(g => g.title));
  assert.deepStrictEqual(allTabs(res.groups).map(t => [t.title, t.url]), allTabs(src).map(t => [t.title, t.url]));
  assert.strictEqual(res.groups[0].locked, true);
  assert.strictEqual(res.groups[0].starred, true);
  assert.strictEqual(res.groups[0].tabs[0].pinned, true);
  assert.strictEqual(res.groups[0].createdAt, 1720000000000);
});

test('untitled groups stay untitled after a JSON round trip', () => {
  const src = [
    { id: 'g1', title: '', tabs: [{ id: 't1', title: 'React', url: 'https://react.dev/' }] },
    { id: 'g2', tabs: [{ id: 't2', title: 'Wiki', url: 'https://en.wikipedia.org/' }] }
  ];
  const res = ExportImport.parseImport(ExportImport.exportToJSON(src));
  assert.deepStrictEqual(res.groups.map(g => g.title), ['', '']);
});

test('Pinfold-branded backups are accepted', () => {
  const res = ExportImport.parseImport(backup([{ title: 'G', tabs: [{ url: 'https://a.com' }] }], 'Pinfold'));
  assert.strictEqual(res.format, 'pinfold_json');
  assert.strictEqual(res.totalTabs, 1);
});

test('Markdown URL with parentheses round-trips', () => {
  const md = ExportImport.exportToMarkdown(sampleGroups());
  assert.ok(md.includes('(https://en.wikipedia.org/wiki/Foo_%28bar%29)'));
  const res = ExportImport.parseImport(md);
  assert.ok(allTabs(res.groups).some(t => t.url === 'https://en.wikipedia.org/wiki/Foo_(bar)' && t.title === 'Wiki'));
});

test('Markdown export -> import round trip preserves group titles with singular and plural tab counts', () => {
  const src = [
    {
      id: 'grp_research',
      title: 'Research',
      createdAt: 1720000000000,
      tabs: [
        { id: 't1', title: 'Google', url: 'https://www.google.com/' }
      ]
    },
    {
      id: 'grp_development',
      title: 'Development',
      createdAt: 1720000100000,
      tabs: [
        { id: 't2', title: 'Github', url: 'https://github.com' },
        { id: 't3', title: 'x', url: 'https://x.com' }
      ]
    }
  ];
  const markdown = ExportImport.exportToMarkdown(src);
  assert.match(markdown, /## Research \(1 tab\)/);
  assert.match(markdown, /## Development \(2 tabs\)/);

  const res = ExportImport.parseImport(markdown);
  assert.strictEqual(res.format, 'markdown');
  assert.deepStrictEqual(
    res.groups.map(group => group.title),
    ['Research', 'Development']
  );
  res.groups.forEach(group => {
    assert.doesNotMatch(group.title, /\(\d+\s+tabs?\)/i);
  });
});

test('Markdown parser handles raw balanced parentheses', () => {
  const res = ExportImport.parseImport('- [Wiki](https://en.wikipedia.org/wiki/Foo_(bar))');
  assert.strictEqual(res.groups[0].tabs[0].url, 'https://en.wikipedia.org/wiki/Foo_(bar)');
});

test('OneTab URL containing | round-trips', () => {
  const text = ExportImport.exportToOneTabFormat(sampleGroups());
  const res = ExportImport.parseImport(text);
  const tab = allTabs(res.groups).find(t => t.title === 'Pipe URL');
  assert.ok(tab);
  assert.strictEqual(tab.url, 'https://example.com/a|b?q=1|2');
});

test('OneTab bare URL with | and no title is kept whole', () => {
  const res = ExportImport.parseImport('https://example.com/a|b');
  assert.strictEqual(res.groups[0].tabs[0].url, 'https://example.com/a|b');
});

test('oversized input is rejected', () => {
  const huge = 'https://a.com\n'.repeat(Math.ceil((20 * 1024 * 1024 + 10) / 14));
  assert.throws(() => ExportImport.parseImport(huge), /too large/);
});

test('too many tabs is rejected', () => {
  const tabs = Array.from({ length: 100001 }, (_, i) => ({ url: 'https://a.com/' + i }));
  assert.throws(() => ExportImport.parseImport(backup([{ title: 'G', tabs }])), /too many tabs/);
});

test('empty and non-string input is rejected', () => {
  assert.throws(() => ExportImport.parseImport('   '), /empty/);
  assert.throws(() => ExportImport.parseImport(null), /empty/);
});

test('pre-release backups still import', () => {
  const res = ExportImport.parseImport(backup([{ title: 'Old', tabs: [{ url: 'https://old.example' }] }], 'Tabi'));
  assert.strictEqual(res.format, 'pinfold_json');
  assert.strictEqual(res.totalTabs, 1);
  assert.strictEqual(res.groups[0].tabs[0].url, 'https://old.example');
});

test('imports with no valid tabs are rejected instead of returning an empty result', () => {
  assert.throws(() => ExportImport.parseImport('hello world, no links here'), /No valid tabs/);
  assert.throws(() => ExportImport.parseImport('javascript:alert(1)\ndata:text/html,hi'), /No valid tabs/);
  assert.throws(() => ExportImport.parseImport(backup([{ title: 'G', tabs: [{ url: 'javascript:alert(1)' }] }])), /No valid tabs/);
});

test('a cut-off JSON backup is rejected, not read as text', () => {
  const full = backup([{ title: 'G', tabs: [{ url: 'https://react.dev/blog', title: 'Blog' }, { url: 'https://a.example' }] }]);
  const truncated = full.slice(0, full.indexOf('https://a.example'));
  assert.throws(() => ExportImport.parseImport(truncated), /could not be read/);
});

test('JSON that is not a Pinfold backup is rejected', () => {
  assert.throws(() => ExportImport.parseImport('{"bookmarks": ["https://example.com"]}'), /not a Pinfold backup/);
});

test('Markdown export -> import keeps tags and leaves untitled groups untitled', () => {
  const src = [
    {
      id: 'grp_tagged', title: 'Reading', createdAt: 1720000000000, tags: ['work', 'reading'],
      tabs: [{ id: 't1', title: 'Example', url: 'https://example.com/' }]
    },
    {
      id: 'grp_untitled', title: '', createdAt: 1720000100000, tags: [],
      tabs: [{ id: 't2', title: 'Wiki', url: 'https://en.wikipedia.org/' }]
    }
  ];
  const markdown = ExportImport.exportToMarkdown(src);
  assert.match(markdown, /## Untitled \(1 tab\)/);
  assert.match(markdown, /\*Tags: #work, #reading\*/);

  const res = ExportImport.parseImport(markdown);
  assert.strictEqual(res.format, 'markdown');
  assert.deepStrictEqual(res.groups.map(g => g.title), ['Reading', '']);
  assert.deepStrictEqual(res.groups[0].tags, ['work', 'reading']);
  assert.strictEqual(res.totalTabs, 2);
});

test('Markdown exports written before the Untitled heading still import', () => {
  const md = '## Tab Group 1 (1 tab) - 11/8/2026\n\n- [Example](https://example.com/)';
  const res = ExportImport.parseImport(md);
  assert.deepStrictEqual(res.groups.map(g => g.title), ['Tab Group 1']);
});
