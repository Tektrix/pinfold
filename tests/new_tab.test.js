const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Runs the service worker with stub chrome APIs and returns its tabs.onCreated and
// tabs.onUpdated listeners, plus the calls made to chrome.tabs.update.
function loadServiceWorker({ openOnNewTab = true, failures = [] } = {}) {
  const stubEvent = { addListener() {} };
  const listeners = {};
  const updates = [];
  const pendingFailures = [...failures];
  const sandbox = {
    console,
    URL,
    setTimeout,
    importScripts() {},
    PinfoldStorage: { getSettings: async () => ({ openOnNewTab }) },
    chrome: {
      runtime: { onInstalled: stubEvent, onStartup: stubEvent, onMessage: stubEvent, getURL: (p) => 'chrome-extension://id/' + p },
      contextMenus: { onClicked: stubEvent },
      commands: { onCommand: stubEvent },
      storage: { onChanged: stubEvent },
      tabs: {
        onCreated: { addListener: (fn) => { listeners.onCreated = fn; } },
        onUpdated: { addListener: (fn) => { listeners.onUpdated = fn; } },
        async update(tabId, props) {
          updates.push({ tabId, url: props.url });
          if (pendingFailures.length) throw new Error(pendingFailures.shift());
        }
      }
    }
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'background', 'service_worker.js'), 'utf8');
  vm.runInNewContext(src, sandbox);
  return { ...listeners, updates };
}

const DASHBOARD = 'chrome-extension://id/dashboard/dashboard.html';
const DRAGGING = 'Tabs cannot be edited right now (user may be dragging a tab).';

test('a new tab opens the dashboard when the setting is on', async () => {
  const sw = loadServiceWorker();
  await sw.onCreated({ id: 7, pendingUrl: 'chrome://newtab/' });
  assert.deepEqual(sw.updates, [{ tabId: 7, url: DASHBOARD }]);
});

test('the "+" button case: retries while Chrome says tabs cannot be edited', async () => {
  const sw = loadServiceWorker({ failures: [DRAGGING, DRAGGING] });
  await sw.onCreated({ id: 7, pendingUrl: 'chrome://newtab/' });
  assert.equal(sw.updates.length, 3, 'two refused attempts, then success');
  assert.ok(sw.updates.every(u => u.tabId === 7 && u.url === DASHBOARD));
});

test('other errors are not retried', async () => {
  const sw = loadServiceWorker({ failures: ['No tab with id: 7.'] });
  await sw.onCreated({ id: 7, pendingUrl: 'chrome://newtab/' });
  assert.equal(sw.updates.length, 1);
});

test('nothing happens when the setting is off, or for other pages', async () => {
  const off = loadServiceWorker({ openOnNewTab: false });
  await off.onCreated({ id: 7, pendingUrl: 'chrome://newtab/' });
  await off.onUpdated(7, { url: 'chrome://newtab/' }, {});
  assert.equal(off.updates.length, 0);

  const on = loadServiceWorker();
  await on.onCreated({ id: 7, pendingUrl: 'https://example.com/' });
  await on.onUpdated(9, { status: 'loading' }, {});
  await on.onUpdated(9, { url: 'https://example.com/' }, {});
  assert.equal(on.updates.length, 0);
});

test('a "+" or Ctrl+T tab opens the dashboard even though Chrome gives it an opener tab', async () => {
  const sw = loadServiceWorker();
  await sw.onCreated({ id: 8, pendingUrl: 'chrome://newtab/', openerTabId: 3 });
  assert.equal(sw.updates.length, 1);
  assert.equal(sw.updates[0].tabId, 8);
  assert.equal(sw.updates[0].url, DASHBOARD);
});

test('a tab that navigates to the new tab page also opens the dashboard', async () => {
  const sw = loadServiceWorker();
  await sw.onUpdated(5, { url: 'edge://newtab/' }, { id: 5 });
  assert.deepEqual(sw.updates, [{ tabId: 5, url: DASHBOARD }]);
});
