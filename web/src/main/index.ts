import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { initDb, closeDb } from './db/client.js';
import { sweepStaleSessions } from './db/sessions.js';
import { registerIpcHandlers, getPtyManager } from './ipc/handlers.js';
import { IPC_CHANNELS } from './ipc/channels.js';
import { PidSweepManager } from './pty/pid-sweep.js';
import { initAutoUpdater, installUpdate, checkForUpdates } from './updater.js';
import { initAppMenu, setCheckForUpdatesState } from './menu.js';

const iconPath = path.join(__dirname, '../../resources/icon.icns');

if (process.env.NODE_ENV === 'development') {
  const defaultUserData = app.getPath('userData');
  app.setPath('userData', `${defaultUserData} Dev`);
}

let pidSweepManager: PidSweepManager | null = null;
let startupSweepCount = 0;
let mainWindow: BrowserWindow | null = null;
let quitConfirmed = false;

function createWindow() {
  mainWindow = new BrowserWindow({
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
      mainWindow?.webContents.send('startup:interrupted-sessions', startupSweepCount);
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

  // App menu (before auto-updater so menu exists when first check fires)
  initAppMenu({ onCheckForUpdates: checkForUpdates });

  // Auto-update
  initAutoUpdater(setCheckForUpdatesState);
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    const activeCount = getPtyManager().activeCount;

    if (activeCount > 0) {
      const sessionWord = activeCount === 1 ? 'session' : 'sessions';
      const options: Electron.MessageBoxSyncOptions = {
        type: 'warning',
        buttons: ['Cancel', 'Update & Restart'],
        defaultId: 0,
        cancelId: 0,
        title: 'Update Orca?',
        message: `You have ${activeCount} active terminal ${sessionWord}.`,
        detail: 'Updating will restart Orca and terminate all running sessions.',
      };
      const result = mainWindow
        ? dialog.showMessageBoxSync(mainWindow, options)
        : dialog.showMessageBoxSync(options);

      if (result === 0) return;
    }

    quitConfirmed = true;
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

app.on('before-quit', (event) => {
  if (quitConfirmed) {
    pidSweepManager?.stop();
    getPtyManager().killAll();
    closeDb();
    return;
  }

  const activeCount = getPtyManager().activeCount;

  if (activeCount === 0) {
    pidSweepManager?.stop();
    closeDb();
    return;
  }

  event.preventDefault();

  const sessionWord = activeCount === 1 ? 'session' : 'sessions';
  const options: Electron.MessageBoxSyncOptions = {
    type: 'warning',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Quit Orca?',
    message: `You have ${activeCount} active terminal ${sessionWord}.`,
    detail: `Quitting will terminate all running ${sessionWord}. Are you sure?`,
  };
  const result = mainWindow
    ? dialog.showMessageBoxSync(mainWindow, options)
    : dialog.showMessageBoxSync(options);

  if (result === 1) {
    quitConfirmed = true;
    app.quit();
  }
});
