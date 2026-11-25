const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Loads dashboard.js with a document that records its listeners and a setInterval
// that records its callback, then runs setupPeriodicRefresh(). renderDashboard is
// replaced with a counter, so each test can see whether a redraw happened.
function loadDashboard() {
  const listeners = {};
  const intervals = [];
  const document = {
    hidden: false,
    activeElement: null,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null
  };
  const sandbox = {
    console,
    URL,
    CSS: { escape: (s) => s },
    document,
    window: { addEventListener() {} },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; }
  };
  vm.createContext(sandbox);
  for (const file of ['utils/icons.js', 'utils/storage.js', 'dashboard/dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  let renders = 0;
  sandbox.renderDashboard = () => { renders++; };
  sandbox.setupPeriodicRefresh();

  const fire = (type) => (listeners[type] || []).forEach(fn => fn({ type }));
  const tick = () => intervals.forEach(t => t.fn());
  return { document, intervals, fire, tick, renders: () => renders };
}

test('the dashboard redraws once a minute while visible', () => {
  const page = loadDashboard();
  assert.equal(page.intervals.length, 1);
  assert.equal(page.intervals[0].ms, 60 * 1000);
  page.tick();
  assert.equal(page.renders(), 1);
});

test('no redraw while the page is hidden or the user is typing', () => {
  const page = loadDashboard();
  page.document.hidden = true;
  page.tick();
  page.document.hidden = false;
  page.document.activeElement = { tagName: 'INPUT' };
  page.tick();
  assert.equal(page.renders(), 0);
});

test('no redraw during a drag, so the dragged item is not removed', () => {
  const page = loadDashboard();
  page.fire('dragstart');
  page.tick();
  assert.equal(page.renders(), 0, 'skipped mid-drag');

  page.fire('dragend');
  page.tick();
  assert.equal(page.renders(), 1, 'redraws again after dragend');

  page.fire('dragstart');
  page.fire('drop');
  page.tick();
  assert.equal(page.renders(), 2, 'redraws again after drop');
});

test('coming back to the tab redraws, unless a drag is in progress', () => {
  const page = loadDashboard();
  page.fire('visibilitychange');
  assert.equal(page.renders(), 1);
  page.fire('dragstart');
  page.fire('visibilitychange');
  assert.equal(page.renders(), 1);
});
