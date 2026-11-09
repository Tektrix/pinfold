# Pinfold Privacy Policy

Last updated: 2026-11-09

Pinfold is a tab manager browser extension. This policy explains what data it accesses, where that data is kept, and how to delete it. In short: everything stays on your device, and nothing is sent to us or to anyone else.

## What data Pinfold accesses

- **Tab titles and URLs.** When you save tabs (from the popup, the right-click menu, or a keyboard shortcut), Pinfold reads the title and address of those tabs so it can store them and reopen them later. Tabs in incognito windows are never saved.
- **Sleeping tabs.** "Sleep other tabs" checks tab URLs and browser state in the current window, then asks the browser to discard eligible tabs. It stores no data, never acts on incognito tabs and needs no new permissions. The browser reloads a sleeping tab when you click it.
- **Page screenshots (optional, off by default).** If you turn on "Capture Page Previews" in Options, Pinfold takes a small, low-quality screenshot of each tab as you save it, to show as a thumbnail in the dashboard.
- **Site icons.** Pinfold displays icons from your browser's own local favicon cache. It does not download them from websites.
- **Your settings**, such as theme, excluded domains, and restore behavior.

Apart from the optional page previews described below, Pinfold does not read page contents. It never reads form data, passwords, cookies, or browsing history.

## Where data is stored

All data is stored locally in your browser profile using the extension storage API (`chrome.storage.local`). It is not synced to other devices and is not uploaded anywhere.

## What is sent anywhere

Nothing. Pinfold has no servers, accounts, analytics, telemetry, advertising, or tracking. It loads no remote code, fonts, or other resources. No data is sold, shared with, or transferred to third parties.

Data only leaves the extension if you choose to export it (copy to the clipboard or download a file). Exports and backups never include page screenshots.

## How to delete your data

- **Delete page previews:** Options → "Delete Saved Page Previews". You can also turn previews off in Options so no new ones are captured.
- **Delete all saved tabs and folders:** Options → "Clear All Saved Tabs".
- **Delete individual items:** use the delete buttons in the dashboard (unlock locked items first).
- **Delete everything, including settings:** uninstall the extension. The browser removes all of its stored data.

## Permissions and why they are needed

| Permission | Purpose |
|---|---|
| `tabs` | Read the titles and URLs of the tabs you save, and close or reopen tabs. |
| `storage` | Keep your saved tabs, folders and settings on your device. |
| `unlimitedStorage` | Allow large collections of saved tabs (and optional previews) to fit in local storage. |
| `contextMenus` | Provide the right-click menu entries. |
| `favicon` | Show site icons from the browser's local favicon cache without contacting websites. |
| Access to all sites (optional) | Requested only if you turn on page previews. The browser requires it to take tab screenshots. It is not granted at install, and Pinfold does not use it for anything else. |

## Children's privacy

Pinfold does not collect personal information from anyone, including children.

## Changes to this policy

If this policy changes, the updated version will be published in the project repository with a new date.

## Contact

Questions or concerns: email info@pinfold.page or open an issue at https://github.com/Tektrix/pinfold/issues
