importScripts('/utils/storage.js');

chrome.runtime.onInstalled.addListener(async (details) => {
  setupContextMenus();
  await PinfoldStorage.migrateLegacyStorage();
  // Versions before Pinfold required access to all sites. Hand that access back on
  // update unless the user has opted in to page previews, which still need it.
  if (details.reason === 'update') {
    const settings = await PinfoldStorage.getSettings();
    if (!settings.capturePreviews) {
      try {
        await chrome.permissions.remove({ origins: ['<all_urls>'] });
      } catch (e) {
      }
    }
  }
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await PinfoldStorage.migrateLegacyStorage();
  updateBadge();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'pinfold_main',
      title: 'Pinfold - Tab Manager',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_send_all_window',
      parentId: 'pinfold_main',
      title: 'Send all tabs in this window to Pinfold',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_send_current_tab',
      parentId: 'pinfold_main',
      title: 'Send this tab to Pinfold',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_send_right',
      parentId: 'pinfold_main',
      title: 'Send tabs to the right to Pinfold',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_send_left',
      parentId: 'pinfold_main',
      title: 'Send tabs to the left to Pinfold',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_send_all_except_active',
      parentId: 'pinfold_main',
      title: 'Send all tabs except active to Pinfold',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_sleep_other_tabs',
      parentId: 'pinfold_main',
      title: 'Sleep other tabs in this window',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_separator',
      parentId: 'pinfold_main',
      type: 'separator',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'pinfold_open_dashboard',
      parentId: 'pinfold_main',
      title: 'Open Pinfold Dashboard',
      contexts: ['page', 'action']
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'pinfold_send_all_window':
      collapseTabs({ scope: 'ALL_IN_WINDOW', windowId: tab ? tab.windowId : undefined });
      break;
    case 'pinfold_send_current_tab':
      collapseTabs({ scope: 'CURRENT_TAB', windowId: tab ? tab.windowId : undefined });
      break;
    case 'pinfold_send_right':
      collapseTabs({ scope: 'TABS_TO_RIGHT', windowId: tab ? tab.windowId : undefined });
      break;
    case 'pinfold_send_left':
      collapseTabs({ scope: 'TABS_TO_LEFT', windowId: tab ? tab.windowId : undefined });
      break;
    case 'pinfold_send_all_except_active':
      collapseTabs({ scope: 'ALL_EXCEPT_ACTIVE', windowId: tab ? tab.windowId : undefined });
      break;
    case 'pinfold_sleep_other_tabs':
      sleepOtherTabs(tab ? tab.windowId : undefined)
        .catch((err) => console.error('Pinfold sleep error:', err));
      break;
    case 'pinfold_open_dashboard':
      openDashboard({ windowId: tab ? tab.windowId : undefined });
      break;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const lastWin = await chrome.windows.getLastFocused({ populate: true });
    const winId = lastWin ? lastWin.id : undefined;

    if (command === 'send_all_tabs') {
      await collapseTabs({ scope: 'ALL_IN_WINDOW', windowId: winId });
    } else if (command === 'send_current_tab') {
      await collapseTabs({ scope: 'CURRENT_TAB', windowId: winId });
    } else if (command === 'open_dashboard') {
      await openDashboard({ windowId: winId });
    }
  } catch (err) {
    console.error('Pinfold shortcut error:', command, err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || sender.id !== chrome.runtime.id) return false;

  if (message.action === 'COLLAPSE_TABS') {
    collapseTabs(message.options || {})
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.action === 'SLEEP_TABS') {
    sleepOtherTabs(message.windowId)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.action === 'OPEN_DASHBOARD') {
    openDashboard()
      .then((tab) => sendResponse({ success: true, tab }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.action === 'RESTORE_TABS') {
    restoreTabs(message.tabs, message.options || {})
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.action === 'UPDATE_BADGE') {
    updateBadge();
    sendResponse({ success: true });
    return false;
  }
});

function canSleepTab(tab) {
  return !!(tab && Number.isInteger(tab.id) && tab.id >= 0 &&
    !tab.active && !tab.discarded && !tab.pinned && !tab.audible &&
    !tab.incognito && tab.autoDiscardable !== false &&
    typeof tab.url === 'string' && /^(https?|file):\/\//.test(tab.url));
}

async function sleepOtherTabs(windowId) {
  const tabs = await chrome.tabs.query(windowId === undefined ? { currentWindow: true } : { windowId });
  let sleptCount = 0;

  for (const tab of tabs.filter(canSleepTab)) {
    try {
      const discardedTab = await chrome.tabs.discard(tab.id);
      if (discardedTab && discardedTab.discarded) sleptCount++;
    } catch (err) {
      // A tab can close or become active while this action is running.
    }
  }

  return { sleptCount };
}

// "Open Dashboard" always opens a new tab in the window the user is in. Jumping to a
// dashboard tab in another window looked like nothing happened. Collapsing tabs passes
// reuse: true so it switches to a dashboard already open in that same window instead.
async function openDashboard({ windowId, reuse = false } = {}) {
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
  if (reuse && windowId !== undefined) {
    const tabs = await chrome.tabs.query({ windowId });
    const existingTab = tabs.find(t => t.url && t.url.startsWith(dashboardUrl));
    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      return existingTab;
    }
  }
  const createProps = { url: dashboardUrl };
  if (windowId !== undefined) createProps.windowId = windowId;
  return await chrome.tabs.create(createProps);
}

// Where a save goes: a folder made for it (popup "New folder"), a folder picked in the
// popup, a new folder for every Collapse all when that setting is on, or no folder.
async function resolveSaveFolder(options, scope, settings) {
  const newTitle = typeof options.newFolderTitle === 'string' ? options.newFolderTitle.trim().slice(0, 100) : '';
  if (newTitle) {
    return (await PinfoldStorage.addFolder(newTitle)).id;
  }
  if (options.folderId) {
    const folders = await PinfoldStorage.getFolders();
    return folders.some(f => f.id === options.folderId) ? options.folderId : null;
  }
  if (scope === 'ALL_IN_WINDOW' && settings.collapseAllIntoNewFolder) {
    return (await PinfoldStorage.addFolder(defaultFolderName('Window', true))).id;
  }
  return null;
}

async function collapseTabs(options = {}) {
  const settings = await PinfoldStorage.getSettings();
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');

  let windowId = options.windowId;
  let allTabs = [];
  let activeTab = null;

  if (windowId !== undefined) {
    try {
      const win = await chrome.windows.get(windowId, { populate: true });
      if (win && win.tabs) {
        allTabs = win.tabs;
        activeTab = allTabs.find(t => t.active);
      }
    } catch (e) {
    }
  }

  if (allTabs.length === 0) {
    try {
      const lastWin = await chrome.windows.getLastFocused({ populate: true });
      if (lastWin) {
        windowId = lastWin.id;
        allTabs = lastWin.tabs || [];
        activeTab = allTabs.find(t => t.active);
      }
    } catch (e) {
    }
  }

  if (allTabs.length === 0) {
    allTabs = await chrome.tabs.query({ currentWindow: true });
  }

  if (!activeTab && allTabs.length > 0) {
    activeTab = allTabs.find(t => t.active) || allTabs[0];
  }

  let targetTabs = [];
  const scope = options.scope || 'ALL_IN_WINDOW';

  // Never copy incognito tabs into the regular profile's storage.
  allTabs = allTabs.filter(t => !t.incognito);
  if (activeTab && activeTab.incognito) activeTab = null;

  if (scope === 'CURRENT_TAB') {
    if (activeTab && isSafeTabUrl(activeTab.url) && !activeTab.url.startsWith(dashboardUrl)) {
      targetTabs = [activeTab];
    } else {
      targetTabs = [];
    }
  } else {
    targetTabs = allTabs.filter((t) => {
      if (t.url && t.url.startsWith(dashboardUrl)) return false;
      if (settings.pinnedTabsBehavior === 'ignore' && t.pinned) return false;
      if (t.url && isDomainExcluded(t.url, settings.excludedDomains)) return false;
      if (!t.url || t.url === 'chrome://newtab/' || t.url === 'edge://newtab/') return false;
      if (!isSafeTabUrl(t.url)) return false;
      return true;
    });

    if (scope === 'TABS_TO_RIGHT' && activeTab) {
      targetTabs = targetTabs.filter(t => t.index > activeTab.index);
    } else if (scope === 'TABS_TO_LEFT' && activeTab) {
      targetTabs = targetTabs.filter(t => t.index < activeTab.index);
    } else if (scope === 'ALL_EXCEPT_ACTIVE' && activeTab) {
      targetTabs = targetTabs.filter(t => t.id !== activeTab.id);
    }
  }

  if (targetTabs.length === 0) {
    if (settings.autoOpenDashboardOnCollapse) {
      await openDashboard({ windowId, reuse: true });
    }
    return { collapsedCount: 0 };
  }

  if (await canCapturePreviews(settings) && windowId) {
    await capturePreviewImages(targetTabs, windowId, activeTab);
  }

  const folderId = await resolveSaveFolder(options, scope, settings);
  const createdItems = await PinfoldStorage.addIndividualTabs(targetTabs, {
    windowId: windowId,
    folderId
  });

  // Unfiled saves get a "just saved" banner in the dashboard offering to file them.
  if (folderId) {
    await PinfoldStorage.clearLastSave();
  } else {
    await PinfoldStorage.setLastSave({
      groupIds: createdItems.map(g => g.id),
      savedAt: Date.now()
    });
  }

  if (settings.autoOpenDashboardOnCollapse !== false) {
    await openDashboard({ windowId, reuse: true });
  }

  const tabIdsToClose = targetTabs.map(t => t.id);
  try {
    await chrome.tabs.remove(tabIdsToClose);
  } catch (err) {
    console.warn('Pinfold: Error closing tabs:', err);
  }

  await updateBadge();

  return {
    collapsedCount: targetTabs.length,
    groupId: createdItems && createdItems.length > 0 ? createdItems[0].id : null
  };
}

// Screenshots are opt-in: the user must enable them in Options, which also grants the
// optional <all_urls> host permission that captureVisibleTab needs.
async function canCapturePreviews(settings) {
  if (!settings.capturePreviews) return false;
  try {
    return await chrome.permissions.contains({ origins: ['<all_urls>'] });
  } catch (e) {
    return false;
  }
}

async function capturePreviewImages(targetTabs, windowId, activeTab) {
  for (const t of targetTabs) {
    try {
      await chrome.tabs.update(t.id, { active: true });
      // Chrome allows at most 2 captureVisibleTab calls per second.
      await new Promise(r => setTimeout(r, 550));
      const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 35 });
      if (screenshot) {
        t.previewImage = screenshot;
      }
    } catch (err) {
    }
  }

  const activeTabStaysOpen = activeTab && !targetTabs.some(t => t.id === activeTab.id);
  if (activeTabStaysOpen) {
    try {
      await chrome.tabs.update(activeTab.id, { active: true });
    } catch (e) {
    }
  }
}

// An excluded entry may hold a bare domain ("youtube.com"), a host with a port
// ("localhost:3000"), or a pasted address ("https://www.youtube.com/watch").
// Reduce each entry to the host (and optional port) it names so every form
// matches the way the settings text implies.
function normalizeDomainEntry(entry) {
  let d = String(entry ?? '').trim().toLowerCase();
  const schemeIdx = d.indexOf('://');
  if (schemeIdx !== -1) d = d.slice(schemeIdx + 3);
  const tailIdx = d.search(/[/?#]/);
  if (tailIdx !== -1) d = d.slice(0, tailIdx);
  return d.replace(/^www\./, '');
}

function isDomainExcluded(url, excludedDomains = []) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return excludedDomains.some(d => {
      const cleanD = normalizeDomainEntry(d);
      if (!cleanD) return false;
      // Entries with a port (e.g. "localhost:3000") match host:port exactly.
      if (cleanD.includes(':')) return parsed.host.toLowerCase() === cleanD;
      return host === cleanD || host.endsWith('.' + cleanD);
    });
  } catch (e) {
    return false;
  }
}

// Opens each tab independently so one rejected URL doesn't stop the rest, and reports
// which tab ids actually opened so the caller only removes those from storage.
async function restoreTabs(tabs, options = {}) {
  const result = { openedIds: [], failedIds: [] };
  if (!Array.isArray(tabs) || tabs.length === 0) return result;

  const settings = await PinfoldStorage.getSettings();
  const openInNewWindow = options.newWindow !== undefined ? options.newWindow : settings.restoreInNewWindow;

  let targetWindowId;
  for (const tab of tabs) {
    if (!tab || !isSafeTabUrl(tab.url)) {
      result.failedIds.push(tab && tab.id);
      continue;
    }
    try {
      if (openInNewWindow && targetWindowId === undefined) {
        const newWin = await chrome.windows.create({ url: tab.url, focused: true });
        targetWindowId = newWin.id;
      } else {
        await chrome.tabs.create({ windowId: targetWindowId, url: tab.url, active: false });
      }
      result.openedIds.push(tab.id);
    } catch (err) {
      result.failedIds.push(tab.id);
    }
  }
  return result;
}

async function updateBadge() {
  try {
    const groups = await PinfoldStorage.getGroups();
    const totalTabs = groups.reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0);

    if (totalTabs > 0) {
      chrome.action.setBadgeText({ text: totalTabs > 999 ? '999+' : String(totalTabs) });
      chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.GROUPS]) {
    updateBadge();
  }
});

const NEW_TAB_URLS = [
  'chrome://newtab/',
  'chrome://new-tab-page/',
  'chrome-search://local-ntp/local-ntp.html',
  'edge://newtab/'
];

function isNewTabUrl(url) {
  return !!url && NEW_TAB_URLS.some(u => url.startsWith(u));
}

// Clicking the "+" button creates the tab while the tab strip is still animating, and
// Chrome then rejects tabs.update with "Tabs cannot be edited right now (user may be
// dragging a tab)". Retry for a moment instead of giving up on the first try.
async function openDashboardInNewTab(tabId) {
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await chrome.tabs.update(tabId, { url: dashboardUrl });
      return true;
    } catch (err) {
      const message = String(err && err.message || err);
      if (!/cannot be edited right now/i.test(message)) return false;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  return false;
}

// Chrome sets openerTabId on tabs opened with the "+" button or Ctrl+T (it remembers the
// tab you came from), so an opener must not stop the redirect: only the URL matters.
chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    if (!tab.id) return;
    if (!isNewTabUrl(tab.pendingUrl) && !isNewTabUrl(tab.url)) return;

    const settings = await PinfoldStorage.getSettings();
    if (!settings.openOnNewTab) return;

    await openDashboardInNewTab(tab.id);
  } catch (err) {
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    if (!isNewTabUrl(changeInfo.url)) return;

    const settings = await PinfoldStorage.getSettings();
    if (!settings.openOnNewTab) return;

    await openDashboardInNewTab(tabId);
  } catch (err) {
  }
});



