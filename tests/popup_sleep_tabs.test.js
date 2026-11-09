const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pluralize } = require('../utils/storage.js');

const ROOT = path.join(__dirname, '..');

function loadPopup(sendMessage, getLastFocused = async () => ({ id: 7 })) {
  const handlers = {};
  const button = { disabled: false, addEventListener(name, fn) { handlers[name] = fn; } };
  const label = { textContent: 'Sleep other tabs' };
  const messages = [];
  const timers = [];
  let closed = false;
  const sandbox = {
    console: { error() {} },
    pluralize,
    document: {
      addEventListener() {},
      getElementById(id) { return { btnSleepTabs: button, sleepTabsLabel: label }[id] || null; }
    },
    window: { close() { closed = true; } },
    setTimeout(fn, delay) { timers.push({ fn, delay }); },
    chrome: {
      windows: { getLastFocused },
      runtime: { async sendMessage(message) { messages.push({ ...message }); return sendMessage(message); } }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8'), sandbox);
  sandbox.bindActionButtons();
  return { click: handlers.click, button, label, messages, timers, isClosed: () => closed };
}

for (const [count, expected] of [[0, 'No tabs to put to sleep'], [1, 'Put 1 tab to sleep'], [8, 'Put 8 tabs to sleep']]) {
  test(`the popup shows the sleep result for ${count} tabs before closing`, async () => {
    const popup = loadPopup(async () => ({ success: true, sleptCount: count }));
    await popup.click();
    assert.deepEqual(popup.messages, [{ action: 'SLEEP_TABS', windowId: 7 }]);
    assert.equal(popup.label.textContent, expected);
    assert.equal(popup.button.disabled, true);
    assert.equal(popup.isClosed(), false);
    assert.equal(popup.timers.length, 1);
    assert.equal(popup.timers[0].delay, 1000);
    popup.timers[0].fn();
    assert.equal(popup.isClosed(), true);
  });
}

test('repeated clicks do not send concurrent sleep requests or close before the reply', async () => {
  let reply;
  const popup = loadPopup(() => new Promise(resolve => { reply = resolve; }));
  const pending = popup.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(popup.label.textContent, 'Putting tabs to sleep…');
  assert.equal(popup.button.disabled, true);
  await popup.click();
  assert.equal(popup.messages.length, 1);
  assert.equal(popup.timers.length, 0);
  assert.equal(popup.isClosed(), false);
  reply({ success: true, sleptCount: 2 });
  await pending;
  await popup.click();
  assert.equal(popup.messages.length, 1);
});

for (const [name, sendMessage] of [
  ['service worker error', async () => ({ success: false, error: 'Window closed' })],
  ['missing response', async () => undefined],
  ['message rejection', async () => { throw new Error('Service worker unavailable'); }]
]) {
  test(`the popup stays open and enables retry after a ${name}`, async () => {
    let attempts = 0;
    const popup = loadPopup(() => ++attempts === 1 ? sendMessage() : { success: true, sleptCount: 1 });
    await popup.click();
    assert.equal(popup.label.textContent, 'Couldn’t sleep tabs. Try again.');
    assert.equal(popup.button.disabled, false);
    assert.equal(popup.isClosed(), false);
    assert.equal(popup.timers.length, 0);
    await popup.click();
    assert.equal(popup.label.textContent, 'Put 1 tab to sleep');
    assert.equal(attempts, 2);
  });
}

test('the popup handles window lookup failure without sending a message', async () => {
  const popup = loadPopup(() => assert.fail('No message expected'), async () => { throw new Error('No window'); });
  await popup.click();
  assert.equal(popup.button.disabled, false);
  assert.equal(popup.messages.length, 0);
  assert.equal(popup.timers.length, 0);
  assert.equal(popup.isClosed(), false);
});

test('the sleep button uses the shared row style and sits between Collapse All and Dashboard', () => {
  const html = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  assert.ok(html.indexOf('id="btnCollapseAll"') < html.indexOf('id="btnSleepTabs"'));
  assert.ok(html.indexOf('id="btnSleepTabs"') < html.indexOf('id="btnOpenDashboard"'));
  assert.match(html, /id="btnSleepTabs" class="action-row-btn" title="Free memory without closing tabs\. They reload when you click them\."/);
});
