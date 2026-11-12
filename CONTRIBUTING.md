# Contributing to Pinfold

Thanks for helping. Pinfold is plain JavaScript, HTML and CSS with no build step and no dependencies, so you can be running your own copy in a few minutes.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/pinfold.git
   ```
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and select the repo folder (the one containing `manifest.json`).
3. After editing files:
   - Click the reload icon on the Pinfold card in `chrome://extensions`. This is required for changes to `manifest.json` and `background/service_worker.js`.
   - Refresh any open dashboard or options page, and reopen the popup, to pick up changes to those pages.

Errors from the service worker show up under **Inspect views: service worker** on the extension card. Page errors show in that page's DevTools.

## Tests

You need Node.js 22 or newer. There is nothing to install.

```bash
npm test
```

This runs `node test_pinfold.js` (manifest, icons, a scan for network calls and remote scripts, parsers) and `node --test "tests/*.test.js"` (unit tests).

- Add unit tests as `tests/<name>.test.js` using `node:test` and `node:assert`.
- `tests/storage.test.js` has an in-memory `chrome.storage.local` mock (`installChromeMock`) with asynchronous callbacks, so races behave like the real API. Copy it when you need storage in a new test file.
- If you add a new source file, add it to the `srcFiles` list in `test_pinfold.js` so it is covered by the network scan.
- `tests/pages.test.js` loads each page's scripts together and checks that every element id a script looks up exists in its HTML. If you rename or remove an element, update both files.

## Project layout

| Path | What it is |
|---|---|
| `manifest.json` | Manifest V3 config, permissions, CSP, keyboard commands |
| `background/service_worker.js` | Context menus, shortcuts, saving and restoring tabs, preview capture, badge |
| `dashboard/` | Dashboard page: folders, views, search, drag and drop, import/export dialog |
| `popup/` | Toolbar popup with the save actions |
| `options/` | Settings page |
| `utils/storage.js` | `PinfoldStorage`: all reads and writes of stored data, settings defaults, `isSafeTabUrl` |
| `utils/export_import.js` | OneTab, Markdown and JSON export and import parsing |
| `utils/groups.js` | Group display name and sorting helpers (`getGroupDisplayName`, `compareGroups`) |
| `utils/icons.js` | Inline SVG icons and small helpers |
| `icons/` | Extension icons (16, 32, 48, 128 px) |
| `generate_icons.js` | Script that regenerates the PNG icons |
| `scripts/package.js` | Builds `dist/pinfold-<version>.zip` for the Chrome Web Store and Edge Add-ons |
| `scripts/build-privacy-page.js` | Builds `site/privacy.html` from `PRIVACY.md` |
| `site/` | Static landing and privacy site (served at `pinfold.page`) |
| `store/` | Chrome Web Store and Edge Add-ons listing text, promo tiles, and screenshots |
| `test_pinfold.js`, `tests/` | Validation script and unit tests |

## Rules the code depends on

These are checked in review. PRs that break them will be asked to change.

- **Write stored data only through `PinfoldStorage`.** Its write methods run inside `withStorageLock`, which serialises read-modify-write across the service worker and every open page. Never call `chrome.storage.local.set` or `remove` from a page or the service worker. If you need a new kind of write, add a method to `PinfoldStorage` that uses `withStorageLock` and re-reads inside the lock.
- **Change settings with `PinfoldStorage.updateSettings(patch)`**, passing only the keys you are changing. New settings need a default in `DEFAULT_SETTINGS`.
- **Escape before `innerHTML`.** Any string a user or a web page controls (tab titles, URLs, folder names, imported data) must go through `escapeHtml` (in `dashboard/dashboard.js`) before it is put into `innerHTML`. Where you can, use `textContent` instead.
- **Check URLs with `isSafeTabUrl`** before a URL is saved, imported or opened. It allows only `http`, `https`, `ftp`, `file`, `chrome`, `edge` and `brave`.
- **No network.** No `fetch`, XHR or WebSockets, no remote scripts, CDNs or fonts, no analytics or telemetry. The CSP in `manifest.json` blocks most of this and `test_pinfold.js` scans for the rest. PRs that add any of it will not be accepted.
- **Permissions need a reason.** A new permission must be justified in the PR and documented in the permissions tables in `README.md` and `PRIVACY.md`. Prefer optional permissions requested at the moment they are needed.
- **Storage keys** are `pinfold_*` (`STORAGE_KEYS`). Data from pre-release builds lives under the keys in `LEGACY_STORAGE_KEYS` and is moved by `PinfoldStorage.migrateLegacyStorage()`. Do not remove the migration or its calls.

## Code style

Match the surrounding code: 2-space indent, semicolons, single quotes, plain functions and object literals, no frameworks. Keep comments sparse and use them to explain why, not what.

## Pull requests

- Look for issues labeled [good first issue](https://github.com/Tektrix/pinfold/labels/good%20first%20issue) if you are new. Comment on the issue before starting larger work so effort is not duplicated.
- Keep each PR small and focused on one change. Link the issue it addresses.
- Describe how you tested it, including which browser and version, and add tests where the logic allows.
- When behaviour changes, update `README.md` and `PRIVACY.md` as needed and add a line under "Unreleased" in `CHANGELOG.md`.
- `npm test` must pass and CI must be green.
- Commit messages: a short subject in the imperative mood, for example "Fix drag and drop into collapsed folders".

## Bugs and feature requests

Open an issue using the bug report or feature request template, and include your browser and version and the steps to reproduce.

Security problems are different: do not open a public issue. Follow [SECURITY.md](SECURITY.md) to report them privately.
