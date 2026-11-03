const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Loads a page script with getElementById returning plain objects, and a
// chrome.commands.getAll() stub that resolves to the given commands.
function loadPage(file, getAll) {
  const elements = new Map();
  const sandbox = {
    console: { error() {} },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { id, textContent: '', hidden: true });
        return elements.get(id);
      }
    },
    window: { addEventListener() {} },
    chrome: { commands: { getAll } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  return { sandbox, el: (id) => sandbox.document.getElementById(id) };
}

// _execute_action comes first, as in Chrome, so matching by position would be wrong.
const ASSIGNED = [
  { name: '_execute_action', shortcut: 'Ctrl+Shift+P', description: '' },
  { name: 'send_all_tabs', shortcut: '⇧⌘D', description: 'Collapse all tabs in window into Pinfold' },
  { name: 'send_current_tab', shortcut: 'Alt+Shift+X', description: 'Send current active tab to Pinfold' },
  { name: 'open_dashboard', shortcut: '', description: 'Open Pinfold Dashboard' }
];

test('popup: each kbd shows its own command, matched by name', async () => {
  const page = loadPage('popup/popup.js', async () => ASSIGNED);
  await page.sandbox.renderShortcuts();
  assert.equal(page.el('kbdCurrentTab').textContent, 'Alt+Shift+X');
  assert.equal(page.el('kbdCurrentTab').hidden, false);
  assert.equal(page.el('kbdCollapseAll').textContent, '⇧⌘D');
  assert.equal(page.el('kbdCollapseAll').hidden, false);
});

test('popup: an unassigned shortcut hides its kbd', async () => {
  const page = loadPage('popup/popup.js', async () => ASSIGNED);
  await page.sandbox.renderShortcuts();
  assert.equal(page.el('kbdOpenDashboard').textContent, '');
  assert.equal(page.el('kbdOpenDashboard').hidden, true);
});

test('popup: a missing command or a failing getAll() hides every kbd', async () => {
  for (const getAll of [async () => [], async () => { throw new Error('no commands'); }]) {
    const page = loadPage('popup/popup.js', getAll);
    await page.sandbox.renderShortcuts();
    for (const id of ['kbdCurrentTab', 'kbdCollapseAll', 'kbdOpenDashboard']) {
      assert.equal(page.el(id).hidden, true, `${id} is hidden`);
    }
  }
});

test('dashboard: the empty state shows the send_all_tabs shortcut', async () => {
  const page = loadPage('dashboard/dashboard.js', async () => ASSIGNED);
  await page.sandbox.renderEmptyStateShortcut();
  assert.equal(page.el('emptyShortcutKbd').textContent, '⇧⌘D');
  assert.equal(page.el('emptyShortcutHint').hidden, false);
});

test('dashboard: the empty state drops the hint when the shortcut is unassigned', async () => {
  const unassigned = ASSIGNED.map(c => c.name === 'send_all_tabs' ? { ...c, shortcut: '' } : c);
  const page = loadPage('dashboard/dashboard.js', async () => unassigned);
  await page.sandbox.renderEmptyStateShortcut();
  assert.equal(page.el('emptyShortcutHint').hidden, true);
});

test('the pages no longer hard-code the default shortcuts', () => {
  for (const file of ['popup/popup.html', 'dashboard/dashboard.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(html, /Alt\+Shift\+[SDO]/, `${file} has no hard-coded shortcut`);
  }
});
