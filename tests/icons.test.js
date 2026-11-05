const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getIcon,
  createDomainFallbackBadge,
  extractHostname
} = require('../utils/icons.js');

test('extractHostname returns an empty string for empty or missing input', () => {
  assert.equal(extractHostname(''), '');
  assert.equal(extractHostname(null), '');
});

test('extractHostname returns an empty string for invalid URLs', () => {
  assert.equal(extractHostname('not a url'), '');
});

test('extractHostname handles URLs without a hostname', () => {
  assert.equal(extractHostname('file:///C:/x.html'), '');
});

test('extractHostname normalizes uppercase hostnames and removes www', () => {
  assert.equal(extractHostname('https://WWW.Example.COM/path'), 'example.com');
});

test('extractHostname omits ports from localhost URLs', () => {
  assert.equal(extractHostname('http://localhost:3000/'), 'localhost');
});

test('extractHostname preserves subdomains', () => {
  assert.equal(extractHostname('https://docs.subdomain.example.com/page'), 'docs.subdomain.example.com');
});

test('createDomainFallbackBadge uses W when the domain is empty', () => {
  const badge = createDomainFallbackBadge('');
  assert.match(badge, />\s*W\s*</);
});

test('createDomainFallbackBadge strips www before choosing its letter', () => {
  const badge = createDomainFallbackBadge('www.example.com');
  assert.match(badge, />\s*E\s*</);
  assert.doesNotMatch(badge, />\s*W\s*</);
});

test('createDomainFallbackBadge chooses a stable colour for the same domain', () => {
  const first = createDomainFallbackBadge('example.com');
  const second = createDomainFallbackBadge('example.com');
  const firstStyle = first.match(/style="([^"]+)"/)?.[1];
  const secondStyle = second.match(/style="([^"]+)"/)?.[1];

  assert.ok(firstStyle);
  assert.equal(firstStyle, secondStyle);
});

test('getIcon returns an empty string for an unknown icon name', () => {
  assert.equal(getIcon('not-a-real-icon'), '');
});

test('getIcon returns SVG markup for a known icon name', () => {
  assert.match(getIcon('search'), /^<svg[\s>]/);
});
