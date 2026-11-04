# Pinfold store submission kit

Copy-paste text for the **Chrome Web Store** (Developer Dashboard) and **Microsoft Edge Add-ons** (Partner Center), for Pinfold 1.0.2.

Store text fields don't render Markdown, so everything inside a fenced block is plain text you can paste as it is. Field names and limits come from the official docs listed in [Sources](#sources). Anything those docs don't state is marked **(unconfirmed)**. Check those items against the live dashboard.

> **Summary / short description:** both stores read this from the manifest `description`, and neither dashboard lets you edit it. It is 129 characters, inside the 132 limit (Chrome manifest docs and the CWS "Item summary" guidance):
>
> ```
> Local-only tab manager. Save open tabs into folders to free memory, search them, export to OneTab, Markdown or JSON. No tracking.
> ```

---

## 1. Basics

| Field | Value |
|---|---|
| Name (from manifest, read-only in both dashboards) | `Pinfold - Private Tab Manager` (29 chars) |
| Summary (CWS) / Short description (Edge), from the manifest `description` and read-only in both | See the top of this file (129 of 132 characters, plain text). |
| Category, Chrome Web Store | **Functionality & UI**. The CWS docs define it as "Extensions that enhance the Chrome user interface, such as tab managers..." Alternative: Workflow & Planning. |
| Category, Edge Add-ons | **Productivity** (unconfirmed: the Edge docs don't publish the category list, so pick the closest entry in the dropdown) |
| Language | English (United States) / `en-US`. The package has no `_locales`, so it lists a single language. |
| Homepage URL (CWS) / Website (Edge) | `https://pinfold.page` |
| Support URL (CWS) / Support contact detail (Edge) | `https://github.com/Tektrix/pinfold/issues` |
| Privacy policy URL (both) | `https://pinfold.page/privacy` |
| Mature content (both) | No / unchecked |
| Official URL (CWS) | Leave empty. The dropdown only offers sites you have verified in Search Console, and a github.com repo can't be verified. |
| YouTube video (both, optional) | None |
| Pricing / Distribution (CWS) | Free, all regions, Public |
| Availability (Edge) | Visibility: Public. Markets: all markets (default). |

---

## 2. Detailed description

Paste this into CWS **Store listing > Description** and Edge **Store listings > Details for English > Description**. Edge requires 250 to 10,000 characters and this text is inside that range. The CWS docs state no limit.

It names no browser, because Edge policy 1.1.2 says the listing "must not reference other browsers". The keyboard shortcuts are the Windows/Linux defaults.

```
Pinfold is a tab manager that keeps everything on your device. Save the tabs you are not using into folders, close them to free up memory, and reopen them later from a searchable dashboard.

Privacy is the starting point. Pinfold has no servers, no accounts, no analytics and no tracking, and it makes no network requests. Your saved tabs, folders and settings are stored only in the browser's local extension storage on this device.

SAVE TABS
- Save from the toolbar popup, the right-click menu, or keyboard shortcuts: Alt+Shift+D saves all tabs in the window, Alt+Shift+S saves the current tab, Alt+Shift+O opens the dashboard (Command+Shift on macOS).
- Choose what to save: all tabs in the window, the current tab, tabs to the left, tabs to the right, or all tabs except the active one.
- Pinned tabs stay open by default. Domains you exclude are skipped by the multi-tab actions. Private (incognito) tabs are never saved.
- The toolbar icon shows how many tabs are saved.

ORGANIZE AND FIND
- Nested folders in a sidebar tree, with a list view and a cards view.
- Search tab titles, addresses and domains. Search is a simple case-insensitive text match. Press / or Ctrl+K to jump to the search box.
- Drag and drop to reorder tabs, move tabs between groups, and move groups into folders.
- Star items to add them to Favorites, lock items so they cannot be deleted, and rename tabs and folders.
- Sort by newest, oldest, most tabs, or name.
- Restore one tab, a group, or everything. Restored tabs leave the list by default, or you can choose to keep them.
- Dark, light or system theme.

IMPORT AND EXPORT
- Export and import OneTab-compatible text, Markdown, and JSON backups. Imports can be merged with your list or replace it.
- Backups contain groups and tabs but not the folder tree yet. After an import, groups appear at the top level.

PAGE PREVIEWS (OPTIONAL, OFF BY DEFAULT)
- Turn on "Capture Page Previews" in Options to show thumbnails in the cards view.
- Turning it on asks for the optional "access to all sites" permission, because the browser requires it for taking a screenshot of a tab. Turning previews off gives that permission back.
- While previews are on, saving briefly switches to each tab and takes a small, low-quality screenshot. This is slower (about two tabs per second) and you will see the tabs switch.
- Screenshots stay on this device, are never included in exports or backups, and can be deleted from Options at any time.

OTHER OPTIONAL SETTING
- "Open Pinfold on New Tab" (off by default) shows the Pinfold dashboard when you open a new tab. Turn it off again in Options.

MEMORY ESTIMATE
- The sidebar shows a rough estimate of memory freed, based on about 50 MB per saved tab. Extensions cannot measure how much memory a tab really used, so treat this number as a ballpark, not a measurement.

PERMISSIONS, IN PLAIN WORDS
- Tabs: read the title and address of the tabs you save, close them, and reopen them later.
- Storage and unlimited storage: keep your saved tabs, folders and settings on your device, without the default size cap.
- Context menus: add the Pinfold entries to the right-click menu.
- Favicon: show site icons from the browser's own icon cache, without contacting any website.
- Access to all sites (optional): requested only if you turn on page previews, and not granted at install. Pinfold uses it for nothing else.

LIMITATIONS
- No sync between devices. Use export and import to move your list.
- Some browser-internal pages may refuse to reopen. Tabs that fail to open stay in your list.

OPEN SOURCE
Pinfold is free and open source under the MIT license. Read the code, report a problem or contribute at:
https://github.com/Tektrix/pinfold

Privacy policy:
https://pinfold.page/privacy
```

---

## 3. Chrome Web Store: Privacy practices tab

The CWS Privacy tab has these sections: **Single purpose description**, **Permission justification** (one box per manifest permission), **Remote code**, **Data usage** (disclosure checkboxes plus certification checkboxes) and **Privacy policy**. The docs state no character limits for these boxes, so keep each one short.

### Single purpose description

```
Pinfold saves the user's open tabs into a local, folder-organized list so the tabs can be closed to free memory and reopened later. Every feature (saving, organizing, searching, restoring, importing and exporting that list, and optional thumbnails of saved tabs) serves this one purpose. All data stays in chrome.storage.local on the user's device.
```

### Permission justifications

**`tabs`**
```
Pinfold reads the URL, title and pinned state of the tabs the user chooses to save (from the toolbar popup, the right-click menu or a keyboard shortcut), stores them locally, and closes those tabs. It uses chrome.tabs.create to reopen saved tabs. chrome.tabs.update is used to return focus after saving and, only when the user has turned on page previews, to activate each tab briefly so it can be captured. tabs.onCreated/onUpdated are used only for the optional "Open Pinfold on New Tab" setting (off by default). Tab data is stored in chrome.storage.local and never transmitted.
```

**`storage`**
```
Saved tabs, groups, folders and user settings are stored in chrome.storage.local on the user's device. Pinfold does not use sync storage and has no server; nothing is uploaded.
```

**`unlimitedStorage`**
```
Users can save thousands of tabs, and optional page-preview thumbnails are stored as small JPEG data URLs. This can exceed the default chrome.storage.local quota, which would make saves fail. unlimitedStorage lifts that quota. The data still stays only on the user's device.
```

**`contextMenus`**
```
Adds a "Pinfold - Tab Manager" right-click submenu (on pages and on the toolbar icon) with the save actions: send all tabs in this window, this tab, tabs to the right, tabs to the left, all tabs except the active one, and open the dashboard.
```

**`favicon`**
```
Shows the site icon next to each saved tab using the browser's local favicon cache (the extension's _favicon/ URL). This lets Pinfold display icons without ever requesting them from the saved websites or from a third-party favicon service.
```

**Host permission: `<all_urls>`** (declared under `optional_host_permissions`; fill this box if the dashboard shows a host permission justification field)
```
Optional and not granted at install. It is requested at runtime with chrome.permissions.request only when the user turns on "Capture Page Previews" in Options (off by default), because chrome.tabs.captureVisibleTab requires host access to the captured page. When the user turns previews off, Pinfold calls chrome.permissions.remove to give it back. It is used for nothing else: Pinfold has no content scripts, no scripting permission and makes no web requests. Screenshots are low-quality JPEGs stored only in chrome.storage.local and are never included in exports or backups.
```

### Are you using remote code?

Select **"No, I am not using remote code."** Justification, if a box appears:
```
All JavaScript is packaged in the extension. There are no remote scripts, fonts, CDNs, eval or new Function, and the extension makes no network requests. The extension CSP is script-src 'self'; object-src 'none'.
```

### Data usage: what to tick and why

**What the official docs say.** The CWS docs don't give a separate definition of "collect". The User Data FAQ defines "handle" and says local-only processing still has to be disclosed:

> "Generally, by 'handle' we mean collecting, transmitting, using, or sharing user data." (CWS User Data FAQ, Q2)
>
> "Extensions are required to disclose how they handle user data, even when data is processed or stored locally" (CWS User Data FAQ, Q3)

The FAQ also says the disclosures and the Limited Use certification are mandatory for every item: "Every item will need to provide these data collection disclosures and limited use certification".

**What Pinfold handles.** Pinfold stores the URLs and titles of the tabs the user saves. If the user opts in, it also stores screenshots of those pages. Nothing leaves the device, but under Q3 that handling is still disclosed. Recommended (conservative) answers:

| Data type checkbox (dashboard label, unconfirmed) | Tick? | Reason |
|---|---|---|
| Personally identifiable information | No | Not accessed |
| Health information | No | Not accessed |
| Financial and payment information | No | Not accessed |
| Authentication information | No | Not accessed (no accounts, no form or cookie access) |
| Personal communications | No | Not accessed |
| Location | No | Not accessed |
| **Web history** | **Yes** | URLs and titles of the tabs the user chooses to save, stored locally |
| User activity | No | No click, keystroke, scroll or network monitoring |
| **Website content** | **Yes** | Only with opt-in page previews: a screenshot of the saved tab, stored locally |

This matches PRIVACY.md, which already says Pinfold accesses tab titles, URLs and optional page screenshots, keeps them on the device and never sends them anywhere. The listing will show these two types next to the certifications below. If you would rather tick nothing on the grounds that nothing is collected off the device, be aware that FAQ Q3 points the other way.

**Certifications.** Tick all three. They are true because no data is ever transferred, and its only use is the user-facing save and restore feature.
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

(Checkbox wording is unconfirmed: the docs show it only in a screenshot. The substance matches the CWS Limited Use policy, which limits use to the single purpose, restricts transfer, and prohibits "Transferring, using, or selling user data to determine credit-worthiness or for lending purposes.")

### Privacy policy

```
https://pinfold.page/privacy
```

### Test instructions tab (optional)

The CWS docs call this tab optional ("only useful if the item requires restricted credentials or a paid account"). Pinfold needs no account, but you can paste the [reviewer test notes](#5-reviewer-test-notes-shared) there anyway.

---

## 4. Microsoft Edge Partner Center

Partner Center walks through these pages: **Packages**, **Availability**, **Properties**, **Privacy**, **Store listings**, then **Publish**, which opens the **Notes for certification** box.

**Properties**
- Category: Productivity (see Basics)
- Website: `https://pinfold.page`
- Support contact detail: `https://github.com/Tektrix/pinfold/issues`
- Mature content: unchecked

**Privacy page.** It has the same sections as Chrome: **Single Purpose Description**, **Permission justification**, **Are you using remote code?**, **Data usage** ("What user data do you plan to collect from users now or in the future?" and "I certify that the following disclosures are true") and **Privacy Policy URL**. Paste the section 3 text unchanged. It mentions `chrome.*` API names, which are the extension APIs Edge uses too, so it isn't referencing another browser.

**Store listings > Details for English (United States)**
- Extension name and Short description: read-only, from the manifest.
- Description: the section 2 text.
- Extension logo: `store/promo/store-logo-300x300.png`
- Small promotional tile: `store/promo/small-tile-440x280.png`
- Screenshots: `store/screenshots/01` to `05` (1280x800)
- Search terms: maximum 7 terms, 30 characters each, 21 words in total. These use 7 terms and 15 words:

```
tab manager
save tabs
tab organizer
tab folders
free memory
bookmark tabs
private tab manager
```

**Notes for certification** (paste into the box on the "Submit your extension" page):
```
No account, login or server is needed. Pinfold works fully offline and makes no network requests.

1. Install the package, then open 3 or 4 ordinary web pages (for example https://example.com and https://www.wikipedia.org) in one window.
2. Click the Pinfold toolbar icon and choose "Collapse All Tabs" (or press Alt+Shift+D). The tabs close and the Pinfold dashboard opens, with each tab saved as its own item.
3. In the dashboard: type part of a title in the search box (or press /), switch between list and cards view, drag a tab within the group, and click a saved tab to reopen it.
4. Right-click on any page to see the "Pinfold - Tab Manager" submenu with the same save actions.
5. Optional permission check: open Options (gear icon in the popup), turn on "Capture Page Previews". The browser asks for permission to access all sites; accept. Save a few tabs again: Pinfold briefly switches to each tab to take a thumbnail shown in cards view. Turn the setting off and the permission is removed again (visible in the extension's details page under site access).
6. Import / Export (dashboard) exports OneTab text, Markdown or JSON; previews are never included.

All data is in the extension's local storage. "Clear All Saved Tabs" in Options resets it.
```

---

## 5. Reviewer test notes (shared)

A two-minute path that covers every permission. It is the same as the Edge notes above and works in the CWS Test instructions tab.

1. **Install** the extension. Unpacked works too: open the extensions page, turn on Developer mode, choose Load unpacked, and select the folder that contains `manifest.json`. Pin the icon.
2. **Save tabs (`tabs`, `storage`):** open 3 or 4 normal pages in one window. Click the toolbar icon, then **Collapse All Tabs** (or press **Alt+Shift+D**). The tabs close and the dashboard opens, with each tab saved as its own item. The toolbar badge shows the count.
3. **Save one tab:** open a page and press **Alt+Shift+S**, or choose **Current Tab** in the popup.
4. **Context menu (`contextMenus`):** right-click on a page and open **Pinfold - Tab Manager**. It offers send all tabs, this tab, right, left, all except active, and open dashboard.
5. **Favicons (`favicon`):** the saved tabs show site icons, served from the browser's local cache. No requests are made.
6. **Find and restore:** press **/** in the dashboard and type part of a title. Click a saved tab to reopen it.
7. **Optional host permission (`<all_urls>`):** go to Options and turn on **Capture Page Previews**. The browser shows a permission prompt; allow it. Save tabs again and switch the dashboard to **cards** view to see the thumbnails. Then turn the setting off: the permission is removed, which you can confirm under the extension's site access. **Delete Saved Page Previews** removes the stored thumbnails.
8. **Reset:** Options > **Clear All Saved Tabs**.

---

## 6. Asset checklist

| Asset | Chrome Web Store | Edge Add-ons | File in repo | Status |
|---|---|---|---|---|
| Store icon / Extension logo | 128x128 PNG, required (docs: 96x96 artwork plus 16 px transparent padding) | 1:1, recommended 300x300, min 128x128, required | CWS: `icons/icon128.png`. Edge: `store/promo/store-logo-300x300.png` | Present: 128x128 and 300x300 |
| Screenshots | 1280x800 or 640x400; at least 1, up to 5 | 640x480 or 1280x800; up to 6, optional | `store/screenshots/01-dashboard-list.png`, `02-dashboard-cards.png`, `03-search.png`, `04-settings-privacy.png`, `05-popup.png` | Present: all 1280x800 (works for both stores) |
| Small promo tile | 440x280, optional, but items without one are listed after items with one | 440x280, optional | `store/promo/small-tile-440x280.png` | Present: 440x280 |
| Marquee / Large promotional tile | 1400x560, optional | 1400x560 PNG, optional | `store/promo/marquee-1400x560.png` (not produced) | Optional, skip |
| Promo video | YouTube link, optional | YouTube URL, optional | none | Skip |

---

## 7. Steps only the owner can do

**Before either store**
1. Build the package with `npm run package`, which produces `dist/pinfold-1.0.2.zip`. Unzip it once and check that `manifest.json` sits at the root of the zip.

**Chrome Web Store**
1. Sign in to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the Google account that will own the listing. Its email can't be changed later.
2. Turn on 2-Step Verification for that Google account. The CWS program policies require it before publishing or updating.
3. Accept the developer agreement and pay the **one-time registration fee**. The current docs don't state the amount. Google has historically charged **US$5**, so confirm on the registration screen.
4. On the Account page, set the **publisher name**, **verify the contact email** (click the link sent to it), and answer the **trader / non-trader** declaration. A trader's name, address and phone number are shown publicly.
5. Click **Add new item** and upload `dist/pinfold-1.0.2.zip`.
6. Fill in **Store listing** (sections 1, 2 and 6), **Privacy** (section 3) and **Distribution** (Free, all regions, Public). Optionally fill in **Test instructions** (section 5).
7. Click **Submit for review**. Deferred publishing is optional.

**Microsoft Edge Add-ons** (no registration fee)
1. Sign in to [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login) with a personal Microsoft account (MSA), or create one with your GitHub account. Work or school accounts can't register.
2. Complete the Edge Developer Account Registration: country/region (read-only afterwards), account type **Individual** (can't be changed later), publisher display name (50 characters max), contact info, and accept the App Developer Agreement. Wait for the confirmation email.
3. Click **Create new extension** and upload `dist/pinfold-1.0.2.zip`.
4. Fill in Availability, Properties, Privacy and Store listings (section 4), click **Publish**, paste the **Notes for certification**, and click **Publish** again. Certification can take up to 7 business days.

---

## Sources

Chrome Web Store
- Store listing fields: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Creating a great listing page (Item summary, 132 characters, plain text): https://developer.chrome.com/docs/webstore/best-listing
- Manifest `description` (no more than 132 characters): https://developer.chrome.com/docs/extensions/reference/manifest/description
- Image requirements: https://developer.chrome.com/docs/webstore/images
- Category definitions: https://developer.chrome.com/docs/webstore/best-practices
- Privacy practices tab: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- User Data FAQ ("handle", local processing): https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Limited Use policy: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Program policies (2-Step Verification): https://developer.chrome.com/docs/webstore/program-policies/policies
- Trader FAQ: https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq
- Register a developer account: https://developer.chrome.com/docs/webstore/register
- Set up the developer account (publisher name, contact email verification): https://developer.chrome.com/docs/webstore/set-up-account
- Publish in the Chrome Web Store: https://developer.chrome.com/docs/webstore/publish
- Test instructions tab: https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions

Microsoft Edge Add-ons
- Publish a Microsoft Edge extension (all Partner Center fields, limits, notes for certification): https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Register as a Microsoft Edge extension developer (no fee): https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account
- Developer policies (no references to other browsers, 7 search terms, new tab disclosure): https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies
