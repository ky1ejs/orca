import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels.js';
import {
  getSessions,
  getSession,
  createSession,
  updateSession,
  type CreateSessionInput,
  type UpdateSessionInput,
} from '../db/sessions.js';
import { PtyManager } from '../pty/manager.js';

let ptyManager: PtyManager | null = null;

export function getPtyManager(): PtyManager {
  if (!ptyManager) {
    ptyManager = new PtyManager();
  }
  return ptyManager;
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
}
