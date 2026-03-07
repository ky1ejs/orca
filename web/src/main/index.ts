import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { initDb, closeDb } from './db/client.js';
import { sweepStaleSessions } from './db/sessions.js';
import { registerIpcHandlers, getPtyManager } from './ipc/handlers.js';

const iconPath = path.join(__dirname, '../../resources/icon.icns');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // Set dock icon on macOS
  try {
    app.dock?.setIcon(iconPath);
  } catch (err) {
    console.warn('Failed to set dock icon:', err);
  }

  // Initialize database
  initDb();
  sweepStaleSessions();

  // Register IPC handlers
  registerIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  getPtyManager().killAll();
  closeDb();
});
