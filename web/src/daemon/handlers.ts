/**
 * Method dispatch for daemon requests.
 * Maps protocol methods to actual implementations.
 */
import type { ClientConnection, DaemonServer } from './server.js';
import type { DaemonPtyManager } from './pty-manager.js';
import type { DaemonStatusManager } from './status-manager.js';
import {
  getSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
} from './sessions.js';
import {
  getProjectDirectory,
  setProjectDirectory,
  deleteProjectDirectory,
} from './project-directories.js';
import { DAEMON_METHODS, DAEMON_PROTOCOL_VERSION } from '../shared/daemon-protocol.js';
import type {
  AuthSetTokenParams,
  PtySpawnParams,
  PtyWriteParams,
  PtyResizeParams,
  PtyKillParams,
  PtyReplayParams,
  PtyClearParams,
  PtySubscribeParams,
  PtyUnsubscribeParams,
  AgentLaunchParams,
  AgentStopParams,
  AgentRestartParams,
  AgentStatusParams,
  DbGetSessionParams,
  DbCreateSessionParams,
  DbUpdateSessionParams,
  DbDeleteSessionParams,
  ProjectDirGetParams,
  ProjectDirSetParams,
  ProjectDirDeleteParams,
  DaemonStatusResult,
} from '../shared/daemon-protocol.js';

interface HandlerDeps {
  ptyManager: DaemonPtyManager;
  statusManager: DaemonStatusManager;
  server: DaemonServer;
  setToken: (token: string | null) => void;
  getVersion: () => string;
  getUptime: () => number;
  shutdown: () => void;
}

export function createHandler(deps: HandlerDeps) {
  // Note: `server` is accessed lazily via `deps.server` (not destructured) because
  // it's created after the handler — the getter resolves it at call time.
  const { ptyManager, statusManager, setToken, getVersion, getUptime, shutdown } = deps;

  return async (client: ClientConnection, method: string, params: unknown): Promise<unknown> => {
    const server = deps.server;
    switch (method) {
      // ── Auth ────────────────────────────────────────
      case DAEMON_METHODS.AUTH_SET_TOKEN: {
        const { token } = params as AuthSetTokenParams;
        setToken(token);
        return { ok: true };
      }

      // ── PTY ────────────────────────────────────────
      case DAEMON_METHODS.PTY_SPAWN: {
        const p = params as PtySpawnParams;
        ptyManager.spawn(p.sessionId, p.command, p.args, p.cwd, p.env);
        // Auto-subscribe the caller to this session's output
        server.subscribeClient(client.id, p.sessionId);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_WRITE: {
        const p = params as PtyWriteParams;
        ptyManager.write(p.sessionId, p.data);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_RESIZE: {
        const p = params as PtyResizeParams;
        ptyManager.resize(p.sessionId, p.cols, p.rows);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_KILL: {
        const p = params as PtyKillParams;
        ptyManager.kill(p.sessionId);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_REPLAY: {
        const p = params as PtyReplayParams;
        return ptyManager.replay(p.sessionId);
      }

      case DAEMON_METHODS.PTY_CLEAR: {
        const p = params as PtyClearParams;
        ptyManager.clear(p.sessionId);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_SUBSCRIBE: {
        const p = params as PtySubscribeParams;
        server.subscribeClient(client.id, p.sessionId);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_UNSUBSCRIBE: {
        const p = params as PtyUnsubscribeParams;
        server.unsubscribeClient(client.id, p.sessionId);
        return { ok: true };
      }

      // ── Agent ──────────────────────────────────────
      case DAEMON_METHODS.AGENT_LAUNCH: {
        const p = params as AgentLaunchParams;
        const result = await statusManager.launch(
          p.taskId,
          p.workingDirectory,
          p.options,
          p.metadata,
          p.colorScheme,
        );
        if (result.success) {
          // Auto-subscribe the caller
          server.subscribeClient(client.id, result.sessionId);
        }
        return result;
      }

      case DAEMON_METHODS.AGENT_STOP: {
        const p = params as AgentStopParams;
        statusManager.stop(p.sessionId);
        return { ok: true };
      }

      case DAEMON_METHODS.AGENT_RESTART: {
        const p = params as AgentRestartParams;
        const result = await statusManager.restart(
          p.taskId,
          p.sessionId,
          p.workingDirectory,
          p.options,
          p.metadata,
          p.colorScheme,
        );
        if (result.success) {
          server.subscribeClient(client.id, result.sessionId);
        }
        return result;
      }

      case DAEMON_METHODS.AGENT_STATUS: {
        const p = params as AgentStatusParams;
        return statusManager.getStatus(p.sessionId);
      }

      // ── DB Sessions ────────────────────────────────
      case DAEMON_METHODS.DB_GET_SESSIONS: {
        return getSessions();
      }

      case DAEMON_METHODS.DB_GET_SESSION: {
        const p = params as DbGetSessionParams;
        return getSession(p.id) ?? null;
      }

      case DAEMON_METHODS.DB_CREATE_SESSION: {
        const p = params as DbCreateSessionParams;
        return createSession(p);
      }

      case DAEMON_METHODS.DB_UPDATE_SESSION: {
        const p = params as DbUpdateSessionParams;
        return updateSession(p.id, p.input) ?? null;
      }

      case DAEMON_METHODS.DB_DELETE_SESSION: {
        const p = params as DbDeleteSessionParams;
        deleteSession(p.id);
        return { ok: true };
      }

      // ── Project Directories ────────────────────────
      case DAEMON_METHODS.PROJECT_DIR_GET: {
        const p = params as ProjectDirGetParams;
        return getProjectDirectory(p.projectId) ?? null;
      }

      case DAEMON_METHODS.PROJECT_DIR_SET: {
        const p = params as ProjectDirSetParams;
        return setProjectDirectory(p.projectId, p.directory);
      }

      case DAEMON_METHODS.PROJECT_DIR_DELETE: {
        const p = params as ProjectDirDeleteParams;
        deleteProjectDirectory(p.projectId);
        return { ok: true };
      }

      // ── Daemon lifecycle ───────────────────────────
      case DAEMON_METHODS.DAEMON_PING: {
        return { pong: true };
      }

      case DAEMON_METHODS.DAEMON_STATUS: {
        const result: DaemonStatusResult = {
          version: getVersion(),
          protocolVersion: DAEMON_PROTOCOL_VERSION,
          uptime: getUptime(),
          activeSessions: ptyManager.activeCount,
          connectedClients: server.clientCount,
        };
        return result;
      }

      case DAEMON_METHODS.DAEMON_SHUTDOWN: {
        // Defer shutdown to allow response to be sent
        setTimeout(() => shutdown(), 100);
        return { ok: true };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  };
}
