import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels.js';
import {
  getSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  type CreateSessionInput,
  type UpdateSessionInput,
} from '../db/sessions.js';
import { PtyManager } from '../pty/manager.js';
import { StatusManager } from '../pty/status.js';
import { storeToken, readToken, clearToken } from '../pty/auth.js';

let ptyManager: PtyManager | null = null;
let statusManager: StatusManager | null = null;

export function getPtyManager(): PtyManager {
  if (!ptyManager) {
    ptyManager = new PtyManager();
  }
  return ptyManager;
}

function getBackendUrl(): string {
  return process.env.BACKEND_URL || __BACKEND_URL__;
}

function getStatusManager(): StatusManager {
  if (!statusManager) {
    statusManager = new StatusManager(getPtyManager(), { backendUrl: getBackendUrl() });
  }
  return statusManager;
}

export function registerIpcHandlers(): void {
  const manager = getPtyManager();

  // Database handlers
  ipcMain.handle(IPC_CHANNELS.DB_GET_SESSIONS, () => {
    return getSessions();
  });

  ipcMain.handle(IPC_CHANNELS.DB_GET_SESSION, (_event, id: string) => {
    return getSession(id);
  });

  ipcMain.handle(IPC_CHANNELS.DB_CREATE_SESSION, (_event, input: CreateSessionInput) => {
    return createSession(input);
  });

  ipcMain.handle(
    IPC_CHANNELS.DB_UPDATE_SESSION,
    (_event, id: string, input: UpdateSessionInput) => {
      return updateSession(id, input);
    },
  );

  ipcMain.handle(IPC_CHANNELS.DB_DELETE_SESSION, (_event, id: string) => {
    deleteSession(id);
  });

  // Auth handlers
  ipcMain.handle(IPC_CHANNELS.AUTH_STORE_TOKEN, (_event, token: string) => {
    storeToken(token);
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_READ_TOKEN, () => {
    return readToken();
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_CLEAR_TOKEN, () => {
    clearToken();
  });

  // PTY handlers
  ipcMain.handle(
    IPC_CHANNELS.PTY_SPAWN,
    (_event, sessionId: string, command: string, args: string[], cwd: string) => {
      manager.spawn(sessionId, command, args, cwd);
    },
  );

  ipcMain.handle(IPC_CHANNELS.PTY_WRITE, (_event, sessionId: string, data: string) => {
    manager.write(sessionId, data);
  });

  ipcMain.handle(
    IPC_CHANNELS.PTY_RESIZE,
    (_event, sessionId: string, cols: number, rows: number) => {
      manager.resize(sessionId, cols, rows);
    },
  );

  ipcMain.handle(IPC_CHANNELS.PTY_KILL, (_event, sessionId: string) => {
    manager.kill(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.PTY_REPLAY, (_event, sessionId: string) => {
    return manager.replay(sessionId);
  });

  // Agent handlers
  const sm = getStatusManager();

  ipcMain.handle(IPC_CHANNELS.AGENT_LAUNCH, (_event, taskId: string, workingDirectory: string) => {
    return sm.launch(taskId, workingDirectory);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_STOP, (_event, sessionId: string) => {
    sm.stop(sessionId);
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_RESTART,
    (_event, taskId: string, sessionId: string, workingDirectory: string) => {
      return sm.restart(taskId, sessionId, workingDirectory);
    },
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_STATUS, (_event, sessionId: string) => {
    return sm.getStatus(sessionId);
  });
}
