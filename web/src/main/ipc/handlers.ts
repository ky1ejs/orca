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

export function registerIpcHandlers(): void {
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
}
