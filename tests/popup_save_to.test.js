const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeElement(id) {
  return {
    id,
    textContent: '',
    hidden: false,
    value: '',
    dataset: {},
    children: [],
    attributes: {},
    setAttribute(name, val) { this.attributes[name] = val; },
    addEventListener() {},
    appendChild(child) { this.children.push(child); },
    focus() {},
    select() {}
  };
}

// Loads popup.js with stub storage returning the given folders, and a stub DOM
// whose elements are kept per id so the rendered chips and options can be read.
function loadPopup({ folders }) {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  const sandbox = {
    console,
    URL,
    document: {
      addEventListener() {},
      getElementById: getEl,
      createElement: () => makeElement(''),
      querySelectorAll: () => getEl('saveToChips').children
    },
    window: { addEventListener() {} }
  };
  vm.createContext(sandbox);
  for (const file of ['utils/icons.js', 'utils/storage.js', 'popup/popup.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  sandbox.PinfoldStorage.getFolders = async () => folders;
  sandbox.PinfoldStorage.getSettings = async () => ({});
  return { sandbox, el: getEl };
}

const folder = (id, extra = {}) => ({ id, title: 'Folder ' + id, parentId: null, lastUsedAt: 0, ...extra });
const plain = (o) => JSON.parse(JSON.stringify(o));

test('folderPath names a root folder by its title', () => {
  const page = loadPopup({ folders: [] });
  const f = folder('a', { title: 'Work' });
  assert.equal(page.sandbox.folderPath(f, new Map([['a', f]])), 'Work');
});

test('folderPath joins nested folders from the root down', () => {
  const page = loadPopup({ folders: [] });
  const parent = folder('a', { title: 'Work' });
  const child = folder('b', { title: '2026', parentId: 'a' });
  const byId = new Map([['a', parent], ['b', child]]);
  assert.equal(page.sandbox.folderPath(child, byId), 'Work / 2026');
});

test('folderPath falls back to "Untitled folder" and cannot loop on cyclic parents', () => {
  const page = loadPopup({ folders: [] });
  const a = folder('a', { title: '', parentId: 'b' });
  const b = folder('b', { title: 'B', parentId: 'a' });
  const byId = new Map([['a', a], ['b', b]]);
  assert.equal(page.sandbox.folderPath(a, byId), 'B / Untitled folder');
});

test('getSaveOptions is empty for the default All tabs target', () => {
  const page = loadPopup({ folders: [] });
  assert.deepEqual(plain(page.sandbox.getSaveOptions()), {});
});

test('getSaveOptions returns the chosen recent folder', () => {
  const page = loadPopup({ folders: [] });
  vm.runInContext("saveTarget = { kind: 'folder', folderId: 'f1' };", page.sandbox);
  assert.deepEqual(plain(page.sandbox.getSaveOptions()), { folderId: 'f1' });
});

test('getSaveOptions reads the dropdown for the More… target', () => {
  const page = loadPopup({ folders: [] });
  vm.runInContext("saveTarget = { kind: 'more', folderId: null };", page.sandbox);
  page.el('saveToFolderSelect').value = 'f9';
  assert.deepEqual(plain(page.sandbox.getSaveOptions()), { folderId: 'f9' });
  page.el('saveToFolderSelect').value = '';
  assert.deepEqual(plain(page.sandbox.getSaveOptions()), {});
});

test('getSaveOptions names a new folder, with the default name as fallback', () => {
  const page = loadPopup({ folders: [] });
  vm.runInContext("saveTarget = { kind: 'new', folderId: null };", page.sandbox);
  page.el('saveToNewFolderInput').value = '  Reading list  ';
  assert.deepEqual(plain(page.sandbox.getSaveOptions()), { newFolderTitle: 'Reading list' });
  page.el('saveToNewFolderInput').value = '   ';
  assert.deepEqual(plain(page.sandbox.getSaveOptions()), { newFolderTitle: page.sandbox.defaultFolderName('Tabs') });
});

test('renderSaveTo shows no More… chip when every folder fits', async () => {
  const page = loadPopup({ folders: [folder('a', { lastUsedAt: 100 }), folder('b', { lastUsedAt: 200 })] });
  await page.sandbox.renderSaveTo();
  const labels = page.el('saveToChips').children.map(b => b.textContent);
  assert.deepEqual(labels, ['All tabs', 'Folder b', 'Folder a', '+ New folder']);
});

test('renderSaveTo caps folder chips at the three most recent and adds More…', async () => {
  const folders = [1, 2, 3, 4, 5].map(i => folder('f' + i, { lastUsedAt: i * 100 }));
  const page = loadPopup({ folders });
  await page.sandbox.renderSaveTo();
  const labels = page.el('saveToChips').children.map(b => b.textContent);
  assert.deepEqual(labels, ['All tabs', 'Folder f5', 'Folder f4', 'Folder f3', '+ New folder', 'More…']);
  assert.equal(page.el('saveToFolderSelect').children.length, 5);
});
