const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

function makeDashboard() {
  const elements = new Map();
  const windowListeners = {};
  const doc = {
    activeElement: null,
    addEventListener() {},
    querySelectorAll: () => [],
    getElementById(id) {
      if (!elements.has(id)) {
        const element = {
          id,
          classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
          addEventListener() {},
          focus() {
            doc.activeElement = this;
          },
          blur() {
            doc.activeElement = null;
          }
        };
        elements.set(id, element);
      }
      return elements.get(id);
    }
  };
  const sandbox = {
    console,
    document: doc,
    window: {
      addEventListener(type, callback) {
        windowListeners[type] = callback;
      }
    }
  };
  vm.runInNewContext(source + '\nbindEventListeners();', sandbox);
  return {
    doc,
    get search() { return doc.getElementById('searchInput'); },
    press(key, { ctrlKey = false, metaKey = false, editing = false } = {}) {
      let prevented = false;
      windowListeners.keydown({
        key, ctrlKey, metaKey,
        target: { closest: () => editing ? {} : null },
        preventDefault() { prevented = true; }
      });
      return prevented;
    }
  };
}

for (const [label, options] of [
  ['Cmd+K on macOS', { metaKey: true }],
  ['Cmd+Shift+K with uppercase K', { metaKey: true }],
  ['Ctrl+K on Windows/Linux', { ctrlKey: true }],
  ['Ctrl+Shift+K with uppercase K', { ctrlKey: true }]
]) {
  test(label + ' focuses search', () => {
    const page = makeDashboard();
    const key = label.includes('uppercase') ? 'K' : 'k';
    assert.equal(page.press(key, options), true);
    assert.equal(page.doc.activeElement, page.search);
  });
}

test('plain K does not steal keyboard focus', () => {
  const page = makeDashboard();
  assert.equal(page.press('k'), false);
  assert.equal(page.doc.activeElement, null);
});

test('slash still focuses search unless editing text', () => {
  const page = makeDashboard();
  assert.equal(page.press('/', { editing: true }), false);
  assert.equal(page.doc.activeElement, null);
  assert.equal(page.press('/'), true);
  assert.equal(page.doc.activeElement, page.search);
});

for (const modalId of ['exportImportModal', 'previewModal']) {
  test(`slash and Ctrl+K do nothing while ${modalId} is open`, () => {
    const page = makeDashboard();
    const modal = page.doc.getElementById(modalId);
    modal.classList.contains = (cls) => cls !== 'hidden';

    assert.equal(page.press('k', { ctrlKey: true }), false);
    assert.equal(page.doc.activeElement, null);
    assert.equal(page.press('/'), false);
    assert.equal(page.doc.activeElement, null);
  });
}
