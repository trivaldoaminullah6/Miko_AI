# Miko Desktop Assistant

Aplikasi pendamping AI desktop interaktif berbasis Electron yang terintegrasi dengan terminal Linux WSL (xterm.js), pemantau Claude Code CLI secara real-time, dan ekstensi Visual Studio Code (`project-companion`).

---

## 1. Prasyarat Sistem (Prerequisites)

Sebelum menjalankan aplikasi dari repository ini, pastikan sistem memenuhi persyaratan berikut:

### Sistem Operasi & Hardware
* **OS:** Windows 10 (versi 2004+) atau Windows 11 (64-bit).
* **Virtualisasi:** Virtualization Technology (Intel VT-x / AMD-V) aktif di BIOS/UEFI.
* **RAM:** Minimal 4 GB (disarankan 8 GB ke atas).

### Perangkat Lunak Wajib
1. **Node.js & npm**
   * Versi Node.js LTS (v18, v20, atau v22).
   * Verifikasi di Windows Terminal / CMD:
     ```cmd
     node -v
     npm -v
     ```

2. **WSL 2 (Windows Subsystem for Linux)**
   * Distro default: **Ubuntu** atau **Debian**.
   * Jika belum terpasang, buka PowerShell (Run as Administrator) dan jalankan:
     ```powershell
     wsl --install -d Ubuntu
     ```
   * Pastikan WSL berjalan di versi 2:
     ```powershell
     wsl -l -v
     ```

3. **Python 3 di Lingkungan Linux WSL**
   * Diperlukan oleh xterm.js PTY bridge untuk mengalokasikan Pseudo-Terminal Linux (`/dev/pts`).
   * Buka terminal WSL dan jalankan:
     ```bash
     sudo apt update && sudo apt install -y python3
     ```

4. **Claude Code CLI (di dalam WSL)**
   * Diperlukan jika ingin menggunakan fitur integrasi Claude Code otomatis.
   * Di dalam terminal WSL:
     ```bash
     npm install -g @anthropic-ai/claude-code
     ```

### Perangkat Lunak Opsional
* **Visual Studio Code:** Diperlukan jika menggunakan modul ekstensi otomatisasi `project-companion`.
* **9router:** Proxy/orchestrator AI lokal jika menggunakan modul server 9router (port `20128`).

---

## 2. Instalasi & Persiapan Proyek

### Langkah 1: Clone Repository
```cmd
git clone <URL_REPOSITORY_ANDA>
cd AI_Destop
```

### Langkah 2: Install Dependensi `assistant-pet` (Aplikasi Utama)
Masuk ke folder `assistant-pet` dan instal modul Node:
```cmd
cd assistant-pet
npm install
cd ..
```

### Langkah 3: Install Dependensi & Build `project-companion` (Ekstensi VS Code)
Jika ingin menggunakan atau mem-build ekstensi pendamping VS Code:
```cmd
cd project-companion
npm install
npm run compile
cd ..
```

---

## 3. Penyesuaian Path Lokal (Penting)

Jika repository di-clone ke folder di luar `C:\Users\MyBook Hype AMD\AI_Destop`, sesuaikan path di file-file berikut:

1. **`assistant-pet/start-pet.bat` & `assistant-pet/Miko.bat`**
   * Ubah baris `cd /d "..."` ke lokasi direktori lokal Anda, atau gunakan:
     ```bat
     cd /d "%~dp0"
     ```
2. **`project-companion/src/extension.ts`**
   * Sesuaikan konstanta `PET_APP_DIR` dengan direktori absolut `assistant-pet` di komputer Anda, lalu jalankan kembali:
     ```cmd
     cd project-companion
     npm run compile
     ```

---

## 4. Cara Menjalankan Aplikasi

### Metode 1: Menggunakan Script Batch (Rekomendasi)
Masuk ke folder `assistant-pet` dan jalankan script peluncur:
```cmd
cd assistant-pet
start-pet.bat
```
Atau langsung jalankan `Miko.bat`.

### Metode 2: Menggunakan npm
```cmd
cd assistant-pet
npm start
```

### Metode 3: Otomatis via Visual Studio Code
1. Muat ekstensi `project-companion` ke dalam VS Code (tekan `F5` dari workspace `project-companion` untuk mode debugging).
2. Setiap kali VS Code dibuka, ekstensi akan mendeteksi proses dan otomatis membangunkan Miko.

---

## 5. Fitur & Pintasan Navigasi

* **Klik Kiri pada Maskot:** Membuka / menutup jendela terminal WSL (xterm.js).
* **Klik Kanan pada Maskot:** Menampilkan dialog konfirmasi keluar.
* **Tahan & Geser (Drag):** Memindahkan posisi maskot di layar.
* **Alt + F (atau klik tombol Folder):** Membuka dialog navigasi folder cepat (Drive C, E, F).
* **Alt + C (atau klik tombol CMD):** Membuka pop-up terminal Windows CMD & kontrol server 9router.
* **Auto Sleep:** Maskot otomatis berganti ekspresi tidur jika tidak ada aktivitas selama 2 menit.
* **Claude Monitor:** Deteksi otomatis saat `claude` dijalankan, memproses prompt, dan selesai tugas.

---

## 6. Struktur Direktori

```text
AI_Destop/
├── README.md                  # Panduan persiapan dan instalasi proyek
├── PRD_AI_Des.md              # Dokumentasi lengkap spesifikasi fitur & arsitektur
├── Pembuatan_AI.md            # Dokumentasi panduan langkah pembuatan sistem
├── assistant-pet/             # Aplikasi Desktop Electron Utama
│   ├── package.json           # Dependensi Electron & xterm
│   ├── main.js                # Main process Electron
│   ├── renderer.js            # Entry point renderer Miko
│   ├── start-pet.bat          # Peluncur aplikasi Windows
│   ├── css/                   # Stylesheet & animasi
│   ├── js/                    # Modul state, maskot, WSL terminal, nav folder, CMD
│   ├── Ekspresi Miko/         # Aset gambar ekspresi maskot
│   └── Suara Miko/            # Aset efek audio
└── project-companion/         # Ekstensi pendamping Visual Studio Code
    ├── package.json           # Konfigurasi ekstensi VS Code
    ├── tsconfig.json          # TypeScript config
    └── src/extension.ts       # Launcher otomatis Miko saat VS Code aktif
```

---

## 7. Pemecahan Masalah (Troubleshooting)

* **Terminal WSL tidak muncul output / blank:**
  * Pastikan Python 3 terpasang di dalam WSL (`wsl -e python3 --version`).
  * Pastikan distro default WSL aktif (`wsl --status`).
* **Layar hitam atau glitch transparansi (GPU AMD):**
  * Script bawaan telah mematikan akselerasi perangkat keras via `--disable-gpu` dan `--no-sandbox` di `main.js`. Jangan hapus flag tersebut jika menggunakan GPU terintegrasi AMD.
* **Dependensi `@xterm/xterm` hilang:**
  * Jalankan `npm install` di dalam direktori `assistant-pet`.
