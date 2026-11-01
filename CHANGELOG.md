# Changelog

All notable changes to Pinfold are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Restore All now removes only confirmed reopened tabs in one locked storage write when Keep on Restore is off; failed and locked tabs stay saved.

- The dashboard theme toggle switches immediately when the system uses dark mode.

## [1.0.1] - 2026-10-26

### Added

- `npm run package` builds the store upload zip in `dist/` with only the extension's runtime files.
- Store submission kit in `store/`: listing text, permission justifications, reviewer notes, screenshots and promo images.

### Changed

- Shortened the extension description to fit the stores' 132-character limit.
- The page previews setting says "your browser" instead of naming Chrome.

## [1.0.0] - 2026-10-26

First public, open-source release.

### Added

- Save tabs from the toolbar popup, the right-click menu, or keyboard shortcuts: all tabs in the window, the current tab, tabs to the left or right, or all except the active tab.
- Dashboard with nested folders, list and cards views, search across titles, URLs and domains, drag-and-drop reordering, favorites, locked items, renaming, sorting, and dark/light/system themes.
- Restore one tab, a group, or everything, with an option to keep restored tabs in the list.
- Import and export in OneTab, Markdown and JSON backup formats.
- Excluded domains, pinned-tab handling, and a toolbar badge with the number of saved tabs.
- README, PRIVACY.md, MIT license, `node:test` unit tests (`npm test`), CI, contributor guide, Code of Conduct, security policy, and issue and pull request templates.

### Changed

- Data saved by pre-release builds migrates to the current storage format automatically, without data loss, and pre-release backups still import.
- The memory figure is shown only as a labelled estimate (about 50 MB per saved tab).

### Fixed

- Every storage write is serialized behind one lock, so parallel saves and "Delete all unlocked" can no longer overwrite each other.
- Settings are saved as merged patches, and the dashboard reloads settings when they change.
- Restore waits for the result and removes only tabs that actually opened; restoring during a search uses the full stored group.
- Locked groups keep their tabs, drag-reorder anchors on tab ids, and deleting a folder also removes its nested subfolders (their groups move to the root).
- Excluded-domain matching: `example.com` matches the domain and its subdomains; an entry with a port matches that host and port exactly.

### Security

- Page screenshots are opt-in (off by default), require the optional all-sites permission, and are never included in exports or backups.
- Removed the memory probe and the `scripting` permission.
- Favicons come from the browser's local favicon cache; Pinfold makes no requests to saved websites.
- Strict extension Content Security Policy; incognito is not allowed.
- Import hardening: imported items get fresh ids, URLs are limited to an allow-list of schemes, fields are type-coerced and size-limited, and ids are escaped in HTML.

[Unreleased]: https://github.com/Tektrix/pinfold/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/Tektrix/pinfold/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Tektrix/pinfold/releases/tag/v1.0.0
