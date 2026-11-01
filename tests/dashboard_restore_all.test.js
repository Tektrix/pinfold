const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

function makeGroup(id, tabIds, locked = false) {
  return {
    id,
    locked,
    tabs: tabIds.map(tabId => ({ id: tabId, url: 'https://' + tabId + '.example/' }))
  };
}

function setup({ groups = [], keep = false, response, reject = false, approve = true } = {}) {
  const calls = { requests: [], removals: [], confirmations: [], toasts: [], refreshes: 0 };
  const sandbox = {
    console,
    document: { addEventListener() {} },
    confirm(message) {
      calls.confirmations.push(message);
      return approve;
    },
    chrome: {
      runtime: {
        async sendMessage(request) {
          calls.requests.push(JSON.parse(JSON.stringify(request)));
          if (reject) throw new Error('Service worker unavailable');
          return response;
        }
      }
    },
    PinfoldStorage: {
      async removeRestoredTabs(ids) {
        calls.removals.push(Array.from(ids));
        return ids.length;
      }
    },
    fixture: { groups, settings: { keepTabOnRestore: keep } }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'dashboard/dashboard.js' });
  vm.runInContext('state.groups = fixture.groups; state.settings = fixture.settings;', sandbox);
  sandbox.showToast = text => calls.toasts.push(text);
  sandbox.refreshData = async () => { calls.refreshes++; };

  return { calls, run: () => vm.runInContext('handleRestoreAll()', sandbox) };
}

test('Restore All removes only confirmed opened tabs from unlocked groups', async () => {
  const h = setup({
    groups: [makeGroup('open', ['a', 'b']), makeGroup('locked', ['c'], true)],
    response: { success: true, openedIds: ['a', 'c'], failedIds: ['b'] }
  });
  await h.run();
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].action, 'RESTORE_TABS');
  assert.equal(h.calls.requests[0].options.newWindow, true);
  assert.deepEqual(h.calls.requests[0].tabs.map(t => t.id), ['a', 'b', 'c']);
  assert.deepEqual(h.calls.removals, [['a', 'c']], 'one batch of confirmed ids');
  assert.equal(h.calls.refreshes, 1);
  assert.equal(h.calls.toasts[0], 'Restored 2 tabs. 1 could not be opened and were kept.');
});

test('Restore All respects Keep restored tabs', async () => {
  const h = setup({
    groups: [makeGroup('open', ['a', 'b'])],
    keep: true,
    response: { success: true, openedIds: ['a', 'b'], failedIds: [] }
  });
  await h.run();
  assert.deepEqual(h.calls.removals, []);
  assert.equal(h.calls.toasts[0], 'Restored 2 tabs');
  assert.equal(h.calls.refreshes, 1);
});

test('Restore All keeps every saved tab if the worker reports failure', async () => {
  const h = setup({
    groups: [makeGroup('open', ['a'])],
    response: { success: false, error: 'failed' }
  });
  await h.run();
  assert.deepEqual(h.calls.removals, []);
  assert.equal(h.calls.refreshes, 0);
  assert.match(h.calls.toasts[0], /still saved/);
});

test('Restore All keeps every saved tab when messaging rejects', async () => {
  const h = setup({ groups: [makeGroup('open', ['a'])], reject: true });
  await h.run();
  assert.deepEqual(h.calls.removals, []);
  assert.equal(h.calls.refreshes, 0);
  assert.match(h.calls.toasts[0], /still saved/);
});

test('Restore All does nothing when confirmation is cancelled', async () => {
  const h = setup({ groups: [makeGroup('open', ['a'])], approve: false });
  await h.run();
  assert.equal(h.calls.confirmations.length, 1);
  assert.deepEqual(h.calls.requests, []);
  assert.deepEqual(h.calls.removals, []);
});

test('Restore All does nothing when no saved tabs exist', async () => {
  const h = setup({ groups: [makeGroup('empty', [])] });
  await h.run();
  assert.deepEqual(h.calls.confirmations, []);
  assert.deepEqual(h.calls.requests, []);
});
