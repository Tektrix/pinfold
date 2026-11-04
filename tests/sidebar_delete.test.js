const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Loads dashboard.js with a stub sidebar of the given group ids and stub storage, and
// replaces refreshData/showToast so only deleteGroupFromSidebar's own logic runs.
function loadDashboard({ groups, settings = {}, confirmAnswer = true, sidebarIds }) {
  const calls = { confirms: [], deleted: [], toasts: [], clicked: [] };
  const leaves = (sidebarIds || groups.map(g => g.id)).map(id => ({
    dataset: { groupId: id },
    click() { calls.clicked.push(id); }
  }));
  const title = { textContent: '' };
  const sandbox = {
    console,
    URL,
    CSS: { escape: (s) => s },
    confirm: (msg) => { calls.confirms.push(msg); return confirmAnswer; },
    document: {
      addEventListener() {},
      getElementById: () => title,
      querySelectorAll: () => leaves,
      querySelector: (sel) => leaves.find(l => sel.includes(`"${l.dataset.groupId}"`)) || null
    },
    window: { addEventListener() {} }
  };
  vm.createContext(sandbox);
  for (const file of ['utils/icons.js', 'utils/storage.js', 'dashboard/dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  vm.runInContext('state.groups = __groups; state.settings = __settings;', Object.assign(sandbox, { __groups: groups, __settings: settings }));
  sandbox.PinfoldStorage.deleteGroup = async (id) => {
    const g = groups.find(x => x.id === id);
    if (!g || g.locked) return false;
    calls.deleted.push(id);
    return true;
  };
  sandbox.refreshData = async () => {};
  sandbox.showToast = (m) => calls.toasts.push(m);
  return { sandbox, calls, title };
}

const one = (id, extra = {}) => ({ id, title: '', tabs: [{ id: 't' + id, url: 'https://a.com' }], ...extra });

test('deleting a tab from the sidebar asks first, like the tab list', async () => {
  const page = loadDashboard({ groups: [one('a'), one('b')] });
  await page.sandbox.deleteGroupFromSidebar('a');
  assert.deepEqual(page.calls.confirms, ['Delete this tab?']);
  assert.deepEqual(page.calls.deleted, ['a']);
});

test('saying no to the confirmation keeps the tab', async () => {
  const page = loadDashboard({ groups: [one('a')], confirmAnswer: false });
  await page.sandbox.deleteGroupFromSidebar('a');
  assert.deepEqual(page.calls.deleted, []);
});

test('with the confirmation setting off it deletes straight away', async () => {
  const page = loadDashboard({ groups: [one('a')], settings: { confirmTabDelete: false } });
  await page.sandbox.deleteGroupFromSidebar('a');
  assert.deepEqual(page.calls.confirms, []);
  assert.deepEqual(page.calls.deleted, ['a']);
});

test('a locked tab is not deleted', async () => {
  const page = loadDashboard({ groups: [one('a', { locked: true })] });
  await page.sandbox.deleteGroupFromSidebar('a');
  assert.deepEqual(page.calls.deleted, []);
  assert.deepEqual(page.calls.toasts, ['Unlock this tab before deleting']);
});

test('deleting the selected tab selects the next one, so Delete can be pressed again', async () => {
  const page = loadDashboard({ groups: [one('a'), one('b'), one('c')] });
  vm.runInContext("state.activeFilter = 'group:b';", page.sandbox);
  await page.sandbox.deleteGroupFromSidebar('b');
  assert.deepEqual(page.calls.deleted, ['b']);
  assert.deepEqual(page.calls.clicked, ['c']);
});

test('deleting the last selected tab selects the one above it', async () => {
  const page = loadDashboard({ groups: [one('a'), one('b')] });
  vm.runInContext("state.activeFilter = 'group:b';", page.sandbox);
  await page.sandbox.deleteGroupFromSidebar('b');
  assert.deepEqual(page.calls.clicked, ['a']);
});

test('deleting the only selected tab goes back to All Tabs', async () => {
  const page = loadDashboard({ groups: [one('a')] });
  vm.runInContext("state.activeFilter = 'group:a';", page.sandbox);
  await page.sandbox.deleteGroupFromSidebar('a');
  assert.equal(vm.runInContext('state.activeFilter', page.sandbox), 'all');
  assert.equal(page.title.textContent, 'All Tabs');
});

test('a multi-tab group uses the group confirmation when it is turned on', async () => {
  const group = { id: 'g', title: 'Trip', tabs: [{ id: 1 }, { id: 2 }] };
  const page = loadDashboard({ groups: [group], settings: { confirmGroupDelete: true } });
  await page.sandbox.deleteGroupFromSidebar('g');
  assert.deepEqual(page.calls.confirms, ['Delete this group of 2 tabs?']);
});
