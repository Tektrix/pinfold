const ESTIMATED_MB_PER_TAB = 50;

let state = {
  groups: [],
  folders: [],
  settings: null,
  activeFilter: 'all',
  viewMode: 'list',
  searchQuery: '',
  sortBy: 'newest',
  draggedTabInfo: null,
  draggedGroupInfo: null
};

document.addEventListener('DOMContentLoaded', async () => {
  await PinfoldStorage.migrateLegacyStorage();
  renderStaticIcons();
  await loadSettingsAndApplyTheme();
  await refreshData();
  bindEventListeners();
  setupStorageListener();
});

function renderStaticIcons() {
  document.getElementById('mainLogo').innerHTML = SVG_ICONS.logo;
  document.getElementById('searchIcon').innerHTML = SVG_ICONS.search;
  document.getElementById('collapseWindowIcon').innerHTML = SVG_ICONS.layers;
  document.getElementById('headerSettingsIcon').innerHTML = SVG_ICONS.settings;
}

async function loadSettingsAndApplyTheme() {
  state.settings = await PinfoldStorage.getSettings();
  state.viewMode = state.settings.viewMode || 'list';
  updateViewModeButtons();
  applyTheme(state.settings.theme);
}

function updateViewModeButtons() {
  const isCards = state.viewMode === 'cards';
  document.getElementById('btnViewCards')?.classList.toggle('active', isCards);
  document.getElementById('btnViewList')?.classList.toggle('active', !isCards);
}

function applyTheme(theme) {
  let activeTheme = theme;
  if (theme === 'system') {
    activeTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.body.setAttribute('data-theme', activeTheme);

  const themeIconEl = document.getElementById('themeIcon');
  if (activeTheme === 'light') {
    themeIconEl.innerHTML = SVG_ICONS.sun;
  } else {
    themeIconEl.innerHTML = SVG_ICONS.moon;
  }
}

async function refreshData() {
  state.groups = await PinfoldStorage.getGroups();
  state.folders = await PinfoldStorage.getFolders();
  renderDashboard();
}

async function copyUrlWithFeedback(buttonEl, url) {
  if (!buttonEl || !url) return;
  try {
    await navigator.clipboard.writeText(url);
    const originalIcon = buttonEl.innerHTML;
    buttonEl.innerHTML = SVG_ICONS.check;
    buttonEl.classList.add('copy-success');
    buttonEl.title = 'Copied!';
    showToast('URL copied to clipboard');
    setTimeout(() => {
      buttonEl.innerHTML = originalIcon;
      buttonEl.classList.remove('copy-success');
      buttonEl.title = 'Copy URL';
    }, 1500);
  } catch (err) {
    const originalIcon = buttonEl.innerHTML;
    buttonEl.innerHTML = SVG_ICONS.close;
    buttonEl.classList.add('copy-error');
    buttonEl.title = 'Failed to copy';
    showToast('Failed to copy URL');
    setTimeout(() => {
      buttonEl.innerHTML = originalIcon;
      buttonEl.classList.remove('copy-error');
      buttonEl.title = 'Copy URL';
    }, 1500);
  }
}

function renderDashboard() {

  updateSidebarCountsAndMemory();
  renderTreeView();

  if (state.groups.length === 0) {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('groupsContainer').classList.add('hidden');
    return;
  }

  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('groupsContainer').classList.remove('hidden');
  renderGroupsList();
}

function updateSidebarCountsAndMemory() {
  const totalTabs = state.groups.reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0);
  const totalFavorites = state.groups.filter(g => g.starred).reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0);

  const countAllEl = document.getElementById('countAllTabs');
  if (countAllEl) countAllEl.textContent = totalTabs;

  const countFavEl = document.getElementById('countFavorites');
  if (countFavEl) countFavEl.textContent = totalFavorites;

  document.getElementById('navAllTabs')?.classList.toggle('active', state.activeFilter === 'all');
  document.getElementById('navFavorites')?.classList.toggle('active', state.activeFilter === 'favorites');

  // Extensions can't measure a tab's real memory use, so this is a labelled rough estimate.
  const totalRamMB = totalTabs * ESTIMATED_MB_PER_TAB;
  document.getElementById('sidebarRamSaved').textContent = `~${formatMemory(totalRamMB)}`;
}

function renderTreeView() {
  const container = document.getElementById('treeViewContainer');
  container.innerHTML = '';

  const totalTabs = state.groups.reduce((acc, g) => acc + (g.tabs ? g.tabs.length : 0), 0);

  const rootNodeGroup = document.createElement('div');
  rootNodeGroup.className = 'tree-node-group';

  const isAllActive = state.activeFilter === 'all';
  const isRootCollapsed = state.settings?.rootTreeCollapsed === true;

  const rootItem = document.createElement('div');
  rootItem.className = `tree-node-item ${isAllActive ? 'active' : ''}`;
  rootItem.innerHTML = `
    <span class="tree-toggle-arrow ${isRootCollapsed ? 'collapsed' : ''}">▼</span>
    <span class="tree-node-icon">📁</span>
    <span class="tree-node-label">All</span>
    <span class="tree-node-count">${totalTabs}</span>
    <div class="tree-item-actions">
      <button class="tree-action-btn btn-add-subfolder" title="Add Folder">+</button>
    </div>
  `;

  const rootToggle = rootItem.querySelector('.tree-toggle-arrow');
  rootToggle.addEventListener('click', async (e) => {
    e.stopPropagation();
    state.settings = await PinfoldStorage.updateSettings({ rootTreeCollapsed: !isRootCollapsed });
    renderTreeView();
  });

  rootItem.addEventListener('click', () => {
    state.activeFilter = 'all';
    document.getElementById('currentViewTitle').textContent = 'All Tabs';
    renderDashboard();
  });

  rootItem.querySelector('.btn-add-subfolder').addEventListener('click', async (e) => {
    e.stopPropagation();
    const title = prompt('Enter folder name (e.g. Work, Reference):');
    if (!title) return;
    await PinfoldStorage.addFolder(title.trim(), null);
    await refreshData();
    showToast('Folder created');
  });

  setupTreeDropTarget(rootItem, null);
  rootNodeGroup.appendChild(rootItem);

  const rootChildrenContainer = document.createElement('div');
  rootChildrenContainer.className = `tree-children-container ${isRootCollapsed ? 'collapsed' : ''}`;

  const rootGroups = state.groups.filter(g => !g.folderId);
  rootGroups.forEach(group => {
    const leafItem = createTreeGroupLeaf(group);
    rootChildrenContainer.appendChild(leafItem);
  });

  const rootFolders = state.folders.filter(f => !f.parentId);
  rootFolders.forEach(folder => {
    const folderBranch = createTreeFolderBranch(folder);
    rootChildrenContainer.appendChild(folderBranch);
  });

  rootNodeGroup.appendChild(rootChildrenContainer);
  container.appendChild(rootNodeGroup);
}

function createTreeFolderBranch(folder) {
  const branchGroup = document.createElement('div');
  branchGroup.className = 'tree-node-group';

  const isFolderActive = state.activeFilter === `folder:${folder.id}`;
  const isCollapsed = !!folder.collapsed;
  const folderTabsCount = getFolderTabCount(folder.id);

  const folderItem = document.createElement('div');
  folderItem.className = `tree-node-item ${isFolderActive ? 'active' : ''}`;
  folderItem.innerHTML = `
    <span class="tree-toggle-arrow ${isCollapsed ? 'collapsed' : ''}">▼</span>
    <span class="tree-node-icon">📁</span>
    <span class="tree-node-label" title="${escapeHtml(folder.title)}">${escapeHtml(folder.title)}</span>
    <span class="tree-node-count">${folderTabsCount}</span>
    <div class="tree-item-actions">
      <button class="tree-action-btn btn-edit-folder" title="Rename folder">${SVG_ICONS.edit}</button>
      <button class="tree-action-btn btn-add-subfolder" title="Add Subfolder">+</button>
      <button class="tree-action-btn delete btn-del-folder" title="Delete folder">✕</button>
    </div>
  `;

  folderItem.querySelector('.btn-edit-folder').addEventListener('click', async (e) => {
    e.stopPropagation();
    const newTitle = prompt('Rename folder:', folder.title);
    if (newTitle !== null && newTitle.trim()) {
      await PinfoldStorage.updateFolder(folder.id, { title: newTitle.trim() });
      if (state.activeFilter === `folder:${folder.id}`) {
        document.getElementById('currentViewTitle').textContent = newTitle.trim();
      }
      await refreshData();
      showToast('Folder renamed');
    }
  });

  folderItem.querySelector('.tree-toggle-arrow').addEventListener('click', async (e) => {
    e.stopPropagation();
    await PinfoldStorage.updateFolder(folder.id, { collapsed: !folder.collapsed });
    await refreshData();
  });

  folderItem.addEventListener('click', () => {
    state.activeFilter = `folder:${folder.id}`;
    document.getElementById('currentViewTitle').textContent = folder.title;
    renderDashboard();
  });

  folderItem.querySelector('.btn-add-subfolder').addEventListener('click', async (e) => {
    e.stopPropagation();
    const title = prompt(`Enter subfolder name inside "${folder.title}":`);
    if (!title) return;
    await PinfoldStorage.addFolder(title.trim(), folder.id);
    if (folder.collapsed) {
      await PinfoldStorage.updateFolder(folder.id, { collapsed: false });
    }
    await refreshData();
    showToast('Subfolder created');
  });

  folderItem.querySelector('.btn-del-folder').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete folder "${folder.title}"? (Tabs inside will be moved to root)`)) return;
    await PinfoldStorage.deleteFolder(folder.id);
    if (state.activeFilter === `folder:${folder.id}`) {
      state.activeFilter = 'all';
    }
    await refreshData();
    showToast('Folder deleted');
  });

  setupTreeDropTarget(folderItem, folder.id);
  branchGroup.appendChild(folderItem);

  const childrenContainer = document.createElement('div');
  childrenContainer.className = `tree-children-container ${isCollapsed ? 'collapsed' : ''}`;

  const folderGroups = state.groups.filter(g => g.folderId === folder.id);
  folderGroups.forEach(group => {
    const leafItem = createTreeGroupLeaf(group);
    childrenContainer.appendChild(leafItem);
  });

  const subFolders = state.folders.filter(f => f.parentId === folder.id);
  subFolders.forEach(sub => {
    const subBranch = createTreeFolderBranch(sub);
    childrenContainer.appendChild(subBranch);
  });

  branchGroup.appendChild(childrenContainer);
  return branchGroup;
}

function createTreeGroupLeaf(group) {
  const leafItem = document.createElement('div');
  const isGroupActive = state.activeFilter === `group:${group.id}`;
  leafItem.className = `tree-node-item ${isGroupActive ? 'active' : ''}`;
  leafItem.draggable = true;

  const tabCount = group.tabs ? group.tabs.length : 0;
  const folder = state.folders.find(f => f.id === group.folderId);
  let name = group.title;
  let iconHtml = '';

  if (tabCount === 1 && group.tabs && group.tabs[0]) {
    const tab = group.tabs[0];
    name = name || tab.title || tab.url || 'Untitled Tab';
    const domain = extractHostname(tab.url);
    iconHtml = `<span class="tree-node-favicon">${buildFaviconHtml(tab, domain)}</span>`;
  } else {
    name = name || (folder ? `${folder.title}` : `${tabCount} tab${tabCount === 1 ? '' : 's'}`);
    iconHtml = `<span class="tree-node-circle">○</span>`;
  }

  leafItem.innerHTML = `
    <span class="tree-toggle-arrow hidden"></span>
    ${iconHtml}
    <span class="tree-node-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
    <button class="tree-mini-edit-btn btn-edit-tree-leaf" title="Edit name">${SVG_ICONS.edit}</button>
  `;

  attachFaviconErrorHandlers(leafItem);

  const editLeafBtn = leafItem.querySelector('.btn-edit-tree-leaf');
  if (editLeafBtn) {
    editLeafBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newTitle = prompt('Edit tab name:', name);
      if (newTitle !== null && newTitle.trim()) {
        if (tabCount === 1 && group.tabs && group.tabs[0]) {
          await PinfoldStorage.updateTabTitle(group.id, group.tabs[0].id, newTitle.trim());
        } else {
          await PinfoldStorage.updateGroup(group.id, { title: newTitle.trim() });
        }
        await refreshData();
        showToast('Name updated');
      }
    });
  }

  leafItem.addEventListener('click', () => {
    state.activeFilter = `group:${group.id}`;
    document.getElementById('currentViewTitle').textContent = name;
    renderDashboard();
  });

  leafItem.addEventListener('dragstart', (e) => {
    state.draggedGroupInfo = { groupId: group.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', group.id);
  });

  leafItem.addEventListener('dragend', () => {
    state.draggedGroupInfo = null;
    document.querySelectorAll('.tree-node-item').forEach(el => el.classList.remove('drag-target'));
  });

  return leafItem;
}

function setupTreeDropTarget(element, targetFolderId) {
  element.addEventListener('dragover', (e) => {
    if (state.draggedGroupInfo) {
      e.preventDefault();
      element.classList.add('drag-target');
    }
  });

  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-target');
  });

  element.addEventListener('drop', async (e) => {
    if (state.draggedGroupInfo) {
      e.preventDefault();
      element.classList.remove('drag-target');
      const { groupId } = state.draggedGroupInfo;
      await PinfoldStorage.assignGroupToFolder(groupId, targetFolderId);
      await refreshData();
      showToast('Tab group moved');
    }
  });
}

function getFolderTabCount(folderId) {
  let count = 0;
  state.groups.filter(g => g.folderId === folderId).forEach(g => {
    count += (g.tabs?.length || 0);
  });

  const subFolders = state.folders.filter(f => f.parentId === folderId);
  subFolders.forEach(sub => {
    count += getFolderTabCount(sub.id);
  });

  return count;
}

function renderGroupsList() {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '';

  let filteredGroups = [...state.groups];

  if (state.activeFilter === 'favorites') {
    filteredGroups = filteredGroups.filter(g => g.starred);
  } else if (state.activeFilter.startsWith('group:')) {
    const targetId = state.activeFilter.replace('group:', '');
    filteredGroups = filteredGroups.filter(g => g.id === targetId);
  } else if (state.activeFilter.startsWith('folder:')) {
    const folderId = state.activeFilter.replace('folder:', '');
    const allowedFolderIds = getFolderAndDescendantIds(folderId);
    filteredGroups = filteredGroups.filter(g => allowedFolderIds.includes(g.folderId));
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    let totalMatches = 0;

    filteredGroups = filteredGroups.map(group => {
      const matchingTabs = (group.tabs || []).filter(tab => {
        const titleMatch = tab.title && tab.title.toLowerCase().includes(q);
        const urlMatch = tab.url && tab.url.toLowerCase().includes(q);
        const domainMatch = extractHostname(tab.url).toLowerCase().includes(q);
        return titleMatch || urlMatch || domainMatch;
      });

      const groupNameMatch = group.title && group.title.toLowerCase().includes(q);
      if (groupNameMatch || matchingTabs.length > 0) {
        totalMatches += (groupNameMatch ? group.tabs : matchingTabs).length;
        return {
          ...group,
          tabs: groupNameMatch ? group.tabs : matchingTabs
        };
      }
      return null;
    }).filter(Boolean);

    const statusBar = document.getElementById('searchStatusBar');
    document.getElementById('searchStatusText').textContent = `Found ${totalMatches} tab${totalMatches === 1 ? '' : 's'} matching "${state.searchQuery}"`;
    statusBar.classList.remove('hidden');
  } else {
    document.getElementById('searchStatusBar').classList.add('hidden');
  }

  sortGroups(filteredGroups);

  if (filteredGroups.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px 0; color: var(--text-secondary);">
        <p>No tabs match your current selection.</p>
      </div>
    `;
    return;
  }

  if (state.viewMode === 'cards') {
    const gridContainer = document.createElement('div');
    gridContainer.className = 'onetab-cards-unified-grid';

    filteredGroups.forEach((group) => {
      (group.tabs || []).forEach((tab) => {
        const cardEl = createTabCardElement(group, tab);
        gridContainer.appendChild(cardEl);
      });
    });

    container.appendChild(gridContainer);
    return;
  }

  filteredGroups.forEach((group) => {
    const groupEl = createOneTabGroupElement(group);
    container.appendChild(groupEl);
  });
}

function getFolderAndDescendantIds(folderId) {
  const ids = [folderId];
  const subs = state.folders.filter(f => f.parentId === folderId);
  subs.forEach(s => {
    ids.push(...getFolderAndDescendantIds(s.id));
  });
  return ids;
}

function sortGroups(groups) {
  groups.sort((a, b) => {
    switch (state.sortBy) {
      case 'oldest':
        return (a.createdAt || 0) - (b.createdAt || 0);
      case 'most_tabs':
        return (b.tabs?.length || 0) - (a.tabs?.length || 0);
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'newest':
      default:
        return (b.createdAt || 0) - (a.createdAt || 0);
    }
  });
}

// Favicons come from Chrome's local favicon cache (the "favicon" permission), never from
// the saved site's server, so rendering the dashboard makes no network requests.
function buildFaviconHtml(tab, domain) {
  if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    const src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`);
    return `<img src="${escapeHtml(src)}" class="tab-favicon-img" data-domain="${escapeHtml(domain)}" alt="" loading="lazy" />`;
  }
  return createDomainFallbackBadge(domain);
}

function attachFaviconErrorHandlers(containerEl) {
  if (!containerEl) return;
  const imgs = containerEl.querySelectorAll('.tab-favicon-img');
  imgs.forEach(img => {
    img.addEventListener('error', () => {
      const d = img.dataset.domain || '';
      img.outerHTML = createDomainFallbackBadge(d);
    }, { once: true });
  });
}

function createOneTabGroupElement(group) {
  const tabCount = group.tabs ? group.tabs.length : 0;
  const folder = state.folders.find(f => f.id === group.folderId);
  const dateStr = formatFullDate(group.createdAt);

  const folderOptionsHtml = state.folders.map(f =>
    `<option value="${escapeHtml(f.id)}" ${f.id === group.folderId ? 'selected' : ''}>📁 ${escapeHtml(f.title)}</option>`
  ).join('');

  if (tabCount === 1) {
    const tab = group.tabs[0];
    const row = document.createElement('div');
    row.className = 'single-tab-row';
    row.dataset.groupId = group.id;
    row.dataset.tabId = tab.id;
    row.draggable = true;

    const domain = extractHostname(tab.url);
    const cleanTitle = tab.title || tab.url || 'Untitled Tab';
    const faviconHtml = buildFaviconHtml(tab, domain);

    row.innerHTML = `
      <span class="tab-drag-dot" title="Drag to reorder">⋮⋮</span>
      <button class="star-icon-btn btn-star-group ${group.starred ? 'starred' : ''}" title="${group.starred ? 'Remove from favorites' : 'Add to favorites'}">${group.starred ? '⭐' : '☆'}</button>
      <span class="tab-icon-box">${faviconHtml}</span>

      <a href="${escapeHtml(tab.url)}" class="tab-title-link" title="${escapeHtml(tab.url)}">
        ${escapeHtml(cleanTitle)}
      </a>
      <button class="row-pencil-btn btn-edit-tab-name" title="Edit tab name">${SVG_ICONS.edit}</button>
      <button class="row-copy-btn btn-copy-tab-url" title="Copy URL">${SVG_ICONS.copy}</button>
      ${folder ? `<span class="group-folder-pill" style="font-size:10.5px; padding:1px 5px;">📁 ${escapeHtml(folder.title)}</span>` : ''}
      <span class="tab-row-meta" title="${dateStr}">${formatTimeAgo(group.createdAt)} (${dateStr})</span>
      <div class="tab-row-actions">
        <button class="row-action-link btn-restore-group">Restore</button>
        <span class="sep">|</span>
        <button class="row-action-link btn-delete-group danger">Delete</button>
        <span class="sep">|</span>
        <button class="row-action-link btn-lock-group">${group.locked ? 'Unlock' : 'Lock'}</button>
        <span class="sep">|</span>
        <select class="clean-mini-select btn-move-folder" title="Move to folder">
          <option value="">📁 Move to...</option>
          <option value="root">📁 Root (All)</option>
          ${folderOptionsHtml}
        </select>
      </div>
    `;

    const editTabBtn = row.querySelector('.btn-edit-tab-name');
    if (editTabBtn) {
      editTabBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const newTitle = prompt('Edit tab name:', cleanTitle);
        if (newTitle !== null && newTitle.trim()) {
          await PinfoldStorage.updateTabTitle(group.id, tab.id, newTitle.trim());
          await refreshData();
          showToast('Tab name updated');
        }
      });
    }

    const copyTabBtn = row.querySelector('.btn-copy-tab-url');
    if (copyTabBtn) {
      copyTabBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await copyUrlWithFeedback(copyTabBtn, tab.url);
      });
    }

    row.querySelector('.tab-title-link').addEventListener('click', async (e) => {
      e.preventDefault();
      await handleOpenTab(group.id, tab, !state.settings?.keepTabOnRestore);
    });

    const moveSelect = row.querySelector('.btn-move-folder');
    moveSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (!val) return;
      const targetFolderId = val === 'root' ? null : val;
      await PinfoldStorage.assignGroupToFolder(group.id, targetFolderId);
      await refreshData();
      showToast('Tab moved');
    });

    row.querySelector('.btn-restore-group').addEventListener('click', async () => {
      await handleRestoreGroup(group);
    });

    row.querySelector('.btn-delete-group').addEventListener('click', async () => {
      if (group.locked) {
        showToast('Unlock this tab before deleting');
        return;
      }
      if (state.settings?.confirmTabDelete !== false) {
        if (!confirm('Delete this tab?')) return;
      }
      await PinfoldStorage.deleteGroup(group.id);
      await refreshData();
      showToast('Tab deleted');
    });

    row.querySelector('.btn-lock-group').addEventListener('click', async () => {
      await PinfoldStorage.updateGroup(group.id, { locked: !group.locked });
      await refreshData();
      showToast(group.locked ? 'Tab unlocked' : 'Tab locked 🔒');
    });


    row.querySelector('.btn-star-group').addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await PinfoldStorage.updateGroup(group.id, { starred: !group.starred });
      await refreshData();
      showToast(group.starred ? 'Removed from favorites' : 'Added to favorites ⭐');
    });

    let hoverTimer = null;
    row.addEventListener('mouseenter', (e) => {
      hoverTimer = setTimeout(() => {
        showHoverCard(tab, e);
      }, 150);
    });
    row.addEventListener('mousemove', (e) => {
      updateHoverCardPosition(e);
    });
    row.addEventListener('mouseleave', () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      hideHoverCard();
    });

    row.addEventListener('dragstart', (e) => {
      hideHoverCard();
      state.draggedGroupInfo = { groupId: group.id };
      state.draggedTabInfo = { sourceGroupId: group.id, tabId: tab.id };
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tab.url);
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      state.draggedGroupInfo = null;
      state.draggedTabInfo = null;
    });

    attachFaviconErrorHandlers(row);
    return row;
  }

  const groupEl = document.createElement('div');
  groupEl.className = 'onetab-group';
  groupEl.dataset.groupId = group.id;

  let groupTitle = group.title;
  if (!groupTitle) {
    groupTitle = folder ? folder.title : `${tabCount} tabs`;
  }

  groupEl.innerHTML = `
    <div class="group-title-row">
      <button class="star-icon-btn btn-star-group ${group.starred ? 'starred' : ''}" title="${group.starred ? 'Remove from favorites' : 'Add to favorites'}">${group.starred ? '⭐' : '☆'}</button>
      <input 
        type="text" 
        class="group-title-text" 
        value="${escapeHtml(groupTitle)}" 
        placeholder="Name this tab group"
        title="Click to rename"
      />
      ${folder ? `<span class="group-folder-pill" title="In folder: ${escapeHtml(folder.title)}">📁 ${escapeHtml(folder.title)}</span>` : ''}
      <span class="group-date-text">created ${formatTimeAgo(group.createdAt)} (${dateStr})</span>
    </div>

    <div class="group-links-row">
      <button class="group-link-action btn-restore-group">Restore all</button>
      <span class="sep">|</span>
      <button class="group-link-action btn-delete-group danger">Delete all</button>
      <span class="sep">|</span>
      <button class="group-link-action btn-lock-group">${group.locked ? 'Unlock' : 'Lock'}</button>
      <span class="sep">|</span>
      <select class="clean-mini-select btn-move-folder" title="Move to folder">
        <option value="">📁 Move to...</option>
        <option value="root">📁 Root (All)</option>
        ${folderOptionsHtml}
      </select>
    </div>

    <div class="group-tabs-vertical-list" data-group-id="${escapeHtml(group.id)}">
    </div>
  `;

  const listEl = groupEl.querySelector('.group-tabs-vertical-list');
  (group.tabs || []).forEach((tab) => {
    const tabEntry = createTabEntryElement(group.id, tab);
    listEl.appendChild(tabEntry);
  });

  const titleInput = groupEl.querySelector('.group-title-text');
  titleInput.addEventListener('change', async (e) => {
    const newTitle = e.target.value.trim();
    await PinfoldStorage.updateGroup(group.id, { title: newTitle });
    await refreshData();
    showToast('Group renamed');
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });

  const moveSelect = groupEl.querySelector('.btn-move-folder');
  moveSelect.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (!val) return;
    const targetFolderId = val === 'root' ? null : val;
    await PinfoldStorage.assignGroupToFolder(group.id, targetFolderId);
    await refreshData();
    showToast('Group moved');
  });

  groupEl.querySelector('.btn-restore-group').addEventListener('click', async () => {
    await handleRestoreGroup(group);
  });

  groupEl.querySelector('.btn-delete-group').addEventListener('click', async () => {
    if (group.locked) {
      showToast('Unlock this group before deleting');
      return;
    }
    if (state.settings?.confirmGroupDelete) {
      const storedGroup = state.groups.find(g => g.id === group.id) || group;
      if (!confirm(`Delete this group of ${storedGroup.tabs.length} tabs?`)) return;
    }
    await PinfoldStorage.deleteGroup(group.id);
    await refreshData();
    showToast('Group deleted');
  });

  groupEl.querySelector('.btn-lock-group').addEventListener('click', async () => {
    await PinfoldStorage.updateGroup(group.id, { locked: !group.locked });
    await refreshData();
    showToast(group.locked ? 'Group unlocked' : 'Group locked 🔒');
  });


  groupEl.querySelector('.btn-star-group').addEventListener('click', async (e) => {
    e.stopPropagation();
    await PinfoldStorage.updateGroup(group.id, { starred: !group.starred });
    await refreshData();
    showToast(group.starred ? 'Removed from favorites' : 'Added to favorites ⭐');
  });

  setupGroupDragDrop(listEl, group.id);
  return groupEl;
}

function createTabCardElement(group, tab) {
  const card = document.createElement('div');
  card.className = 'tab-card-entry';
  card.dataset.tabId = tab.id;
  card.dataset.groupId = group.id;
  card.draggable = true;

  const domain = extractHostname(tab.url);
  const cleanTitle = tab.title || tab.url || 'Untitled Tab';
  const folder = state.folders.find(f => f.id === group.folderId);
  const dateStr = formatFullDate(group.createdAt);

  const folderOptionsHtml = state.folders.map(f =>
    `<option value="${escapeHtml(f.id)}" ${f.id === group.folderId ? 'selected' : ''}>📁 ${escapeHtml(f.title)}</option>`
  ).join('');

  let cleanPath = '';
  try {
    const parsed = new URL(tab.url);
    if (parsed.pathname && parsed.pathname !== '/') {
      cleanPath = parsed.pathname + (parsed.search ? parsed.search.slice(0, 25) + '...' : '');
    }
  } catch (e) {
    cleanPath = '';
  }

  let thumbnailHtml = '';
  if (tab.previewImage) {
    thumbnailHtml = `<img src="${escapeHtml(tab.previewImage)}" alt="${escapeHtml(cleanTitle)}" loading="lazy" />`;
  } else {
    thumbnailHtml = `
      <div class="tab-card-placeholder">
        <div class="placeholder-top-bar">
          <span class="placeholder-dot"></span>
          <span class="placeholder-dot"></span>
          <span class="placeholder-dot"></span>
          <span class="placeholder-domain-tag">${escapeHtml(domain)}</span>
        </div>
        <div class="placeholder-body">
          ${createDomainFallbackBadge(domain)}
          ${cleanPath ? `<span class="placeholder-path-pill" title="${escapeHtml(tab.url)}">${escapeHtml(cleanPath)}</span>` : `<span class="placeholder-domain-title">${escapeHtml(domain)}</span>`}
        </div>
      </div>
    `;
  }

  const faviconHtml = buildFaviconHtml(tab, domain);

  card.innerHTML = `
    <div class="tab-card-preview-wrap">
      ${thumbnailHtml}
    </div>
    <div class="tab-card-info">
      <div class="tab-card-header">
        <span class="tab-icon-box">${faviconHtml}</span>
        <span class="tab-card-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</span>
        <button class="card-pencil-btn btn-edit-card-title" title="Edit tab name">${SVG_ICONS.edit}</button>
      </div>
      <div class="tab-card-domain-row">
        <span class="tab-card-domain" title="${escapeHtml(tab.url)}">${escapeHtml(domain)}</span>
        <button class="card-copy-btn btn-copy-card-url" title="Copy URL">${SVG_ICONS.copy}</button>
      </div>
    </div>
    <div class="tab-card-footer">
      <div class="tab-card-footer-meta">
        <div class="tab-card-meta-left">
          <button class="star-icon-btn btn-card-star ${group.starred ? 'starred' : ''}" title="${group.starred ? 'Remove from favorites' : 'Add to favorites'}">${group.starred ? '⭐' : '☆'}</button>
          <span title="${dateStr}">${formatTimeAgo(group.createdAt)}</span>
        </div>
        ${folder ? `<span class="group-folder-pill" style="font-size:10px; padding:1px 4px;">📁 ${escapeHtml(folder.title)}</span>` : ''}
      </div>
      <div class="tab-card-footer-actions">
        <button class="card-action-btn btn-card-restore">Restore</button>
        <span class="sep">|</span>
        <button class="card-action-btn btn-card-delete danger">Delete</button>
        <span class="sep">|</span>
        <button class="card-action-btn btn-card-lock">${group.locked ? 'Unlock' : 'Lock'}</button>
        <span class="sep">|</span>
        <select class="clean-mini-select btn-card-move" title="Move to folder">
          <option value="">📁 Move to...</option>
          <option value="root">📁 Root (All)</option>
          ${folderOptionsHtml}
        </select>
      </div>
    </div>
  `;

  attachFaviconErrorHandlers(card);

  const editCardBtn = card.querySelector('.btn-edit-card-title');
  if (editCardBtn) {
    editCardBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newTitle = prompt('Edit tab name:', cleanTitle);
      if (newTitle !== null && newTitle.trim()) {
        await PinfoldStorage.updateTabTitle(group.id, tab.id, newTitle.trim());
        await refreshData();
        showToast('Tab name updated');
      }
    });
  }

  const copyCardBtn = card.querySelector('.btn-copy-card-url');
  if (copyCardBtn) {
    copyCardBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await copyUrlWithFeedback(copyCardBtn, tab.url);
    });
  }

  card.querySelector('.tab-card-preview-wrap').addEventListener('click', async () => {
    await handleOpenTab(group.id, tab, !state.settings?.keepTabOnRestore);
  });
  card.querySelector('.tab-card-info').addEventListener('click', async () => {
    await handleOpenTab(group.id, tab, !state.settings?.keepTabOnRestore);
  });

  card.querySelector('.btn-card-restore').addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleRestoreGroup(group);
  });

  card.querySelector('.btn-card-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (group.locked) {
      showToast('Unlock this group before deleting');
      return;
    }
    if (state.settings?.confirmTabDelete !== false) {
      if (!confirm('Delete this tab?')) return;
    }
    await PinfoldStorage.removeTabFromGroup(group.id, tab.id);
    await refreshData();
    showToast('Tab deleted');
  });

  card.querySelector('.btn-card-move').addEventListener('change', async (e) => {
    e.stopPropagation();
    const val = e.target.value;
    if (!val) return;
    const targetFolderId = val === 'root' ? null : val;
    await PinfoldStorage.assignGroupToFolder(group.id, targetFolderId);
    await refreshData();
    showToast('Card moved');
  });

  card.querySelector('.btn-card-lock').addEventListener('click', async (e) => {
    e.stopPropagation();
    await PinfoldStorage.updateGroup(group.id, { locked: !group.locked });
    await refreshData();
    showToast(group.locked ? 'Card unlocked' : 'Card locked 🔒');
  });


  card.querySelector('.btn-card-star').addEventListener('click', async (e) => {
    e.stopPropagation();
    await PinfoldStorage.updateGroup(group.id, { starred: !group.starred });
    await refreshData();
    showToast(group.starred ? 'Removed from favorites' : 'Added to favorites ⭐');
  });

  card.addEventListener('dragstart', (e) => {
    state.draggedGroupInfo = { groupId: group.id };
    state.draggedTabInfo = { sourceGroupId: group.id, tabId: tab.id };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.url);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    state.draggedGroupInfo = null;
    state.draggedTabInfo = null;
    document.querySelectorAll('.tab-card-entry').forEach(c => c.classList.remove('drag-target'));
  });

  return card;
}

function createTabEntryElement(groupId, tab) {
  const row = document.createElement('div');
  row.className = 'tab-entry-row';
  row.dataset.tabId = tab.id;
  row.dataset.groupId = groupId;
  row.draggable = true;

  const domain = extractHostname(tab.url);
  const cleanTitle = tab.title || tab.url || 'Untitled Tab';
  const faviconHtml = buildFaviconHtml(tab, domain);

  row.innerHTML = `
    <span class="tab-drag-dot" title="Drag to reorder">⋮⋮</span>
    <span class="tab-icon-box">${faviconHtml}</span>
    <a href="${escapeHtml(tab.url)}" class="tab-title-link" title="${escapeHtml(tab.url)}">
      ${escapeHtml(cleanTitle)}
    </a>
    <button class="row-pencil-btn btn-edit-entry-title" title="Edit tab name">${SVG_ICONS.edit}</button>
    <button class="row-copy-btn btn-copy-entry-url" title="Copy URL">${SVG_ICONS.copy}</button>
    <div class="tab-actions-hover">
      <button class="tab-mini-action delete-btn" title="Delete tab">✕</button>
    </div>
  `;

  attachFaviconErrorHandlers(row);

  const editEntryBtn = row.querySelector('.btn-edit-entry-title');
  if (editEntryBtn) {
    editEntryBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newTitle = prompt('Edit tab name:', cleanTitle);
      if (newTitle !== null && newTitle.trim()) {
        await PinfoldStorage.updateTabTitle(groupId, tab.id, newTitle.trim());
        await refreshData();
        showToast('Tab name updated');
      }
    });
  }

  const copyEntryBtn = row.querySelector('.btn-copy-entry-url');
  if (copyEntryBtn) {
    copyEntryBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await copyUrlWithFeedback(copyEntryBtn, tab.url);
    });
  }

  const titleLink = row.querySelector('.tab-title-link');
  titleLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleOpenTab(groupId, tab, !state.settings?.keepTabOnRestore);
  });

  row.querySelector('.delete-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (state.settings?.confirmTabDelete !== false) {
      if (!confirm('Delete this tab?')) return;
    }
    hideHoverCard();
    const removed = await PinfoldStorage.removeTabFromGroup(groupId, tab.id);
    await refreshData();
    showToast(removed ? 'Tab deleted' : 'Unlock this group before deleting');
  });



  let hoverTimer = null;
  row.addEventListener('mouseenter', (e) => {
    hoverTimer = setTimeout(() => {
      showHoverCard(tab, e);
    }, 150);
  });

  row.addEventListener('mousemove', (e) => {
    updateHoverCardPosition(e);
  });

  row.addEventListener('mouseleave', () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hideHoverCard();
  });

  row.addEventListener('dragstart', (e) => {
    hideHoverCard();
    state.draggedTabInfo = { sourceGroupId: groupId, tabId: tab.id };
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.url);
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    state.draggedTabInfo = null;
    document.querySelectorAll('.tab-entry-row').forEach(r => {
      r.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });

  return row;
}

function setupGroupDragDrop(listEl, targetGroupId) {
  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetRow = e.target.closest('.tab-entry-row');
    if (!targetRow) return;

    const rect = targetRow.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      targetRow.classList.add('drag-over-top');
      targetRow.classList.remove('drag-over-bottom');
    } else {
      targetRow.classList.add('drag-over-bottom');
      targetRow.classList.remove('drag-over-top');
    }
  });

  listEl.addEventListener('dragleave', (e) => {
    const targetRow = e.target.closest('.tab-entry-row');
    if (targetRow) {
      targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });

  listEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!state.draggedTabInfo) return;

    const { sourceGroupId, tabId } = state.draggedTabInfo;
    const targetRow = e.target.closest('.tab-entry-row');

    const anchorTabId = targetRow ? targetRow.dataset.tabId : null;
    const placeAfter = targetRow ? targetRow.classList.contains('drag-over-bottom') : false;

    await PinfoldStorage.moveTab(sourceGroupId, targetGroupId, tabId, anchorTabId, placeAfter);
    await refreshData();
    showToast('Tab moved');
  });
}

async function handleOpenTab(groupId, tab, removeFromList = false) {
  if (!isSafeTabUrl(tab.url)) {
    showToast('This link type cannot be opened');
    return;
  }

  try {
    await chrome.tabs.create({ url: tab.url, active: true });
  } catch (err) {
    showToast('Could not open this tab');
    return;
  }

  if (removeFromList) {
    await PinfoldStorage.removeTabFromGroup(groupId, tab.id);
    await refreshData();
  }
}

// The rendered group may be a search-filtered copy, so always restore the stored
// group, and only remove the tabs the background confirms it opened.
async function handleRestoreGroup(renderedGroup) {
  const group = state.groups.find(g => g.id === renderedGroup.id) || renderedGroup;
  if (!group.tabs || group.tabs.length === 0) return;

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      action: 'RESTORE_TABS',
      tabs: group.tabs.map(t => ({ id: t.id, url: t.url })),
      options: { newWindow: state.settings?.restoreInNewWindow }
    });
  } catch (err) {
    response = null;
  }

  if (!response || !response.success) {
    showToast('Restore failed. Your tabs are still saved.');
    return;
  }

  const openedIds = response.openedIds || [];
  if (!state.settings?.keepTabOnRestore && !group.locked && openedIds.length > 0) {
    await PinfoldStorage.removeTabsFromGroup(group.id, openedIds);
  }

  await refreshData();
  const failedCount = (response.failedIds || []).length;
  showToast(failedCount > 0
    ? `Restored ${openedIds.length} tabs. ${failedCount} could not be opened and were kept.`
    : `Restored ${openedIds.length} tabs`);
}

async function handleRestoreAll() {
  const allTabs = state.groups.flatMap(g => (g.tabs || []).map(t => ({ id: t.id, url: t.url })));
  if (allTabs.length === 0) return;
  if (!confirm(`Restore all ${allTabs.length} tabs?`)) return;

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      action: 'RESTORE_TABS',
      tabs: allTabs,
      options: { newWindow: true }
    });
  } catch (err) {
    response = null;
  }

  if (!response || !response.success) {
    showToast('Restore failed. Your tabs are still saved.');
    return;
  }

  const openedIds = new Set(Array.isArray(response.openedIds) ? response.openedIds : []);
  if (!state.settings?.keepTabOnRestore && openedIds.size > 0) {
    await PinfoldStorage.removeRestoredTabs([...openedIds]);
  }

  await refreshData();
  const failedCount = Array.isArray(response.failedIds) ? response.failedIds.length : 0;
  showToast(failedCount > 0
    ? `Restored ${openedIds.size} tabs. ${failedCount} could not be opened and were kept.`
    : `Restored ${openedIds.size} tabs`);
}

function bindEventListeners() {
  document.getElementById('navAllTabs')?.addEventListener('click', () => {
    state.activeFilter = 'all';
    document.getElementById('currentViewTitle').textContent = 'All Tabs';
    renderDashboard();
  });

  document.getElementById('navFavorites')?.addEventListener('click', () => {
    state.activeFilter = 'favorites';
    document.getElementById('currentViewTitle').textContent = '⭐ Favorites';
    renderDashboard();
  });

  document.getElementById('btnNewRootFolder').addEventListener('click', async () => {
    const title = prompt('Enter folder name (e.g. Work, Reference, Projects):');
    if (!title) return;
    await PinfoldStorage.addFolder(title.trim(), null);
    await refreshData();
    showToast('Folder created');
  });

  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');

  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    btnClearSearch.classList.toggle('hidden', state.searchQuery.length === 0);
    renderDashboard();
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    btnClearSearch.classList.add('hidden');
    renderDashboard();
    searchInput.focus();
  });

  document.getElementById('btnResetSearch').addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    btnClearSearch.classList.add('hidden');
    renderDashboard();
  });

  window.addEventListener('keydown', (e) => {
    const typingInField = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if (((e.key === '/' && !typingInField) || (e.ctrlKey && e.key === 'k')) && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape') {
      if (!document.getElementById('exportImportModal').classList.contains('hidden')) {
        closeExportImportModal();
      } else if (searchInput === document.activeElement) {
        searchInput.blur();
      }
    }
  });

  document.getElementById('btnHeaderCollapseWindow').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'COLLAPSE_TABS', options: { scope: 'ALL_IN_WINDOW' } });
  });

  document.getElementById('btnEmptyCollapseWindow').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'COLLAPSE_TABS', options: { scope: 'ALL_IN_WINDOW' } });
  });

  document.getElementById('btnEmptyImport').addEventListener('click', () => {
    openExportImportModal('import-tab');
  });

  document.getElementById('themeToggleBtn').addEventListener('click', async () => {
    const current = document.body.dataset.theme;
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    state.settings = await PinfoldStorage.updateSettings({ theme: nextTheme });
    applyTheme(nextTheme);
    showToast(`Theme: ${nextTheme === 'dark' ? 'Dark' : 'Light'}`);
  });

  document.getElementById('btnHeaderSettings').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  document.getElementById('btnViewList')?.addEventListener('click', async () => {
    if (state.viewMode === 'list') return;
    state.viewMode = 'list';
    updateViewModeButtons();
    state.settings = await PinfoldStorage.updateSettings({ viewMode: 'list' });
    renderGroupsList();
    showToast('Switched to List view');
  });

  document.getElementById('btnViewCards')?.addEventListener('click', async () => {
    if (state.viewMode === 'cards') return;
    state.viewMode = 'cards';
    updateViewModeButtons();
    state.settings = await PinfoldStorage.updateSettings({ viewMode: 'cards' });
    renderGroupsList();
    showToast('Switched to Cards view');
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderDashboard();
  });

  document.getElementById('btnRestoreAllEverywhere').addEventListener('click', handleRestoreAll);

  document.getElementById('btnDeleteAllUnlocked').addEventListener('click', async () => {
    const unlocked = state.groups.filter(g => !g.locked);
    if (unlocked.length === 0) {
      showToast('All groups are locked');
      return;
    }
    if (!confirm(`Delete all ${unlocked.length} unlocked groups?`)) return;
    // Recomputed from storage inside the lock, so tabs saved while the dialog was open survive.
    const deletedCount = await PinfoldStorage.deleteUnlockedGroups();
    await refreshData();
    showToast(`${deletedCount} unlocked groups deleted`);
  });

  document.getElementById('btnOpenExportImport').addEventListener('click', () => {
    openExportImportModal('export-onetab');
  });
  document.getElementById('btnCloseModal').addEventListener('click', closeExportImportModal);
  document.getElementById('exportImportModal').addEventListener('click', (e) => {
    if (e.target.id === 'exportImportModal') closeExportImportModal();
  });

  document.querySelectorAll('.modal-nav-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      switchModalTab(tabBtn.dataset.tab);
    });
  });

  document.getElementById('btnCopyOneTab').addEventListener('click', async () => {
    const text = document.getElementById('exportOneTabTextarea').value;
    await navigator.clipboard.writeText(text);
    showToast('Copied OneTab text');
  });

  document.getElementById('btnDownloadOneTab').addEventListener('click', () => {
    const text = document.getElementById('exportOneTabTextarea').value;
    ExportImport.downloadFile(`pinfold-export-${new Date().toISOString().slice(0, 10)}.txt`, text, 'text/plain');
  });

  document.getElementById('btnCopyMd').addEventListener('click', async () => {
    const text = document.getElementById('exportMdTextarea').value;
    await navigator.clipboard.writeText(text);
    showToast('Copied Markdown');
  });

  document.getElementById('btnDownloadMd').addEventListener('click', () => {
    const text = document.getElementById('exportMdTextarea').value;
    ExportImport.downloadFile(`pinfold-export-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown');
  });

  document.getElementById('btnCopyJson').addEventListener('click', async () => {
    const text = document.getElementById('exportJsonTextarea').value;
    await navigator.clipboard.writeText(text);
    showToast('Copied JSON');
  });

  document.getElementById('btnDownloadJson').addEventListener('click', () => {
    const text = document.getElementById('exportJsonTextarea').value;
    ExportImport.downloadFile(`pinfold-backup-${new Date().toISOString().slice(0, 10)}.json`, text, 'application/json');
  });

  document.getElementById('btnExecuteImport').addEventListener('click', async () => {
    const raw = document.getElementById('importInputTextarea').value;
    if (!raw.trim()) {
      showToast('Please paste content to import');
      return;
    }

    try {
      const result = ExportImport.parseImport(raw);
      const mode = document.querySelector('input[name="importMode"]:checked').value;

      if (mode === 'replace' && !confirm('Replace all current tabs?')) return;
      await PinfoldStorage.importGroups(result.groups, mode);

      await refreshData();
      closeExportImportModal();
      document.getElementById('importInputTextarea').value = '';
      showToast(`Imported ${result.totalTabs} tabs!`);
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  });
}

function openExportImportModal(defaultTab = 'export-onetab') {
  const modal = document.getElementById('exportImportModal');
  modal.classList.remove('hidden');

  document.getElementById('exportOneTabTextarea').value = ExportImport.exportToOneTabFormat(state.groups);
  document.getElementById('exportMdTextarea').value = ExportImport.exportToMarkdown(state.groups);
  document.getElementById('exportJsonTextarea').value = ExportImport.exportToJSON(state.groups);

  switchModalTab(defaultTab);
}

function closeExportImportModal() {
  document.getElementById('exportImportModal').classList.add('hidden');
}

function switchModalTab(targetTab) {
  document.querySelectorAll('.modal-nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === targetTab));
  document.getElementById('panelExportOneTab').classList.toggle('active', targetTab === 'export-onetab');
  document.getElementById('panelExportMd').classList.toggle('active', targetTab === 'export-md');
  document.getElementById('panelExportJson').classList.toggle('active', targetTab === 'export-json');
  document.getElementById('panelImport').classList.toggle('active', targetTab === 'import-tab');
}

function setupStorageListener() {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEYS.SETTINGS]) {
      await loadSettingsAndApplyTheme();
      renderDashboard();
    }
    if (changes[STORAGE_KEYS.GROUPS] || changes[STORAGE_KEYS.FOLDERS]) {
      refreshData();
    }
  });
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}

function showHoverCard(tab, event) {
  const card = document.getElementById('tabHoverCard');
  if (!card) return;

  const domain = extractHostname(tab.url) || tab.url;
  const title = tab.title || tab.url || 'Untitled Tab';

  document.getElementById('hoverCardTitle').textContent = title;
  document.getElementById('hoverCardDomain').textContent = domain;

  const bodyEl = document.getElementById('hoverCardBody');
  if (tab.previewImage) {
    bodyEl.innerHTML = `<img src="${escapeHtml(tab.previewImage)}" alt="Tab preview" />`;
  } else {
    bodyEl.innerHTML = `
      <div class="hover-card-placeholder">
        ${createDomainFallbackBadge(domain)}
        <span class="hover-card-placeholder-domain">${escapeHtml(domain)}</span>
      </div>
    `;
  }

  card.classList.remove('hidden');
  updateHoverCardPosition(event);
}

function updateHoverCardPosition(e) {
  const card = document.getElementById('tabHoverCard');
  if (!card || card.classList.contains('hidden')) return;

  const cardWidth = 270;
  const cardHeight = 220;
  const offset = 14;

  let left = e.clientX + offset;
  let top = e.clientY + offset;

  if (left + cardWidth > window.innerWidth - 10) {
    left = e.clientX - cardWidth - offset;
  }

  if (top + cardHeight > window.innerHeight - 10) {
    top = e.clientY - cardHeight - offset;
  }

  card.style.left = `${Math.max(10, left)}px`;
  card.style.top = `${Math.max(10, top)}px`;
}

function hideHoverCard() {
  const card = document.getElementById('tabHoverCard');
  if (card) {
    card.classList.add('hidden');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

