const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// In-memory chrome.storage.local whose callbacks fire asynchronously, like the real API,
// so interleaved read-modify-write sequences can actually race.
function installChromeMock() {
  let data = {};
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  globalThis.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach(k => {
            if (data[k] !== undefined) out[k] = clone(data[k]);
          });
          setTimeout(() => cb(out), Math.random() * 5);
        },
        set(items, cb) {
          setTimeout(() => {
            Object.entries(items).forEach(([k, v]) => { data[k] = clone(v); });
            cb && cb();
          }, Math.random() * 5);
        },
        remove(keys, cb) {
          setTimeout(() => {
            (Array.isArray(keys) ? keys : [keys]).forEach(k => delete data[k]);
            cb && cb();
          }, 0);
        }
      }
    }
  };
  return {
    dump: () => clone(data),
    load: (obj) => { data = clone(obj); }
  };
}

const store = installChromeMock();
const { PinfoldStorage, STORAGE_KEYS, isSafeTabUrl } = require('../utils/storage.js');

test.beforeEach(() => store.load({}));

test('concurrent collapses keep every saved tab', async () => {
  await Promise.all([
    PinfoldStorage.addIndividualTabs([{ url: 'https://a.com', title: 'A' }]),
    PinfoldStorage.addIndividualTabs([{ url: 'https://b.com', title: 'B' }]),
    PinfoldStorage.addIndividualTabs([{ url: 'https://c.com', title: 'C' }])
  ]);
  const groups = await PinfoldStorage.getGroups();
  assert.strictEqual(groups.length, 3);
});

test('deleteUnlockedGroups reads fresh storage and keeps locked groups', async () => {
  await PinfoldStorage.addIndividualTabs([{ url: 'https://old.com' }]);
  const groups = await PinfoldStorage.getGroups();
  await PinfoldStorage.updateGroup(groups[0].id, { locked: true });
  await PinfoldStorage.addIndividualTabs([{ url: 'https://unlocked.com' }]);

  await Promise.all([
    PinfoldStorage.deleteUnlockedGroups(),
    PinfoldStorage.addIndividualTabs([{ url: 'https://saved-during-dialog.com' }])
  ]);
  const urls = (await PinfoldStorage.getGroups()).map(g => g.tabs[0].url);
  assert.ok(urls.includes('https://old.com'), 'locked group kept');
  assert.ok(!urls.includes('https://unlocked.com'), 'unlocked group deleted');
});

test('updateSettings merges patches instead of overwriting other settings', async () => {
  await Promise.all([
    PinfoldStorage.updateSettings({ theme: 'light' }),
    PinfoldStorage.updateSettings({ excludedDomains: ['example.com'] })
  ]);
  const settings = await PinfoldStorage.getSettings();
  assert.strictEqual(settings.theme, 'light');
  assert.deepStrictEqual(settings.excludedDomains, ['example.com']);
  assert.strictEqual(settings.capturePreviews, false, 'previews are off by default');
});

test('new tabs store no memory figures or remote favicon URLs', async () => {
  await PinfoldStorage.addIndividualTabs([{ url: 'https://a.com', favIconUrl: 'https://tracker.example/x.png', memoryBytes: 123 }]);
  const tab = (await PinfoldStorage.getGroups())[0].tabs[0];
  assert.strictEqual(tab.favIconUrl, undefined);
  assert.strictEqual(tab.memoryBytes, undefined);
});

function seedGroup(tabUrls) {
  const group = {
    id: 'g1', title: 'G', createdAt: 1, locked: false, starred: false, tags: [],
    tabs: tabUrls.map((u, i) => ({ id: 't' + i, title: u, url: 'https://' + u, createdAt: 1 }))
  };
  store.load({ [STORAGE_KEYS.GROUPS]: [group] });
}

test('moveTab drops below a later row in the right place', async () => {
  seedGroup(['a', 'b', 'c', 'd']);
  await PinfoldStorage.moveTab('g1', 'g1', 't0', 't2', true); // drag A below C
  const order = (await PinfoldStorage.getGroups())[0].tabs.map(t => t.title);
  assert.deepStrictEqual(order, ['b', 'c', 'a', 'd']);
});

test('moveTab drops above an earlier row in the right place', async () => {
  seedGroup(['a', 'b', 'c', 'd']);
  await PinfoldStorage.moveTab('g1', 'g1', 't3', 't1', false); // drag D above B
  const order = (await PinfoldStorage.getGroups())[0].tabs.map(t => t.title);
  assert.deepStrictEqual(order, ['a', 'd', 'b', 'c']);
});

test('removeTabsFromGroup only removes the given tabs', async () => {
  seedGroup(['a', 'b', 'c']);
  await PinfoldStorage.removeTabsFromGroup('g1', ['t0', 't2']);
  const tabs = (await PinfoldStorage.getGroups())[0].tabs.map(t => t.title);
  assert.deepStrictEqual(tabs, ['b']);
});

test('removeRestoredTabs only deletes opened tabs from unlocked groups', async () => {
  store.load({
    [STORAGE_KEYS.GROUPS]: [
      { id: 'open', locked: false, tabs: [{ id: 'a' }, { id: 'b' }] },
      { id: 'locked', locked: true, tabs: [{ id: 'c' }] },
      { id: 'empty', locked: false, tabs: [] },
      { id: 'fully-restored', locked: false, tabs: [{ id: 'd' }] }
    ]
  });
  const removed = await PinfoldStorage.removeRestoredTabs(['a', 'c', 'd', 'unknown']);
  assert.strictEqual(removed, 2);
  const groups = await PinfoldStorage.getGroups();
  assert.deepStrictEqual(groups.map(g => g.id), ['open', 'locked', 'empty']);
  assert.deepStrictEqual(groups[0].tabs.map(t => t.id), ['b']);
  assert.deepStrictEqual(groups[1].tabs.map(t => t.id), ['c']);
});

test('removeRestoredTabs does not erase a newly saved tab during restore', async () => {
  seedGroup(['a', 'b']);
  await Promise.all([
    PinfoldStorage.addIndividualTabs([{ url: 'https://new.example', title: 'New' }]),
    PinfoldStorage.removeRestoredTabs(['t0'])
  ]);
  const groups = await PinfoldStorage.getGroups();
  assert.ok(groups.some(g => g.tabs.some(t => t.url === 'https://new.example')));
  assert.deepStrictEqual(groups.find(g => g.id === 'g1').tabs.map(t => t.id), ['t1']);
});

test('deleteFolder removes nested subfolders and moves their groups to root', async () => {
  store.load({
    [STORAGE_KEYS.FOLDERS]: [
      { id: 'f1', parentId: null }, { id: 'f2', parentId: 'f1' }, { id: 'f3', parentId: 'f2' }, { id: 'other', parentId: null }
    ],
    [STORAGE_KEYS.GROUPS]: [
      { id: 'g1', folderId: 'f3', tabs: [] }, { id: 'g2', folderId: 'other', tabs: [] }
    ]
  });
  await PinfoldStorage.deleteFolder('f1');
  const folders = (await PinfoldStorage.getFolders()).map(f => f.id);
  const groups = await PinfoldStorage.getGroups();
  assert.deepStrictEqual(folders, ['other']);
  assert.strictEqual(groups.find(g => g.id === 'g1').folderId, null);
  assert.strictEqual(groups.find(g => g.id === 'g2').folderId, 'other');
});

test('clearPreviewImages removes stored screenshots but keeps tabs', async () => {
  await PinfoldStorage.addIndividualTabs([{ url: 'https://a.com', previewImage: 'data:image/jpeg;base64,xx' }]);
  assert.strictEqual(await PinfoldStorage.clearPreviewImages(), 1);
  const tab = (await PinfoldStorage.getGroups())[0].tabs[0];
  assert.strictEqual(tab.previewImage, '');
  assert.strictEqual(tab.url, 'https://a.com');
});

test('isSafeTabUrl allows normal pages and blocks script/data URLs', () => {
  ['https://a.com', 'http://localhost:3000/x', 'chrome://settings', 'file:///C:/x.txt'].forEach(u =>
    assert.ok(isSafeTabUrl(u), u));
  ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'blob:https://a.com/1', 'not a url', '', null, 5].forEach(u =>
    assert.ok(!isSafeTabUrl(u), String(u)));
});

// The service worker registers chrome listeners at load, so run it in a sandbox with
// stub APIs and pull isDomainExcluded out of it.
function loadServiceWorkerFunction(name) {
  const stubEvent = { addListener() {} };
  const sandbox = {
    console,
    URL,
    setTimeout,
    importScripts() {},
    PinfoldStorage,
    isSafeTabUrl,
    chrome: {
      runtime: { onInstalled: stubEvent, onStartup: stubEvent, onMessage: stubEvent, getURL: (p) => 'chrome-extension://id/' + p },
      contextMenus: { onClicked: stubEvent },
      commands: { onCommand: stubEvent },
      storage: { onChanged: stubEvent },
      tabs: { onCreated: stubEvent, onUpdated: stubEvent }
    }
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'background', 'service_worker.js'), 'utf8');
  vm.runInNewContext(src + `\n;globalThis.__fn = ${name};`, sandbox);
  return sandbox.__fn;
}

test('excluded domains match the domain and its subdomains only', () => {
  const isDomainExcluded = loadServiceWorkerFunction('isDomainExcluded');
  const list = ['x.com', 'zoom.us', 'localhost:3000'];
  assert.ok(isDomainExcluded('https://x.com/home', list));
  assert.ok(isDomainExcluded('https://www.x.com/home', list));
  assert.ok(isDomainExcluded('https://us02web.zoom.us/j/1', list));
  assert.ok(isDomainExcluded('http://localhost:3000/', list));
  assert.ok(!isDomainExcluded('https://netflix.com', list), 'x.com must not match netflix.com');
  assert.ok(!isDomainExcluded('https://notzoom.us', list));
  assert.ok(!isDomainExcluded('http://localhost:8080/', list));
});

test('migrateLegacyStorage moves legacy data to the new keys once', async () => {
  const legacyGroups = [{ id: 'g1', tabs: [{ id: 't1', url: 'https://a.com' }] }];
  store.load({
    tabi_groups: legacyGroups,
    tabi_folders: [{ id: 'f1', parentId: null }],
    tabi_settings: { theme: 'light' },
    tabi_stats: { totalTabsCollapsed: 3 }
  });

  assert.strictEqual(await PinfoldStorage.migrateLegacyStorage(), true);
  const data = store.dump();
  assert.deepStrictEqual(data[STORAGE_KEYS.GROUPS], legacyGroups);
  assert.deepStrictEqual(data[STORAGE_KEYS.FOLDERS], [{ id: 'f1', parentId: null }]);
  assert.strictEqual((await PinfoldStorage.getSettings()).theme, 'light');
  ['tabi_groups', 'tabi_folders', 'tabi_settings', 'tabi_stats'].forEach(k => assert.strictEqual(data[k], undefined, k));

  assert.strictEqual(await PinfoldStorage.migrateLegacyStorage(), false, 'second run is a no-op');
});

test('migrateLegacyStorage never overwrites data already under the new keys', async () => {
  store.load({
    tabi_groups: [{ id: 'old', tabs: [] }],
    [STORAGE_KEYS.GROUPS]: [{ id: 'new', tabs: [] }]
  });
  assert.strictEqual(await PinfoldStorage.migrateLegacyStorage(), false);
  assert.deepStrictEqual((await PinfoldStorage.getGroups()).map(g => g.id), ['new']);
  assert.deepStrictEqual(store.dump().tabi_groups, [{ id: 'old', tabs: [] }], 'old copy kept, not lost');
});

test('locked groups keep their tabs unless removal is forced', async () => {
  seedGroup(['a', 'b']);
  await PinfoldStorage.updateGroup('g1', { locked: true });
  assert.strictEqual(await PinfoldStorage.removeTabFromGroup('g1', 't0'), false);
  assert.strictEqual((await PinfoldStorage.getGroups())[0].tabs.length, 2);
  assert.strictEqual(await PinfoldStorage.removeTabFromGroup('g1', 't0', true), true);
  assert.strictEqual((await PinfoldStorage.getGroups())[0].tabs.length, 1);
});
