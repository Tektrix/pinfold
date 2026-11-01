const fs = require('fs');
const path = require('path');
const { ExportImport } = require('./utils/export_import.js');
const { SVG_ICONS, extractHostname } = require('./utils/icons.js');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

console.log('\n--- 1. Manifest V3 Validation ---');
const manifestPath = path.join(__dirname, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(manifest.manifest_version === 3, 'Manifest version is 3');
assert(manifest.permissions.includes('tabs') && manifest.permissions.includes('storage'), 'Contains necessary tabs and storage permissions');
assert(manifest.background && manifest.background.service_worker, 'Service worker is defined');
assert(manifest.action && manifest.action.default_popup, 'Action popup is defined');

console.log('\n--- 2. Icon Assets Validation ---');
[16, 32, 48, 128].forEach(size => {
  const iconFile = path.join(__dirname, 'icons', `icon${size}.png`);
  assert(fs.existsSync(iconFile), `icon${size}.png exists`);
  const buf = fs.readFileSync(iconFile);
  assert(buf.length > 50, `icon${size}.png has non-zero size (${buf.length} bytes)`);
  assert(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47, `icon${size}.png is a valid PNG binary`);
});

console.log('\n--- 3. Privacy & Network Isolation Audit ---');
const srcFiles = [
  'background/service_worker.js',
  'popup/popup.html',
  'popup/popup.js',
  'popup/popup.css',
  'dashboard/dashboard.html',
  'dashboard/dashboard.js',
  'dashboard/dashboard.css',
  'options/options.html',
  'options/options.js',
  'options/options.css',
  'utils/storage.js',
  'utils/export_import.js',
  'utils/icons.js'
];

let foundLeak = false;
srcFiles.forEach(file => {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  if (content.includes('fetch(') || content.includes('XMLHttpRequest') || content.includes('new WebSocket')) {
    console.error(`  Network call found in ${file}`);
    foundLeak = true;
  }
  if (content.match(/<script[^>]+src=["']https?:\/\//i) || content.match(/<link[^>]+href=["']https?:\/\//i)) {
    console.error(`  External CDN link found in ${file}`);
    foundLeak = true;
  }
});
assert(!foundLeak, 'Privacy verification PASSED: ZERO external API calls, tracking, or remote CDNs detected');

console.log('\n--- 4. Service Worker Environment Compatibility Test ---');
const vm = require('vm');
const storageCode = fs.readFileSync(path.join(__dirname, 'utils', 'storage.js'), 'utf8');
const swContext = vm.createContext({
  chrome: { storage: { local: { get: () => {}, set: () => {}, remove: () => {} } } },
  self: {},
  console: console
});

try {
  vm.runInContext(storageCode, swContext);
  assert(swContext.PinfoldStorage !== undefined, 'storage.js loads cleanly in pure Service Worker context (no window object)');
} catch (e) {
  assert(false, `storage.js threw in Service Worker context: ${e.message}`);
}

const iconsCode = fs.readFileSync(path.join(__dirname, 'utils', 'icons.js'), 'utf8');
const exportCode = fs.readFileSync(path.join(__dirname, 'utils', 'export_import.js'), 'utf8');
const browserContext = vm.createContext({
  chrome: { storage: { local: { get: () => {}, set: () => {}, remove: () => {} } } },
  console: console
});

try {
  vm.runInContext(iconsCode, browserContext);
  vm.runInContext(storageCode, browserContext);
  vm.runInContext(exportCode, browserContext);
  assert(browserContext.SVG_ICONS !== undefined && browserContext.PinfoldStorage !== undefined && browserContext.ExportImport !== undefined, 'icons.js, storage.js, and export_import.js load together in browser without identifier collisions');
} catch (e) {
  assert(false, `Multi-script browser load threw: ${e.message}`);
}

const sampleGroups = [
  {
    id: 'grp_1',
    title: 'React 19 & Next.js Docs',
    createdAt: 1720000000000,
    locked: true,
    starred: true,
    tags: ['react', 'frontend'],
    tabs: [
      { id: 't1', title: 'React 19 Overview', url: 'https://react.dev/blog', favIconUrl: '', pinned: false, createdAt: 1720000000000 },
      { id: 't2', title: 'Next.js Routing', url: 'https://nextjs.org/docs/routing', favIconUrl: '', pinned: false, createdAt: 1720000000000 }
    ]
  },
  {
    id: 'grp_2',
    title: 'GitHub PRs',
    createdAt: 1720000100000,
    locked: false,
    starred: false,
    tags: ['github'],
    tabs: [
      { id: 't3', title: 'PR #42 - Fix memory leak', url: 'https://github.com/org/repo/pull/42', favIconUrl: '', pinned: false, createdAt: 1720000100000 }
    ]
  }
];

const exportedJSON = ExportImport.exportToJSON(sampleGroups);
const parsedJSON = ExportImport.parseImport(exportedJSON);
assert(parsedJSON.groups.length === 2, 'JSON roundtrip preserves 2 groups');
assert(parsedJSON.totalTabs === 3, 'JSON roundtrip preserves 3 total tabs');
assert(parsedJSON.groups[0].tabs[0].url === 'https://react.dev/blog', 'JSON preserves tab URLs');

const exportedMD = ExportImport.exportToMarkdown(sampleGroups);
assert(exportedMD.includes('## React 19 & Next.js Docs'), 'Markdown includes group header');
assert(exportedMD.includes('[React 19 Overview](https://react.dev/blog)'), 'Markdown includes formatted link');
const parsedMD = ExportImport.parseImport(exportedMD);
assert(parsedMD.groups.length === 2, 'Markdown parser recognized 2 groups');
assert(parsedMD.totalTabs === 3, 'Markdown parser extracted 3 tabs');

const oneTabText = `https://react.dev/blog | React 19 Overview\nhttps://nextjs.org/docs/routing | Next.js Routing\n\nhttps://github.com/org/repo/pull/42 | PR #42`;
const parsedOneTab = ExportImport.parseImport(oneTabText);
assert(parsedOneTab.groups.length === 2, 'OneTab plain text parser split on double newline into 2 groups');
assert(parsedOneTab.totalTabs === 3, 'OneTab plain text parser extracted 3 tabs');
assert(parsedOneTab.groups[0].tabs[1].title === 'Next.js Routing', 'OneTab title parsing works');

console.log('\n--- 5. Utility Helpers Tests ---');
assert(extractHostname('https://subdomain.github.com/org/repo?q=1') === 'subdomain.github.com', 'extractHostname parses subdomain properly');
assert(extractHostname('https://www.google.com/search') === 'google.com', 'extractHostname removes www prefix');
assert(SVG_ICONS.logo && SVG_ICONS.search && SVG_ICONS.trash, 'Inline SVG icons are defined');

console.log('\n--- 6. CSS Syntax & Brace Integrity Tests ---');
const cssFiles = ['dashboard/dashboard.css', 'popup/popup.css', 'options/options.css'];
cssFiles.forEach(file => {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  let openBraces = (content.match(/\{/g) || []).length;
  let closeBraces = (content.match(/\}/g) || []).length;
  assert(openBraces === closeBraces, `${file} has balanced braces (${openBraces} open, ${closeBraces} close)`);
});

console.log('\n--- 7. Default Settings ---');
const { DEFAULT_SETTINGS } = require('./utils/storage.js');
assert(DEFAULT_SETTINGS.openOnNewTab === false, 'openOnNewTab is defined in DEFAULT_SETTINGS and defaults to false');
assert(DEFAULT_SETTINGS.sortBy === 'newest', 'sortBy is defined in DEFAULT_SETTINGS and defaults to newest');
assert(DEFAULT_SETTINGS.confirmTabDelete === true, 'confirmTabDelete is defined in DEFAULT_SETTINGS and defaults to true');
assert(DEFAULT_SETTINGS.capturePreviews === false, 'Page previews (screenshots) are off by default');



console.log('\n================================');
console.log(`Tests Completed: ${passedTests} passed, ${failedTests} failed.`);
if (failedTests > 0) {
  console.error('Some tests failed!');
  process.exit(1);
} else {
  console.log('All systems verified successfully!\n');
}


