const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pluralize } = require('../utils/storage.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

function makeGroup(id, tabIds, locked = false) {
  return {
    id,
    locked,
    tabs: tabIds.map(tabId => ({ id: tabId, url: 'https://' + tabId + '.example/' }))
  };
}

function setup({ reject = false } = {}) {
  const calls = { clipboard: [], toasts: [] };
  const sandbox = {
    console,
    pluralize,
    document: { addEventListener() {} },
    chrome: { runtime: { async sendMessage() {} } },
    PinfoldStorage: {},
    navigator: {
      clipboard: {
        async writeText(text) {
          calls.clipboard.push(text);
          if (reject) throw new Error('Clipboard unavailable');
        }
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'dashboard/dashboard.js' });
  sandbox.showToast = text => calls.toasts.push(text);

  return {
    calls,
    run: group => {
      sandbox.fixture = group;
      return vm.runInContext('handleCopyGroupLinks(fixture)', sandbox);
    }
  };
}

test('Copy links copies every URL in the group, one per line', async () => {
  const h = setup();
  await h.run(makeGroup('g', ['a', 'b', 'c']));
  assert.deepEqual(h.calls.clipboard, ['https://a.example/\nhttps://b.example/\nhttps://c.example/']);
  assert.deepEqual(h.calls.toasts, ['Copied 3 links']);
});

test('Copy links uses the singular for one link', async () => {
  const h = setup();
  await h.run(makeGroup('g', ['a']));
  assert.deepEqual(h.calls.clipboard, ['https://a.example/']);
  assert.deepEqual(h.calls.toasts, ['Copied 1 link']);
});

test('Copy links works on locked groups', async () => {
  const h = setup();
  await h.run(makeGroup('g', ['a', 'b'], true));
  assert.equal(h.calls.clipboard.length, 1);
  assert.deepEqual(h.calls.toasts, ['Copied 2 links']);
});

test('Copy links shows an error toast when the clipboard write fails', async () => {
  const h = setup({ reject: true });
  await h.run(makeGroup('g', ['a']));
  assert.deepEqual(h.calls.toasts, ['Failed to copy links']);
});

test('Copy links does not touch the clipboard for an empty group', async () => {
  const h = setup();
  await h.run(makeGroup('g', []));
  assert.deepEqual(h.calls.clipboard, []);
  assert.deepEqual(h.calls.toasts, ['No links to copy']);
});