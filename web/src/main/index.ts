import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { initDb, closeDb } from './db/client.js';
import { sweepStaleSessions } from './db/sessions.js';
import { registerIpcHandlers, getPtyManager } from './ipc/handlers.js';
import { IPC_CHANNELS } from './ipc/channels.js';
import { PidSweepManager } from './pty/pid-sweep.js';
import { initAutoUpdater, installUpdate } from './updater.js';

const iconPath = path.join(__dirname, '../../resources/icon.icns');

let pidSweepManager: PidSweepManager | null = null;
let startupSweepCount = 0;

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

  // Notify renderer about interrupted sessions from startup sweep
  mainWindow.webContents.on('did-finish-load', () => {
    if (startupSweepCount > 0) {
      mainWindow.webContents.send('startup:interrupted-sessions', startupSweepCount);
    }
  });
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

  // Sweep stale sessions from previous run
  const sweepResult = sweepStaleSessions();
  startupSweepCount = sweepResult.total;
  if (startupSweepCount > 0) {
    console.log(`Startup sweep: ${startupSweepCount} session(s) were interrupted since last run`);
  }

  // Register IPC handlers
  registerIpcHandlers();

  // Auto-update
  initAutoUpdater();
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    installUpdate();
  });

  // Start periodic PID sweep (every 60s)
  pidSweepManager = new PidSweepManager();
  pidSweepManager.start();

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
  // Stop periodic PID sweeps
  pidSweepManager?.stop();

  // Graceful cleanup: SIGTERM all managed PTY processes
  getPtyManager().killAll();

  closeDb();
});
