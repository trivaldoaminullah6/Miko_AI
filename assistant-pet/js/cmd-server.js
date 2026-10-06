const { shell, clipboard } = require('electron');
const { spawn, exec } = require('child_process');
const state = require('./state');

let TerminalClass = null;
let FitAddonClass = null;
try {
  TerminalClass = require('@xterm/xterm').Terminal;
  FitAddonClass = require('@xterm/addon-fit').FitAddon;
} catch (_) {
  TerminalClass = window.Terminal;
  FitAddonClass = window.FitAddon ? (window.FitAddon.FitAddon || window.FitAddon) : null;
}

let cmdBtn = null;
let cmdPopup = null;
let cmdToggle9routerBtn = null;
let cmdWebBtn = null;
let cmdStatusBadge = null;
let cmdStatusText = null;
let cmdTermContainer = null;

let cmdInputLine = '';
let cmdHistory = [];
let cmdHistoryIndex = 0;
let pendingCmdEcho = '';

let miko = null;

function update9routerButtonState(online) {
  state.is9routerRunning = online;
  if (!cmdToggle9routerBtn) return;
  if (online) {
    cmdToggle9routerBtn.className = 'cmd-tool-btn running';
    cmdToggle9routerBtn.title = 'Hentikan 9router';
    cmdToggle9routerBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <rect x="5" y="5" width="14" height="14" rx="2"></rect>
      </svg>
      <span id="cmd-toggle-text">Hentikan 9router</span>
    `;
  } else {
    cmdToggle9routerBtn.className = 'cmd-tool-btn';
    cmdToggle9routerBtn.title = 'Jalankan 9router';
    cmdToggle9routerBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="6 4 20 12 6 20"></polygon>
      </svg>
      <span id="cmd-toggle-text">Jalankan 9router</span>
    `;
  }
}

function check9routerHealth() {
  fetch('http://127.0.0.1:20128/', { method: 'GET', signal: AbortSignal.timeout(1200) })
    .then(() => {
      if (cmdStatusBadge) {
        cmdStatusBadge.className = 'cmd-status-badge online';
      }
      if (cmdStatusText) {
        cmdStatusText.textContent = '9router: Aktif (20128)';
      }
      update9routerButtonState(true);
    })
    .catch(() => {
      if (cmdStatusBadge) {
        cmdStatusBadge.className = 'cmd-status-badge offline';
      }
      if (cmdStatusText) {
        cmdStatusText.textContent = '9router: Nonaktif';
      }
      update9routerButtonState(false);
    });
}

function start9routerServer() {
  fetch('http://127.0.0.1:20128/', { method: 'GET', signal: AbortSignal.timeout(800) })
    .then(() => {
      if (miko && miko.pet) miko.pet.showMikoSpeech("Server 9router Telah Aktif", "9Router_aktif.mp3", 4000);
      if (cmdStatusBadge) cmdStatusBadge.className = 'cmd-status-badge online';
      if (cmdStatusText) cmdStatusText.textContent = '9router: Aktif (20128)';
      update9routerButtonState(true);
    })
    .catch(() => {
      if (miko && miko.pet) miko.pet.showMikoSpeech("Mengaktifkan 9router...", null, 2000);
      update9routerButtonState(true);
      const userHome = process.env.USERPROFILE || 'C:\\Users\\MyBook Hype AMD';
      try {
        exec('start "" /b 9router --host 127.0.0.1 --tray', {
          cwd: userHome,
          windowsHide: true
        }, (err) => {
          if (err) {
            try {
              const p = spawn('cmd.exe', ['/c', '9router --host 127.0.0.1 --tray'], {
                cwd: userHome,
                detached: true,
                stdio: 'ignore',
                windowsHide: true
              });
              p.unref();
            } catch (_) {}
          }
        });
      } catch (e) {
        console.error('Start 9router error:', e);
      }

      let attempts = 0;
      const pollTimer = setInterval(() => {
        attempts++;
        fetch('http://127.0.0.1:20128/', { method: 'GET', signal: AbortSignal.timeout(800) })
          .then(() => {
            clearInterval(pollTimer);
            if (cmdStatusBadge) cmdStatusBadge.className = 'cmd-status-badge online';
            if (cmdStatusText) cmdStatusText.textContent = '9router: Aktif (20128)';
            update9routerButtonState(true);
            if (miko && miko.pet) miko.pet.showMikoSpeech("Server 9router Telah Aktif", "9Router_aktif.mp3", 4000);
          })
          .catch(() => {
            if (attempts >= 8) {
              clearInterval(pollTimer);
              check9routerHealth();
            }
          });
      }, 800);
    });
}

function stop9routerServer() {
  update9routerButtonState(false);
  try {
    exec('netstat -ano | findstr :20128', { shell: true, windowsHide: true }, (err, stdout) => {
      if (!err && stdout) {
        const lines = stdout.split('\n').filter(l => l.includes('LISTENING'));
        lines.forEach(line => {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && !isNaN(pid)) {
            try { exec(`taskkill /pid ${pid} /f /t`, () => {}); } catch (_) {}
          }
        });
      }
    });
  } catch (_) {}

  try {
    exec('taskkill /f /im 9router.exe', () => {});
  } catch (_) {}

  if (cmdStatusBadge) cmdStatusBadge.className = 'cmd-status-badge offline';
  if (cmdStatusText) cmdStatusText.textContent = '9router: Nonaktif';

  if (miko && miko.pet) miko.pet.showMikoSpeech("Miko Menonaktifkan Server 9router", "9router_nonaktif.mp3", 4000);
  setTimeout(check9routerHealth, 1200);
}

function startCmdSession() {
  if (state.cmdProc) {
    try { exec(`taskkill /pid ${state.cmdProc.pid} /f /t`, () => {}); } catch (_) {}
    try { state.cmdProc.kill(); } catch (_) {}
    state.cmdProc = null;
  }

  if (state.termCmd) state.termCmd.reset();
  cmdInputLine = '';
  pendingCmdEcho = '';
  cmdHistoryIndex = cmdHistory.length;

  const userHome = process.env.USERPROFILE || 'C:\\Users\\MyBook Hype AMD';

  try {
    state.cmdProc = spawn('cmd.exe', [], {
      cwd: userHome,
      windowsHide: true,
      env: {
        ...process.env,
        COMSPEC: process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
      }
    });

    state.cmdProc.stdout.on('data', (chunk) => {
      let str = chunk.toString('utf8');

      if (pendingCmdEcho) {
        const trimmed = pendingCmdEcho.trim();
        if (str.startsWith(trimmed + '\r\n')) {
          str = str.slice(trimmed.length + 2);
          pendingCmdEcho = '';
        } else if (str.startsWith(trimmed + '\n')) {
          str = str.slice(trimmed.length + 1);
          pendingCmdEcho = '';
        } else if (str.startsWith(trimmed)) {
          str = str.slice(trimmed.length);
          pendingCmdEcho = '';
        }
      }

      if (str.includes('Choose Interface') || str.includes('Press Enter to go back to menu') || str.includes('Web UI (Open in Browser)')) {
        str = str.replace(/={10,}[\s\S]*?(?:Press Enter to go back to menu\.\.\.|Exit[\r\n]*)/gi, '');
        str = str.replace(/.*Choose Interface.*/gi, '');
        str = str.replace(/.*Web UI \(Open in Browser\).*/gi, '');
        str = str.replace(/.*Terminal UI \(Interactive CLI\).*/gi, '');
        str = str.replace(/.*Hide to Tray \(Background\).*/gi, '');
        str = str.replace(/.*Press Enter to go back to menu.*/gi, '');
        str = str.replace(/.*Update to v\d+\.\d+\.\d+.*/gi, '');
        if (!str.trim()) {
          return;
        }
      }

      const formatted = str.replace(/(?<!\r)\n/g, '\r\n');
      if (state.termCmd) state.termCmd.write(formatted);
    });

    state.cmdProc.stderr.on('data', (chunk) => {
      const str = chunk.toString('utf8').replace(/(?<!\r)\n/g, '\r\n');
      if (state.termCmd) state.termCmd.write('\x1b[31m' + str + '\x1b[0m');
    });

    state.cmdProc.on('error', (err) => {
      if (state.termCmd) state.termCmd.write(`\r\n\x1b[31m[Error CMD: ${err.message}]\x1b[0m\r\n`);
      state.cmdProc = null;
    });

    state.cmdProc.on('close', (code) => {
      if (state.termCmd) state.termCmd.write(`\r\n\x1b[33m[Proses CMD selesai (Exit Code: ${code})]\x1b[0m\r\n`);
      state.cmdProc = null;
    });
  } catch (err) {
    if (state.termCmd) state.termCmd.write(`\r\n\x1b[31m[Gagal menjalankan cmd.exe: ${err.message}]\x1b[0m\r\n`);
    state.cmdProc = null;
  }
}

function pasteToCmd(text) {
  if (!text) return;
  if (!state.cmdProc) {
    startCmdSession();
  }
  cmdInputLine += text;
  if (state.termCmd) {
    state.termCmd.write(text);
    state.termCmd.focus();
  }
}

function openCmdPopup() {
  if (state.isShuttingDown) return;
  if (miko && miko.pet) miko.pet.resetSleepTimer();

  if (state.isFolderPopupOpen && miko && miko.folderNav) {
    miko.folderNav.closeFolderPopup();
  }
  if (!state.isOpen && miko && miko.terminalWsl) {
    miko.terminalWsl.toggleTerminal();
  }

  state.isCmdPopupOpen = true;
  if (cmdBtn) cmdBtn.classList.add('active');
  if (cmdPopup) cmdPopup.classList.add('active');

  if (!state.cmdProc) {
    startCmdSession();
  }

  if (miko && miko.pet) {
    miko.pet.updateExpression();
    miko.pet.showMikoSpeech("Terminal CMD dibuka!<br>Siap menjalankan perintah & server <strong>9router</strong>.", null, 3500);
  }

  setTimeout(() => {
    fitCmdTerminal();
    focusCmdTerminal();
  }, 80);

  setTimeout(() => {
    fitCmdTerminal();
    focusCmdTerminal();
  }, 160);

  check9routerHealth();
  clearInterval(state.cmdHealthTimer);
  state.cmdHealthTimer = setInterval(check9routerHealth, 4000);
}

function closeCmdPopup() {
  if (!state.isCmdPopupOpen) return;
  state.isCmdPopupOpen = false;
  if (cmdBtn) cmdBtn.classList.remove('active');
  if (cmdPopup) cmdPopup.classList.remove('active');
  clearInterval(state.cmdHealthTimer);
  if (state.term) state.term.focus();
  if (miko && miko.pet) {
    miko.pet.updateExpression();
    miko.pet.resetSleepTimer();
  }
}

function toggleCmdPopup() {
  if (state.isCmdPopupOpen) {
    closeCmdPopup();
  } else {
    openCmdPopup();
  }
}

function fitCmdTerminal() {
  try {
    if (state.fitAddonCmd) state.fitAddonCmd.fit();
    if (state.termCmd && state.termCmd.rows) {
      state.termCmd.refresh(0, state.termCmd.rows - 1);
    }
  } catch (_) {}
}

function focusCmdTerminal() {
  if (state.termCmd) state.termCmd.focus();
}

function init(mikoContext) {
  miko = mikoContext;

  cmdBtn = document.getElementById('cmd-btn');
  cmdPopup = document.getElementById('cmd-popup');
  cmdToggle9routerBtn = document.getElementById('cmd-toggle-9router-btn');
  cmdWebBtn = document.getElementById('cmd-web-btn');
  cmdStatusBadge = document.getElementById('cmd-status-badge');
  cmdStatusText = document.getElementById('cmd-status-text');
  cmdTermContainer = document.getElementById('cmd-term-container');

  state.termCmd = new TerminalClass({
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    fontFamily: '"SF Mono", "Menlo", "Monaco", "Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.35,
    letterSpacing: 0.2,
    theme: {
      background: '#0e1016',
      foreground: '#e6edf3',
      cursor: '#34d399',
      cursorAccent: '#0e1016',
      selectionBackground: 'rgba(52, 211, 153, 0.35)',
      selectionForeground: '#ffffff',
      black: '#1e293b',
      red: '#f87171',
      green: '#34d399',
      yellow: '#facc15',
      blue: '#38bdf8',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#e2e8f0',
      brightBlack: '#475569',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde047',
      brightBlue: '#7dd3fc',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff'
    }
  });

  state.fitAddonCmd = new FitAddonClass();
  state.termCmd.loadAddon(state.fitAddonCmd);
  state.termCmd.open(cmdTermContainer);

  if (cmdTermContainer) {
    cmdTermContainer.addEventListener('click', () => {
      state.termCmd.focus();
    });
    cmdTermContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const text = clipboard.readText();
      pasteToCmd(text);
    });
    cmdTermContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      state.termCmd.focus();
    });
  }

  const termContainer = document.getElementById('terminal-container');
  if (termContainer) {
    termContainer.addEventListener('mousedown', () => {
      if (state.isCmdPopupOpen) {
        closeCmdPopup();
      }
    });
  }

  state.termCmd.onData((data) => {
    if (miko && miko.pet) {
      miko.pet.resetSleepTimer();
      miko.pet.setPetState('typing');
    }

    if (!state.cmdProc) {
      startCmdSession();
    }

    if (data === '\r' || data === '\n') {
      state.termCmd.write('\r\n');
      const cmdToSend = cmdInputLine;
      cmdInputLine = '';

      if (cmdToSend.trim().length > 0) {
        cmdHistory.push(cmdToSend);
        cmdHistoryIndex = cmdHistory.length;
      }

      const trimmed = cmdToSend.trim();

      if (trimmed.toLowerCase() === 'cls' || trimmed.toLowerCase() === 'clear') {
        state.termCmd.clear();
        if (state.cmdProc && state.cmdProc.stdin && state.cmdProc.stdin.writable) {
          pendingCmdEcho = cmdToSend;
          state.cmdProc.stdin.write(cmdToSend + '\r\n');
        }
        return;
      }

      if (trimmed.toLowerCase() === '9router' || (trimmed.toLowerCase().startsWith('9router ') && !trimmed.includes('--tray'))) {
        start9routerServer();
        return;
      }

      if (state.cmdProc && state.cmdProc.stdin && state.cmdProc.stdin.writable) {
        pendingCmdEcho = cmdToSend;
        state.cmdProc.stdin.write(cmdToSend + '\r\n');
      }
      return;
    }

    if (data === '\x7f' || data === '\x08') {
      if (cmdInputLine.length > 0) {
        cmdInputLine = cmdInputLine.slice(0, -1);
        state.termCmd.write('\b \b');
      }
      return;
    }

    if (data === '\x03') {
      cmdInputLine = '';
      state.termCmd.write('^C\r\n');
      if (state.cmdProc && state.cmdProc.stdin && state.cmdProc.stdin.writable) {
        state.cmdProc.stdin.write('\x03\r\n');
      }
      return;
    }

    if (data === '\x1b[A') {
      if (cmdHistory.length > 0 && cmdHistoryIndex > 0) {
        state.termCmd.write('\b \b'.repeat(cmdInputLine.length));
        cmdHistoryIndex--;
        cmdInputLine = cmdHistory[cmdHistoryIndex] || '';
        state.termCmd.write(cmdInputLine);
      }
      return;
    }

    if (data === '\x1b[B') {
      if (cmdHistoryIndex < cmdHistory.length - 1) {
        state.termCmd.write('\b \b'.repeat(cmdInputLine.length));
        cmdHistoryIndex++;
        cmdInputLine = cmdHistory[cmdHistoryIndex] || '';
        state.termCmd.write(cmdInputLine);
      } else {
        state.termCmd.write('\b \b'.repeat(cmdInputLine.length));
        cmdHistoryIndex = cmdHistory.length;
        cmdInputLine = '';
      }
      return;
    }

    if (data.startsWith('\x1b')) {
      return;
    }

    cmdInputLine += data;
    state.termCmd.write(data);
  });

  state.termCmd.onSelectionChange(() => {
    const sel = state.termCmd.getSelection();
    if (sel && sel.length > 0) {
      clipboard.writeText(sel);
    }
  });

  state.termCmd.attachCustomKeyEventHandler((e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'c' && e.type === 'keydown') {
      const sel = state.termCmd.getSelection();
      if (sel && sel.length > 0) {
        clipboard.writeText(sel);
        return false;
      }
      return true;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'v' && e.type === 'keydown') {
      const text = clipboard.readText();
      pasteToCmd(text);
      return false;
    }
    if (e.key === 'Escape' && e.type === 'keydown') {
      closeCmdPopup();
      return false;
    }
    return true;
  });

  if (cmdBtn) {
    cmdBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCmdPopup();
    });
  }

  if (cmdToggle9routerBtn) {
    cmdToggle9routerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.is9routerRunning) {
        stop9routerServer();
      } else {
        start9routerServer();
      }
      state.termCmd.focus();
    });
  }

  if (cmdWebBtn) {
    cmdWebBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        shell.openExternal('http://127.0.0.1:20128/dashboard');
      } catch (_) {
        try { shell.openExternal('http://127.0.0.1:20128/'); } catch (_) {}
      }
    });
  }

  if (cmdStatusBadge) {
    cmdStatusBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        shell.openExternal('http://127.0.0.1:20128/');
      } catch (_) {}
    });
  }

  if (cmdPopup) {
    cmdPopup.addEventListener('click', (e) => {
      e.stopPropagation();
      state.termCmd.focus();
    });
    cmdPopup.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      state.termCmd.focus();
    });
  }
}

module.exports = {
  init,
  startCmdSession,
  pasteToCmd,
  openCmdPopup,
  closeCmdPopup,
  toggleCmdPopup,
  fitCmdTerminal,
  focusCmdTerminal,
  start9routerServer,
  stop9routerServer,
  check9routerHealth
};
