import * as vscode from 'vscode';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as path from 'path';

const PET_APP_DIR = 'C:\\Users\\MyBook Hype AMD\\AI_Destop\\assistant-pet';

function isPetRunning(): Promise<boolean> {
    return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq electron.exe" /NH', (err, stdout) => {
            resolve(!err && stdout.toLowerCase().includes('electron.exe'));
        });
    });
}

function launchPetApp() {
    const batFile = path.join(PET_APP_DIR, 'start-pet.bat');

    if (!fs.existsSync(batFile)) {
        vscode.window.showErrorMessage('start-pet.bat tidak ditemukan di folder assistant-pet');
        return;
    }

    exec(`cmd.exe /c "${batFile}"`, (err) => {
        if (err) {
            vscode.window.showErrorMessage(`Gagal menjalankan maskot: ${err.message}`);
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    // Saat VS Code dibuka, cek apakah maskot sudah jalan. Jika belum, jalankan.
    isPetRunning().then((running) => {
        if (!running) {
            vscode.window.showInformationMessage('Membangunkan Desktop Assistant...');
            launchPetApp();
        }
    });
}

export function deactivate() {}
