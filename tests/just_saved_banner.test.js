const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeElement() {
  const classes = new Set();
  return {
    textContent: '',
    hidden: false,
    dataset: {},
    children: [],
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    appendChild(child) { this.children.push(child); }
  };
}

// Loads dashboard.js with stub storage and a stub DOM holding the banner elements,
// so getJustSavedGroups and renderJustSavedBanner run against the given state.
function loadDashboard({ groups, lastSave, folders = [] }) {
  const elements = {
    justSavedBanner: makeElement(),
    justSavedText: makeElement(),
    justSavedMoveSelect: makeElement()
  };
  const sandbox = {
    console,
    URL,
    CSS: { escape: (s) => s },
    document: {
      addEventListener() {},
      getElementById: (id) => elements[id] || makeElement(),
      createElement: () => makeElement(),
      querySelectorAll: () => [],
      querySelector: () => null
    },
    window: { addEventListener() {} }
  };
  vm.createContext(sandbox);
  for (const file of ['utils/icons.js', 'utils/storage.js', 'dashboard/dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  vm.runInContext(
    'state.groups = __groups; state.lastSave = __lastSave; state.folders = __folders;',
    Object.assign(sandbox, { __groups: groups, __lastSave: lastSave, __folders: folders })
  );
  return { sandbox, elements };
}

const group = (id, extra = {}) => ({ id, title: '', tabs: [{ id: 't' + id, url: 'https://a.com' }], ...extra });
const recentSave = (groupIds) => ({ groupIds, savedAt: Date.now() - 5 * 60 * 1000 });

test('no lastSave means no just-saved groups', () => {
  const page = loadDashboard({ groups: [group('a')], lastSave: null });
  assert.equal(page.sandbox.getJustSavedGroups().length, 0);
});

test('a lastSave without a group id list means no just-saved groups', () => {
  const page = loadDashboard({ groups: [group('a')], lastSave: { savedAt: Date.now() } });
  assert.equal(page.sandbox.getJustSavedGroups().length, 0);
});

test('a save older than 30 minutes no longer counts', () => {
  const stale = { groupIds: ['a'], savedAt: Date.now() - 31 * 60 * 1000 };
  const page = loadDashboard({ groups: [group('a')], lastSave: stale });
  assert.equal(page.sandbox.getJustSavedGroups().length, 0);
});

test('groups deleted since the save are skipped', () => {
  const page = loadDashboard({ groups: [group('a')], lastSave: recentSave(['a', 'gone']) });
  assert.deepEqual(page.sandbox.getJustSavedGroups().map(g => g.id), ['a']);
});

test('groups already moved into a folder are no longer counted', () => {
  const page = loadDashboard({
    groups: [group('a'), group('b', { folderId: 'f1' })],
    lastSave: recentSave(['a', 'b'])
  });
  assert.deepEqual(page.sandbox.getJustSavedGroups().map(g => g.id), ['a']);
});

test('a normal recent save returns its unfiled groups', () => {
  const page = loadDashboard({
    groups: [group('a'), group('b'), group('c')],
    lastSave: recentSave(['a', 'c'])
  });
  assert.deepEqual(page.sandbox.getJustSavedGroups().map(g => g.id), ['a', 'c']);
});

test('the banner stays hidden when there is nothing just saved', () => {
  const page = loadDashboard({ groups: [group('a')], lastSave: null });
  page.sandbox.renderJustSavedBanner();
  assert.equal(page.elements.justSavedBanner.classList.contains('hidden'), true);
});

test('the banner says "1 tab" for a single saved tab', () => {
  const page = loadDashboard({ groups: [group('a')], lastSave: recentSave(['a']) });
  page.sandbox.renderJustSavedBanner();
  assert.equal(page.elements.justSavedBanner.classList.contains('hidden'), false);
  assert.match(page.elements.justSavedText.textContent, /^1 tab saved /);
});

test('the banner says "2 tabs" for two saved tabs', () => {
  const page = loadDashboard({
    groups: [group('a'), group('b')],
    lastSave: recentSave(['a', 'b'])
  });
  page.sandbox.renderJustSavedBanner();
  assert.match(page.elements.justSavedText.textContent, /^2 tabs saved /);
});
