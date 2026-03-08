import { contextBridge, ipcRenderer } from 'electron';

export interface AgentLaunchOptions {
  planMode?: boolean;
}

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
    deleteSession: (id: string) => Promise<void>;
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
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    getAll: () => Promise<Record<string, unknown>>;
  };
  fonts: {
    list: () => Promise<string[]>;
  };
  projectDir: {
    get: (projectId: string) => Promise<{ project_id: string; directory: string } | undefined>;
    set: (
      projectId: string,
      directory: string,
    ) => Promise<{ project_id: string; directory: string }>;
    delete: (projectId: string) => Promise<void>;
  };
  agent: {
    launch: (
      taskId: string,
      workingDirectory: string,
      options?: AgentLaunchOptions,
    ) => Promise<AgentLaunchResult>;
    stop: (sessionId: string) => Promise<void>;
    restart: (
      taskId: string,
      sessionId: string,
      workingDirectory: string,
      options?: AgentLaunchOptions,
    ) => Promise<AgentLaunchResult>;
    status: (sessionId: string) => Promise<string | null>;
  };
  lifecycle: {
    onSessionsDied: (cb: (sessionIds: string[]) => void) => () => void;
    onInterruptedSessions: (cb: (count: number) => void) => () => void;
    onSessionStatusChanged: (cb: (sessionId: string, status: string) => void) => () => void;
  };
  updates: {
    onUpdateReady: (cb: (version: string) => void) => () => void;
    onUpdateError: (cb: (message: string) => void) => () => void;
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
    deleteSession: (id) => ipcRenderer.invoke('db:deleteSession', id),
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
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  fonts: {
    list: () => ipcRenderer.invoke('fonts:list'),
  },
  projectDir: {
    get: (projectId) => ipcRenderer.invoke('projectDir:get', projectId),
    set: (projectId, directory) => ipcRenderer.invoke('projectDir:set', projectId, directory),
    delete: (projectId) => ipcRenderer.invoke('projectDir:delete', projectId),
  },
  agent: {
    launch: (taskId, workingDirectory, options) =>
      ipcRenderer.invoke('agent:launch', taskId, workingDirectory, options),
    stop: (sessionId) => ipcRenderer.invoke('agent:stop', sessionId),
    restart: (taskId, sessionId, workingDirectory, options) =>
      ipcRenderer.invoke('agent:restart', taskId, sessionId, workingDirectory, options),
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
    onSessionStatusChanged: (cb) => {
      const listener = (_event: unknown, data: { sessionId: string; status: string }) =>
        cb(data.sessionId, data.status);
      ipcRenderer.on('session:status-changed', listener);
      return () => {
        ipcRenderer.removeListener('session:status-changed', listener);
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
    onUpdateError: (cb) => {
      const listener = (_event: unknown, message: string) => cb(message);
      ipcRenderer.on('update:error', listener);
      return () => {
        ipcRenderer.removeListener('update:error', listener);
      };
    },
    install: () => ipcRenderer.invoke('update:install'),
  },
};

contextBridge.exposeInMainWorld('orca', api);
