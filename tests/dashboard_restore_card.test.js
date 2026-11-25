const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = require('../utils/storage.js');
const { pluralize, cleanFolderTitle } = storage;
// Use the real helper if utils/storage.js exports it, otherwise a simple stand-in.
const extractHostname = storage.extractHostname || (url => {
  try { return new URL(url).hostname; } catch (e) { return ''; }
});

const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

function makeGroup(id, tabIds) {
  return {
    id,
    locked: false,
    tabs: tabIds.map(tabId => ({ id: tabId, url: 'https://' + tabId + '.example/', title: tabId }))
  };
}

// Minimal fake DOM element: enough for code that builds cards with
// document.createElement / appendChild / addEventListener / classList.
function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    listeners: {},
    dataset: {},
    style: {},
    attributes: {},
    className: '',
    textContent: '',
    title: '',
    src: '',
    href: '',
    classList: {
      add(...names) {
        const set = new Set(el.className.split(/\s+/).filter(Boolean));
        names.forEach(n => set.add(n));
        el.className = Array.from(set).join(' ');
      },
      remove(...names) {
        const set = new Set(el.className.split(/\s+/).filter(Boolean));
        names.forEach(n => set.delete(n));
        el.className = Array.from(set).join(' ');
      },
      contains(name) {
        return el.className.split(/\s+/).includes(name);
      },
      toggle() {}
    },
    appendChild(child) { el.children.push(child); return child; },
    append(...kids) { kids.forEach(k => el.children.push(k)); },
    // Cards are built with `innerHTML = \`...\`` and then wired up with
    // querySelector(...).addEventListener(...). We don't parse HTML; instead,
    // querySelector returns a stable fake element for any class that appears
    // in the innerHTML string, so handlers attach to it and can be clicked.
    innerHTML: '',
    _found: {},
    querySelector(sel) {
      if (el._found[sel]) return el._found[sel];
      if (sel[0] === '.') {
        const name = sel.slice(1).split(/[\s.>\[:]/)[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const re = new RegExp('class\\s*=\\s*"([^"]*\\s)?' + name + '(\\s[^"]*)?"');
        if (!re.test(String(el.innerHTML))) return null;
      }
      el._found[sel] = makeElement('div');
      return el._found[sel];
    },
    querySelectorAll(sel) {
      const found = el.querySelector(sel);
      return found ? [found] : [];
    },
    closest() { return null; },
    contains() { return false; },
    remove() {},
    setAttribute(k, v) { el.attributes[k] = v; },
    getAttribute(k) { return el.attributes[k]; },
    addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    click() {
      const event = { target: el, stopPropagation() {}, preventDefault() {} };
      // Returns a promise so tests can await async handlers.
      return Promise.all((el.listeners.click || []).map(fn => fn(event)));
    }
  };
  return el;
}

function findByClass(root, cls) {
  if (root.classList && root.classList.contains(cls)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, cls);
    if (found) return found;
  }
  return null;
}

function setup({ groups = [], keep = false, response } = {}) {
  const calls = { requests: [], removals: [], opened: [], removedTabs: [], toasts: [], refreshes: 0 };
  const sandbox = {
    console,
    pluralize,
    cleanFolderTitle,
    extractHostname,
    // Real answer needed here: handleOpenTab refuses URLs this says are unsafe.
    isSafeTabUrl: storage.isSafeTabUrl || (url => /^https?:\/\//i.test(String(url))),
    // Rendering helpers that createTabCardElement may call. Their output
    // doesn't matter for these tests, so simple stand-ins are enough.
    formatFullDate: () => '',
    formatDate: () => '',
    formatRelativeTime: () => '',
    escapeHtml: s => String(s),
    getFaviconUrl: () => '',
    createDomainFallbackBadge: () => '',
    // Icon lookup table: any icon name (edit, restore, delete, ...) -> empty markup.
    SVG_ICONS: new Proxy({}, { get: () => '' }),
    document: { addEventListener() {}, createElement: makeElement },
    confirm() { return true; },
    chrome: {
      tabs: {
        async create(options) { calls.opened.push(options.url); }
      },
      runtime: {
        getURL: path => 'chrome-extension://test' + path,
        async sendMessage(request) {
          calls.requests.push(JSON.parse(JSON.stringify(request)));
          return response;
        }
      }
    },
    PinfoldStorage: {
      async removeTabFromGroup(groupId, tabId) {
        calls.removedTabs.push({ groupId, tabId });
      },
      async removeRestoredTabs(ids) {
        calls.removals.push(Array.from(ids));
        return ids.length;
      }
    },
    fixture: { groups, settings: { keepTabOnRestore: keep } }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'dashboard/dashboard.js' });
  vm.runInContext('state.groups = fixture.groups; state.settings = fixture.settings;', sandbox);
  sandbox.showToast = text => calls.toasts.push(text);
  sandbox.refreshData = async () => { calls.refreshes++; };

  // Build a card for one tab of one group and return its Restore button.
  function restoreButtonFor(groupId, tabId) {
    sandbox.__groupId = groupId;
    sandbox.__tabId = tabId;
    // The card renderer calls many small display helpers (date formatting,
    // icons, badges...) that this test doesn't care about. If one is missing,
    // define a no-op stand-in for it and try again.
    let card;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        card = vm.runInContext(
          '(function () {' +
          '  const g = state.groups.find(x => x.id === __groupId);' +
          '  return createTabCardElement(g, g.tabs.find(t => t.id === __tabId));' +
          '})()',
          sandbox
        );
        break;
      } catch (err) {
        // (errors thrown inside the vm come from another realm, so no instanceof check)
        const missing = err && /^(\w+) is not defined$/.exec(String(err.message));
        if (!missing) throw err;
        sandbox[missing[1]] = () => '';
      }
    }
    assert.ok(card, 'createTabCardElement should return a card');
    const button = card.querySelector('.btn-card-restore') || findByClass(card, 'btn-card-restore');
    assert.ok(button, 'card should contain a .btn-card-restore button');
    return button;
  }

  return { calls, restoreButtonFor };
}

// Let the async handler (tabs.create -> removal -> refresh) finish.
const flush = () => new Promise(resolve => setImmediate(resolve));

test('Card Restore opens only that card\'s tab', async () => {
  const h = setup({ groups: [makeGroup('g1', ['a', 'b', 'c'])] });
  await h.restoreButtonFor('g1', 'b').click();
  await flush();

  assert.deepEqual(h.calls.opened, ['https://b.example/'], 'only the clicked tab is opened');
  assert.deepEqual(h.calls.requests, [], 'the whole group is not restored');
});

test('Card Restore removes only that tab from the list', async () => {
  const h = setup({ groups: [makeGroup('g1', ['a', 'b', 'c'])] });
  await h.restoreButtonFor('g1', 'b').click();
  await flush();

  assert.deepEqual(h.calls.removedTabs, [{ groupId: 'g1', tabId: 'b' }], 'other tabs in the group stay saved');
  assert.equal(h.calls.refreshes, 1);
});

test('Card Restore respects Keep restored tabs', async () => {
  const h = setup({ groups: [makeGroup('g1', ['a', 'b'])], keep: true });
  await h.restoreButtonFor('g1', 'a').click();
  await flush();

  assert.deepEqual(h.calls.opened, ['https://a.example/']);
  assert.deepEqual(h.calls.removedTabs, [], 'nothing is removed when the setting is on');
});