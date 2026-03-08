import { BrowserWindow, dialog } from 'electron';
// electron-updater is CJS — named imports don't work in ESM
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

type MenuStateCallback = (label: string, enabled: boolean) => void;

let onMenuStateChange: MenuStateCallback | null = null;
let isManualCheck = false;

export function initAutoUpdater(menuCallback: MenuStateCallback): void {
  onMenuStateChange = menuCallback;

  // Don't check for updates in development
  if (process.env.NODE_ENV === 'development') return;

  autoUpdater.on('checking-for-update', () => {
    onMenuStateChange?.('Checking for Updates...', false);
  });

  autoUpdater.on('update-available', () => {
    onMenuStateChange?.('Downloading Update...', false);
    isManualCheck = false;
  });

  autoUpdater.on('update-not-available', () => {
    if (isManualCheck) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Updates',
        message: "You're up to date!",
        detail: `Orca is running the latest version.`,
      });
    }
    isManualCheck = false;
    onMenuStateChange?.('Check for Updates...', true);
  });

  autoUpdater.on('update-downloaded', (info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('update:ready', info.version);
    }
    onMenuStateChange?.('Restart to Update', true);
    isManualCheck = false;
  });

  autoUpdater.on('error', (err) => {
    if (isManualCheck) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Error',
        message: 'Failed to check for updates',
        detail: err?.message ?? 'An unknown error occurred.',
      });
    }
    isManualCheck = false;
    onMenuStateChange?.('Check for Updates...', true);
  });

  // Check for updates shortly after launch
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);

  // Check again every 4 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdatesAndNotify();
    },
    4 * 60 * 60 * 1000,
  );
}

export function checkForUpdates(): void {
  isManualCheck = true;
  autoUpdater.checkForUpdates();
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true);
}
