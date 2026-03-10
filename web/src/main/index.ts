import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { registerIpcHandlers } from './ipc/handlers.js';
import { IPC_CHANNELS } from './ipc/channels.js';
import { getSetting } from './config/settings.js';
import { DaemonClient } from './daemon/client.js';
import { DaemonConnector } from './daemon/connector.js';
import type { EnsureRunningResult } from './daemon/connector.js';
import { readToken } from './pty/auth.js';
import { initAutoUpdater, installUpdate, checkForUpdates, isAutoUpdateRestart } from './updater.js';
import { initAppMenu, setCheckForUpdatesState } from './menu.js';
import { DAEMON_EVENTS, DAEMON_METHODS } from '../shared/daemon-protocol.js';
import { isActiveSessionStatus } from '../shared/session-status.js';
import type {
  PtyDataEvent,
  PtyExitEvent,
  PidSweepSessionsDiedEvent,
  SessionStatusChangedEvent,
  SessionActivityChangedEvent,
} from '../shared/daemon-protocol.js';
import { logger } from './logger.js';
import { exportDiagnostics } from './diagnostics.js';
import { DockBadgeManager } from './dock-badge.js';
import { TrayManager } from './tray-manager.js';

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

const iconPath = path.join(__dirname, '../../resources/icon.icns');

if (process.env.NODE_ENV === 'development') {
  const defaultUserData = app.getPath('userData');
  app.setPath('userData', `${defaultUserData} Dev`);
}

// Register orca:// custom protocol for deep linking (e.g. GitHub OAuth callback)
app.setAsDefaultProtocolClient('orca');

// Handle orca:// URLs on macOS (app already running)
app.on('open-url', (event, url) => {
  event.preventDefault();
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'github' && parsed.pathname === '/callback') {
      const installationId = parsed.searchParams.get('installation_id');
      const workspaceId = parsed.searchParams.get('workspaceId');
      if (installationId && workspaceId) {
        sendToAllWindows(IPC_CHANNELS.GITHUB_INSTALLATION_CALLBACK, {
          installationId: Number(installationId),
          workspaceId,
        });
      }
    }
  } catch {
    logger.warn(`Failed to parse deep link URL: ${url}`);
  }
});

let mainWindow: BrowserWindow | null = null;
let daemonClient: DaemonClient | null = null;
let daemonConnector: DaemonConnector | null = null;
let cleanupDaemonEvents: (() => void) | null = null;
const dockBadge = new DockBadgeManager();
const trayIconPath = path.join(__dirname, '../../resources/orcaTemplate.png');
const trayManager = new TrayManager(trayIconPath, () => createWindow());

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    backgroundColor: (() => {
      const colorScheme = getSetting('appearance.colorScheme');
      const isDark =
        colorScheme === 'dark' || (colorScheme !== 'light' && nativeTheme.shouldUseDarkColors);
      return isDark ? '#0e0d0c' : '#f7f6f3';
    })(),
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

function sendToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

/**
 * Forward daemon events to the renderer process via Electron IPC.
 * Returns an unsubscribe function to clean up before re-registering.
 */
function setupDaemonEventForwarding(client: DaemonClient): void {
  // Clean up previous subscriptions to avoid duplicate handlers on reconnect
  cleanupDaemonEvents?.();

  const unsub1 = client.subscribe(DAEMON_EVENTS.PTY_DATA, (params) => {
    const { sessionId, data } = params as PtyDataEvent;
    sendToAllWindows(`pty:data:${sessionId}`, data);
  });

  const unsub2 = client.subscribe(DAEMON_EVENTS.PTY_EXIT, (params) => {
    const { sessionId, exitCode } = params as PtyExitEvent;
    const exitStatus = exitCode === 0 ? 'EXITED' : 'ERROR';
    dockBadge.handleStatusChange(sessionId, exitStatus);
    trayManager.handleStatusChange(sessionId, exitStatus);
    sendToAllWindows(`pty:exit:${sessionId}`, exitCode);
  });

  const unsub3 = client.subscribe(DAEMON_EVENTS.PID_SWEEP_SESSIONS_DIED, (params) => {
    const { sessionIds } = params as PidSweepSessionsDiedEvent;
    dockBadge.handleSessionsDied(sessionIds);
    trayManager.handleSessionsDied(sessionIds);
    sendToAllWindows('pid-sweep:sessions-died', sessionIds);
  });

  const unsub4 = client.subscribe(DAEMON_EVENTS.SESSION_STATUS_CHANGED, (params) => {
    const { sessionId, status } = params as SessionStatusChangedEvent;
    dockBadge.handleStatusChange(sessionId, status);
    trayManager.handleStatusChange(sessionId, status);
    sendToAllWindows('session:status-changed', { sessionId, status });
  });

  const unsub5 = client.subscribe(DAEMON_EVENTS.SESSION_ACTIVITY_CHANGED, (params) => {
    const { sessionId, active } = params as SessionActivityChangedEvent;
    trayManager.handleActivityChange(sessionId, active);
    sendToAllWindows('session:activity-changed', { sessionId, active });
  });

  cleanupDaemonEvents = () => {
    unsub1();
    unsub2();
    unsub3();
    unsub4();
    unsub5();
  };
}

/**
 * Push the auth token from safeStorage to the daemon.
 */
async function pushTokenToDaemon(client: DaemonClient): Promise<void> {
  const token = readToken();
  if (token) {
    try {
      await client.request(DAEMON_METHODS.AUTH_SET_TOKEN, { token });
    } catch {
      // Daemon may not be ready yet
    }
  }
}

/**
 * Re-subscribe to all active sessions so PTY data flows after reconnect.
 */
async function resubscribeToActiveSessions(client: DaemonClient): Promise<void> {
  try {
    const sessions = (await client.request(DAEMON_METHODS.DB_GET_SESSIONS)) as Array<{
      id: string;
      status: string;
    }>;
    dockBadge.initFromSessions(sessions);
    trayManager.initFromSessions(sessions);
    const active = sessions.filter((s) => isActiveSessionStatus(s.status));
    await Promise.all(
      active.map((s) => client.request(DAEMON_METHODS.PTY_SUBSCRIBE, { sessionId: s.id })),
    );
  } catch {
    // Best effort — sessions may not exist
  }
}

app.whenReady().then(async () => {
  // Set dock icon on macOS
  try {
    app.dock?.setIcon(iconPath);
  } catch (err) {
    logger.warn(`Failed to set dock icon: ${err}`);
  }

  // Create and connect to daemon
  daemonClient = new DaemonClient();
  daemonConnector = new DaemonConnector(daemonClient);

  let startupResult: EnsureRunningResult = {
    reconnected: false,
    activeSessions: 0,
    pendingProtocolUpdate: false,
  };

  try {
    startupResult = await daemonConnector.ensureRunning();
    logger.info('Connected to PTY daemon');
  } catch (err) {
    logger.error('Failed to connect to daemon', err);
    dialog.showErrorBox(
      'Daemon Error',
      'Failed to start the PTY daemon. Terminal sessions will not work.',
    );
  }

  // Forward daemon events to renderer
  setupDaemonEventForwarding(daemonClient);

  // Push auth token to daemon
  await pushTokenToDaemon(daemonClient);

  // Re-subscribe to active sessions if reconnecting to existing daemon
  if (startupResult.reconnected) {
    await resubscribeToActiveSessions(daemonClient);
  }

  // Handle reconnection
  daemonConnector.setOnReconnect(async () => {
    logger.info('Reconnected to PTY daemon');
    setupDaemonEventForwarding(daemonClient!);
    await pushTokenToDaemon(daemonClient!);
    await resubscribeToActiveSessions(daemonClient!);
    sendToAllWindows('daemon:reconnected');
  });

  daemonConnector.setOnDisconnect(() => {
    logger.info('Disconnected from PTY daemon');
    dockBadge.clear();
    trayManager.clear();
    sendToAllWindows('daemon:disconnected');
  });

  // Register IPC handlers (proxy to daemon)
  registerIpcHandlers(daemonClient);

  // App menu (before auto-updater so menu exists when first check fires)
  initAppMenu({ onCheckForUpdates: checkForUpdates, onExportDiagnostics: exportDiagnostics });

  // Auto-update — no more session termination warning!
  initAutoUpdater(setCheckForUpdatesState);
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    installUpdate();
  });

  createWindow();

  // Notify renderer after window is ready
  if (startupResult.reconnected && startupResult.activeSessions > 0) {
    mainWindow!.webContents.once('did-finish-load', () => {
      if (startupResult.pendingProtocolUpdate) {
        // Breaking protocol change — tell the renderer so it can prompt the user
        mainWindow!.webContents.send(
          'daemon:protocol-update-required',
          startupResult.activeSessions,
        );
      } else {
        mainWindow!.webContents.send('startup:interrupted-sessions', startupResult.activeSessions);
      }
    });
  }

  // Handle user confirming daemon restart after protocol update
  ipcMain.handle('daemon:force-restart', async () => {
    await daemonConnector!.forceRestart();
    setupDaemonEventForwarding(daemonClient!);
    await pushTokenToDaemon(daemonClient!);
  });

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
  dockBadge.clear();
  trayManager.clear();
  daemonConnector?.stopReconnection();

  if (isAutoUpdateRestart) {
    // Update restart: just disconnect — daemon stays alive, sessions survive.
    // When the updated app launches, it reconnects to the same daemon.
    daemonClient?.disconnect();
  } else {
    // Normal quit: tell the daemon to shut down.
    // Fire-and-forget — we can't await in before-quit, and the daemon
    // handles shutdown gracefully (kills PTYs, closes DB, removes socket).
    if (daemonClient?.connected) {
      daemonClient.request(DAEMON_METHODS.DAEMON_SHUTDOWN).catch(() => {});
    }
    daemonClient?.disconnect();
  }
});
