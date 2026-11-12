const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DASHBOARD = 'chrome-extension://id/dashboard/dashboard.html';

// Runs the service worker with stub chrome APIs over the given open tabs and
// returns canSleepTab / sleepOtherTabs plus a log of the discard calls it made.
function loadSleepTabs(openTabs, failingIds = [], notDiscardedIds = []) {
  const stubEvent = { addListener() {} };
  const calls = [];
  const sandbox = {
    console,
    URL,
    setTimeout,
    importScripts() {},
    chrome: {
      runtime: { onInstalled: stubEvent, onStartup: stubEvent, onMessage: stubEvent, getURL: (p) => 'chrome-extension://id/' + p },
      contextMenus: { onClicked: stubEvent },
      commands: { onCommand: stubEvent },
      storage: { onChanged: stubEvent },
      windows: { async update() {} },
      tabs: {
        onCreated: stubEvent,
        onUpdated: stubEvent,
        async query(q) {
          if (q.currentWindow) return openTabs.filter(t => t.windowId === 1);
          return openTabs.filter(t => q.windowId === undefined || t.windowId === q.windowId);
        },
        async discard(id) {
          calls.push(id);
          if (failingIds.includes(id)) throw new Error('cannot discard');
          return { id, discarded: !notDiscardedIds.includes(id) };
        },
        async update() {},
        async create(props) { return { id: 99, ...props }; }
      }
    }
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'background', 'service_worker.js'), 'utf8');
  vm.runInNewContext(src + '\n;globalThis.__canSleepTab = canSleepTab; globalThis.__sleepOtherTabs = sleepOtherTabs;', sandbox);
  return { canSleepTab: sandbox.__canSleepTab, sleepOtherTabs: sandbox.__sleepOtherTabs, calls };
}

const tab = (extra = {}) => ({ id: 1, windowId: 1, url: 'https://example.com/', ...extra });

test('canSleepTab accepts a normal https tab', () => {
  const { canSleepTab } = loadSleepTabs([]);
  assert.equal(canSleepTab(tab()), true);
  assert.equal(canSleepTab(tab({ url: 'http://example.com/' })), true);
  assert.equal(canSleepTab(tab({ url: 'file:///tmp/page.html' })), true);
});

test('canSleepTab rejects tabs Chrome needs awake', () => {
  const { canSleepTab } = loadSleepTabs([]);
  assert.equal(canSleepTab(tab({ active: true })), false);
  assert.equal(canSleepTab(tab({ discarded: true })), false);
  assert.equal(canSleepTab(tab({ pinned: true })), false);
  assert.equal(canSleepTab(tab({ audible: true })), false);
  assert.equal(canSleepTab(tab({ autoDiscardable: false })), false);
  assert.equal(canSleepTab(tab({ incognito: true })), false);
});

test('canSleepTab rejects non-web pages, including the dashboard', () => {
  const { canSleepTab } = loadSleepTabs([]);
  assert.equal(canSleepTab(tab({ url: 'chrome://settings' })), false);
  assert.equal(canSleepTab(tab({ url: DASHBOARD })), false);
  assert.equal(canSleepTab(tab({ url: '' })), false);
});

test('sleepOtherTabs discards exactly the eligible tabs', async () => {
  const tabs = [
    tab({ id: 1, active: true }),
    tab({ id: 2, pinned: true }),
    tab({ id: 3 }),
    tab({ id: 4 }),
    tab({ id: 5 })
  ];
  const { sleepOtherTabs, calls } = loadSleepTabs(tabs);
  const result = await sleepOtherTabs(1);
  assert.deepEqual(calls, [3, 4, 5]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { sleptCount: 3 });
});

test('sleepOtherTabs keeps going when one discard fails', async () => {
  const tabs = [tab({ id: 3 }), tab({ id: 4 }), tab({ id: 5 })];
  const { sleepOtherTabs, calls } = loadSleepTabs(tabs, [4]);
  const result = await sleepOtherTabs(1);
  assert.deepEqual(calls, [3, 4, 5]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { sleptCount: 2 });
});

test('sleepOtherTabs without a window id stays in the current window', async () => {
  const tabs = [
    tab({ id: 3, windowId: 1 }),
    tab({ id: 4, windowId: 2 }),
    tab({ id: 5, windowId: 2 })
];
  const { sleepOtherTabs, calls } = loadSleepTabs(tabs);
  const result = await sleepOtherTabs(undefined);
  assert.deepEqual(calls, [3]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { sleptCount: 1 });
});

test('sleepOtherTabs does not count a tab Chrome did not actually discard', async () => {
  const tabs = [tab({ id: 3 }), tab({ id: 4 })];
  const { sleepOtherTabs, calls } = loadSleepTabs(tabs, [], [4]);
  const result = await sleepOtherTabs(1);
  assert.deepEqual(calls, [3, 4]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { sleptCount: 1 });
});
  
