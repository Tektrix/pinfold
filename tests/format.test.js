const test = require('node:test');
const assert = require('node:assert');
const { formatMemory, formatTimeAgo, pluralize, localDateStamp } = require('../utils/storage.js');

test('formatTimeAgo handles relative-time boundaries', (t) => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);

  const cases = [
    [59, 'Just now'],
    [60, '1m ago'],
    [23 * 60 * 60, '23h ago'],
    [24 * 60 * 60, 'Yesterday'],
    [6 * 24 * 60 * 60, '6d ago']
  ];

  cases.forEach(([secondsAgo, expected]) => {
    assert.strictEqual(formatTimeAgo(now - secondsAgo * 1000), expected);
  });
});

test('formatTimeAgo uses a locale date after six days', (t) => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);

  const timestamp = now - 7 * 24 * 60 * 60 * 1000;
  const date = new Date(timestamp);
  const expected = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });

  assert.strictEqual(formatTimeAgo(timestamp), expected);
});

test('formatTimeAgo handles future, zero and undefined timestamps', (t) => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);

  assert.strictEqual(formatTimeAgo(now + 60 * 1000), 'Just now');
  assert.strictEqual(formatTimeAgo(0), '');
  assert.strictEqual(formatTimeAgo(undefined), '');
});

test('formatMemory handles zero, negative and unit boundaries', () => {
  const cases = [
    [0, '0 MB'],
    [-1, '0 MB'],
    [1023, '1023 MB'],
    [1024, '1.0 GB'],
    [1536, '1.5 GB']
  ];

  cases.forEach(([memory, expected]) => {
    assert.strictEqual(formatMemory(memory), expected);
  });
});

test('pluralize handles zero, one, and multiple counts', () => {
  assert.strictEqual(pluralize(0, 'tab'), 'tabs');
  assert.strictEqual(pluralize(1, 'tab'), 'tab');
  assert.strictEqual(pluralize(2, 'tab'), 'tabs');
});

test('localDateStamp uses the local calendar day and zero-pads', () => {
  assert.strictEqual(localDateStamp(new Date(2026, 10, 5, 23, 30)), '2026-11-05');
  assert.strictEqual(localDateStamp(new Date(2026, 0, 9, 1, 5)), '2026-01-09');
  assert.strictEqual(localDateStamp(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});
