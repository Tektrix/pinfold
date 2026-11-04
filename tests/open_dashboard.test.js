const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DASHBOARD = 'chrome-extension://id/dashboard/dashboard.html';

// Runs the service worker with stub chrome APIs over the given open tabs and returns
// openDashboard plus a log of the tab calls it made.
function loadOpenDashboard(openTabs) {
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
      windows: { async update(id, props) { calls.push(['windows.update', id, props]); } },
      tabs: {
        onCreated: stubEvent,
        onUpdated: stubEvent,
        async query(q) {
          return openTabs.filter(t => q.windowId === undefined || t.windowId === q.windowId);
        },
        async update(id, props) { calls.push(['tabs.update', id, props]); },
        async create(props) { calls.push(['tabs.create', props]); return { id: 99, ...props }; }
      }
    }
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'background', 'service_worker.js'), 'utf8');
  vm.runInNewContext(src + '\n;globalThis.__openDashboard = openDashboard;', sandbox);
  return { openDashboard: sandbox.__openDashboard, calls };
}

const TABS = [
  { id: 1, windowId: 1, url: DASHBOARD },
  { id: 2, windowId: 2, url: 'https://example.com/' }
];

test('Open Dashboard opens a new tab in the current window even when another window has one', async () => {
  const sw = loadOpenDashboard(TABS);
  await sw.openDashboard({ windowId: 2 });
  assert.equal(sw.calls.length, 1);
  assert.equal(sw.calls[0][0], 'tabs.create');
  assert.equal(sw.calls[0][1].url, DASHBOARD);
  assert.equal(sw.calls[0][1].windowId, 2);
});

test('Open Dashboard opens a new tab even when the same window already has one', async () => {
  const sw = loadOpenDashboard(TABS);
  await sw.openDashboard({ windowId: 1 });
  assert.deepEqual(sw.calls.map(c => c[0]), ['tabs.create']);
});

test('without a window id it opens in the browser\'s current window', async () => {
  const sw = loadOpenDashboard(TABS);
  await sw.openDashboard();
  assert.equal(sw.calls[0][0], 'tabs.create');
  assert.equal('windowId' in sw.calls[0][1], false);
});

test('after collapsing, a dashboard already open in the same window is reused', async () => {
  const sw = loadOpenDashboard(TABS);
  await sw.openDashboard({ windowId: 1, reuse: true });
  // Compare fields: the props object comes from the sandbox realm.
  assert.equal(sw.calls.length, 1);
  assert.equal(sw.calls[0][0], 'tabs.update');
  assert.equal(sw.calls[0][1], 1);
  assert.equal(sw.calls[0][2].active, true);
});

test('after collapsing, a dashboard in another window is not focused; a new one opens here', async () => {
  const sw = loadOpenDashboard(TABS);
  await sw.openDashboard({ windowId: 2, reuse: true });
  assert.deepEqual(sw.calls.map(c => c[0]), ['tabs.create']);
  assert.equal(sw.calls[0][1].windowId, 2);
});
