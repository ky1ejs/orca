import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export function initAutoUpdater(): void {
  // Don't check for updates in development
  if (process.env.NODE_ENV === 'development') return;

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

  autoUpdater.on('update-downloaded', (info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('update:ready', info.version);
    }
  });
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true);
}
