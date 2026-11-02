const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

function setup(storedSettings) {
  const elements = new Map();
  const calls = { updates: [], renders: 0 };
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '',
        listeners: {},
        innerHTML: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
        addEventListener(type, listener) { this.listeners[type] = listener; }
      });
    }
    return elements.get(id);
  };
  let settings = { theme: 'light', viewMode: 'list', ...storedSettings };
  const sandbox = {
    console,
    document: {
      body: { setAttribute() {} },
      getElementById: element,
      addEventListener() {},
      querySelectorAll: () => []
    },
    window: { matchMedia: () => ({ matches: true }), addEventListener() {} },
    SVG_ICONS: { sun: 'sun', moon: 'moon' },
    PinfoldStorage: {
      async getSettings() { return settings; },
      async updateSettings(patch) {
        calls.updates.push(patch);
        settings = { ...settings, ...patch };
        return settings;
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  sandbox.renderDashboard = () => { calls.renders++; };
  return {
    calls,
    element,
    async initialize() {
      await vm.runInContext('loadSettingsAndApplyTheme()', sandbox);
      vm.runInContext('bindEventListeners()', sandbox);
    },
    stateSort: () => vm.runInContext('state.sortBy', sandbox)
  };
}

test('loads saved sort order into the dashboard and dropdown', async () => {
  const page = setup({ sortBy: 'oldest' });
  await page.initialize();
  assert.equal(page.stateSort(), 'oldest');
  assert.equal(page.element('sortSelect').value, 'oldest');
});

test('falls back to newest when saved sort order is invalid', async () => {
  const page = setup({ sortBy: 'untrusted' });
  await page.initialize();
  assert.equal(page.stateSort(), 'newest');
  assert.equal(page.element('sortSelect').value, 'newest');
});

test('changing the sort dropdown persists a settings patch and rerenders', async () => {
  const page = setup({ sortBy: 'newest' });
  await page.initialize();
  const select = page.element('sortSelect');
  select.value = 'most_tabs';
  await select.listeners.change({ target: select });
  assert.equal(page.stateSort(), 'most_tabs');
  assert.equal(page.calls.updates.length, 1);
  assert.equal(page.calls.updates[0].sortBy, 'most_tabs');
  assert.equal(page.calls.renders, 1);
});
