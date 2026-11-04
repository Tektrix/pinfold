const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function fakeElement(id) {
  const classes = new Set(id === 'previewModal' ? ['hidden'] : []);
  return {
    id,
    textContent: '',
    alt: '',
    attrs: {},
    focused: false,
    isConnected: true,
    set src(v) { this.attrs.src = v; },
    get src() { return this.attrs.src; },
    removeAttribute(name) { delete this.attrs[name]; },
    focus() { this.focused = true; },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))
    }
  };
}

function loadDashboard() {
  const elements = new Map();
  const sandbox = {
    console,
    URL,
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, fakeElement(id));
        return elements.get(id);
      }
    },
    window: { addEventListener() {} }
  };
  vm.createContext(sandbox);
  for (const file of ['utils/icons.js', 'dashboard/dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  return { sandbox, el: (id) => sandbox.document.getElementById(id) };
}

const TAB = { title: 'Pinfold docs', url: 'https://docs.example.com/guide', previewImage: 'data:image/jpeg;base64,AAAA' };

test('the preview modal shows the screenshot, title and domain', () => {
  const page = loadDashboard();
  const opener = fakeElement('opener');
  page.sandbox.openPreviewModal(TAB, opener);
  assert.equal(page.el('previewModal').classList.contains('hidden'), false);
  assert.equal(page.el('previewModalImage').src, TAB.previewImage);
  assert.equal(page.el('previewModalTitle').textContent, 'Pinfold docs');
  assert.equal(page.el('previewModalDomain').textContent, 'docs.example.com');
  assert.equal(page.el('btnClosePreviewModal').focused, true);
});

test('closing the preview modal hides it, drops the image and returns focus', () => {
  const page = loadDashboard();
  const opener = fakeElement('opener');
  page.sandbox.openPreviewModal(TAB, opener);
  page.sandbox.closePreviewModal();
  assert.equal(page.el('previewModal').classList.contains('hidden'), true);
  assert.equal(page.el('previewModalImage').src, undefined);
  assert.equal(opener.focused, true);
});

test('a tab without a preview does not open the modal', () => {
  const page = loadDashboard();
  page.sandbox.openPreviewModal({ ...TAB, previewImage: '' }, null);
  assert.equal(page.el('previewModal').classList.contains('hidden'), true);
});

test('cards get an expand button only when the tab has a preview', () => {
  const src = fs.readFileSync(path.join(ROOT, 'dashboard/dashboard.js'), 'utf8');
  assert.match(src, /\$\{tab\.previewImage \? `<button class="card-expand-btn btn-expand-preview"/);
});
