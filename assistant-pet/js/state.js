// State terpusat untuk aplikasi Miko Desktop Companion
const state = {
  // Status visibilitas terminal WSL
  isOpen: false,

  // Status ekspresi & aktivitas Claude
  isClaudeSession: false,
  isClaudeWorking: false,
  isSuccess: false,
  isTyping: false,
  isGreeting: true,
  isShuttingDown: false,
  isSleeping: false,

  // Status modal / pop-up
  isFolderPopupOpen: false,
  isCmdPopupOpen: false,

  // Status server 9router & audio
  is9routerRunning: false,
  isMuted: localStorage.getItem('miko_muted') === 'true',

  // Objek proses sistem
  wslProc: null,
  cmdProc: null,

  // State ekspresi maskot
  currentExpression: 'sapa',
  frontActive: true,

  // Timers
  typingTimer: null,
  successTimer: null,
  sleepTimer: null,
  speechBubbleTimer: null,
  claudeFinishTimer: null,
  cmdHealthTimer: null,

  // Claude input tracking
  lastPromptTime: 0,
  lastCtrlCTime: 0,
  inputLineBuffer: '',
  wslStdoutHistory: '',

  // Terminal instances
  term: null,
  fitAddon: null,
  termCmd: null,
  fitAddonCmd: null
};

module.exports = state;
