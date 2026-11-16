const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Loads popup.js with a stub chrome.runtime.sendMessage, a fake setTimeout that
// records its callbacks instead of scheduling them, and a window.close() counter.
function loadPopup(sendMessage) {
  const elements = new Map();
  const timers = [];
  const state = { closed: 0 };
  const sandbox = {
    console: { error() {} },
    setTimeout(fn, ms) { timers.push({ fn, ms }); },
    pluralize(count, singular, plural = singular + 's') { return count === 1 ? singular : plural; },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { id, textContent: '' });
        return elements.get(id);
      }
    },
    window: { addEventListener() {}, close() { state.closed++; } },
    chrome: {
      windows: { getLastFocused: async () => ({ id: 7 }) },
      runtime: { sendMessage }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8'), sandbox);
  const label = () => sandbox.document.getElementById('labelSleepTabs').textContent;
  const runTimers = () => timers.splice(0).forEach(t => t.fn());
  return { sandbox, label, timers, runTimers, state };
}

test('popup sleep: a successful reply shows the count and closes after a second', async () => {
  let sent;
  const page = loadPopup(async (msg) => { sent = msg; return { success: true, sleptCount: 3 }; });
  await page.sandbox.triggerSleepTabs();
  assert.equal(sent.action, 'SLEEP_TABS');
  assert.equal(sent.windowId, 7);
  assert.equal(page.label(), 'Put 3 tabs to sleep');
  assert.equal(page.state.closed, 0, 'not closed straight away');
  assert.equal(page.timers.length, 1);
  assert.equal(page.timers[0].ms, 1000);
  page.runTimers();
  assert.equal(page.state.closed, 1);
});

test('popup sleep: a successful reply with nothing slept says so and still closes', async () => {
  const page = loadPopup(async () => ({ success: true, sleptCount: 0 }));
  await page.sandbox.triggerSleepTabs();
  assert.equal(page.label(), 'No tabs to put to sleep');
  page.runTimers();
  assert.equal(page.state.closed, 1);
});

test('popup sleep: { success: false } or no reply shows the failure and keeps the popup open', async () => {
  for (const reply of [{ success: false }, undefined]) {
    const page = loadPopup(async () => reply);
    await page.sandbox.triggerSleepTabs();
    assert.equal(page.label(), "Couldn't put tabs to sleep", `reply ${JSON.stringify(reply)}`);
    assert.equal(page.timers.length, 0, 'no close scheduled');
    assert.equal(page.state.closed, 0, 'popup stays open');
  }
});

test('popup sleep: a rejected sendMessage shows the failure and keeps the popup open', async () => {
  const page = loadPopup(async () => { throw new Error('Could not establish connection'); });
  await page.sandbox.triggerSleepTabs();
  assert.equal(page.label(), "Couldn't put tabs to sleep");
  assert.equal(page.timers.length, 0, 'no close scheduled');
  assert.equal(page.state.closed, 0, 'popup stays open');
});