# Product Requirement Document (PRD) & Feature Inventory: Miko Desktop Assistant

Dokumen ini mendokumentasikan seluruh arsitektur, modul, dan fitur yang telah diimplementasikan serta berfungsi dalam ekosistem **Miko Desktop Assistant** (mencakup aplikasi desktop `assistant-pet` dan ekstensi VS Code `project-companion`).

---

## 1. Ikhtisar Sistem & Arsitektur

Ekosistem Miko terdiri dari dua komponen inti yang terhubung secara seamless di lingkungan Windows & WSL:

```
  +──────────────────────────────────────────────────────────────+
  |                   Visual Studio Code                         |
  |  +--------------------------------------------------------+  |
  |  | Extension: project-companion                           |  |
  |  | - onStartupFinished auto-check                         |  |
  |  | - Menjalankan start-pet.bat jika Miko belum aktif       |  |
  |  +--------------------------------------------------------+  |
  +──────────────────────────────┬───────────────────────────────+
                                 │ Trigger Startup
                                 ▼
  +──────────────────────────────────────────────────────────────+
  |              Electron App: assistant-pet (Miko)              |
  |  +---------------------------+  +--------------------------+ |
  |  | Floating Mascot (Window)  |  | Terminal Box (xterm.js)  | |
  |  | - Frameless, Transparent  |  | - Embedded Linux PTY     | |
  |  | - Always On Top           |  | - Interactive WSL Bash   | |
  |  | - 9 Ekspresi & Animasi    |  | - Claude Code Monitor    | |
  |  | - Audio Speech System     |  | - Action Buttons Toolbar | |
  |  | - Drag Engine Debounced   |  | - Pop-up Folder & CMD    | |
  |  +---------------------------+  +--------------------------+ |
  +──────────────────────────────────────────────────────────────+
```

---

## 2. Inventaris Fitur yang Telah Dikembangkan

### A. Maskot Desktop Interaktif (Desktop Pet Engine)

| ID | Fitur | Deskripsi Implementasi | Status |
| :--- | :--- | :--- | :--- |
| **PET-01** | **Frameless & Transparent Window** | Jendela Electron transparan tanpa border OS (`frame: false`, `transparent: true`), melayang di atas semua aplikasi (`alwaysOnTop: 'screen-saver'`). | Aktif |
| **PET-02** | **Single Instance Lock** | Mekanisme `app.requestSingleInstanceLock()` untuk mencegah duplikasi proses. Jika instance kedua dibuka, fokus dikembalikan ke instance utama. | Aktif |
| **PET-03** | **Freeform Dragging** | Maskot dapat digeser bebas ke seluruh layar monitor dengan klik kiri dan tahan (`move-window` IPC). | Aktif |
| **PET-04** | **State Machine Multi-Ekspresi** | Maskot memiliki 9 kondisi ekspresi visual dinamis berbasis state aplikasi: | Aktif |
| | - *Sapa* (`Sapa.png`) | Tampil saat startup awal atau sambutan. | Aktif |
| | - *Idle* (`idle.png`) | Mode santai default saat tidak ada aktivitas intensif. | Aktif |
| | - *Mengetik* (`Mengetik.png`) | Aktif saat pengguna mengetik di terminal (debounce 1.2 detik). | Aktif |
| | - *Coding* (`Coding.png`) | Aktif otomatis saat Claude Code CLI sedang memproses prompt. | Aktif |
| | - *Sukses* (`Sukses.png`) | Aktif saat Claude selesai bekerja. | Aktif |
| | - *Cari* (`Cari.png`) | Aktif saat pop-up pencarian folder dibuka (klik tombol folder atau Alt+F). | Aktif |
| | - *Perbaiki* (`Perbaiki.png`) | Aktif otomatis saat memasuki mode CMD / 9router (klik tombol CMD atau Alt+C). | Aktif |
| | - *Tidur* (`Tidur.png`) | Mode tidur otomatis jika sistem idle selama 2 menit (120.000 ms). | Aktif |
| | - *Pamit* (`Sapai Jumpa.png`) | Tampil saat proses shutdown aplikasi. | Aktif |
| **PET-05** | **Flicker-Free Crossfade Transitions** | Transisi pergantian ekspresi menggunakan teknik dual-buffer (`petImg` & `petImgBack`) dengan CSS opacity transition untuk mencegah kedipan layar. | Aktif |
| **PET-06** | **Breathing Animation System** | Animasi bernapas halus dengan CSS keyframes (`mikoAlive`, `state-typing`, `state-coding`, `state-sukses`, `state-cari`, `state-tidur`). | Aktif |
| **PET-07** | **Interactive Speech Bubble** | Balon percakapan dinamis dengan panah penunjuk ke arah kepala maskot, efek animasi pop-in, auto-dismiss, dan dukungan teks HTML. | Aktif |
| **PET-08** | **Pooled Audio Engine** | Pemutar audio HTML5 tunggal teroptimasi untuk memutar suara Miko tanpa kebocoran memori: | Aktif |
| | - `Selamat Datang.mp3` | Salam pembuka saat Miko dinyalakan. | Aktif |
| | - `Claude_Berjalan.mp3` | Suara konfirmasi saat sesi `claude` CLI diaktifkan. | Aktif |
| | - `Mengerjakan.mp3` | Suara konfirmasi saat prompt baru dikirim ke Claude. | Aktif |
| | - `Selesai_Mengerjakan.mp3` | Suara perayaan saat tugas Claude selesai dikerjakan. | Aktif |
| | - `Claude_Brakhir.mp3` | Suara saat keluar dari sesi Claude Code CLI. | Aktif |
| | - `9Router_aktif.mp3` | Suara saat server 9router diaktifkan. | Aktif |
| | - `9router_nonaktif.mp3` | Suara saat server 9router dinonaktifkan. | Aktif |
| | - `Sampai Jumpa.mp3` | Suara pamit saat Miko ditutup. | Aktif |
| **PET-09** | **Audio & Speech Mute Toggle** | Tombol bisukan suara dan balon dialog di header terminal. Status tersimpan permanen di `localStorage` (`miko_muted`). | Aktif |
| **PET-10** | **Glide-to-Center Shutdown Sequence** | Saat ditutup, Miko otomatis meluncur mulus ke tengah layar menggunakan interpolasi kubik (*cubic ease-out* ~480ms), mengucapkan salam pamit, memutar audio, lalu keluar bersih. | Aktif |
| **PET-11** | **Quick Exit Context Menu** | Klik kanan pada maskot menampilkan dialog konfirmasi instan untuk mematikan Miko sepenuhnya. | Aktif |
| **PET-12** | **Drag-to-Click False Trigger Prevention** | Penundaan reset flag drag (`hasDragged = false`) sebesar 100ms pada `mouseup` window untuk memutus eksekusi salah sasaran event `click` browser setelah proses drag maskot selesai. | Aktif |

---

## 2. Terminal Emulator Terintegrasi (WSL Bash + xterm.js)

| ID | Fitur | Deskripsi Implementasi | Status |
| :--- | :--- | :--- | :--- |
| **TRM-01** | **Expand / Collapse Toggle** | Klik kiri pada maskot membuka/menutup terminal box di sebelah kanan. Ukuran jendela Electron bertransformasi mulus dari `260x220` menjadi `860x440`. | Aktif |
| **TRM-02** | **Python PTY Allocator (Real Linux `/dev/pts`)** | Mengalokasikan Pseudo-Terminal Linux riil di dalam WSL melalui skrip PTY Python bawaan. Memastikan `isatty(0) == True` sehingga CLI interaktif penuh (seperti Claude Code, vim, nano, htop) berjalan normal tanpa crash pipe. | Aktif |
| **TRM-03** | **Interactive WSL Session** | Menjalankan shell bash interaktif (`wsl.exe ~ --exec bash -c ...`) dengan dukungan UTF-8, color truecolor, dan xterm-256color. | Aktif |
| **TRM-04** | **Auto Dynamic Terminal Resize** | FitAddon menyesuaikan ukuran kolom dan baris xterm secara otomatis saat jendela diubah, mengirimkan sinyal SIGWINCH via ioctl PTY. | Aktif |
| **TRM-05** | **Smart Clipboard & Keystroke Handling** | - **Klik Rata/Kanan:** Tempel (Paste) langsung ke sesi WSL.<br>- **Auto-Copy:** Menyeleksi teks langsung menyalin otomatis ke clipboard Windows.<br>- **Smart Ctrl+C:** Menyalin teks jika ada seleksi aktif, atau mengirimkan interupsi `SIGINT (^C)` jika tidak ada teks terpilih.<br>- **Ctrl+V:** Menempel teks dari clipboard. | Aktif |
| **TRM-06** | **Terminal Action Header** | Toolbar kontrol terminal terintegrasi (6 tombol aksi):<br>- Tombol **Mute** (toggle suara & balon Miko)<br>- Tombol **Folder** (membuka dialog pop-up pilih disk & folder C/E/F)<br>- Tombol **CMD / 9router** (membuka pop-up terminal CMD & server 9router)<br>- Tombol **Clear** (membersihkan layar terminal)<br>- Tombol **Restart** (restart sesi shell WSL instan)<br>- Tombol **Quit** (shutdown Miko) | Aktif |
| **TRM-07** | **Modern Dark UI & High-Contrast Theme** | Desain terminal modern: border subtle, elevation shadow gelap (`#0b0f14`), status dot aktif, badge pill WSL BASH, typography `Cascadia Code` 13px, serta palet ANSI kontras tinggi. | Aktif |

---

## 3. Claude Code CLI Real-time Intelligence Monitor

| ID | Fitur | Deskripsi Implementasi | Status |
| :--- | :--- | :--- | :--- |
| **CLD-01** | **CLI Session Activation Detection** | Memindai masukan pengguna secara presisi. Mengetik perintah `claude` langsung memicu ekspresi gembira dan memutar suara `Claude_Berjalan.mp3`. | Aktif |
| **CLD-02** | **Prompt Execution Monitoring** | Mendeteksi pengiriman prompt saat sesi Claude aktif. Otomatis mengubah maskot ke ekspresi `Coding.png`, memutar audio `Mengerjakan.mp3`, dan menampilkan dialog kerja. | Aktif |
| **CLD-03** | **Response Completion Detection** | Memantau arus output stdout WSL untuk mendeteksi kembalinya karakter prompt (`❯` atau `>`). Mengubah ekspresi ke `Sukses.png`, memutar audio `Selesai_Mengerjakan.mp3`, dan menampilkan pesan sukses. | Aktif |
| **CLD-04** | **Dual Stream Exit Detection** | Mendeteksi berakhirnya sesi Claude Code via dua jalur:<br>1. **Stdout Signature:** Menangkap teks khas exit (`Resume this session with:`, `claude --resume`, `Session ended`) dari output stream terminal.<br>2. **Input Signals:** Perintah `/exit`, `exit`, `/quit`, `quit`, `Ctrl+D` (EOF), dan double `Ctrl+C`. Miko otomatis memutar `Claude_Brakhir.mp3`, mematikan mode sesi Claude, dan kembali ke mode bash biasa. | Aktif |
| **CLD-05** | **Keystroke Noise Filter** | Memfilter escape codes terminal (laporan kursor `\x1b[...R`, event mouse `\x1b[<...`, focus-in/out) agar tidak disalahartikan sebagai ketukan tombol pengguna. | Aktif |

---

## 4. Modul Navigasi Folder Cepat (Quick Folder Navigator)

| ID | Fitur | Deskripsi Implementasi | Status |
| :--- | :--- | :--- | :--- |
| **NAV-01** | **Dedicated Folder Header Button** | Tombol ikon folder (`folder-btn`) di header aksi terminal. Pop-up hanya muncul saat tombol folder diklik atau melalui shortcut `Alt+F`. | Aktif |
| **NAV-02** | **Compact Floating Modal Overlay** | Desain pop-up ringkas (`360px x 330px`) terjangkar di kanan atas terminal dengan solid background `#0f1622` bebas glitch kompositor GPU. | Aktif |
| **NAV-03** | **Multi-Drive Root Detection** | Mendukung pemindaian dan pemilihan partisi lokal Windows: `c:`, `e:`, dan `f:`. | Aktif |
| **NAV-04** | **Real-time Subfolder Browsing & Drill-Down** | Saat disk dipilih, input terisi `${drive}/ @` dengan kursor siap mengetik nama folder. Masuk subfolder via `Tab`/`Panah Kanan` dan kembali via `Panah Kiri`. | Aktif |
| **NAV-05** | **Deep Search via `@namafolder`** | Pencarian folder instan berbasis query eksplisit setelah `@` (contoh: `f/ @proyekku`), diurutkan berdasarkan kesesuaian awalan. | Aktif |
| **NAV-06** | **Time-Budgeted BFS Queue Traversal** | Pemindaian disk dengan algoritma Breadth-First Search non-blocking (time budget 100ms per frame) menjaga UI tetap mulus 60 FPS. | Aktif |
| **NAV-07** | **Directory-Only Enforcement & Safety Filter** | Filter multi-lapis mengecualikan semua file dan folder sistem (`$Recycle.Bin`, `node_modules`, `.git`, folder Windows di C:). | Aktif |
| **NAV-08** | **Auto-cd WSL & Claude AI Auto-Launch** | Menekan `Enter` otomatis mengonversi path ke mount Linux (`/mnt/<drive>/...`), mengeksekusi `cd "<wslPath>" && claude\n`, menutup modal, memutar audio `Claude_Berjalan.mp3`, dan menyapa pengguna. | Aktif |

---

## 5. Modul Server 9router & Terminal CMD Windows

| ID | Fitur | Deskripsi Implementasi | Status |
| :--- | :--- | :--- | :--- |
| **SRV-01** | **Dedicated CMD & 9router Button** | Tombol ikon terminal `>_` emerald green `#34d399` di toolbar terminal (`Alt+C`). | Aktif |
| **SRV-02** | **Full-Sized xterm.js CMD Terminal View** | Instance xterm.js autentik terpisah yang berjalan langsung di direktori aktif Windows (`C:\Users\MyBook Hype AMD`). | Aktif |
| **SRV-03** | **Native Direct CMD Engine** | Integrasi proses `cmd.exe` langsung via Node.js spawn dengan local echo real-time, buffer backspace, riwayat panah Atas/Bawah, dan interupsi Ctrl+C. | Aktif |
| **SRV-04** | **Smart 9router Toggle Runner** | Satu tombol dinamis: Play hijau (*Jalankan 9router*) saat nonaktif, Stop merah (*Hentikan 9router*) saat aktif dengan efek suara responsif. | Aktif |
| **SRV-05** | **Zero-Stroke Clean Flat UI** | Tampilan pop-up CMD, badge status, dan tombol toolbar bebas dari garis tepi kasar (*zero stroke*). | Aktif |
| **SRV-06** | **Real-Time 9router Health Monitor** | Memeriksa ketersediaan server lokal di `http://127.0.0.1:20128/` secara berkala serta tombol buka Web UI browser. | Aktif |

---

## 6. Optimasi Performa, Efisiensi Penyimpanan & Kompatibilitas

| ID | Fitur | Deskripsi Implementasi | Status |
| :--- | :--- | :--- | :--- |
| **OPT-01** | **AMD Windows GPU Glitch Mitigation** | `app.disableHardwareAcceleration()`, flag `--no-sandbox`, dan `--disable-gpu` untuk mencegah glitch rendering transparansi pada prosesor grafis AMD. | Aktif |
| **OPT-02** | **Chromium Memory Cap & Throttling** | Flag `--max-old-space-size=128`, `--renderer-process-limit=1`, `spellcheck: false`, `backgroundThrottling: false` untuk membatasi konsumsi RAM di kisaran ~40-60 MB. | Aktif |
| **OPT-03** | **Ultra-Lightweight Clean Asset Storage** | Penghapusan file GIF mentah (~354 MB) dan pembersihan audio usang. Seluruh aset visual menggunakan PNG transparan (~300 KB) dan MP3 (~70 KB) dengan total folder hanya ~3.6 MB. | Aktif |
| **OPT-04** | **Zero-Copy Instant Boot** | Pembersihan rutin auto-copy disk di `main.js` saat startup. Electron langsung memuat aset on-demand dari foldernya tanpa I/O redundan. | Aktif |
| **OPT-05** | **Direct Synchronous IPC Window Dragging** | Sinkronisasi pergeseran jendela via IPC langsung pada event `mousemove` tanpa requestAnimationFrame untuk mencegah lag compositor. | Aktif |

---

## 7. Ekstensi Pendamping VS Code (`project-companion`)

| ID | Fitur | Deskripsi Implementasi | Status |
| :--- | :--- | :--- | :--- |
| **EXT-01** | **Auto-Wakeup on VS Code Launch** | Ekstensi aktif otomatis saat VS Code terbuka (`onStartupFinished`, `workspaceContains:**`). | Aktif |
| **EXT-02** | **Process Detection via Tasklist** | Memeriksa apakah `electron.exe` sedang berjalan menggunakan perintah Windows native `tasklist /FI "IMAGENAME eq electron.exe" /NH`. | Aktif |
| **EXT-03** | **Background Pet Launcher** | Jika proses Electron belum berjalan, ekstensi secara otomatis mengeksekusi `start-pet.bat` di latar belakang tanpa membuka jendela cmd tambahan. | Aktif |
| **EXT-04** | **Companion Status Notifications** | Menampilkan status banner di pojok VS Code saat mendeteksi dan membangunkan Miko. | Aktif |

---

## 8. Matriks Direktori & File Proyek Saat Ini

```
AI_Destop/
├── Pembuatan_AI.md                    # Panduan langkah demi langkah pembuatan sistem Miko
├── PRD_AI_Des.md                      # [Dokumen ini] Dokumentasi lengkap spesifikasi fitur Miko
├── voice_open_app.md                  # PRD modul Voice Launcher (fitur masa depan)
├── assistant-pet/                     # Aplikasi Desktop Electron Utama
│   ├── package.json                   # Konfigurasi dependensi Electron & xterm
│   ├── main.js                        # Electron main process (Window, GPU flags, IPC, RAM cap)
│   ├── renderer.js                    # Entry point modular renderer Miko
│   ├── index.html                     # Struktur DOM Utama
│   ├── start-pet.bat                  # Peluncur utama Miko
│   ├── Miko.bat                       # Alias batch peluncur Miko
│   ├── add-to-path.bat                # Batch pendaftaran ke Windows PATH
│   ├── css/
│   │   └── style.css                  # Style UI, tema xterm dark, animasi CSS
│   ├── js/
│   │   ├── state.js                   # State machine terpusat
│   │   ├── pet.js                     # Logika maskot, ekspresi, audio, drag debounce
│   │   ├── terminal-wsl.js            # Engine xterm WSL bash & Claude tracker
│   │   ├── folder-nav.js              # Modul pencarian & navigasi folder
│   │   └── cmd-server.js              # Modul terminal CMD & server 9router
│   ├── Ekspresi Miko/                 # Aset ekspresi visual PNG teroptimasi (~300 KB)
│   │   ├── Sapa.png
│   │   ├── idle.png
│   │   ├── Mengetik.png
│   │   ├── Coding.png
│   │   ├── Sukses.png
│   │   ├── Cari.png
│   │   ├── Perbaiki.png
│   │   ├── Tidur.png
│   │   └── Sapai Jumpa.png
│   └── Suara Miko/                    # Aset audio efek suara MP3 teroptimasi (~70 KB)
│       ├── Selamat Datang.mp3
│       ├── Claude_Berjalan.mp3
│       ├── Mengerjakan.mp3
│       ├── Selesai_Mengerjakan.mp3
│       ├── Claude_Brakhir.mp3
│       ├── 9Router_aktif.mp3
│       ├── 9router_nonaktif.mp3
│       └── Sampai Jumpa.mp3
└── project-companion/                 # Ekstensi pendamping VS Code
    ├── package.json                   # Konfigurasi ekstensi VS Code
    ├── tsconfig.json                  # Konfigurasi TypeScript compiler
    ├── esbuild.js                     # Bundler skrip ekstensi
    └── src/
        └── extension.ts               # Listener VS Code pembangun Miko otomatis
```
