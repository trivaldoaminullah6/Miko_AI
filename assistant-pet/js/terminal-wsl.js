const { ipcRenderer, clipboard } = require('electron');
const { spawn } = require('child_process');
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

let terminalBox = null;
let termContainer = null;
let termCloseDot = null;
let termMinDot = null;
let termMaxDot = null;
let clearBtn = null;
let restartBtn = null;
let quitBtn = null;
let isTerminalExpanded = false;

let miko = null;

// Validasi ketukan keyboard nyata user (bukan escape sequence terminal)
function isRealUserKeystroke(data) {
  if (!data || typeof data !== 'string') return false;
  if (data === '\x1b[I' || data === '\x1b[O') return false;
  if (data.startsWith('\x1b[<') || data.startsWith('\x1b[M')) return false;
  if (/^\x1b\[\??[0-9;]*[Rnc]$/.test(data)) return false;
  if (data === '\x1b[200~' || data === '\x1b[201~') return false;
  return true;
}

// Analisis karakter input terminal untuk deteksi Claude CLI
function processInputChars(str) {
  if (!isRealUserKeystroke(str)) return;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\r' || ch === '\n') {
      const cmd = state.inputLineBuffer.trim();
      state.inputLineBuffer = '';

      // 1. Pemicu awal: perintah 'claude' di bash
      if (/^(?:sudo\s+)?(?:(?:\S*\/)?claude|npx\s+.*claude)(?:\s|$)/i.test(cmd)) {
        state.isClaudeSession = true;
        state.isSuccess = false;
        const parts = cmd.split(/\s+/);
        if (parts.length > 1 && !parts.slice(1).every(arg => arg.startsWith('-'))) {
          state.isClaudeWorking = true;
          state.lastPromptTime = Date.now();
        } else {
          state.isClaudeWorking = false;
        }
        if (miko && miko.pet) {
          miko.pet.updateExpression();
          miko.pet.showMikoSpeech(
            "Integrasi Selesai Modul Claude Siap Dijalankan",
            "Claude_Berjalan.mp3",
            5000
          );
        }
        continue;
      }

      // 2. Keluar dari sesi Claude CLI
      if (state.isClaudeSession && (/^(?:\/exit|\/quit|exit|quit|:q)$/i.test(cmd) || cmd.endsWith('/exit') || cmd.endsWith('/quit') || cmd.endsWith('exit') || cmd.endsWith('quit'))) {
        exitClaudeSession();
        continue;
      }

      // 3. User mengirim prompt di dalam Claude
      if (state.isClaudeSession && !state.isClaudeWorking && cmd.length > 0) {
        state.isClaudeWorking = true;
        state.isSuccess = false;
        state.lastPromptTime = Date.now();
        clearTimeout(state.claudeFinishTimer);
        clearTimeout(state.successTimer);
        if (miko && miko.pet) {
          miko.pet.updateExpression();
          miko.pet.showMikoSpeech(
            "Miko Mengerjakan Printah",
            "Mengerjakan.mp3",
            4500
          );
        }
      }
    } else if (ch === '\x04') { // Ctrl+D (EOF)
      if (state.isClaudeSession) {
        exitClaudeSession();
      }
    } else if (ch === '\x7f' || ch === '\b') {
      state.inputLineBuffer = state.inputLineBuffer.slice(0, -1);
    } else if (ch === '\x03') { // Ctrl+C
      state.inputLineBuffer = '';
      const now = Date.now();
      if (state.isClaudeSession && (now - state.lastCtrlCTime < 900)) {
        exitClaudeSession();
      } else {
        state.lastCtrlCTime = now;
        if (state.isClaudeWorking || state.isSuccess) {
          state.isClaudeWorking = false;
          state.isSuccess = false;
          clearTimeout(state.claudeFinishTimer);
          clearTimeout(state.successTimer);
          if (miko && miko.pet) miko.pet.updateExpression();
        }
      }
    } else if (ch === '\x15') { // Ctrl+U
      state.inputLineBuffer = '';
    } else if (ch >= ' ') {
      state.inputLineBuffer += ch;
    }
  }
}

// Selesai / keluar dari Claude Code CLI
function exitClaudeSession() {
  if (!state.isClaudeSession) return;
  state.isClaudeSession = false;
  state.isClaudeWorking = false;
  state.isSuccess = false;
  clearTimeout(state.claudeFinishTimer);
  clearTimeout(state.successTimer);
  if (miko && miko.pet) {
    miko.pet.updateExpression();
    miko.pet.resetSleepTimer();
    miko.pet.showMikoSpeech(
      "Sesi Calude Berahir koneksi diputuskan",
      "Claude_Brakhir.mp3",
      4500
    );
  }
}

// Pembaruan teks judul window terminal gaya macOS
function updateTerminalTitle(cols, rows) {
  const titleText = document.getElementById('term-title-text');
  if (titleText) {
    const c = cols || (state.term ? state.term.cols : 80) || 80;
    const r = rows || (state.term ? state.term.rows : 24) || 24;
    titleText.textContent = `miko — bash — ${c}×${r}`;
  }
}

// Penyelarasan ukuran terminal (FitAddon)
function fitTerminal() {
  if (!state.isOpen) return;
  try {
    if (state.fitAddon) state.fitAddon.fit();
    if (state.term && state.term.cols && state.term.rows) {
      updateTerminalTitle(state.term.cols, state.term.rows);
      if (state.wslProc && state.wslProc.stdin && state.wslProc.stdin.writable) {
        state.wslProc.stdin.write(`\x1b[8;${state.term.rows};${state.term.cols}t`);
      }
      state.term.refresh(0, state.term.rows - 1);
    }
  } catch (_) {}

  if (miko && miko.cmdServer && state.isCmdPopupOpen) {
    miko.cmdServer.fitCmdTerminal();
  }
}

// Buka / Tutup Terminal WSL
function toggleTerminal() {
  if (miko && miko.pet) miko.pet.resetSleepTimer();
  state.isOpen = !state.isOpen;
  ipcRenderer.send('toggle-size', state.isOpen);

  if (!terminalBox) terminalBox = document.getElementById('terminal-box');

  if (state.isOpen) {
    if (terminalBox) terminalBox.style.display = 'flex';
    if (miko && miko.pet) miko.pet.updateExpression();
    setTimeout(() => {
      fitTerminal();
      if (state.isCmdPopupOpen && miko && miko.cmdServer) {
        miko.cmdServer.focusCmdTerminal();
      } else if (state.term) {
        state.term.focus();
      }
    }, 120);
  } else {
    if (state.isFolderPopupOpen && miko && miko.folderNav) {
      miko.folderNav.closeFolderPopup();
    }
    if (state.isCmdPopupOpen && miko && miko.cmdServer) {
      miko.cmdServer.closeCmdPopup();
    }
    if (isTerminalExpanded) {
      isTerminalExpanded = false;
      if (terminalBox) terminalBox.classList.remove('expanded');
    }
    if (terminalBox) terminalBox.style.display = 'none';
    state.isTyping = false;
    clearTimeout(state.typingTimer);
    if (miko && miko.pet) miko.pet.updateExpression();
  }
}

// Mulai sesi WSL Bash interaktif autentik dengan Linux Pseudo-Terminal (PTY)
function startWslSession() {
  if (state.wslProc) {
    try { state.wslProc.kill(); } catch (_) {}
    state.wslProc = null;
  }

  if (state.term) state.term.reset();

  const pythonPtyCode = `
import os, sys, select, fcntl, termios, struct, re

master, slave = os.openpty()
cols = ${state.term ? state.term.cols || 80 : 80}
rows = ${state.term ? state.term.rows || 24 : 24}
try:
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
except Exception:
    pass

pid = os.fork()
if pid == 0:
    os.close(master)
    os.setsid()
    try:
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
    except Exception:
        pass
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    if slave > 2:
        os.close(slave)

    os.environ['TERM'] = 'xterm-256color'
    os.environ['COLORTERM'] = 'truecolor'
    os.environ['CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT'] = '1'
    os.environ['LANG'] = 'en_US.UTF-8'

    home = os.path.expanduser('~')
    try:
        os.chdir(home)
    except Exception:
        pass

    os.execvp('/bin/bash', ['/bin/bash', '--login'])
else:
    os.close(slave)
    resize_pattern = re.compile(rb'\\x1b\\[8;([0-9]+);([0-9]+)t')
    try:
        while True:
            r, _, _ = select.select([0, master], [], [])
            if 0 in r:
                data = os.read(0, 4096)
                if not data:
                    break
                m = resize_pattern.search(data)
                if m:
                    try:
                        r_rows = int(m.group(1))
                        r_cols = int(m.group(2))
                        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", r_rows, r_cols, 0, 0))
                    except Exception:
                        pass
                    data = resize_pattern.sub(b'', data)
                if data:
                    os.write(master, data)
            if master in r:
                data = os.read(master, 4096)
                if not data:
                    break
                os.write(1, data)
    except Exception:
        pass
    finally:
        os.close(master)
`;

  const b64Py = Buffer.from(pythonPtyCode.trim(), 'utf8').toString('base64');
  const ptyCommand = `python3 -c "$(echo "${b64Py}" | base64 -d)"`;

  try {
    state.isClaudeSession = false;
    state.isClaudeWorking = false;
    state.isSuccess = false;
    state.wslStdoutHistory = '';
    clearTimeout(state.claudeFinishTimer);
    clearTimeout(state.successTimer);

    state.wslProc = spawn('wsl.exe', ['~', '--exec', 'bash', '-c', ptyCommand], {
      windowsHide: true,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: 'en_US.UTF-8'
      }
    });

    state.wslProc.stdout.on('data', (data) => {
      if (state.term) state.term.write(data);
      const text = data.toString('utf8');
      state.wslStdoutHistory = (state.wslStdoutHistory + text).slice(-1024);

      // 1. Deteksi sesi Claude Code keluar ke shell
      if (state.isClaudeSession) {
        const hasExitIndicator =
          state.wslStdoutHistory.includes('Resume this session with:') ||
          state.wslStdoutHistory.includes('claude --resume') ||
          state.wslStdoutHistory.includes('Session ended') ||
          state.wslStdoutHistory.includes('Goodbye!') ||
          text.includes('Resume this session with:') ||
          text.includes('claude --resume');

        if (hasExitIndicator) {
          exitClaudeSession();
          state.wslStdoutHistory = '';
          return;
        }
      }

      // 2. Deteksi selesainya respon prompt Claude
      if (state.isClaudeSession && state.isClaudeWorking) {
        const now = Date.now();
        if (now - state.lastPromptTime >= 800) {
          clearTimeout(state.claudeFinishTimer);
          const hasPrompt = text.includes('❯') || text.includes('>');
          const delay = hasPrompt ? 400 : 1300;

          state.claudeFinishTimer = setTimeout(() => {
            if (state.isClaudeWorking && (Date.now() - state.lastPromptTime >= 1400)) {
              state.isClaudeWorking = false;
              state.isSuccess = true;
              if (miko && miko.pet) {
                miko.pet.updateExpression();
                clearTimeout(state.successTimer);
                miko.pet.showMikoSpeech(
                  "Selesai, Miko telah mengerjakan Tugas",
                  "Selesai_Mengerjakan.mp3",
                  4500,
                  () => {
                    state.isSuccess = false;
                    miko.pet.updateExpression();
                    miko.pet.resetSleepTimer();
                  }
                );
              }

              state.successTimer = setTimeout(() => {
                if (state.isSuccess) {
                  state.isSuccess = false;
                  if (miko && miko.pet) {
                    miko.pet.updateExpression();
                    miko.pet.resetSleepTimer();
                  }
                }
              }, 5500);
            }
          }, delay);
        }
      }
    });

    state.wslProc.stderr.on('data', (data) => {
      if (state.term) state.term.write(data);
    });

    state.wslProc.on('exit', () => {
      if (state.term) state.term.write('\r\n\x1b[33m[Sesi bash WSL berakhir. Klik tombol Restart di atas untuk memulai sesi baru]\x1b[0m\r\n');
    });

    state.wslProc.on('error', (err) => {
      if (state.term) state.term.write(`\r\n\x1b[31m[Gagal menjalankan WSL: ${err.message}]\x1b[0m\r\n`);
    });
  } catch (err) {
    if (state.term) state.term.write(`\r\n\x1b[31m[Error inisialisasi WSL: ${err.message}]\x1b[0m\r\n`);
  }
}

// Kirim perintah teks langsung ke stdin WSL
function sendToWsl(command) {
  if (state.wslProc && state.wslProc.stdin && state.wslProc.stdin.writable) {
    state.wslProc.stdin.write(command);
  }
}

// Inisialisasi modul terminal WSL
function init(mikoContext) {
  miko = mikoContext;

  terminalBox = document.getElementById('terminal-box');
  termContainer = document.getElementById('terminal-container');
  termCloseDot = document.getElementById('term-close-dot');
  termMinDot = document.getElementById('term-min-dot');
  termMaxDot = document.getElementById('term-max-dot');
  clearBtn = document.getElementById('clear-btn');
  restartBtn = document.getElementById('restart-btn');
  quitBtn = document.getElementById('quit-btn');

  state.term = new TerminalClass({
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    fontFamily: '"SF Mono", "Menlo", "Monaco", "Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.35,
    letterSpacing: 0.2,
    allowTransparency: true,
    theme: {
      background: '#0e1016',
      foreground: '#e6edf3',
      cursor: '#38bdf8',
      cursorAccent: '#0e1016',
      selectionBackground: 'rgba(56, 189, 248, 0.35)',
      selectionForeground: '#ffffff',
      black: '#1e242d',
      red: '#ff6b6b',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#38bdf8',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#e2e8f0',
      brightBlack: '#4b5563',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde047',
      brightBlue: '#7dd3fc',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff'
    }
  });

  state.fitAddon = new FitAddonClass();
  state.term.loadAddon(state.fitAddon);
  state.term.open(termContainer);
  updateTerminalTitle(state.term.cols, state.term.rows);

  termContainer.addEventListener('click', () => {
    state.term.focus();
  });

  termContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const text = clipboard.readText();
    if (text && state.wslProc && state.wslProc.stdin && state.wslProc.stdin.writable) {
      state.wslProc.stdin.write(text);
      processInputChars(text);
    }
  });

  state.term.onSelectionChange(() => {
    const sel = state.term.getSelection();
    if (sel && sel.length > 0) {
      clipboard.writeText(sel);
    }
  });

  state.term.attachCustomKeyEventHandler((e) => {
    if (e.altKey && e.key.toLowerCase() === 'f' && e.type === 'keydown') {
      if (miko && miko.folderNav) miko.folderNav.toggleFolderPopup();
      return false;
    }
    if (e.altKey && e.key.toLowerCase() === 'c' && e.type === 'keydown') {
      if (miko && miko.cmdServer) miko.cmdServer.toggleCmdPopup();
      return false;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'c' && e.type === 'keydown') {
      const sel = state.term.getSelection();
      if (sel && sel.length > 0) {
        clipboard.writeText(sel);
        return false;
      }
      return true;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'v' && e.type === 'keydown') {
      const text = clipboard.readText();
      if (text && state.wslProc && state.wslProc.stdin && state.wslProc.stdin.writable) {
        state.wslProc.stdin.write(text);
        processInputChars(text);
      }
      return false;
    }
    return true;
  });

  state.term.onData((data) => {
    if (isRealUserKeystroke(data) && miko && miko.pet) {
      miko.pet.setPetState('typing');
    }
    processInputChars(data);
    if (state.wslProc && state.wslProc.stdin && state.wslProc.stdin.writable) {
      state.wslProc.stdin.write(data);
    }
  });

  state.term.onResize(({ cols, rows }) => {
    updateTerminalTitle(cols, rows);
    if (state.wslProc && state.wslProc.stdin && state.wslProc.stdin.writable) {
      state.wslProc.stdin.write(`\x1b[8;${rows};${cols}t`);
    }
  });

  // Tombol kontrol header macOS traffic lights
  if (termCloseDot) {
    termCloseDot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (miko && miko.pet) miko.pet.resetSleepTimer();
      if (state.isOpen) {
        toggleTerminal();
      }
    });
  }

  if (termMinDot) {
    termMinDot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (miko && miko.pet) miko.pet.resetSleepTimer();
      ipcRenderer.send('toggle-miko');
    });
  }

  if (termMaxDot) {
    termMaxDot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (miko && miko.pet) miko.pet.resetSleepTimer();
      isTerminalExpanded = !isTerminalExpanded;
      if (terminalBox) {
        if (isTerminalExpanded) {
          terminalBox.classList.add('expanded');
        } else {
          terminalBox.classList.remove('expanded');
        }
      }
      ipcRenderer.send('toggle-expand-terminal', isTerminalExpanded);
      setTimeout(fitTerminal, 100);
      setTimeout(fitTerminal, 250);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (miko && miko.pet) miko.pet.resetSleepTimer();
      state.term.clear();
      state.term.focus();
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (miko && miko.pet) miko.pet.resetSleepTimer();
      state.isClaudeSession = false;
      state.isClaudeWorking = false;
      state.isSuccess = false;
      state.isGreeting = false;
      if (miko && miko.pet) miko.pet.updateExpression();
      startWslSession();
      state.term.focus();
    });
  }

  if (quitBtn) {
    let quitClickCount = 0;
    quitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      quitClickCount++;
      if (quitClickCount > 1) {
        ipcRenderer.send('close-app');
        return;
      }
      if (miko && miko.pet) miko.pet.shutdownMiko();
    });
  }
}

module.exports = {
  init,
  startWslSession,
  fitTerminal,
  toggleTerminal,
  exitClaudeSession,
  sendToWsl,
  processInputChars
};
