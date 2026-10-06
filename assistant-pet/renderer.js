// Renderer Entry Point - Desktop Pet & Terminal Companion Miko
window.onerror = function(msg, url, lineNo, columnNo, error) {
  console.error('Miko Renderer Error:', msg, 'at line', lineNo, error);
  return false;
};
window.onunhandledrejection = function(e) {
  console.error('Miko Unhandled Promise Rejection:', e.reason);
};

const { ipcRenderer } = require('electron');
const state = require('./js/state');
const pet = require('./js/pet');
const terminalWsl = require('./js/terminal-wsl');
const folderNav = require('./js/folder-nav');
const cmdServer = require('./js/cmd-server');

// Inisialisasi arsitektur modular Miko
const miko = {
  state,
  pet,
  terminalWsl,
  folderNav,
  cmdServer
};
window.Miko = miko;

// Pasang kontrol & listener tiap modul
pet.init(miko);
terminalWsl.init(miko);
folderNav.init(miko);
cmdServer.init(miko);

// Shortcut aplikasi (Alt+M toggle sembunyi/muncul, Alt+F, Alt+C, Escape)
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    ipcRenderer.send('toggle-miko');
    return;
  }
  if (e.altKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    folderNav.toggleFolderPopup();
    return;
  }
  if (e.altKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    cmdServer.toggleCmdPopup();
    return;
  }
  if (e.key === 'Escape') {
    if (state.isCmdPopupOpen) {
      e.preventDefault();
      cmdServer.closeCmdPopup();
    } else if (state.isFolderPopupOpen) {
      e.preventDefault();
      folderNav.closeFolderPopup();
    }
  }
});

// Event saat Miko dimunculkan kembali oleh shortcut Alt+M
ipcRenderer.on('miko-restored', () => {
  pet.updateExpression();
  pet.resetSleepTimer();
  pet.showMikoSpeech("Miko kembali!", null, 2500);
});

// Penyelarasan ukuran terminal saat resize window
window.addEventListener('resize', () => {
  terminalWsl.fitTerminal();
});

// Pembersihan proses saat window Electron ditutup
window.addEventListener('beforeunload', () => {
  if (state.cmdProc) {
    try {
      const { execSync } = require('child_process');
      execSync(`taskkill /pid ${state.cmdProc.pid} /f /t`);
    } catch (_) {}
    try { state.cmdProc.kill(); } catch (_) {}
  }
  if (state.wslProc) {
    try { state.wslProc.kill(); } catch (_) {}
  }
});

// Mulai sesi WSL Bash
terminalWsl.startWslSession();

// Sambutan awal Maskot Miko saat peluncuran
setTimeout(() => {
  pet.showMikoSpeech(
    "Selamat Datang<br>Singkronisasi Data Miko Berhasil<br>Miko Siap Membantu",
    "Selamat Datang.mp3",
    5500,
    () => {
      state.isGreeting = false;
      pet.updateExpression();
    }
  );
}, 700);
