const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Smoke tests for the extension pages. They catch a page whose script or stylesheet
// was emptied or replaced by mistake (a contributor's PR once committed a script whose
// whole content was the literal text `$(cat /tmp/...)`), which a syntax check alone misses.

const ROOT = path.join(__dirname, '..');
const PAGES = ['dashboard', 'popup', 'options'];
const MIN_STYLED_CLASS_RATIO = 0.7;

function readPage(page) {
  const htmlPath = path.join(ROOT, page, `${page}.html`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const resolve = (ref) => path.join(path.dirname(htmlPath), ref);
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => resolve(m[1]));
  const styles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(m => resolve(m[1]));
  return { html, scripts, styles, ownScript: path.join(ROOT, page, `${page}.js`), ownStyle: path.join(ROOT, page, `${page}.css`) };
}

// Runs a page's scripts in order in one shared context, like classic <script> tags,
// with just enough of the browser stubbed for top-level code to run.
function runPageScripts(scripts) {
  const listeners = {};
  const noop = () => {};
  const stubTarget = { addEventListener: noop, removeEventListener: noop };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    document: {
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    window: stubTarget,
    navigator: {},
    chrome: { runtime: { onMessage: stubTarget }, storage: { onChanged: stubTarget } }
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of scripts) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return listeners;
}

for (const page of PAGES) {
  test(`${page}: every script and stylesheet the page loads exists and is not empty`, () => {
    const { scripts, styles, ownScript, ownStyle } = readPage(page);
    assert.ok(scripts.includes(ownScript), `${page}.html loads ${page}.js`);
    assert.ok(styles.includes(ownStyle), `${page}.html loads ${page}.css`);
    for (const file of [...scripts, ...styles]) {
      assert.ok(fs.existsSync(file), `${path.relative(ROOT, file)} exists`);
      assert.ok(fs.statSync(file).size > 500, `${path.relative(ROOT, file)} has real content`);
    }
  });

  test(`${page}: scripts run together and register the page's startup handler`, () => {
    const { scripts } = readPage(page);
    let listeners;
    assert.doesNotThrow(() => { listeners = runPageScripts(scripts); }, `${page} scripts run without throwing`);
    assert.ok((listeners.DOMContentLoaded || []).length > 0, `${page}.js registers a DOMContentLoaded handler`);
  });

  test(`${page}: every element id the script looks up exists in the HTML`, () => {
    const { html, ownScript } = readPage(page);
    const js = fs.readFileSync(ownScript, 'utf8');
    const ids = [...new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
    assert.ok(ids.length >= 10, `${page}.js looks up its page elements (found ${ids.length})`);
    const missing = ids.filter(id => !html.includes(`id="${id}"`));
    assert.deepStrictEqual(missing, [], `ids missing from ${page}.html`);
  });

  test(`${page}: the stylesheet styles most of the classes used in the HTML`, () => {
    const { html, ownStyle } = readPage(page);
    const css = fs.readFileSync(ownStyle, 'utf8');
    const classes = new Set();
    for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const styled = [...classes].filter(c => new RegExp(`\\.${escape(c)}(?![\\w-])`).test(css));
    const ratio = styled.length / classes.size;
    assert.ok(ratio >= MIN_STYLED_CLASS_RATIO,
      `${page}.css styles ${styled.length} of ${classes.size} classes used in ${page}.html (need ${MIN_STYLED_CLASS_RATIO * 100}%)`);
  });
}

test('toast containers are live regions so screen readers announce toasts', () => {
  for (const page of ['dashboard', 'options']) {
    const { html } = readPage(page);
    const match = html.match(/<div id="toastContainer"[^>]*>/);
    assert.ok(match, `${page}.html has a toast container`);
    assert.ok(match[0].includes('role="status"'), `${page} toast container has role="status"`);
    assert.ok(match[0].includes('aria-live="polite"'), `${page} toast container has aria-live="polite"`);
  }
});

test('every options control is named by its visible label', () => {
  const { html } = readPage('options');
  const tags = [...html.matchAll(/<(select|input|textarea)\b[^>]*>/g)].map(m => m[0]);
  assert.ok(tags.length >= 10, `found ${tags.length} controls on the options page`);
  for (const tag of tags) {
    assert.ok(/aria-label(ledby)?=/.test(tag), `control has an accessible name: ${tag.slice(0, 80)}`);
  }
});

test('dashboard search and sort controls have accessible names', () => {
  const { html } = readPage('dashboard');
  for (const id of ['searchInput', 'sortSelect']) {
    const tag = (html.match(new RegExp(`<(input|select)[^>]*id="${id}"[^>]*>`)) || [''])[0];
    assert.ok(tag.includes('aria-label="'), `${id} has an aria-label`);
  }
});
