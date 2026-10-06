const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

// Pastikan paket xterm terinstal
const xtermDir = path.join(__dirname, 'node_modules', '@xterm', 'xterm');
if (!fs.existsSync(xtermDir)) {
  try {
    execSync('npm install --no-audit --no-fund', { cwd: __dirname, windowsHide: true });
  } catch (err) {
    console.error('Auto install xterm error:', err);
  }
}

// Cegah duplikasi proses (Single Instance Lock)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Mencegah glitch GPU / transparency crash pada Windows AMD
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

// Optimasi performa & limitasi RAM Chromium (Visual tetap 100% identik)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-smooth-scrolling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let win = null;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  win = new BrowserWindow({
    width: 260,
    height: 220,
    x: Math.round((screenWidth - 260) / 2),
    y: Math.round((screenHeight - 220) / 2),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true, // Hilangkan dari Alt+Tab dan taskbar agar tidak menumpuk
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
      spellcheck: false // Matikan background dictionary loader (hemat ~15-20 MB RAM)
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setAlwaysOnTop(true, 'screen-saver');

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('closed', () => {
    win = null;
  });
}

// Fokus ke window aktif jika mencoba membuka Miko lagi
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// IPC: Geser window saat di-drag
ipcMain.on('move-window', (event, { mouseX, mouseY }) => {
  if (win) {
    const [winX, winY] = win.getPosition();
    win.setPosition(winX + mouseX, winY + mouseY);
  }
});

// IPC: Ubah ukuran window saat terminal buka / tutup
ipcMain.on('toggle-size', (event, isOpen) => {
  if (win) {
    if (isOpen) {
      try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        const [curX, curY] = win.getPosition();
        let newX = curX;
        let newY = curY;
        if (curX + 860 > screenWidth) {
          newX = Math.max(0, screenWidth - 860);
        }
        if (curY + 440 > screenHeight) {
          newY = Math.max(0, screenHeight - 440);
        }
        if (newX !== curX || newY !== curY) {
          win.setPosition(newX, newY);
        }
      } catch (_) {}
      win.setSize(860, 440);
    } else {
      win.setSize(260, 220);
    }
  }
});

// IPC: Ubah ukuran window saat terminal di-expand / normal (tombol hijau macOS)
ipcMain.on('toggle-expand-terminal', (event, isExpanded) => {
  if (win) {
    if (isExpanded) {
      try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        const targetW = Math.min(1060, screenWidth - 40);
        const targetH = Math.min(580, screenHeight - 60);
        const [curX, curY] = win.getPosition();
        let newX = curX;
        let newY = curY;
        if (curX + targetW > screenWidth) {
          newX = Math.max(0, screenWidth - targetW);
        }
        if (curY + targetH > screenHeight) {
          newY = Math.max(0, screenHeight - targetH);
        }
        if (newX !== curX || newY !== curY) {
          win.setPosition(newX, newY);
        }
        win.setSize(targetW, targetH);
      } catch (_) {
        win.setSize(1060, 580);
      }
    } else {
      win.setSize(860, 440);
    }
  }
});

// IPC: Geser halus window Miko ke tengah layar saat shutdown
ipcMain.on('glide-to-center', (event) => {
  if (!win) {
    event.sender.send('glide-to-center-finished');
    return;
  }

  // Pastikan ukuran window kembali ke maskot saja (260 x 220)
  win.setSize(260, 220);

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const targetX = Math.round((screenWidth - 260) / 2);
  const targetY = Math.round((screenHeight - 220) / 2);

  const [startX, startY] = win.getPosition();

  const totalFrames = 30;
  const frameDuration = 16; // ~60fps, total ~480ms
  let frame = 0;

  if (Math.abs(startX - targetX) < 6 && Math.abs(startY - targetY) < 6) {
    win.setPosition(targetX, targetY);
    event.sender.send('glide-to-center-finished');
    return;
  }

  const glideTimer = setInterval(() => {
    frame++;
    const progress = frame / totalFrames;
    // Cubic ease-out
    const ease = 1 - Math.pow(1 - progress, 3);
    const curX = Math.round(startX + (targetX - startX) * ease);
    const curY = Math.round(startY + (targetY - startY) * ease);

    if (win) {
      win.setPosition(curX, curY);
    }

    if (frame >= totalFrames) {
      clearInterval(glideTimer);
      if (win) {
        win.setPosition(targetX, targetY);
      }
      event.sender.send('glide-to-center-finished');
    }
  }, frameDuration);
});

// IPC: Keluar aplikasi total
ipcMain.on('close-app', () => {
  app.quit();
  process.exit(0);
});

// Toggle visibilitas Miko (Sembunyikan / Munculkan)
function toggleMikoVisibility() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
    if (win.webContents) {
      win.webContents.send('miko-restored');
    }
  }
}

// IPC: Sembunyikan dan Munculkan Miko
ipcMain.on('hide-miko', () => {
  if (win && win.isVisible()) win.hide();
});

ipcMain.on('show-miko', () => {
  if (win && !win.isVisible()) {
    win.show();
    win.focus();
    if (win.webContents) win.webContents.send('miko-restored');
  }
});

ipcMain.on('toggle-miko', () => {
  toggleMikoVisibility();
});

app.whenReady().then(() => {
  createWindow();

  // Global shortcut resmi: Alt+M untuk toggle sembunyi/muncul di mana saja
  try {
    globalShortcut.register('Alt+M', () => {
      toggleMikoVisibility();
    });
  } catch (err) {
    console.error('Failed to register Alt+M:', err);
  }
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
});

app.on('window-all-closed', () => {
  app.quit();
  process.exit(0);
});
