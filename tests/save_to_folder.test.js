const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// In-memory chrome.storage.local, enough for PinfoldStorage
let data = {};
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
globalThis.chrome = {
  runtime: { lastError: undefined },
  storage: {
    local: {
      get(keys, cb) {
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (data[k] !== undefined) out[k] = clone(data[k]); });
        setTimeout(() => cb(out), 0);
      },
      set(items, cb) { setTimeout(() => { Object.entries(items).forEach(([k, v]) => { data[k] = clone(v); }); cb && cb(); }, 0); },
      remove(keys, cb) { setTimeout(() => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete data[k]); cb && cb(); }, 0); }
    }
  }
};
const { PinfoldStorage, STORAGE_KEYS, defaultFolderName, sortFoldersByRecentUse } = require('../utils/storage.js');

const tab = (n) => ({ title: 'Tab ' + n, url: `https://example.com/${n}` });

// Loads the service worker's resolveSaveFolder against the real PinfoldStorage
function loadResolveSaveFolder() {
  const stubEvent = { addListener() {} };
  const sandbox = {
    console, URL, setTimeout, importScripts() {},
    PinfoldStorage, defaultFolderName,
    chrome: {
      runtime: { onInstalled: stubEvent, onStartup: stubEvent, onMessage: stubEvent, getURL: (p) => 'chrome-extension://id/' + p },
      contextMenus: { onClicked: stubEvent },
      commands: { onCommand: stubEvent },
      storage: { onChanged: stubEvent },
      tabs: { onCreated: stubEvent, onUpdated: stubEvent }
    }
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'background', 'service_worker.js'), 'utf8');
  vm.runInNewContext(src + '\n;globalThis.__fn = resolveSaveFolder;', sandbox);
  return sandbox.__fn;
}

test.beforeEach(() => { data = {}; });

test('saving into a folder files the tabs there and marks the folder as recently used', async () => {
  const work = await PinfoldStorage.addFolder('Work');
  const groups = await PinfoldStorage.addIndividualTabs([tab(1), tab(2)], { folderId: work.id });
  assert.ok(groups.every(g => g.folderId === work.id));
  const folders = await PinfoldStorage.getFolders();
  assert.ok(folders[0].lastUsedAt > 0);
});

test('recent folders put the last one saved into first, then newest created', async () => {
  const folders = [
    { id: 'a', title: 'A', createdAt: 100 },
    { id: 'b', title: 'B', createdAt: 300 },
    { id: 'c', title: 'C', createdAt: 200, lastUsedAt: 900 },
    { id: 'd', title: 'D', createdAt: 50 }
  ];
  assert.deepEqual(sortFoldersByRecentUse(folders).map(f => f.id), ['c', 'b', 'a', 'd']);
  data[STORAGE_KEYS.FOLDERS] = folders;
  assert.deepEqual((await PinfoldStorage.getRecentFolders(3)).map(f => f.id), ['c', 'b', 'a']);
});

test('assignGroupsToFolder moves only the given groups, in one write', async () => {
  const research = await PinfoldStorage.addFolder('Research');
  const saved = await PinfoldStorage.addIndividualTabs([tab(1), tab(2), tab(3)]);
  const moved = await PinfoldStorage.assignGroupsToFolder([saved[0].id, saved[2].id, 'missing'], research.id);
  assert.equal(moved, 2);
  const byId = Object.fromEntries((await PinfoldStorage.getGroups()).map(g => [g.id, g.folderId]));
  assert.equal(byId[saved[0].id], research.id);
  assert.equal(byId[saved[1].id], null);
  assert.equal(byId[saved[2].id], research.id);
  assert.equal(await PinfoldStorage.assignGroupsToFolder([], research.id), 0);
});

test('the last unfiled save is stored and cleared, including by Clear all data', async () => {
  await PinfoldStorage.setLastSave({ groupIds: ['x'], savedAt: 1 });
  assert.deepEqual(await PinfoldStorage.getLastSave(), { groupIds: ['x'], savedAt: 1 });
  await PinfoldStorage.clearLastSave();
  assert.equal(await PinfoldStorage.getLastSave(), null);
  await PinfoldStorage.setLastSave({ groupIds: ['x'], savedAt: 1 });
  await PinfoldStorage.clearAllData();
  assert.equal(await PinfoldStorage.getLastSave(), null);
});

test('default folder names include the date, and the time when asked', () => {
  const when = new Date(2026, 10, 4, 15, 10);
  assert.match(defaultFolderName('Tabs', false, when), /^Tabs · \S.*4/);
  assert.doesNotMatch(defaultFolderName('Tabs', false, when), /10/);
  assert.match(defaultFolderName('Window', true, when), /^Window · .*10/);
});

test('resolveSaveFolder: a new folder from the popup is created with the typed name', async () => {
  const resolve = loadResolveSaveFolder();
  const id = await resolve({ newFolderTitle: '  Trip planning  ' }, 'CURRENT_TAB', {});
  const folders = await PinfoldStorage.getFolders();
  assert.equal(folders.length, 1);
  assert.equal(folders[0].id, id);
  assert.equal(folders[0].title, 'Trip planning');
});

test('resolveSaveFolder: a picked folder is used only if it still exists', async () => {
  const resolve = loadResolveSaveFolder();
  const work = await PinfoldStorage.addFolder('Work');
  assert.equal(await resolve({ folderId: work.id }, 'ALL_IN_WINDOW', {}), work.id);
  assert.equal(await resolve({ folderId: 'deleted' }, 'ALL_IN_WINDOW', {}), null);
});

test('resolveSaveFolder: the setting makes only Collapse all go into a new folder', async () => {
  const resolve = loadResolveSaveFolder();
  const settings = { collapseAllIntoNewFolder: true };
  assert.equal(await resolve({}, 'CURRENT_TAB', settings), null);
  assert.equal(await resolve({}, 'TABS_TO_RIGHT', settings), null);
  const id = await resolve({}, 'ALL_IN_WINDOW', settings);
  const folders = await PinfoldStorage.getFolders();
  assert.equal(folders.length, 1);
  assert.equal(folders[0].id, id);
  assert.match(folders[0].title, /^Window · /);
  assert.equal(await resolve({}, 'ALL_IN_WINDOW', {}), null, 'off by default');
});

test('resolveSaveFolder: a folder picked in the popup wins over the setting', async () => {
  const resolve = loadResolveSaveFolder();
  const work = await PinfoldStorage.addFolder('Work');
  assert.equal(await resolve({ folderId: work.id }, 'ALL_IN_WINDOW', { collapseAllIntoNewFolder: true }), work.id);
  assert.equal((await PinfoldStorage.getFolders()).length, 1);
});
