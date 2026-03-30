/**
 * Method dispatch for daemon requests.
 * Maps protocol methods to actual implementations.
 */
import type { ClientConnection, DaemonServer } from './server.js';
import type { DaemonPtyManager } from './pty-manager.js';
import type { DaemonStatusManager } from './status-manager.js';
import type { WorktreeManager } from './worktree-manager.js';
import type { OutputPersistence } from './output-persistence.js';
import {
  getSessions,
  getSessionsByTaskId,
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
import { getWorktree, listWorktrees } from './worktrees.js';
import { checkWorktreeSafety } from './worktree-safety.js';
import { DAEMON_METHODS, DAEMON_PROTOCOL_VERSION } from '../shared/daemon-protocol.js';
import { isActiveSessionStatus } from '../shared/session-status.js';
import type {
  AuthSetTokenParams,
  PtySpawnParams,
  PtyWriteParams,
  PtyResizeParams,
  PtyKillParams,
  PtyReplayParams,
  PtyClearParams,
  PtySnapshotParams,
  PtyAckParams,
  PtySubscribeParams,
  PtyUnsubscribeParams,
  AgentLaunchParams,
  AgentStopParams,
  AgentRestartParams,
  AgentStatusParams,
  DbGetSessionParams,
  DbGetSessionsByTaskParams,
  DbCreateSessionParams,
  DbUpdateSessionParams,
  DbDeleteSessionParams,
  ProjectDirGetParams,
  ProjectDirSetParams,
  ProjectDirDeleteParams,
  WorktreeGetParams,
  WorktreeRemoveParams,
  WorktreeSafetyParams,
  WorktreeListResult,
  BootstrapStatusParams,
  DaemonStatusResult,
  SessionsRestoreAllResult,
} from '../shared/daemon-protocol.js';

interface HandlerDeps {
  ptyManager: DaemonPtyManager;
  statusManager: DaemonStatusManager;
  worktreeManager: WorktreeManager;
  server: DaemonServer;
  outputPersistence: OutputPersistence;
  setToken: (token: string | null) => void;
  getVersion: () => string;
  getUptime: () => number;
  getMcpServerPort: () => number | null;
  shutdown: () => void;
}

export function createHandler(deps: HandlerDeps) {
  // Note: `server` is accessed lazily via `deps.server` (not destructured) because
  // it's created after the handler — the getter resolves it at call time.
  const {
    ptyManager,
    statusManager,
    worktreeManager,
    outputPersistence,
    setToken,
    getVersion,
    getUptime,
    getMcpServerPort,
    shutdown,
  } = deps;

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
        // Reset flow control — the replay contains the full buffer so any
        // previously unacked bytes (leaked from IPC pipeline during unmount)
        // are now stale. Without this, unacked bytes accumulate across
        // mount/unmount cycles until they permanently pause the PTY.
        ptyManager.resetFlowControl(p.sessionId);
        return ptyManager.replay(p.sessionId);
      }

      case DAEMON_METHODS.PTY_CLEAR: {
        const p = params as PtyClearParams;
        ptyManager.clear(p.sessionId);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_SNAPSHOT: {
        const p = params as PtySnapshotParams;
        ptyManager.setSnapshot(p.sessionId, p.content);
        return { ok: true };
      }

      case DAEMON_METHODS.PTY_ACK: {
        const p = params as PtyAckParams;
        ptyManager.ack(p.sessionId, p.bytes);
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
          (sessionId) => server.subscribeClient(client.id, sessionId),
        );
        if (result.success) {
          // Ensure subscription (in case callback wasn't called)
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
          (sessionId) => server.subscribeClient(client.id, sessionId),
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

      case DAEMON_METHODS.DB_GET_SESSIONS_BY_TASK: {
        const p = params as DbGetSessionsByTaskParams;
        return getSessionsByTaskId(p.taskId);
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
        outputPersistence.removeSession(p.id);
        deleteSession(p.id);
        return { ok: true };
      }

      // ── Session Restore ─────────────────────────────
      case DAEMON_METHODS.SESSIONS_RESTORE_ALL: {
        const sessions = getSessions();
        for (const session of sessions) {
          if (isActiveSessionStatus(session.status)) {
            server.subscribeClient(client.id, session.id);
            // Reset flow control so stale unacked bytes accumulated during
            // the disconnect don't permanently pause the PTY.
            ptyManager.resetFlowControl(session.id);
          }
        }
        const result: SessionsRestoreAllResult = { sessions };
        return result;
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

      // ── Worktrees ─────────────────────────────────
      case DAEMON_METHODS.WORKTREE_GET: {
        const p = params as WorktreeGetParams;
        return getWorktree(p.taskId) ?? null;
      }

      case DAEMON_METHODS.WORKTREE_REMOVE: {
        const p = params as WorktreeRemoveParams;
        await worktreeManager.removeWorktree(p.taskId, p.force);
        return { ok: true };
      }

      case DAEMON_METHODS.WORKTREE_SAFETY: {
        const p = params as WorktreeSafetyParams;
        const row = getWorktree(p.taskId);
        if (!row) return null;
        return checkWorktreeSafety(
          row.worktree_path,
          row.repo_path,
          row.branch_name,
          row.base_branch,
        );
      }

      case DAEMON_METHODS.WORKTREE_LIST: {
        const rows = listWorktrees();
        const results: WorktreeListResult[] = [];
        for (const row of rows) {
          const safety = await checkWorktreeSafety(
            row.worktree_path,
            row.repo_path,
            row.branch_name,
            row.base_branch,
          );
          results.push({ ...row, safety });
        }
        return results;
      }

      // ── Bootstrap ───────────────────────────────────
      case DAEMON_METHODS.BOOTSTRAP_STATUS: {
        const p = params as BootstrapStatusParams;
        return statusManager.getBootstrapStatus(p.worktreePath);
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
          mcpServerPort: getMcpServerPort(),
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
