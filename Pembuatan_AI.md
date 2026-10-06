# Panduan Lengkap Pembuatan AI Desktop Assistant (Miko)

Panduan ini mendokumentasikan secara menyeluruh rancang bangun, spesifikasi kebutuhan, arsitektur sistem, dan panduan langkah demi langkah untuk membuat sistem **Miko Desktop Assistant** (Maskot Desktop Interaktif + Terminal WSL + Claude Code Monitor + Ekstensi VS Code).

---

## 1. Kebutuhan Sistem & Prasyarat (Prerequisites)

### A. Perangkat Keras & Sistem Operasi
* **Sistem Operasi**: Windows 10 (versi 2004+) atau Windows 11 (64-bit).
* **RAM**: Minimal 4 GB (disarankan 8 GB ke atas).
* **Penyimpanan**: Minimal 2 GB ruang kosong untuk Node.js, Electron, dependensi, dan distro WSL Linux.
* **Prosesor**: AMD atau Intel dengan dukungan virtualisasi hardware (AMD-V / Intel VT-x) aktif di BIOS/UEFI.

### B. Perangkat Lunak Inti
1. **Node.js**: Versi LTS (v18.x, v20.x, atau v22.x).
2. **WSL 2 (Windows Subsystem for Linux)**:
   * Distro default: Ubuntu atau Debian.
   * Perintah instalasi: `wsl --install -d Ubuntu`
3. **Python 3 pada Linux WSL**:
   * Digunakan sebagai alokator Pseudo-Terminal (`/dev/pts`).
   * Instalasi di WSL: `sudo apt update && sudo apt install -y python3`
4. **Claude Code CLI** (pada lingkungan Linux WSL):
   * `npm install -g @anthropic-ai/claude-code`
5. **Visual Studio Code**:
   * Untuk integrasi ekstensi `project-companion`.
6. **(Opsional) 9router**:
   * Router/proxy server lokal untuk orchestrator AI (port `20128`).

---

## 2. Arsitektur & Diagram Komponen

Sistem Miko dibangun dengan arsitektur modular berlapis:

```
+────────────────────────────────────────────────────────────────────────+
|                          VISUAL STUDIO CODE                            |
|  Ekstensi: project-companion                                           |
|  - Deteksi 'electron.exe' via Windows Tasklist saat startup            |
|  - Otomatis trigger 'start-pet.bat' jika Miko belum berjalan           |
+───────────────────────────────────┬────────────────────────────────────+
                                    │ Background Spawn
                                    ▼
+────────────────────────────────────────────────────────────────────────+
|                ELECTRON APP: assistant-pet (Main Process)              |
|  - Window: Frameless, Transparent, Always-on-Top, Taskbar-less         |
|  - Flags: Hardware acceleration off (AMD fix), RAM limit 128MB         |
|  - IPC Hub: move-window, toggle-size, toggle-expand, glide-to-center   |
+───────────────────────────────────┬────────────────────────────────────+
                                    │ IPC / Renderer
                                    ▼
+────────────────────────────────────────────────────────────────────────+
|                 RENDERER PROCESS (index.html & Modules)                |
|                                                                        |
|  [Module: pet.js]                                                      |
|  - Maskot Desktop, Drag Engine, Sleep Timer (2 mnt)                    |
|  - State Machine 9 Ekspresi (Dual-buffer flicker-free)                 |
|  - Audio Engine HTML5 (Suara Miko) & Speech Bubble                     |
|                                                                        |
|  [Module: terminal-wsl.js]                                             |
|  - xterm.js + FitAddon                                                 |
|  - WSL spawn: wsl.exe ~ --exec bash -c (Python PTY)                    |
|  - Stream Parser: Deteksi prompt, aktivitas, & exit Claude CLI        |
|                                                                        |
|  [Module: folder-nav.js]                                               |
|  - Dialog pemilihan drive Windows (C, E, F)                            |
|  - Deep-search BFS non-blocking (budget 100ms/frame)                   |
|  - Auto 'cd <path> && claude' ke bash WSL                              |
|                                                                        |
|  [Module: cmd-server.js]                                               |
|  - Terminal native CMD Windows (xterm.js terpisah)                    |
|  - Controller & monitor kesehatan service 9router (port 20128)         |
+────────────────────────────────────────────────────────────────────────+
```

---

## 3. Struktur Direktori Proyek

```
AI_Destop/
├── Pembuatan_AI.md                    # Dokumentasi panduan pembuatan
├── PRD_AI_Des.md                      # Product Requirement Document
├── assistant-pet/                     # Proyek Electron (Desktop Pet & Terminal)
│   ├── package.json                   # Konfigurasi dependensi Electron
│   ├── start-pet.bat                  # Script peluncur utama
│   ├── Miko.bat                       # Script alias peluncur
│   ├── add-to-path.bat                # Script registrasi ke Windows PATH
│   ├── main.js                        # Electron Main Process
│   ├── renderer.js                    # Renderer Entry Point
│   ├── index.html                     # Struktur DOM Utama
│   ├── css/
│   │   └── style.css                  # Style UI, animasi napas, tata letak
│   ├── js/
│   │   ├── state.js                   # State terpusat (singleton)
│   │   ├── pet.js                     # Logika maskot, ekspresi, audio, drag
│   │   ├── terminal-wsl.js            # Engine xterm WSL bash & Claude tracker
│   │   ├── folder-nav.js              # Modul pencarian & navigasi folder
│   │   └── cmd-server.js              # Modul terminal CMD & server 9router
│   ├── Ekspresi Miko/                 # Gambar ekspresi PNG transparan
│   │   ├── Sapa.png
│   │   ├── idle.png
│   │   ├── Mengetik.png
│   │   ├── Coding.png
│   │   ├── Sukses.png
│   │   ├── Cari.png
│   │   ├── Perbaiki.png
│   │   ├── Tidur.png
│   │   └── Sapai Jumpa.png
│   └── Suara Miko/                    # File efek audio MP3
│       ├── Selamat Datang.mp3
│       ├── Claude_Berjalan.mp3
│       ├── Mengerjakan.mp3
│       ├── Selesai_Mengerjakan.mp3
│       ├── Claude_Brakhir.mp3
│       ├── 9Router_aktif.mp3
│       ├── 9router_nonaktif.mp3
│       └── Sampai Jumpa.mp3
└── project-companion/                 # Ekstensi pendamping VS Code
    ├── package.json
    ├── tsconfig.json
    ├── esbuild.js
    └── src/
        └── extension.ts
```

---

## 4. Langkah-Langkah Pembuatan dari Awal (Step-by-Step)

### Tahap 1: Inisialisasi Proyek Electron (`assistant-pet`)
1. Buat folder `assistant-pet`:
   ```bash
   mkdir assistant-pet && cd assistant-pet
   npm init -y
   ```
2. Instal dependensi:
   ```bash
   npm install electron @xterm/xterm @xterm/addon-fit
   ```
3. Konfigurasi `package.json`:
   ```json
   {
     "name": "assistant-pet",
     "version": "1.0.0",
     "main": "main.js",
     "scripts": {
       "start": "electron ."
     }
   }
   ```

### Tahap 2: Konfigurasi Electron Main Process (`main.js`)
Fitur penting pada `main.js`:
* **Transparansi & Always-on-Top**:
  ```javascript
  win = new BrowserWindow({
    width: 260,
    height: 220,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  ```
* **Mitigasi Glitch GPU AMD Windows**:
  ```javascript
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
  ```
* **IPC Window Mover & Resizer**:
  Menangani event `move-window`, `toggle-size` (260x220 saat collapsed, 860x440 saat expanded), dan `glide-to-center` (animasi penutupan aplikasi).

### Tahap 3: Implementasi Modul Maskot (`js/pet.js`)
* **State Machine Ekspresi Visual**:
  Terdapat 9 status ekspresi yang berganti dinamis berdasarkan status aplikasi:
  1. `sapa`: Saat peluncuran awal.
  2. `idle`: Kondisi normal santai.
  3. `typing`: Pengguna sedang mengetik di terminal.
  4. `coding`: Claude CLI sedang mengeksekusi instruksi.
  5. `sukses`: Claude CLI berhasil menyelesaikan tugas.
  6. `cari`: Pop-up pencarian folder sedang terbuka.
  7. `perbaiki`: Pop-up terminal CMD / 9router sedang terbuka.
  8. `tidur`: Tidak ada aktivitas selama 2 menit.
  9. `bye`: Prosedur shutdown aplikasi.
* **Dual-Buffer Crossfade Transition**:
  Gunakan dua elemen `<img>` bertumpuk (`#pet-img` dan `#pet-img-back`) dengan class CSS `.active` dan transition opacity 0.25s agar tidak terjadi flicker saat pergantian gambar.
* **Solusi Drag-and-Drop Anti-Trigger**:
  Tunda reset state `hasDragged` sebesar 100ms pada event `mouseup` window agar event native `click` browser tidak salah mengeksekusi toggle terminal saat maskot digeser.

### Tahap 4: Integrasi Terminal Linux WSL & Python PTY (`js/terminal-wsl.js`)
* **Pseudo-Terminal Linux Riil (`/dev/pts`)**:
  Claude Code dan shell interaktif memerlukan TTY riil. Jika hanya memakai raw child process pipe, aplikasi CLI interaktif akan gagal.
* Jalankan bash WSL melalui jembatan Python PTY bawaan Linux:
  ```python
  import os, sys, fcntl, termios, struct
  master, slave = os.openpty()
  # Atur ukuran baris & kolom TTY
  fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
  # Fork proses child dan hubungkan ke bash
  ```
* Di Node.js, spawn proses menggunakan:
  ```javascript
  spawn('wsl.exe', ['~', '--exec', 'bash', '-c', ptyCommand]);
  ```
* Sambungkan output stdout ke instance `@xterm/xterm`.

### Tahap 5: Deteksi Cerdas Status Claude Code CLI
Memantau input kursor dan output stream terminal:
1. **Deteksi Aktivasi**: Regex `/claude(\s|$)/` pada buffer input -> Ubah ekspresi, putar `Claude_Berjalan.mp3`.
2. **Deteksi Eksekusi Prompt**: Input dikirim saat sesi Claude aktif -> Ubah ekspresi ke `Coding.png`, putar `Mengerjakan.mp3`.
3. **Deteksi Selesai**: Karakter prompt `❯` atau `>` muncul kembali pada stdout setelah output panjang -> Ubah ekspresi ke `Sukses.png`, putar `Selesai_Mengerjakan.mp3`.
4. **Deteksi Keluar (Exit)**: Deteksi teks `Resume this session with:`, perintah `/exit`, `Ctrl+D`, atau double `Ctrl+C` -> Putar `Claude_Brakhir.mp3`, kembalikan maskot ke mode bash normal.

### Tahap 6: Pembuatan Ekstensi VS Code (`project-companion`)
* Ekstensi bertugas memastikan Miko aktif saat VS Code dibuka:
  ```typescript
  // src/extension.ts
  export function activate(context: vscode.ExtensionContext) {
    exec('tasklist /FI "IMAGENAME eq electron.exe" /NH', (err, stdout) => {
      if (!stdout.toLowerCase().includes('electron.exe')) {
        exec('cmd.exe /c "C:\\Users\\...\\assistant-pet\\start-pet.bat"');
      }
    });
  }
  ```

---

## 5. Pemecahan Masalah Kritis (Troubleshooting & Best Practices)

| Masalah | Penyebab | Solusi yang Diterapkan |
| :--- | :--- | :--- |
| **Window hitam / Glitch visual di Windows AMD** | Hardware acceleration Chromium bentrok dengan kompositor Windows transparan. | Pasang `app.disableHardwareAcceleration()` dan `--disable-gpu` di `main.js`. |
| **Terminal terbuka sendiri saat Miko digeser** | Event `mouseup` langsung me-reset flag `hasDragged = false`, sehingga event `click` menganggap pergeseran sebagai klik. | Tunda reset `hasDragged` selama 100ms via `setTimeout` di event `mouseup`. |
| **Claude CLI error "stdout is not a tty"** | Node.js child_process menggunakan pipe biasa, bukan terminal Linux riil. | Gunakan Python PTY wrapper (`os.openpty()`) untuk mengalokasikan `/dev/pts` di WSL. |
| **Konsumsi RAM tinggi** | Cache V8 Chromium dan background dictionary Electron. | Tambahkan `--max-old-space-size=128`, limit 1 renderer process, dan matikan spellcheck. |
| **Ukuran folder membengkak ratusan MB** | Terdapat file GIF mentah berukuran besar yang tidak terpakai. | Gunakan file PNG teroptimasi (~300 KB) dan manipulasi animasi via CSS transform/keyframes. |

---

## 6. Cara Menjalankan & Memverifikasi

1. **Menjalankan Miko secara mandiri**:
   Klik dua kali `start-pet.bat` di folder `assistant-pet`.
2. **Shortcut Global & Akses Cepat**:
   * `Alt + M`: Sembunyikan / Munculkan Miko dari mana saja.
   * `Alt + F`: Buka pop-up navigator folder C/E/F.
   * `Alt + C`: Buka pop-up CMD Windows / Server 9router.
   * `Klik Kiri Maskot`: Buka / Tutup panel terminal WSL.
   * `Klik Kanan Maskot`: Dialog keluar aplikasi total.
3. **Uji Integrasi VS Code**:
   Tutup Miko sepenuhnya. Buka VS Code. Ekstensi `project-companion` akan otomatis mendeteksi ketiadaan proses `electron.exe` dan membangunkan Miko di desktop.
