import { contextBridge, ipcRenderer } from 'electron';

export interface AgentLaunchResult {
  success: boolean;
  sessionId?: string;
  error?: { name: string; message: string; suggestion: string };
}

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
  auth: {
    storeToken: (token: string) => Promise<void>;
    readToken: () => Promise<string | null>;
    clearToken: () => Promise<void>;
  };
  pty: {
    spawn: (sessionId: string, command: string, args: string[], cwd: string) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    kill: (sessionId: string) => Promise<void>;
    replay: (sessionId: string) => Promise<string>;
    onData: (sessionId: string, cb: (data: string) => void) => () => void;
    onExit: (sessionId: string, cb: (exitCode: number) => void) => () => void;
  };
  agent: {
    launch: (
      taskId: string,
      workingDirectory: string,
      initialContext?: string,
    ) => Promise<AgentLaunchResult>;
    stop: (sessionId: string) => Promise<void>;
    restart: (
      taskId: string,
      sessionId: string,
      workingDirectory: string,
      initialContext?: string,
    ) => Promise<AgentLaunchResult>;
    status: (sessionId: string) => Promise<string | null>;
  };
  lifecycle: {
    onSessionsDied: (cb: (sessionIds: string[]) => void) => () => void;
    onInterruptedSessions: (cb: (count: number) => void) => () => void;
  };
  updates: {
    onUpdateReady: (cb: (version: string) => void) => () => void;
    install: () => Promise<void>;
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
  auth: {
    storeToken: (token) => ipcRenderer.invoke('auth:storeToken', token),
    readToken: () => ipcRenderer.invoke('auth:readToken'),
    clearToken: () => ipcRenderer.invoke('auth:clearToken'),
  },
  pty: {
    spawn: (sessionId, command, args, cwd) =>
      ipcRenderer.invoke('pty:spawn', sessionId, command, args, cwd),
    write: (sessionId, data) => ipcRenderer.invoke('pty:write', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.invoke('pty:resize', sessionId, cols, rows),
    kill: (sessionId) => ipcRenderer.invoke('pty:kill', sessionId),
    replay: (sessionId) => ipcRenderer.invoke('pty:replay', sessionId),
    onData: (sessionId, cb) => {
      const channel = `pty:data:${sessionId}`;
      const listener = (_event: unknown, data: string) => cb(data);
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
    onExit: (sessionId, cb) => {
      const channel = `pty:exit:${sessionId}`;
      const listener = (_event: unknown, exitCode: number) => cb(exitCode);
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
  },
  agent: {
    launch: (taskId, workingDirectory, initialContext?) =>
      ipcRenderer.invoke('agent:launch', taskId, workingDirectory, initialContext),
    stop: (sessionId) => ipcRenderer.invoke('agent:stop', sessionId),
    restart: (taskId, sessionId, workingDirectory, initialContext?) =>
      ipcRenderer.invoke('agent:restart', taskId, sessionId, workingDirectory, initialContext),
    status: (sessionId) => ipcRenderer.invoke('agent:status', sessionId),
  },
  lifecycle: {
    onSessionsDied: (cb) => {
      const listener = (_event: unknown, sessionIds: string[]) => cb(sessionIds);
      ipcRenderer.on('pid-sweep:sessions-died', listener);
      return () => {
        ipcRenderer.removeListener('pid-sweep:sessions-died', listener);
      };
    },
    onInterruptedSessions: (cb) => {
      const listener = (_event: unknown, count: number) => cb(count);
      ipcRenderer.on('startup:interrupted-sessions', listener);
      return () => {
        ipcRenderer.removeListener('startup:interrupted-sessions', listener);
      };
    },
  },
  updates: {
    onUpdateReady: (cb) => {
      const listener = (_event: unknown, version: string) => cb(version);
      ipcRenderer.on('update:ready', listener);
      return () => {
        ipcRenderer.removeListener('update:ready', listener);
      };
    },
    install: () => ipcRenderer.invoke('update:install'),
  },
};

contextBridge.exposeInMainWorld('orca', api);
