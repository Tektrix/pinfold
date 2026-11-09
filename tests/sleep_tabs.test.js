const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const tab = (id, props = {}) => ({ id, windowId: 1, url: `https://example.com/${id}`, ...props });

function loadSleepTabs(openTabs = [], { discard, query } = {}) {
  const stubEvent = { addListener() {} };
  const calls = [];
  const menus = [];
  const handlers = {};
  const sandbox = {
    console: { error() {} },
    URL,
    setTimeout,
    importScripts() {},
    chrome: {
      runtime: {
        id: 'id', onInstalled: stubEvent, onStartup: stubEvent,
        onMessage: { addListener(fn) { handlers.message = fn; } },
        getURL: (p) => 'chrome-extension://id/' + p
      },
      contextMenus: {
        onClicked: { addListener(fn) { handlers.click = fn; } },
        removeAll(cb) { cb(); },
        create(props) { menus.push(props); }
      },
      commands: { onCommand: stubEvent },
      storage: { onChanged: stubEvent },
      tabs: {
        onCreated: stubEvent,
        onUpdated: stubEvent,
        async query(q) {
          calls.push(['query', { ...q }]);
          if (query) return query(q);
          return openTabs.filter(t => t.windowId === (q.currentWindow ? 1 : q.windowId));
        },
        async discard(id) {
          calls.push(['discard', id]);
          if (discard) return discard(id);
          return { ...openTabs.find(t => t.id === id), discarded: true };
        }
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'background/service_worker.js'), 'utf8'), sandbox);
  return { canSleepTab: sandbox.canSleepTab, sleepOtherTabs: sandbox.sleepOtherTabs,
    setupContextMenus: sandbox.setupContextMenus, calls, menus, handlers };
}

for (const url of ['https://example.com/', 'http://example.com/', 'file:///tmp/page.html']) {
  test(`canSleepTab allows ${url}`, () => {
    assert.equal(loadSleepTabs().canSleepTab(tab(1, { url })), true);
  });
}

for (const [name, props] of Object.entries({
  active: { active: true },
  discarded: { discarded: true },
  pinned: { pinned: true },
  audible: { audible: true },
  protected: { autoDiscardable: false },
  incognito: { incognito: true },
  settings: { url: 'chrome://settings' },
  edge: { url: 'edge://settings' },
  dashboard: { url: 'chrome-extension://id/dashboard/dashboard.html' },
  extension: { url: 'chrome-extension://other/options.html' },
  ftp: { url: 'ftp://example.com/file' },
  missingUrl: { url: undefined },
  missingId: { id: undefined },
  invalidId: { id: -1 }
})) {
  test(`canSleepTab skips ${name} tabs`, () => {
    assert.equal(loadSleepTabs().canSleepTab(tab(1, props)), false);
  });
}

test('sleepOtherTabs discards only the three eligible tabs in the requested window', async () => {
  const sw = loadSleepTabs([tab(1, { active: true }), tab(2, { pinned: true }), tab(3), tab(4), tab(5), tab(6, { windowId: 2 })]);
  assert.deepEqual({ ...await sw.sleepOtherTabs(1) }, { sleptCount: 3 });
  assert.deepEqual(sw.calls, [['query', { windowId: 1 }], ['discard', 3], ['discard', 4], ['discard', 5]]);
});

test('sleepOtherTabs continues after a rejected discard without counting it', async () => {
  const sw = loadSleepTabs([tab(1), tab(2), tab(3)], {
    async discard(id) {
      if (id === 2) throw new Error('Tab closed');
      return tab(id, { discarded: true });
    }
  });
  assert.deepEqual({ ...await sw.sleepOtherTabs(1) }, { sleptCount: 2 });
  assert.deepEqual(sw.calls.filter(c => c[0] === 'discard'), [['discard', 1], ['discard', 2], ['discard', 3]]);
});

test('sleepOtherTabs does not count an undefined or undiscarded API result', async () => {
  const sw = loadSleepTabs([tab(1), tab(2), tab(3)], {
    async discard(id) { return id === 1 ? undefined : tab(id, { discarded: id === 3 }); }
  });
  assert.equal((await sw.sleepOtherTabs(1)).sleptCount, 1);
});

test('sleepOtherTabs uses only the current window when no window ID is given', async () => {
  const sw = loadSleepTabs([tab(1), tab(2, { windowId: 2 })]);
  assert.equal((await sw.sleepOtherTabs()).sleptCount, 1);
  assert.deepEqual(sw.calls, [['query', { currentWindow: true }], ['discard', 1]]);
});

test('sleepOtherTabs never acts on incognito tabs', async () => {
  const sw = loadSleepTabs([tab(1, { incognito: true }), tab(2, { incognito: true })]);
  assert.equal((await sw.sleepOtherTabs(1)).sleptCount, 0);
  assert.deepEqual(sw.calls, [['query', { windowId: 1 }]]);
});

test('sleepOtherTabs returns zero when no tabs are eligible', async () => {
  const sw = loadSleepTabs([tab(1, { active: true }), tab(2, { discarded: true })]);
  assert.equal((await sw.sleepOtherTabs(1)).sleptCount, 0);
  assert.deepEqual(sw.calls, [['query', { windowId: 1 }]]);
});

test('sleepOtherTabs does not fall back to another window after a query error', async () => {
  const sw = loadSleepTabs([], { async query() { throw new Error('Window closed'); } });
  await assert.rejects(sw.sleepOtherTabs(2), /Window closed/);
  assert.deepEqual(sw.calls, [['query', { windowId: 2 }]]);
});

test('the sleep context menu is between send-other-tabs and the separator', () => {
  const sw = loadSleepTabs();
  sw.setupContextMenus();
  const i = sw.menus.findIndex(m => m.id === 'pinfold_sleep_other_tabs');
  assert.equal(sw.menus[i - 1].id, 'pinfold_send_all_except_active');
  assert.equal(sw.menus[i + 1].type, 'separator');
  assert.equal(sw.menus[i].title, 'Sleep other tabs in this window');
});

test('the context menu passes the clicked tab window to sleepOtherTabs', async () => {
  const sw = loadSleepTabs([tab(1), tab(2, { windowId: 2 })]);
  sw.handlers.click({ menuItemId: 'pinfold_sleep_other_tabs' }, tab(3, { windowId: 2, active: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sw.calls, [['query', { windowId: 2 }], ['discard', 2]]);
});

test('SLEEP_TABS replies with success and the count for the popup window', async () => {
  const sw = loadSleepTabs([tab(1), tab(2, { windowId: 2 })]);
  const response = await new Promise(resolve => {
    assert.equal(sw.handlers.message({ action: 'SLEEP_TABS', windowId: 2 }, { id: 'id' }, resolve), true);
  });
  assert.deepEqual({ ...response }, { success: true, sleptCount: 1 });
  assert.deepEqual(sw.calls, [['query', { windowId: 2 }], ['discard', 2]]);
});

test('SLEEP_TABS reports query errors to the popup', async () => {
  const sw = loadSleepTabs([], { async query() { throw new Error('Window closed'); } });
  const response = await new Promise(resolve => {
    sw.handlers.message({ action: 'SLEEP_TABS', windowId: 2 }, { id: 'id' }, resolve);
  });
  assert.deepEqual({ ...response }, { success: false, error: 'Window closed' });
});

test('SLEEP_TABS ignores messages from another extension', () => {
  const sw = loadSleepTabs([tab(1)]);
  assert.equal(sw.handlers.message({ action: 'SLEEP_TABS', windowId: 1 }, { id: 'other' }, () => assert.fail('Unexpected response')), false);
  assert.deepEqual(sw.calls, []);
});
