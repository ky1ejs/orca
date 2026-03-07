export const IPC_CHANNELS = {
  DB_GET_SESSIONS: 'db:getSessions',
  DB_GET_SESSION: 'db:getSession',
  DB_CREATE_SESSION: 'db:createSession',
  DB_UPDATE_SESSION: 'db:updateSession',
  DB_GET_AUTH_TOKEN: 'db:getAuthToken',
  PTY_SPAWN: 'pty:spawn',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_REPLAY: 'pty:replay',
} as const;
