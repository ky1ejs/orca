import { contextBridge, ipcRenderer } from 'electron';

export interface OrcaAPI {
  platform: string;
  db: {
    getSessions: () => Promise<unknown[]>;
    getSession: (id: string) => Promise<unknown | undefined>;
    createSession: (input: {
      taskId?: string;
      pid?: number;
      status?: string;
      workingDirectory?: string;
    }) => Promise<unknown>;
    updateSession: (
      id: string,
      input: { pid?: number; status?: string; stoppedAt?: string },
    ) => Promise<unknown | undefined>;
  };
}

const api: OrcaAPI = {
  platform: process.platform,
  db: {
    getSessions: () => ipcRenderer.invoke('db:getSessions'),
    getSession: (id) => ipcRenderer.invoke('db:getSession', id),
    createSession: (input) => ipcRenderer.invoke('db:createSession', input),
    updateSession: (id, input) => ipcRenderer.invoke('db:updateSession', id, input),
  },
};

contextBridge.exposeInMainWorld('orca', api);
