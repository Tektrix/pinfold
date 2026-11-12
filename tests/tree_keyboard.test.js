const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Loads dashboard.js far enough to reach setupTreeItemKeyboard.
function loadHelper() {
  const sandbox = {
    console,
    URL,
    CSS: { escape: (s) => s },
    document: {
      addEventListener() {},
      getElementById: () => ({ textContent: '' }),
      querySelectorAll: () => [],
      querySelector: () => null
    },
    window: { addEventListener() {} }
  };
  vm.createContext(sandbox);
  for (const file of ['utils/icons.js', 'utils/storage.js', 'dashboard/dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  return sandbox.setupTreeItemKeyboard;
}

function fakeItem(setup) {
  const item = {
    clicks: 0,
    click() { item.clicks++; },
    addEventListener(type, fn) { item._keydown = fn; }
  };
  setup(item);
  return item;
}

function key(item, k, target = item) {
  let prevented = false;
  item._keydown({ key: k, target, preventDefault: () => { prevented = true; } });
  return prevented;
}

test('Enter and Space activate the item like a click', () => {
  const setup = loadHelper();
  const item = fakeItem((it) => setup(it));
  assert.equal(key(item, 'Enter'), true);
  assert.equal(key(item, ' '), true);
  assert.equal(item.clicks, 2);
});

test('keys pressed on a button inside the item are left alone', () => {
  const setup = loadHelper();
  const item = fakeItem((it) => setup(it));
  const innerButton = {};
  assert.equal(key(item, 'Enter', innerButton), false);
  assert.equal(item.clicks, 0);
});

test('Arrow Right expands a collapsed folder, Arrow Left collapses an open one', () => {
  const setup = loadHelper();
  let toggles = 0;
  const collapsed = fakeItem((it) => setup(it, { onToggle: () => { toggles++; }, isCollapsed: true }));
  assert.equal(key(collapsed, 'ArrowRight'), true);
  assert.equal(key(collapsed, 'ArrowLeft'), false);
  assert.equal(toggles, 1);

  const open = fakeItem((it) => setup(it, { onToggle: () => { toggles++; }, isCollapsed: false }));
  assert.equal(key(open, 'ArrowLeft'), true);
  assert.equal(key(open, 'ArrowRight'), false);
  assert.equal(toggles, 2);
});

test('unrelated keys do nothing', () => {
  const setup = loadHelper();
  const item = fakeItem((it) => setup(it, { onToggle: () => { throw new Error('must not toggle'); }, isCollapsed: true }));
  assert.equal(key(item, 'a'), false);
  assert.equal(key(item, 'Tab'), false);
  assert.equal(item.clicks, 0);
});

test('the tree container is exposed as a tree to assistive technology', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'dashboard.html'), 'utf8');
  assert.match(html, /<div class="tree-view-root" id="treeViewContainer" role="tree">/);
});
