document.addEventListener('DOMContentLoaded', async () => {
  await PinfoldStorage.migrateLegacyStorage();
  renderIcons();
  await renderShortcuts();
  await loadAndApplyTheme();
  await loadStatistics();
  await renderSaveTo();
  bindActionButtons();
});

// Where the next save goes. Resets to "All tabs" every time the popup opens, so tabs
// never land in a folder by surprise. kind: 'none' | 'folder' | 'more' | 'new'
let saveTarget = { kind: 'none', folderId: null };

function folderPath(folder, byId) {
  const parts = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.title || 'Untitled folder');
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return parts.join(' / ');
}

async function renderSaveTo() {
  const chipsEl = document.getElementById('saveToChips');
  if (!chipsEl) return;
  let folders = [];
  let settings = {};
  try {
    [folders, settings] = await Promise.all([PinfoldStorage.getFolders(), PinfoldStorage.getSettings()]);
  } catch (err) {
    console.error('Pinfold folders error:', err);
  }
  const byId = new Map(folders.map(f => [f.id, f]));
  const recent = sortFoldersByRecentUse(folders).slice(0, 3);

  const chips = [{ kind: 'none', label: 'All tabs', title: 'Save without a folder' }];
  recent.forEach(f => chips.push({ kind: 'folder', folderId: f.id, label: f.title || 'Untitled folder', title: folderPath(f, byId) }));
  chips.push({ kind: 'new', label: '+ New folder', title: 'Save into a new folder' });
  if (folders.length > recent.length) chips.push({ kind: 'more', label: 'More…', title: 'Choose another folder' });

  chipsEl.textContent = '';
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'save-to-chip';
    btn.textContent = chip.label;
    btn.title = chip.title;
    btn.dataset.kind = chip.kind;
    if (chip.folderId) btn.dataset.folderId = chip.folderId;
    btn.addEventListener('click', () => selectSaveTarget(chip.kind, chip.folderId || null));
    chipsEl.appendChild(btn);
  });

  const select = document.getElementById('saveToFolderSelect');
  select.textContent = '';
  folders
    .map(f => ({ id: f.id, path: folderPath(f, byId) }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
    .forEach(f => {
      const option = document.createElement('option');
      option.value = f.id;
      option.textContent = f.path;
      select.appendChild(option);
    });

  document.getElementById('saveToNote').dataset.enabled = settings.collapseAllIntoNewFolder === true ? 'true' : 'false';
  selectSaveTarget('none', null);
}

function selectSaveTarget(kind, folderId) {
  saveTarget = { kind, folderId };
  document.querySelectorAll('.save-to-chip').forEach(btn => {
    const pressed = btn.dataset.kind === kind && (kind !== 'folder' || btn.dataset.folderId === folderId);
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });

  const input = document.getElementById('saveToNewFolderInput');
  input.hidden = kind !== 'new';
  if (kind === 'new') {
    if (!input.value) input.value = defaultFolderName('Tabs');
    input.focus();
    input.select();
  }

  const select = document.getElementById('saveToFolderSelect');
  select.hidden = kind !== 'more';
  if (kind === 'more') select.focus();

  const note = document.getElementById('saveToNote');
  note.hidden = !(kind === 'none' && note.dataset.enabled === 'true');
}

function getSaveOptions() {
  if (saveTarget.kind === 'folder' && saveTarget.folderId) return { folderId: saveTarget.folderId };
  if (saveTarget.kind === 'more') {
    const value = document.getElementById('saveToFolderSelect').value;
    return value ? { folderId: value } : {};
  }
  if (saveTarget.kind === 'new') {
    const title = document.getElementById('saveToNewFolderInput').value.trim();
    return { newFolderTitle: title || defaultFolderName('Tabs') };
  }
  return {};
}

async function loadAndApplyTheme() {
  try {
    const settings = await PinfoldStorage.getSettings();
    let activeTheme = settings.theme || 'dark';
    if (activeTheme === 'system') {
      activeTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.body.setAttribute('data-theme', activeTheme);
  } catch (e) {
    document.body.setAttribute('data-theme', 'dark');
  }
}

function renderIcons() {
  const logoEl = document.getElementById('headerLogo');
  if (logoEl) logoEl.innerHTML = SVG_ICONS.logo;
  
  const settingsEl = document.getElementById('settingsIcon');
  if (settingsEl) settingsEl.innerHTML = SVG_ICONS.settings;

  const currentTabEl = document.getElementById('iconCurrentTab');
  if (currentTabEl) currentTabEl.innerHTML = SVG_ICONS.currentTab;

  const otherTabsEl = document.getElementById('iconOtherTabs');
  if (otherTabsEl) otherTabsEl.innerHTML = SVG_ICONS.otherTabs;

  const tabsRightEl = document.getElementById('iconTabsRight');
  if (tabsRightEl) tabsRightEl.innerHTML = SVG_ICONS.tabsRight;

  const tabsLeftEl = document.getElementById('iconTabsLeft');
  if (tabsLeftEl) tabsLeftEl.innerHTML = SVG_ICONS.tabsLeft;

  const collapseAllEl = document.getElementById('iconCollapseAll');
  if (collapseAllEl) collapseAllEl.innerHTML = SVG_ICONS.collapseAll;

  const dashboardEl = document.getElementById('iconDashboard');
  if (dashboardEl) dashboardEl.innerHTML = SVG_ICONS.dashboard;

  const sleepEl = document.getElementById('iconSleepTabs');
  if (sleepEl) sleepEl.innerHTML = SVG_ICONS.moon;
}

// The browser may use different defaults (Command on macOS), leave a shortcut
// unassigned, or let the user change it, so show what it actually assigned.
// getAll() also returns _execute_action, so match by command name, not position.
async function renderShortcuts() {
  let commands = [];
  try {
    commands = await chrome.commands.getAll();
  } catch (err) {
    console.error('Pinfold shortcuts error:', err);
  }
  showShortcut(document.getElementById('kbdCurrentTab'), commands, 'send_current_tab');
  showShortcut(document.getElementById('kbdCollapseAll'), commands, 'send_all_tabs');
  showShortcut(document.getElementById('kbdOpenDashboard'), commands, 'open_dashboard');
}

function showShortcut(kbd, commands, name) {
  if (!kbd) return;
  const command = commands.find(c => c.name === name);
  const shortcut = (command && command.shortcut) || '';
  kbd.textContent = shortcut;
  kbd.hidden = !shortcut;
}

async function loadStatistics() {
  try {
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    const winTabsEl = document.getElementById('currentWindowTabsCount');
    if (winTabsEl) winTabsEl.textContent = currentTabs.length;

    const groups = await PinfoldStorage.getGroups();
    const totalSaved = groups.reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0);
    const savedEl = document.getElementById('savedTabsCount');
    if (savedEl) savedEl.textContent = totalSaved;
  } catch (err) {
    console.error('Pinfold statistics error:', err);
  }
}

function bindActionButtons() {
  const btnCollapseAll = document.getElementById('btnCollapseAll');
  if (btnCollapseAll) {
    btnCollapseAll.addEventListener('click', async () => {
      await triggerCollapse('ALL_IN_WINDOW');
    });
  }

  const btnCollapseCurrent = document.getElementById('btnCollapseCurrent');
  if (btnCollapseCurrent) {
    btnCollapseCurrent.addEventListener('click', async () => {
      await triggerCollapse('CURRENT_TAB');
    });
  }

  const btnCollapseRight = document.getElementById('btnCollapseRight');
  if (btnCollapseRight) {
    btnCollapseRight.addEventListener('click', async () => {
      await triggerCollapse('TABS_TO_RIGHT');
    });
  }

  const btnCollapseLeft = document.getElementById('btnCollapseLeft');
  if (btnCollapseLeft) {
    btnCollapseLeft.addEventListener('click', async () => {
      await triggerCollapse('TABS_TO_LEFT');
    });
  }

  const btnCollapseExceptActive = document.getElementById('btnCollapseExceptActive');
  if (btnCollapseExceptActive) {
    btnCollapseExceptActive.addEventListener('click', async () => {
      await triggerCollapse('ALL_EXCEPT_ACTIVE');
    });
  }

  const btnSleepTabs = document.getElementById('btnSleepTabs');
  if (btnSleepTabs) {
    btnSleepTabs.addEventListener('click', async () => {
      await triggerSleepTabs();
    });
  }

  const btnOpenDashboard = document.getElementById('btnOpenDashboard');
  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD' });
      window.close();
    });
  }

  const btnOpenOptions = document.getElementById('btnOpenOptions');
  if (btnOpenOptions) {
    btnOpenOptions.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options/options.html'));
      }
    });
  }
}

async function triggerSleepTabs() {
  const label = document.getElementById('labelSleepTabs');
  try {
    const currentWin = await chrome.windows.getLastFocused();
    const response = await chrome.runtime.sendMessage({
      action: 'SLEEP_TABS',
      windowId: currentWin ? currentWin.id : undefined
    });
    const slept = response && response.success ? response.sleptCount : 0;
    if (label) label.textContent = slept > 0 ? `Put ${slept} ${pluralize(slept, 'tab')} to sleep` : 'No tabs to put to sleep';
    setTimeout(() => window.close(), 1000);
  } catch (err) {
    console.error('Pinfold sleep tabs error:', err);
    window.close();
  }
}

async function triggerCollapse(scope) {
  try {
    const currentWin = await chrome.windows.getLastFocused();
    chrome.runtime.sendMessage({
      action: 'COLLAPSE_TABS',
      options: { scope, windowId: currentWin ? currentWin.id : undefined, ...getSaveOptions() }
    });
    window.close();
  } catch (err) {
    console.error('Pinfold collapse error:', err);
  }
}

