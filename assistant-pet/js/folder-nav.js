const path = require('path');
const fs = require('fs');
const state = require('./state');

const DEFAULT_DRIVES = ['c', 'd', 'e', 'f'];

const NAV_ICONS = {
  drive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  parent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
};

const IGNORED_NAMES = new Set([
  '$recycle.bin', 'system volume information', 'recovery', 'config.msi',
  'perflogs', 'node_modules', '.git', '.vscode', '.idea', '$windows.~bt', '$windows.~ws',
  'appdata', '.cache', '.npm', '.cargo', '.rustup', '.gradle', '__pycache__',
  '.nuget', 'vendor', '.next', '.nuxt', 'dist', 'build', 'out', 'temp', 'tmp'
]);

const C_ROOT_IGNORED = new Set([
  'windows', 'program files', 'program files (x86)', 'programdata',
  'msocache', 'documents and settings'
]);

// Cache in-memory untuk menyimpan daftar folder disk yang telah di-scan
const diskFolderIndex = new Map();
const diskVisitedDirs = new Map();

let folderBtn = null;
let folderPopup = null;
let folderInput = null;
let folderCloseBtn = null;
let folderList = null;
let folderStatusText = null;

let currentNavItems = [];
let navSelectedIndex = 0;
let folderSearchDebounce = null;
let isDeletingFolderInput = false;
let activeSearchId = 0;

let miko = null;

function getAvailableDrives() {
  const letters = ['c', 'd', 'e', 'f', 'g'];
  const available = [];
  for (const dl of letters) {
    try {
      const rootWin = `${dl.toUpperCase()}:\\`;
      if (fs.existsSync(rootWin)) {
        available.push(dl);
      }
    } catch (_) {}
  }
  return available.length > 0 ? available : DEFAULT_DRIVES;
}

function getImmediateSubdirs(dirWinPath, dl, currentRelPath = '') {
  const subdirs = [];
  const isCRoot = dl === 'c' && !currentRelPath;

  try {
    if (!fs.existsSync(dirWinPath)) return subdirs;
    const entries = fs.readdirSync(dirWinPath, { withFileTypes: true });

    for (const entry of entries) {
      if (typeof entry.isDirectory !== 'function' || !entry.isDirectory()) continue;
      if (typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) continue;

      const nameLower = entry.name.toLowerCase();
      if (IGNORED_NAMES.has(nameLower) || entry.name.startsWith('.')) continue;
      if (isCRoot && C_ROOT_IGNORED.has(nameLower)) continue;

      const childWinPath = path.join(dirWinPath, entry.name);
      const childRelPath = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;
      const wslPath = `/mnt/${dl}/${childRelPath}`;

      subdirs.push({
        type: 'folder',
        name: entry.name,
        label: entry.name,
        sub: childWinPath,
        driveLetter: dl,
        relPath: childRelPath,
        wslPath: wslPath
      });
    }
  } catch (_) {}

  return subdirs;
}

function listDirItems(dirWinPath, dl, currentRelPath = '') {
  const items = [];

  if (currentRelPath) {
    const parentRel = path.dirname(currentRelPath);
    items.push({
      type: 'parent',
      name: '..',
      label: '.. (Kembali ke folder sebelumnya)',
      sub: 'Kembali satu tingkat',
      driveLetter: dl,
      relPath: parentRel === '.' ? '' : parentRel.replace(/\\/g, '/')
    });
  } else {
    items.push({
      type: 'parent',
      name: '.. (Pilih Disk Lain)',
      label: '.. (Pilih Disk Lain)',
      sub: 'Kembali ke daftar pilihan disk',
      driveLetter: dl,
      relPath: ''
    });
  }

  const subdirs = getImmediateSubdirs(dirWinPath, dl, currentRelPath);

  subdirs.sort((a, b) => {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  items.push(...subdirs);
  return items;
}

function sortSearchResults(results, queryLower) {
  results.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    const aExact = aName === queryLower;
    const bExact = bName === queryLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStarts = aName.startsWith(queryLower);
    const bStarts = bName.startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    const aDepth = (a.relPath.match(/[\\\/]/g) || []).length;
    const bDepth = (b.relPath.match(/[\\\/]/g) || []).length;
    if (aDepth !== bDepth) return aDepth - bDepth;

    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function startAsyncFolderSearch(baseWinPath, dl, query, baseRelPath = '') {
  activeSearchId++;
  const searchId = activeSearchId;
  const queryLower = query.toLowerCase();

  if (!diskFolderIndex.has(dl)) {
    diskFolderIndex.set(dl, []);
  }
  if (!diskVisitedDirs.has(dl)) {
    diskVisitedDirs.set(dl, new Set());
  }

  const cachedList = diskFolderIndex.get(dl);
  const matchedCache = [];
  const seenPaths = new Set();

  for (const item of cachedList) {
    if (baseRelPath && !item.relPath.toLowerCase().startsWith(baseRelPath.toLowerCase())) {
      continue;
    }
    if (item.name.toLowerCase().includes(queryLower)) {
      matchedCache.push(item);
      seenPaths.add(item.sub.toLowerCase());
    }
  }

  if (matchedCache.length > 0) {
    sortSearchResults(matchedCache, queryLower);
    currentNavItems = matchedCache.slice(0, 100);
    renderCurrentNavItems();
    if (folderStatusText) {
      folderStatusText.textContent = `${matchedCache.length} folder ditemukan untuk "${query}"`;
    }
  }

  runAsyncBfsSearch(searchId, baseWinPath, dl, query, queryLower, baseRelPath, matchedCache, seenPaths);
}

async function runAsyncBfsSearch(searchId, baseWinPath, dl, query, queryLower, baseRelPath, existingMatches, seenPaths) {
  const results = [...existingMatches];
  const maxResults = 120;
  const maxDepth = 7;
  const maxDirsToScan = 15000;
  const visitedSet = diskVisitedDirs.get(dl);
  const cachedArray = diskFolderIndex.get(dl);

  const currentUser = (process.env.USERNAME || '').toLowerCase();
  const queue = [{
    dirPath: baseWinPath,
    relPath: baseRelPath,
    depth: 0
  }];

  let qHead = 0;
  let dirsScanned = 0;
  const startTime = Date.now();
  const MAX_TIME_MS = 2500;

  while (qHead < queue.length && results.length < maxResults && dirsScanned < maxDirsToScan) {
    if (searchId !== activeSearchId) return;

    if (dirsScanned > 0 && dirsScanned % 35 === 0) {
      if (Date.now() - startTime > MAX_TIME_MS) break;
      await new Promise(resolve => setTimeout(resolve, 0));
      if (searchId !== activeSearchId) return;
    }

    const current = queue[qHead++];
    dirsScanned++;

    const currentPathKey = current.dirPath.toLowerCase();
    const isAlreadyScanned = visitedSet.has(currentPathKey);

    let subdirs = [];
    if (!isAlreadyScanned) {
      subdirs = getImmediateSubdirs(current.dirPath, dl, current.relPath);
      visitedSet.add(currentPathKey);

      for (const item of subdirs) {
        cachedArray.push(item);
      }
    }

    // Prioritaskan C:\Users dan direktori user aktif jika berada di C: root
    if (dl === 'c' && current.depth === 0) {
      subdirs.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (aName === 'users') return -1;
        if (bName === 'users') return 1;
        return 0;
      });
    } else if (dl === 'c' && current.relPath.toLowerCase() === 'users') {
      subdirs.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (currentUser && aName === currentUser) return -1;
        if (currentUser && bName === currentUser) return 1;
        return 0;
      });
    }

    for (const item of subdirs) {
      const childKey = item.sub.toLowerCase();

      if (item.name.toLowerCase().includes(queryLower) && !seenPaths.has(childKey)) {
        seenPaths.add(childKey);
        results.push(item);

        if (results.length % 10 === 0 && results.length > existingMatches.length) {
          sortSearchResults(results, queryLower);
          currentNavItems = results.slice(0, 100);
          renderCurrentNavItems();
          if (folderStatusText) {
            folderStatusText.textContent = `Mencari... (${results.length} folder ditemukan)`;
          }
        }

        if (results.length >= maxResults) break;
      }

      if (current.depth + 1 < maxDepth) {
        queue.push({
          dirPath: item.sub,
          relPath: item.relPath,
          depth: current.depth + 1
        });
      }
    }
  }

  if (searchId !== activeSearchId) return;

  sortSearchResults(results, queryLower);
  currentNavItems = results.slice(0, 100);
  renderCurrentNavItems();

  if (folderStatusText) {
    if (results.length === 0) {
      folderStatusText.textContent = `Tidak ada folder yang cocok dengan "${query}"`;
      if (folderList) {
        folderList.innerHTML = `
          <div class="folder-item-empty">
            Tidak ada folder yang cocok dengan "<strong>${escapeHtml(query)}</strong>" di Disk ${dl.toUpperCase()}:
          </div>
        `;
      }
    } else {
      folderStatusText.textContent = `${results.length} folder ditemukan untuk "${query}"`;
    }
  }
}

function parseFolderNavInput(val) {
  const trimmed = (val || '').trim();
  if (!trimmed) {
    return { mode: 'drives', driveLetter: null, currentRelPath: '', query: '' };
  }

  const driveMatch = trimmed.match(/^([a-zA-Z])(?::|\/|\\)?(?:\/|\\)?\s*(@)?\s*(.*)$/);
  if (!driveMatch) {
    return { mode: 'unknown', raw: trimmed };
  }

  const dl = driveMatch[1].toLowerCase();
  const rootWin = `${dl.toUpperCase()}:\\`;

  try {
    if (!fs.existsSync(rootWin)) {
      return { mode: 'invalid_drive', driveLetter: dl };
    }
  } catch (_) {
    return { mode: 'invalid_drive', driveLetter: dl };
  }

  const hasAt = Boolean(driveMatch[2]);
  const rest = (driveMatch[3] || '').trim();

  if (hasAt) {
    return {
      mode: rest ? 'search' : 'disk',
      driveLetter: dl,
      currentRelPath: '',
      query: rest
    };
  }

  if (!rest) {
    return {
      mode: 'disk',
      driveLetter: dl,
      currentRelPath: '',
      query: ''
    };
  }

  const atIdx = rest.indexOf('@');
  if (atIdx !== -1) {
    const pathPart = rest.slice(0, atIdx).trim().replace(/[\\\/]+$/, '').replace(/\\/g, '/');
    const queryPart = rest.slice(atIdx + 1).trim();
    return {
      mode: queryPart ? 'search' : 'disk',
      driveLetter: dl,
      currentRelPath: pathPart,
      query: queryPart
    };
  }

  const normalized = rest.replace(/\\/g, '/');
  if (normalized.includes('/')) {
    const parts = normalized.split('/').filter(Boolean);
    let validRelPath = '';
    let queryPart = '';
    for (let i = parts.length; i >= 1; i--) {
      const candidateRel = parts.slice(0, i).join(path.sep);
      const testPath = path.join(rootWin, candidateRel);
      try {
        if (fs.existsSync(testPath) && fs.statSync(testPath).isDirectory()) {
          validRelPath = parts.slice(0, i).join('/');
          queryPart = parts.slice(i).join(' ').trim();
          break;
        }
      } catch (_) {}
    }
    if (validRelPath) {
      return {
        mode: queryPart ? 'search' : 'disk',
        driveLetter: dl,
        currentRelPath: validRelPath,
        query: queryPart
      };
    }
  }

  return {
    mode: 'search',
    driveLetter: dl,
    currentRelPath: '',
    query: rest
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCurrentNavItems() {
  if (!folderList) return;
  folderList.innerHTML = '';

  if (currentNavItems.length === 0) return;

  if (navSelectedIndex >= currentNavItems.length) {
    navSelectedIndex = 0;
  }

  currentNavItems.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = `folder-item${idx === navSelectedIndex ? ' active' : ''}`;
    div.dataset.index = idx;

    const iconHtml = item.type === 'drive'
      ? NAV_ICONS.drive
      : item.type === 'parent'
        ? NAV_ICONS.parent
        : NAV_ICONS.folder;

    div.innerHTML = `
      <div class="item-icon">${iconHtml}</div>
      <div class="item-info">
        <div class="item-title">
          <span class="item-name">${escapeHtml(item.name)}</span>
          ${item.type === 'folder' || item.type === 'drive' ? `<span class="folder-drill-badge">Tab</span>` : ''}
        </div>
        <span class="item-sub">${escapeHtml(item.sub || '')}</span>
      </div>
    `;

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      navSelectedIndex = idx;
      updateActiveSelection();
      if (item.type === 'parent') {
        drillUpFolder();
      } else if (item.type === 'drive') {
        drillIntoFolder(item);
      } else {
        navigateToWslFolder(item.wslPath);
      }
    });

    div.addEventListener('mouseenter', () => {
      navSelectedIndex = idx;
      updateActiveSelection();
    });

    folderList.appendChild(div);
  });

  scrollActiveItemIntoView();
}

function renderFolderNav() {
  if (!folderInput || !folderList || !folderStatusText) return;
  const parsed = parseFolderNavInput(folderInput.value);
  folderList.innerHTML = '';
  currentNavItems = [];

  if (parsed.mode === 'drives') {
    const drives = getAvailableDrives();
    folderStatusText.textContent = `Pilih disk: ${drives.map(d => d.toUpperCase()).join(', ')}`;
    for (const dl of drives) {
      const rootWin = `${dl.toUpperCase()}:\\`;
      const exists = fs.existsSync(rootWin);
      currentNavItems.push({
        type: 'drive',
        name: `Disk ${dl.toUpperCase()}:`,
        label: `Disk ${dl.toUpperCase()}:`,
        sub: exists ? rootWin : `${rootWin} (Tidak terdeteksi)`,
        driveLetter: dl,
        relPath: '',
        disabled: !exists
      });
    }
    renderCurrentNavItems();
  } else if (parsed.mode === 'invalid_drive') {
    folderStatusText.textContent = `Disk ${parsed.driveLetter.toUpperCase()}: tidak ditemukan`;
    folderList.innerHTML = `
      <div class="folder-item-empty">
        Disk <strong>${parsed.driveLetter.toUpperCase()}:</strong> tidak terdeteksi pada sistem.
      </div>
    `;
    return;
  } else if (parsed.mode === 'unknown') {
    folderStatusText.textContent = 'Ketik huruf disk';
    folderList.innerHTML = `
      <div class="folder-item-empty">
        Ketik huruf disk: <code>c</code>, <code>d</code>, <code>e</code>, atau <code>f</code>
      </div>
    `;
    return;
  } else if (parsed.mode === 'disk') {
    activeSearchId++;
    const rootWin = `${parsed.driveLetter.toUpperCase()}:\\`;
    const targetDir = parsed.currentRelPath
      ? path.join(rootWin, parsed.currentRelPath.replace(/\//g, path.sep))
      : rootWin;

    folderStatusText.textContent = `Disk ${parsed.driveLetter.toUpperCase()}: - Ketik nama folder untuk mencari...`;
    currentNavItems = listDirItems(targetDir, parsed.driveLetter, parsed.currentRelPath);
    renderCurrentNavItems();
  } else if (parsed.mode === 'search') {
    const rootWin = `${parsed.driveLetter.toUpperCase()}:\\`;
    const dirWin = parsed.currentRelPath
      ? path.join(rootWin, parsed.currentRelPath.replace(/\//g, path.sep))
      : rootWin;

    folderStatusText.textContent = `Mencari "${parsed.query}" di Disk ${parsed.driveLetter.toUpperCase()}:...`;
    startAsyncFolderSearch(dirWin, parsed.driveLetter, parsed.query, parsed.currentRelPath);
  }
}

function updateActiveSelection() {
  if (!folderList) return;
  const items = folderList.querySelectorAll('.folder-item');
  items.forEach((el, i) => {
    if (i === navSelectedIndex) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function scrollActiveItemIntoView() {
  if (!folderList) return;
  const activeEl = folderList.querySelector('.folder-item.active');
  if (activeEl) {
    activeEl.scrollIntoView({ block: 'nearest' });
  }
}

function drillIntoFolder(item) {
  if (!folderInput) return;
  if (item.type === 'drive') {
    folderInput.value = `${item.driveLetter.toUpperCase()}:/ `;
  } else if (item.type === 'folder') {
    folderInput.value = `${item.driveLetter.toUpperCase()}:/${item.relPath}/ `;
  }
  navSelectedIndex = 0;
  renderFolderNav();
  folderInput.focus();
  setTimeout(() => {
    folderInput.setSelectionRange(folderInput.value.length, folderInput.value.length);
  }, 0);
}

function drillUpFolder() {
  if (!folderInput) return;
  const parsed = parseFolderNavInput(folderInput.value);

  if (parsed.mode === 'drives') return;

  if (parsed.mode === 'disk' || parsed.mode === 'search') {
    if (!parsed.currentRelPath) {
      folderInput.value = '';
    } else {
      const parentRel = path.dirname(parsed.currentRelPath);
      if (parentRel === '.' || !parentRel) {
        folderInput.value = `${parsed.driveLetter.toUpperCase()}:/ `;
      } else {
        folderInput.value = `${parsed.driveLetter.toUpperCase()}:/${parentRel.replace(/\\/g, '/')}/ `;
      }
    }
    navSelectedIndex = 0;
    renderFolderNav();
    folderInput.focus();
    setTimeout(() => {
      folderInput.setSelectionRange(folderInput.value.length, folderInput.value.length);
    }, 0);
  }
}

function navigateToWslFolder(wslPath) {
  if (!wslPath) return;
  closeFolderPopup();

  if (miko && miko.terminalWsl) {
    miko.terminalWsl.sendToWsl(`\x15cd "${wslPath}" && claude\n`);
    state.inputLineBuffer = '';
  }

  state.isClaudeSession = true;
  state.isClaudeWorking = false;
  state.isSuccess = false;

  if (miko && miko.pet) {
    miko.pet.updateExpression();
    miko.pet.showMikoSpeech(
      "Integrasi Selesai Modul Claude Siap Dijalankan",
      "Claude_Berjalan.mp3",
      5000
    );
  }
}

function openFolderPopup() {
  if (state.isShuttingDown) return;
  if (miko && miko.pet) miko.pet.resetSleepTimer();

  if (state.isCmdPopupOpen && miko && miko.cmdServer) {
    miko.cmdServer.closeCmdPopup();
  }
  if (!state.isOpen && miko && miko.terminalWsl) {
    miko.terminalWsl.toggleTerminal();
  }

  state.isFolderPopupOpen = true;
  if (folderBtn) folderBtn.classList.add('active');
  if (folderPopup) folderPopup.classList.add('active');
  if (folderInput) folderInput.value = '';
  navSelectedIndex = 0;
  renderFolderNav();
  if (miko && miko.pet) miko.pet.updateExpression();
  setTimeout(() => {
    if (folderInput) folderInput.focus();
  }, 50);
}

function closeFolderPopup() {
  if (!state.isFolderPopupOpen) return;
  activeSearchId++;
  state.isFolderPopupOpen = false;
  if (folderBtn) folderBtn.classList.remove('active');
  if (folderPopup) folderPopup.classList.remove('active');
  if (state.term) state.term.focus();
  if (miko && miko.pet) {
    miko.pet.updateExpression();
    miko.pet.resetSleepTimer();
  }
}

function toggleFolderPopup() {
  if (state.isFolderPopupOpen) {
    closeFolderPopup();
  } else {
    openFolderPopup();
  }
}

function init(mikoContext) {
  miko = mikoContext;

  folderBtn = document.getElementById('folder-btn');
  folderPopup = document.getElementById('folder-popup');
  folderInput = document.getElementById('folder-input');
  folderCloseBtn = document.getElementById('folder-close-btn');
  folderList = document.getElementById('folder-list');
  folderStatusText = document.getElementById('folder-status-text');

  if (folderBtn) {
    folderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolderPopup();
    });
  }

  if (folderCloseBtn) {
    folderCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFolderPopup();
    });
  }

  if (folderPopup) {
    folderPopup.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  const termContainer = document.getElementById('terminal-container');
  if (termContainer) {
    termContainer.addEventListener('mousedown', () => {
      if (state.isFolderPopupOpen) {
        closeFolderPopup();
      }
    });
  }

  if (folderInput) {
    folderInput.addEventListener('input', () => {
      if (miko && miko.pet) miko.pet.resetSleepTimer();
      clearTimeout(folderSearchDebounce);

      if (!isDeletingFolderInput) {
        const raw = folderInput.value.trim().toLowerCase();
        const available = getAvailableDrives();
        if (available.includes(raw)) {
          folderInput.value = `${raw.toUpperCase()}:/ `;
          setTimeout(() => {
            folderInput.setSelectionRange(folderInput.value.length, folderInput.value.length);
          }, 0);
        } else if (raw.length === 2 && raw.endsWith(':') && available.includes(raw[0])) {
          folderInput.value = `${raw[0].toUpperCase()}:/ `;
          setTimeout(() => {
            folderInput.setSelectionRange(folderInput.value.length, folderInput.value.length);
          }, 0);
        }
      }

      folderSearchDebounce = setTimeout(() => {
        navSelectedIndex = 0;
        renderFolderNav();
      }, 50);
    });

    folderInput.addEventListener('keydown', (e) => {
      if (miko && miko.pet) miko.pet.resetSleepTimer();
      isDeletingFolderInput = (e.key === 'Backspace' || e.key === 'Delete');

      if (e.key === 'Escape') {
        e.preventDefault();
        closeFolderPopup();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentNavItems.length > 0) {
          navSelectedIndex = (navSelectedIndex + 1) % currentNavItems.length;
          updateActiveSelection();
          scrollActiveItemIntoView();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentNavItems.length > 0) {
          navSelectedIndex = (navSelectedIndex - 1 + currentNavItems.length) % currentNavItems.length;
          updateActiveSelection();
          scrollActiveItemIntoView();
        }
        return;
      }

      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault();
        const item = currentNavItems[navSelectedIndex];
        if (item) {
          if (item.type === 'drive' || item.type === 'folder') {
            drillIntoFolder(item);
          } else if (item.type === 'parent') {
            drillUpFolder();
          }
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        drillUpFolder();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const item = currentNavItems[navSelectedIndex];
        if (item) {
          if (item.type === 'parent') {
            drillUpFolder();
          } else if (item.type === 'drive') {
            drillIntoFolder(item);
          } else if (item.type === 'folder') {
            navigateToWslFolder(item.wslPath);
          }
        }
        return;
      }
    });
  }
}

module.exports = {
  init,
  openFolderPopup,
  closeFolderPopup,
  toggleFolderPopup,
  navigateToWslFolder
};
