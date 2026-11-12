let currentSettings = null;

document.addEventListener('DOMContentLoaded', async () => {
  await PinfoldStorage.migrateLegacyStorage();
  renderIcons();
  await loadAndBindSettings();
  watchSystemTheme();
});

function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (currentSettings?.theme === 'system') applyTheme('system');
  });
}

function renderIcons() {
  document.getElementById('optionsLogo').innerHTML = SVG_ICONS.logo;
  document.getElementById('backToDashIcon').innerHTML = SVG_ICONS.externalLink;
  document.getElementById('privacyShieldIcon').innerHTML = SVG_ICONS.shieldCheck;
  document.getElementById('backupIcon').innerHTML = SVG_ICONS.download;
  document.getElementById('clearIcon').innerHTML = SVG_ICONS.trash;
}

async function loadAndBindSettings() {
  currentSettings = await PinfoldStorage.getSettings();
  applyTheme(currentSettings.theme);

  const themeSelect = document.getElementById('settingTheme');
  themeSelect.value = currentSettings.theme || 'system';

  const viewModeSelect = document.getElementById('settingViewMode');
  if (viewModeSelect) {
    viewModeSelect.value = currentSettings.viewMode || 'list';
  }

  const keepOnRestoreSelect = document.getElementById('settingKeepOnRestore');
  keepOnRestoreSelect.value = String(currentSettings.keepTabOnRestore === true);

  const restoreWindowSelect = document.getElementById('settingRestoreWindow');
  restoreWindowSelect.value = String(currentSettings.restoreInNewWindow === true);

  const pinnedTabsSelect = document.getElementById('settingPinnedTabs');
  pinnedTabsSelect.value = currentSettings.pinnedTabsBehavior || 'ignore';

  const autoOpenDashCheckbox = document.getElementById('settingAutoOpenDash');
  autoOpenDashCheckbox.checked = currentSettings.autoOpenDashboardOnCollapse !== false;

  const collapseIntoFolderCheckbox = document.getElementById('settingCollapseAllIntoNewFolder');
  collapseIntoFolderCheckbox.checked = currentSettings.collapseAllIntoNewFolder === true;

  const skipDuplicateCheckbox = document.getElementById('settingSkipDuplicateTabs');
  if (skipDuplicateCheckbox) {
    skipDuplicateCheckbox.checked = currentSettings.skipDuplicateTabs === true;
  }

  const openOnNewTabCheckbox = document.getElementById('settingOpenOnNewTab');
  if (openOnNewTabCheckbox) {
    openOnNewTabCheckbox.checked = currentSettings.openOnNewTab === true;
  }

  const confirmTabDeleteCheckbox = document.getElementById('settingConfirmTabDelete');
  if (confirmTabDeleteCheckbox) {
    confirmTabDeleteCheckbox.checked = currentSettings.confirmTabDelete !== false;
  }

  const capturePreviewsCheckbox = document.getElementById('settingCapturePreviews');
  capturePreviewsCheckbox.checked = currentSettings.capturePreviews === true &&
    await chrome.permissions.contains({ origins: ['<all_urls>'] });

  const confirmDeleteCheckbox = document.getElementById('settingConfirmDelete');
  confirmDeleteCheckbox.checked = currentSettings.confirmGroupDelete !== false;

  const excludedDomainsTextarea = document.getElementById('settingExcludedDomains');
  excludedDomainsTextarea.value = (currentSettings.excludedDomains || []).join('\n');

  themeSelect.addEventListener('change', async (e) => {
    applyTheme(e.target.value);
    await saveSetting({ theme: e.target.value });
  });

  if (viewModeSelect) {
    viewModeSelect.addEventListener('change', async (e) => {
      await saveSetting({ viewMode: e.target.value });
    });
  }

  keepOnRestoreSelect.addEventListener('change', async (e) => {
    await saveSetting({ keepTabOnRestore: e.target.value === 'true' });
  });

  restoreWindowSelect.addEventListener('change', async (e) => {
    await saveSetting({ restoreInNewWindow: e.target.value === 'true' });
  });

  pinnedTabsSelect.addEventListener('change', async (e) => {
    await saveSetting({ pinnedTabsBehavior: e.target.value });
  });

  autoOpenDashCheckbox.addEventListener('change', async (e) => {
    await saveSetting({ autoOpenDashboardOnCollapse: e.target.checked });
  });

  collapseIntoFolderCheckbox.addEventListener('change', async (e) => {
    await saveSetting({ collapseAllIntoNewFolder: e.target.checked });
  });

  if (skipDuplicateCheckbox) {
    skipDuplicateCheckbox.addEventListener('change', async (e) => {
      await saveSetting({ skipDuplicateTabs: e.target.checked });
    });
  }

  if (openOnNewTabCheckbox) {
    openOnNewTabCheckbox.addEventListener('change', async (e) => {
      await saveSetting({ openOnNewTab: e.target.checked });
    });
  }

  if (confirmTabDeleteCheckbox) {
    confirmTabDeleteCheckbox.addEventListener('change', async (e) => {
      await saveSetting({ confirmTabDelete: e.target.checked });
    });
  }

  confirmDeleteCheckbox.addEventListener('change', async (e) => {
    await saveSetting({ confirmGroupDelete: e.target.checked });
  });


  // Screenshots need the optional all-sites permission; ask for it only when the user opts in,
  // and give it back when they opt out.
  capturePreviewsCheckbox.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
      if (!granted) {
        e.target.checked = false;
        showToast('Permission not granted. Previews stay off');
        return;
      }
      await saveSetting({ capturePreviews: true });
    } else {
      await saveSetting({ capturePreviews: false });
      await chrome.permissions.remove({ origins: ['<all_urls>'] });
    }
  });

  excludedDomainsTextarea.addEventListener('change', async (e) => {
    const lines = e.target.value.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    await saveSetting({ excludedDomains: lines });
  });


  document.getElementById('btnBackToDashboard').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD' });
  });

  document.getElementById('btnBackupAll').addEventListener('click', async () => {
    const groups = await PinfoldStorage.getGroups();
    const json = ExportImport.exportToJSON(groups);
    ExportImport.downloadFile(`pinfold-full-backup-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
    showToast('Backup downloaded');
  });

  document.getElementById('btnClearPreviews').addEventListener('click', async () => {
    if (!confirm('Delete all saved page previews? Your saved tabs are kept.')) return;
    const cleared = await PinfoldStorage.clearPreviewImages();
    showToast(`Deleted ${cleared} page ${pluralize(cleared, 'preview')}`);
  });

  document.getElementById('btnClearAll').addEventListener('click', async () => {
    const groups = await PinfoldStorage.getGroups();
    const totalTabs = groups.reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0);

    const firstConfirm = confirm(`Are you sure you want to delete ALL ${totalTabs} saved ${pluralize(totalTabs, 'tab')}? This action cannot be undone.`);
    if (!firstConfirm) return;

    const secondConfirm = prompt('Type DELETE to confirm complete wipe:');
    if (secondConfirm !== 'DELETE') {
      alert('Deletion cancelled.');
      return;
    }

    await PinfoldStorage.clearAllData();
    showToast('All saved tabs have been cleared');
  });
}

function applyTheme(theme) {
  let activeTheme = theme;
  if (theme === 'system') {
    activeTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.body.setAttribute('data-theme', activeTheme);
}

async function saveSetting(patch) {
  currentSettings = await PinfoldStorage.updateSettings(patch);
  showToast('Settings saved');
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${SVG_ICONS.check}</span><span class="toast-text"></span>`;
  toast.querySelector('.toast-text').textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2200);
}

