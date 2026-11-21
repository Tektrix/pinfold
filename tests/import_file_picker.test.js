const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

function makeDashboard() {
  const elements = new Map();
  const toasts = [];
  const doc = {
    activeElement: null,
    addEventListener() {},
    querySelectorAll: () => [],
    getElementById(id) {
      if (!elements.has(id)) {
        const listeners = {};
        const element = {
          id,
          value: '',
          listeners,
          classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
          addEventListener(type, cb) {
            listeners[type] = cb;
          },
          click() {
            this.clicked = (this.clicked || 0) + 1;
          },
          focus() {},
          blur() {}
        };
        elements.set(id, element);
      }
      return elements.get(id);
    }
  };
  const sandbox = {
    console,
    document: doc,
    window: { addEventListener() {} }
  };
  vm.runInNewContext(source + '\nbindEventListeners();', sandbox);
  sandbox.showToast = (msg) => {
    toasts.push(msg);
  };
  return {
    toasts,
    btnChooseImportFile: doc.getElementById('btnChooseImportFile'),
    importFileInput: doc.getElementById('importFileInput'),
    importInputTextarea: doc.getElementById('importInputTextarea')
  };
}

test('clicking Choose file triggers the hidden file input', () => {
  const page = makeDashboard();
  page.btnChooseImportFile.listeners.click();
  assert.equal(page.importFileInput.clicked, 1);
});

test('normal file fills importInputTextarea and resets input value', async () => {
  const page = makeDashboard();
  const target = {
    value: 'C:\\fakepath\\tabs.txt',
    files: [{ size: 100, text: async () => 'https://a.com' }]
  };

  await page.importFileInput.listeners.change({ target });

  assert.equal(page.importInputTextarea.value, 'https://a.com');
  assert.equal(target.value, '');
  assert.deepEqual(page.toasts, []);
});

test('file over 20 MB shows too large toast, never calls text(), and resets input value', async () => {
  const page = makeDashboard();
  let textCalled = false;
  const target = {
    value: 'C:\\fakepath\\huge.json',
    files: [{
      size: 20 * 1024 * 1024 + 1,
      text: async () => {
        textCalled = true;
        return 'should not be read';
      }
    }]
  };

  await page.importFileInput.listeners.change({ target });

  assert.equal(textCalled, false);
  assert.equal(page.importInputTextarea.value, '');
  assert.equal(target.value, '');
  assert.equal(page.toasts.length, 1);
  assert.match(page.toasts[0], /too large/i);
});

test('no file picked does nothing and resets input value', async () => {
  const page = makeDashboard();
  page.importInputTextarea.value = 'existing';
  const target = {
    value: 'C:\\fakepath\\old.txt',
    files: []
  };

  await page.importFileInput.listeners.change({ target });

  assert.equal(page.importInputTextarea.value, 'existing');
  assert.equal(target.value, '');
  assert.deepEqual(page.toasts, []);
});
