/**
 * IPC handlers — thin proxies to the PTY daemon for PTY/DB/agent operations.
 * Settings, fonts, and auth stay local in Electron.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels.js';
import { getSetting, setSetting, getAllSettings } from '../config/settings.js';
import { resolveColorScheme } from '../config/theme.js';
import { listSystemFonts } from '../config/list-fonts.js';
import { storeToken, readToken, clearToken } from '../pty/auth.js';
import type { DaemonClient } from '../daemon/client.js';
import type { DaemonConnector } from '../daemon/connector.js';
import { DAEMON_METHODS } from '../../shared/daemon-protocol.js';
import type { AgentLaunchOptions, TaskMetadata } from '../../shared/daemon-protocol.js';
import { createPerfTimer } from '../../shared/perf.js';
import { logger } from '../logger.js';

export function registerIpcHandlers(client: DaemonClient, connector: DaemonConnector): void {
  // ── Database handlers (proxy to daemon) ──────────────────────────────
  ipcMain.handle(IPC_CHANNELS.DB_GET_SESSIONS, () => {
    return client.request(DAEMON_METHODS.DB_GET_SESSIONS);
  });

  ipcMain.handle(IPC_CHANNELS.DB_GET_SESSION, (_event, id: string) => {
    return client.request(DAEMON_METHODS.DB_GET_SESSION, { id });
  });

  ipcMain.handle(
    IPC_CHANNELS.DB_CREATE_SESSION,
    (
      _event,
      input: { taskId?: string; pid?: number; status?: string; workingDirectory?: string },
    ) => {
      return client.request(DAEMON_METHODS.DB_CREATE_SESSION, input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_UPDATE_SESSION,
    (_event, id: string, input: { pid?: number; status?: string; stoppedAt?: string }) => {
      return client.request(DAEMON_METHODS.DB_UPDATE_SESSION, { id, input });
    },
  );

  ipcMain.handle(IPC_CHANNELS.DB_DELETE_SESSION, (_event, id: string) => {
    return client.request(DAEMON_METHODS.DB_DELETE_SESSION, { id });
  });

  // ── Project directory handlers (proxy to daemon) ─────────────────────
  ipcMain.handle(IPC_CHANNELS.PROJECT_DIR_GET, (_event, projectId: string) => {
    return client.request(DAEMON_METHODS.PROJECT_DIR_GET, { projectId });
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_DIR_SET, (_event, projectId: string, directory: string) => {
    return client.request(DAEMON_METHODS.PROJECT_DIR_SET, { projectId, directory });
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_DIR_DELETE, (_event, projectId: string) => {
    return client.request(DAEMON_METHODS.PROJECT_DIR_DELETE, { projectId });
  });

  // ── Settings handlers (local — not proxied to daemon) ────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    return getSetting(key);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: unknown) => {
    setSetting(key, value);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    return getAllSettings();
  });

  // ── Fonts handler (local — not proxied to daemon) ────────────────────
  ipcMain.handle(IPC_CHANNELS.FONTS_LIST, () => {
    return listSystemFonts();
  });

  // ── Auth handlers (safeStorage stays in Electron, token pushed to daemon) ─
  ipcMain.handle(IPC_CHANNELS.AUTH_STORE_TOKEN, async (_event, token: string) => {
    storeToken(token);
    // Push token to daemon
    await client.request(DAEMON_METHODS.AUTH_SET_TOKEN, { token });
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_READ_TOKEN, () => {
    return readToken();
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_CLEAR_TOKEN, async () => {
    clearToken();
    // Clear token in daemon
    await client.request(DAEMON_METHODS.AUTH_SET_TOKEN, { token: '' });
  });

  // ── Daemon handlers (proxy to daemon) ──────────────────────────────
  ipcMain.handle(IPC_CHANNELS.DAEMON_STATUS, () => {
    return client.request(DAEMON_METHODS.DAEMON_STATUS);
  });

  // ── PTY handlers (proxy to daemon) ──────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PTY_SPAWN,
    (_event, sessionId: string, command: string, args: string[], cwd: string) => {
      return client.request(DAEMON_METHODS.PTY_SPAWN, { sessionId, command, args, cwd });
    },
  );

  ipcMain.handle(IPC_CHANNELS.PTY_WRITE, (_event, sessionId: string, data: string) => {
    return client.request(DAEMON_METHODS.PTY_WRITE, { sessionId, data });
  });

  ipcMain.handle(
    IPC_CHANNELS.PTY_RESIZE,
    (_event, sessionId: string, cols: number, rows: number) => {
      return client.request(DAEMON_METHODS.PTY_RESIZE, { sessionId, cols, rows });
    },
  );

  ipcMain.handle(IPC_CHANNELS.PTY_KILL, (_event, sessionId: string) => {
    return client.request(DAEMON_METHODS.PTY_KILL, { sessionId });
  });

  ipcMain.handle(IPC_CHANNELS.PTY_REPLAY, (_event, sessionId: string) => {
    return client.request(DAEMON_METHODS.PTY_REPLAY, { sessionId });
  });

  ipcMain.handle(IPC_CHANNELS.PTY_SNAPSHOT, (_event, sessionId: string, content: string) => {
    return client.request(DAEMON_METHODS.PTY_SNAPSHOT, { sessionId, content });
  });

  // ACK is fire-and-forget — no UUID, no timeout, no response expected.
  ipcMain.on(IPC_CHANNELS.PTY_ACK, (_event, sessionId: string, bytes: number) => {
    client.notify(DAEMON_METHODS.PTY_ACK, { sessionId, bytes });
  });

  // ── Agent handlers (proxy to daemon) ────────────────────────────────
  // Agent operations ensure the daemon is running first — the daemon may have
  // shut down (idle timeout, crash) between the last connection and the request.
  ipcMain.handle(
    IPC_CHANNELS.AGENT_LAUNCH,
    async (
      _event,
      taskId: string,
      workingDirectory: string,
      options?: AgentLaunchOptions,
      metadata?: TaskMetadata,
    ) => {
      const mark = createPerfTimer('ipc.agent-launch', (msg) => logger.info(msg));

      if (!client.connected) {
        mark('daemon-not-connected');
        await connector.ensureRunning();
        mark('ensure-running-done');
      } else {
        mark('daemon-already-connected');
      }

      const result = await client.request(DAEMON_METHODS.AGENT_LAUNCH, {
        taskId,
        workingDirectory,
        options,
        metadata,
        colorScheme: resolveColorScheme(),
      });
      mark('daemon-response-received');

      return result;
    },
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_STOP, (_event, sessionId: string) => {
    return client.request(DAEMON_METHODS.AGENT_STOP, { sessionId });
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_RESTART,
    async (
      _event,
      taskId: string,
      sessionId: string,
      workingDirectory: string,
      options?: AgentLaunchOptions,
      metadata?: TaskMetadata,
    ) => {
      if (!client.connected) await connector.ensureRunning();
      return client.request(DAEMON_METHODS.AGENT_RESTART, {
        taskId,
        sessionId,
        workingDirectory,
        options,
        metadata,
        colorScheme: resolveColorScheme(),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_STATUS, (_event, sessionId: string) => {
    return client.request(DAEMON_METHODS.AGENT_STATUS, { sessionId });
  });
}
