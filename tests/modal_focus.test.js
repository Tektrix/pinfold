const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, force) => { if (force === undefined) force = !set.has(c); force ? set.add(c) : set.delete(c); }
  };
}

// Loads dashboard.js with a stub DOM for the Export / Import modal. Elements track
// focus through document.activeElement, like a real page.
function loadDashboard() {
  const focusLog = [];
  const doc = { activeElement: null, _all: [] };
  const makeEl = (id, classes = []) => {
    const el = {
      id,
      dataset: {},
      value: '',
      hidden: false,
      disabled: false,
      classList: makeClassList(classes),
      focus() { doc.activeElement = el; focusLog.push(id); },
      closest: () => null,
      querySelectorAll: () => []
    };
    doc._all.push(el);
    return el;
  };
  const byId = {};
  for (const id of ['exportImportModal', 'exportOneTabTextarea', 'exportMdTextarea', 'exportJsonTextarea',
    'importInputTextarea', 'panelExportOneTab', 'panelExportMd', 'panelExportJson', 'panelImport']) {
    byId[id] = makeEl(id, id === 'exportImportModal' ? ['hidden'] : []);
  }
  const navTabs = ['export-onetab', 'export-md', 'export-json', 'import-tab'].map(tab => {
    const el = makeEl('tab-' + tab, tab === 'export-onetab' ? ['active'] : []);
    el.dataset.tab = tab;
    return el;
  });
  doc.getElementById = (id) => byId[id] || makeEl(id);
  doc.querySelectorAll = (sel) => (sel === '.modal-nav-tab' ? navTabs : []);
  doc.querySelector = (sel) => (sel === '.modal-nav-tab.active' ? navTabs.find(t => t.classList.contains('active')) || null : null);
  doc.addEventListener = () => {};
  doc.contains = (el) => doc._all.includes(el);

  const sandbox = {
    console,
    URL,
    CSS: { escape: (s) => s },
    document: doc,
    window: { addEventListener() {} },
    navigator: { clipboard: { writeText: async () => {} } }
  };
  vm.createContext(sandbox);
  for (const file of ['utils/icons.js', 'utils/storage.js', 'utils/export_import.js', 'dashboard/dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  vm.runInContext('state.groups = [];', sandbox);
  return { sandbox, byId, navTabs, doc, focusLog, makeEl };
}

test('opening the modal focuses the active tab button', () => {
  const page = loadDashboard();
  page.sandbox.openExportImportModal('export-onetab');
  assert.equal(page.byId.exportImportModal.classList.contains('hidden'), false);
  assert.equal(page.doc.activeElement, page.navTabs[0]);
});

test('opening the modal on the Import tab focuses the import textarea', () => {
  const page = loadDashboard();
  page.sandbox.openExportImportModal('import-tab');
  assert.equal(page.doc.activeElement, page.byId.importInputTextarea);
});

test('closing the modal returns focus to the element that opened it', () => {
  const page = loadDashboard();
  const opener = page.makeEl('btnOpenExportImport');
  page.doc.activeElement = opener;
  page.sandbox.openExportImportModal('export-onetab');
  assert.notEqual(page.doc.activeElement, opener);
  page.sandbox.closeExportImportModal();
  assert.equal(page.byId.exportImportModal.classList.contains('hidden'), true);
  assert.equal(page.doc.activeElement, opener);
});

test('Tab on the last focusable element wraps to the first', () => {
  const page = loadDashboard();
  const first = page.makeEl('first');
  const last = page.makeEl('last');
  const container = { querySelectorAll: () => [first, last], contains: (el) => el === first || el === last };
  page.doc.activeElement = last;
  let prevented = false;
  page.sandbox.keepFocusInModal({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true; } }, container);
  assert.equal(prevented, true);
  assert.equal(page.doc.activeElement, first);
});

test('Shift+Tab on the first focusable element wraps to the last', () => {
  const page = loadDashboard();
  const first = page.makeEl('first');
  const last = page.makeEl('last');
  const container = { querySelectorAll: () => [first, last], contains: (el) => el === first || el === last };
  page.doc.activeElement = first;
  let prevented = false;
  page.sandbox.keepFocusInModal({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; } }, container);
  assert.equal(prevented, true);
  assert.equal(page.doc.activeElement, last);
});

test('Tab in the middle of the dialog is left alone', () => {
  const page = loadDashboard();
  const first = page.makeEl('first');
  const mid = page.makeEl('mid');
  const last = page.makeEl('last');
  const container = { querySelectorAll: () => [first, mid, last], contains: () => true };
  page.doc.activeElement = mid;
  let prevented = false;
  page.sandbox.keepFocusInModal({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true; } }, container);
  assert.equal(prevented, false);
  assert.equal(page.doc.activeElement, mid);
});
