const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');

// Root folder aplikasi (folder assistant-pet)
const rootDir = path.join(__dirname, '..');

// Elemen DOM maskot & audio
let petContainer = null;
let petAvatarBox = null;
let petImg = null;
let petImgBack = null;
let speechBubble = null;
let muteBtn = null;

// Audio player terpusat
const speechAudioPlayer = new Audio();

// Referensi ke modul Miko lainnya
let miko = null;

// Resolusi path audio
function getAudioSrc(filename) {
  try {
    const baseName = path.basename(filename);
    if (fs.existsSync(path.join(rootDir, 'Suara Miko', baseName))) {
      return `Suara Miko/${encodeURIComponent(baseName)}`;
    }
    if (fs.existsSync(path.join(rootDir, 'Suara miko', baseName))) {
      return `Suara miko/${encodeURIComponent(baseName)}`;
    }
    if (fs.existsSync(path.join(rootDir, baseName))) {
      return encodeURIComponent(baseName);
    }
  } catch (_) {}
  return encodeURIComponent(path.basename(filename));
}

// Resolusi path ekspresi
function getExpressionSrc(filename) {
  try {
    if (fs.existsSync(path.join(rootDir, 'Ekspresi Miko', filename))) {
      return `Ekspresi Miko/${encodeURIComponent(filename)}`;
    }
    if (fs.existsSync(path.join(rootDir, 'Ekprsi Miko', filename))) {
      return `Ekprsi Miko/${encodeURIComponent(filename)}`;
    }
  } catch (_) {}
  return encodeURIComponent(filename);
}

const EXPR = {
  sapa: getExpressionSrc('Sapa.png'),
  idle: getExpressionSrc('idle.png'),
  typing: getExpressionSrc('Mengetik.png'),
  coding: getExpressionSrc('Coding.png'),
  sukses: getExpressionSrc('Sukses.png'),
  bye: getExpressionSrc('Sapai Jumpa.png'),
  cari: getExpressionSrc('Cari.png'),
  tidur: getExpressionSrc('Tidur.png'),
  perbaiki: getExpressionSrc('Perbaiki.png')
};

// Hentikan pemutaran audio maskot
function stopSpeechAudio() {
  try {
    speechAudioPlayer.pause();
    speechAudioPlayer.currentTime = 0;
    speechAudioPlayer.onended = null;
    speechAudioPlayer.onerror = null;
  } catch (_) {}
}

// Perbarui tampilan tombol mute
function updateMuteButtonUI() {
  if (!muteBtn) return;
  if (state.isMuted) {
    muteBtn.classList.add('muted');
    muteBtn.title = "Suara & Pesan Dinonaktifkan (Klik untuk Aktifkan)";
    muteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    `;
    if (speechBubble) speechBubble.classList.remove('visible');
    if (state.isGreeting) {
      state.isGreeting = false;
      updateExpression();
    }
    stopSpeechAudio();
  } else {
    muteBtn.classList.remove('muted');
    muteBtn.title = "Suara & Pesan Aktif (Klik untuk Bisukan)";
    muteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    `;
  }
}

// Tampilkan balon ucapan & putar audio
function showMikoSpeech(htmlMessage, audioFile, duration = 4000, onEnd = null) {
  if (state.isShuttingDown) return;
  clearTimeout(state.speechBubbleTimer);
  stopSpeechAudio();

  if (state.isMuted) {
    if (onEnd) {
      state.speechBubbleTimer = setTimeout(onEnd, duration || 3500);
    }
    return;
  }

  if (speechBubble) {
    speechBubble.innerHTML = htmlMessage;
    speechBubble.classList.add('visible');
  }

  let finished = false;
  const dismiss = () => {
    if (finished) return;
    finished = true;
    clearTimeout(state.speechBubbleTimer);
    if (speechBubble) speechBubble.classList.remove('visible');
    if (onEnd) onEnd();
  };

  const fallbackDuration = audioFile ? Math.max(duration || 4500, 5000) : (duration || 4000);
  state.speechBubbleTimer = setTimeout(dismiss, fallbackDuration);

  if (!audioFile) return;

  try {
    speechAudioPlayer.src = getAudioSrc(audioFile);
    speechAudioPlayer.onended = dismiss;
    speechAudioPlayer.onerror = () => {};
    speechAudioPlayer.play().catch(() => {});
  } catch (_) {}
}

// Mode tidur maskot jika tidak ada aktivitas (2 menit)
const SLEEP_IDLE_TIMEOUT = 120000;

function resetSleepTimer() {
  if (state.isShuttingDown) return;
  clearTimeout(state.sleepTimer);
  if (state.isSleeping) {
    state.isSleeping = false;
    updateExpression();
  }
  state.sleepTimer = setTimeout(() => {
    if (!state.isShuttingDown && !state.isTyping && !state.isClaudeWorking && !state.isFolderPopupOpen && !state.isCmdPopupOpen) {
      state.isSleeping = true;
      state.isGreeting = false;
      updateExpression();
    }
  }, SLEEP_IDLE_TIMEOUT);
}

// Perbarui visual ekspresi & animasi maskot
function updateExpression() {
  if (!petAvatarBox || !petImg || !petImgBack) return;

  let target = 'idle';
  if (state.isShuttingDown) {
    target = 'bye';
  } else if (state.isCmdPopupOpen) {
    target = 'perbaiki';
  } else if (state.isTyping) {
    target = 'typing';
  } else if (state.isSuccess) {
    target = 'sukses';
  } else if (state.isClaudeWorking) {
    target = 'coding';
  } else if (state.isFolderPopupOpen) {
    target = 'cari';
  } else if (state.isGreeting) {
    target = 'sapa';
  } else if (state.isSleeping) {
    target = 'tidur';
  } else {
    target = 'idle';
  }

  petAvatarBox.className = '';
  if (target === 'typing') {
    petAvatarBox.classList.add('state-typing');
  } else if (target === 'coding') {
    petAvatarBox.classList.add('state-coding');
  } else if (target === 'sukses') {
    petAvatarBox.classList.add('state-sukses');
  } else if (target === 'perbaiki') {
    petAvatarBox.classList.add('state-perbaiki');
  } else if (target === 'cari') {
    petAvatarBox.classList.add('state-cari');
  } else if (target === 'tidur') {
    petAvatarBox.classList.add('state-tidur');
  } else if (target === 'sapa') {
    petAvatarBox.classList.add('state-sapa');
  } else {
    petAvatarBox.classList.add('state-idle');
  }

  if (state.currentExpression !== target) {
    state.currentExpression = target;
    const targetSrc = EXPR[target];

    const currentVisible = state.frontActive ? petImg : petImgBack;
    const nextVisible = state.frontActive ? petImgBack : petImg;

    nextVisible.src = targetSrc;
    nextVisible.classList.add('active');
    currentVisible.classList.remove('active');
    state.frontActive = !state.frontActive;
  }
}

// Pengatur status mengetik maskot
function setPetState(s) {
  resetSleepTimer();
  if (s === 'typing') {
    state.isGreeting = false;
    state.isTyping = true;
    updateExpression();
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      state.isTyping = false;
      updateExpression();
    }, 1200);
  } else if (s === 'idle') {
    state.isTyping = false;
    clearTimeout(state.typingTimer);
    updateExpression();
  }
}

// Prosedur shutdown lengkap Miko
function shutdownMiko() {
  if (state.isShuttingDown) return;
  state.isShuttingDown = true;

  if (miko && miko.folderNav) miko.folderNav.closeFolderPopup();
  if (miko && miko.cmdServer) miko.cmdServer.closeCmdPopup();
  clearInterval(state.cmdHealthTimer);

  // Bersihkan proses CMD
  if (state.cmdProc) {
    const pid = state.cmdProc.pid;
    try {
      const { exec } = require('child_process');
      exec(`taskkill /pid ${pid} /f /t`, () => {});
    } catch (_) {}
    try { state.cmdProc.kill(); } catch (_) {}
    state.cmdProc = null;
  }

  updateExpression();

  // Tutup terminal WSL segera
  if (state.isOpen) {
    state.isOpen = false;
    const terminalBox = document.getElementById('terminal-box');
    if (terminalBox) terminalBox.style.display = 'none';
  }

  // Matikan proses WSL
  if (state.wslProc) {
    try { state.wslProc.kill(); } catch (_) {}
    state.wslProc = null;
  }

  // Fallback darurat 10 detik jika IPC macet
  const shutdownEmergencyTimer = setTimeout(() => {
    ipcRenderer.send('close-app');
  }, 10000);

  // Geser Miko ke tengah layar
  ipcRenderer.send('glide-to-center');

  ipcRenderer.once('glide-to-center-finished', () => {
    clearTimeout(shutdownEmergencyTimer);
  });
}

// Handler event glide-to-center-finished
ipcRenderer.on('glide-to-center-finished', () => {
  let finished = false;
  const finishClose = () => {
    if (finished) return;
    finished = true;
    if (speechBubble) speechBubble.classList.remove('visible');
    setTimeout(() => {
      ipcRenderer.send('close-app');
    }, 400);
  };

  // Timer pengaman 9 detik
  setTimeout(finishClose, 9000);

  if (state.isMuted) {
    setTimeout(finishClose, 700);
    return;
  }

  if (speechBubble) {
    speechBubble.innerHTML = "Sistem dimatikan miko undur diri, Bye Bye";
    speechBubble.classList.add('visible');
  }

  try {
    speechAudioPlayer.src = getAudioSrc('Sampai Jumpa.mp3');
    speechAudioPlayer.onended = () => {
      setTimeout(finishClose, 600);
    };
    speechAudioPlayer.onerror = () => {
      setTimeout(finishClose, 3000);
    };
    speechAudioPlayer.play().catch(() => {
      setTimeout(finishClose, 3000);
    });
  } catch (_) {
    setTimeout(finishClose, 3000);
  }
});

let lastToggleTime = 0;
function handleMikoClick() {
  if (state.isShuttingDown) return;
  const now = Date.now();
  if (now - lastToggleTime < 300) return;
  lastToggleTime = now;
  if (miko && miko.terminalWsl) {
    miko.terminalWsl.toggleTerminal();
  }
}

// Inisialisasi modul maskot
function init(mikoContext) {
  miko = mikoContext;

  petContainer = document.getElementById('pet-container');
  petAvatarBox = document.getElementById('pet-avatar-box');
  petImg = document.getElementById('pet-img');
  petImgBack = document.getElementById('pet-img-back');
  speechBubble = document.getElementById('speech-bubble');
  muteBtn = document.getElementById('mute-btn');

  petImg.onerror = () => { if (petImg.src !== EXPR.idle) petImg.src = EXPR.idle; };
  petImgBack.onerror = () => { if (petImgBack.src !== EXPR.idle) petImgBack.src = EXPR.idle; };
  petImg.ondragstart = (e) => { e.preventDefault(); return false; };
  petImgBack.ondragstart = (e) => { e.preventDefault(); return false; };

  petImg.src = EXPR.sapa;
  updateExpression();
  resetSleepTimer();

  // Tombol mute/unmute
  if (muteBtn) {
    updateMuteButtonUI();
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetSleepTimer();
      state.isMuted = !state.isMuted;
      localStorage.setItem('miko_muted', state.isMuted);
      updateMuteButtonUI();
    });
  }

  // Interaksi Dragging & Klik Window
  let isMouseDown = false;
  let hasDragged = false;
  let dragStartX = 0, dragStartY = 0;
  let lastScreenX = 0, lastScreenY = 0;
  let pendingDx = 0, pendingDy = 0;
  let dragRafId = null;
  const DRAG_THRESHOLD = 5;

  function flushWindowDrag() {
    dragRafId = null;
    if (pendingDx !== 0 || pendingDy !== 0) {
      ipcRenderer.send('move-window', { mouseX: pendingDx, mouseY: pendingDy });
      pendingDx = 0;
      pendingDy = 0;
    }
  }

  petContainer.addEventListener('click', (e) => {
    if (e.altKey) {
      e.stopPropagation();
      ipcRenderer.send('toggle-miko');
      return;
    }
    if (e.button === 0 && !hasDragged) {
      handleMikoClick();
    }
  });

  speechBubble.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.altKey) {
      ipcRenderer.send('toggle-miko');
      return;
    }
    if (hasDragged) return;
    speechBubble.classList.remove('visible');
    handleMikoClick();
  });

  petContainer.addEventListener('mousedown', (e) => {
    resetSleepTimer();
    if (e.altKey) {
      e.stopPropagation();
      isMouseDown = false;
      ipcRenderer.send('toggle-miko');
      return;
    }
    if (state.isShuttingDown || e.button !== 0) return;
    isMouseDown = true;
    hasDragged = false;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
  });

  const termHeader = document.querySelector('.term-header');
  if (termHeader) {
    termHeader.addEventListener('mousedown', (e) => {
      resetSleepTimer();
      if (e.target.closest('button, input, a, .action-btn, .mac-dot, .cmd-popup, .folder-popup')) return;
      if (state.isShuttingDown || e.button !== 0) return;
      isMouseDown = true;
      hasDragged = false;
      dragStartX = e.screenX;
      dragStartY = e.screenY;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
    });
  }

  petContainer.addEventListener('mouseenter', () => {
    resetSleepTimer();
  });

  window.addEventListener('mousemove', (e) => {
    if (state.isSleeping) {
      resetSleepTimer();
    }
    if (!isMouseDown) return;

    const totalDist = Math.hypot(e.screenX - dragStartX, e.screenY - dragStartY);
    if (!hasDragged && totalDist >= DRAG_THRESHOLD) {
      hasDragged = true;
    }

    if (hasDragged) {
      const dx = e.screenX - lastScreenX;
      const dy = e.screenY - lastScreenY;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      pendingDx += dx;
      pendingDy += dy;
      if (!dragRafId) {
        dragRafId = requestAnimationFrame(flushWindowDrag);
      }
    }
  });

  window.addEventListener('mousedown', () => {
    resetSleepTimer();
  });

  window.addEventListener('mouseup', (e) => {
    resetSleepTimer();
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      flushWindowDrag();
    }
    if (isMouseDown) {
      isMouseDown = false;
      if (hasDragged) {
        setTimeout(() => {
          hasDragged = false;
        }, 100);
      }
    }
  });

  petContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.isShuttingDown) return;
    if (confirm('Keluar dari Miko sepenuhnya?')) {
      shutdownMiko();
    }
  });
}

module.exports = {
  init,
  showMikoSpeech,
  stopSpeechAudio,
  resetSleepTimer,
  updateExpression,
  setPetState,
  shutdownMiko,
  getAudioSrc,
  getExpressionSrc,
  EXPR
};
