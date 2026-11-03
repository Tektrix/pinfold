document.addEventListener('DOMContentLoaded', async () => {
  await PinfoldStorage.migrateLegacyStorage();
  renderIcons();
  await renderShortcuts();
  await loadAndApplyTheme();
  await loadStatistics();
  bindActionButtons();
});

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

async function triggerCollapse(scope) {
  try {
    const currentWin = await chrome.windows.getLastFocused();
    chrome.runtime.sendMessage({
      action: 'COLLAPSE_TABS',
      options: { scope, windowId: currentWin ? currentWin.id : undefined }
    });
    window.close();
  } catch (err) {
    console.error('Pinfold collapse error:', err);
  }
}

