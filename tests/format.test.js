const test = require('node:test');
const assert = require('node:assert');
const { formatMemory, formatTimeAgo, pluralize, localDateStamp, cleanFolderTitle } = require('../utils/storage.js');

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


test('localDateStamp uses the local calendar date with zero padding', () => {
  // 23:30 local: the UTC date is already tomorrow in timezones ahead of UTC,
     // but the stamp must stay on the local date
     assert.strictEqual(localDateStamp(new Date(2026, 10, 5, 23, 30)), '2026-11-05');
  assert.strictEqual(localDateStamp(new Date(2026, 0, 9, 0, 15)), '2026-01-09');
  assert.strictEqual(localDateStamp(new Date(2026, 11, 25, 12, 0)), '2026-12-25');
});

test('cleanFolderTitle trims, caps to 100 characters and rejects empty or non-string input', () => {
  // Normal text
  assert.strictEqual(cleanFolderTitle('Work'), 'Work');

  // Surrounding spaces
  assert.strictEqual(cleanFolderTitle('   Work and Reading   '), 'Work and Reading');

  // Only spaces
  assert.strictEqual(cleanFolderTitle('   '), '');

  // 150-character name
  const longName = 'A'.repeat(150);
  assert.strictEqual(cleanFolderTitle(longName), 'A'.repeat(100));
  assert.strictEqual(cleanFolderTitle(longName).length, 100);

  // Additional edge cases
  assert.strictEqual(cleanFolderTitle(''), '');
  assert.strictEqual(cleanFolderTitle(null), '');
  assert.strictEqual(cleanFolderTitle(undefined), '');
  assert.strictEqual(cleanFolderTitle(123), '');
  assert.strictEqual(cleanFolderTitle('   ' + 'B'.repeat(150) + '   '), 'B'.repeat(100));
});
