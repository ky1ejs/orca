/**
 * Protocol types for communication between Electron main process and the PTY daemon
 * over a Unix domain socket using NDJSON (newline-delimited JSON).
 */

/** Client -> Daemon request */
export interface DaemonRequest {
  id: string;
  method: string;
  params?: unknown;
}

/** Daemon -> Client response */
export interface DaemonResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

/** Daemon -> Client push event */
export interface DaemonEvent {
  event: string;
  params: unknown;
}

export type DaemonMessage = DaemonResponse | DaemonEvent;

export function isDaemonEvent(msg: DaemonMessage): msg is DaemonEvent {
  return 'event' in msg;
}

export function isDaemonResponse(msg: DaemonMessage): msg is DaemonResponse {
  return 'id' in msg && !('event' in msg);
}

// ─── Method parameter types ────────────────────────────────────────────

export interface AuthSetTokenParams {
  token: string;
}

export interface PtySpawnParams {
  sessionId: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface PtyWriteParams {
  sessionId: string;
  data: string;
}

export interface PtyResizeParams {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface PtyKillParams {
  sessionId: string;
}

export interface PtyReplayParams {
  sessionId: string;
}

export interface PtyClearParams {
  sessionId: string;
}

export interface PtySnapshotParams {
  sessionId: string;
  content: string;
}

export interface PtyAckParams {
  sessionId: string;
  bytes: number;
}

export interface PtySubscribeParams {
  sessionId: string;
}

export interface PtyUnsubscribeParams {
  sessionId: string;
}

export interface AgentLaunchOptions {
  planMode?: boolean;
}

export interface TaskMetadata {
  displayId: string;
  title: string;
  description: string | null;
  projectName: string | null;
  workspaceSlug: string;
}

export interface AgentLaunchParams {
  taskId: string;
  workingDirectory: string;
  options?: AgentLaunchOptions;
  metadata?: TaskMetadata;
  colorScheme?: 'light' | 'dark';
}

export interface AgentStopParams {
  sessionId: string;
}

export interface AgentRestartParams {
  taskId: string;
  sessionId: string;
  workingDirectory: string;
  options?: AgentLaunchOptions;
  metadata?: TaskMetadata;
  colorScheme?: 'light' | 'dark';
}

export interface AgentStatusParams {
  sessionId: string;
}

export interface DbGetSessionParams {
  id: string;
}

export interface DbGetSessionsByTaskParams {
  taskId: string;
}

export interface DbCreateSessionParams {
  taskId?: string;
  pid?: number;
  status?: string;
  workingDirectory?: string;
}

export interface DbUpdateSessionParams {
  id: string;
  input: { pid?: number; status?: string; stoppedAt?: string };
}

export interface DbDeleteSessionParams {
  id: string;
}

export interface ProjectDirGetParams {
  projectId: string;
}

export interface ProjectDirSetParams {
  projectId: string;
  directory: string;
}

export interface ProjectDirDeleteParams {
  projectId: string;
}

export interface WorktreeGetParams {
  taskId: string;
}

export interface WorktreeGetResult {
  task_id: string;
  worktree_path: string;
  branch_name: string;
  base_branch: string;
  repo_path: string;
  created_at: string;
  updated_at: string;
}

export interface WorktreeRemoveParams {
  taskId: string;
  force?: boolean;
}

export interface WorktreeSafetyParams {
  taskId: string;
}

export interface WorktreeSafetyResult {
  dirty: boolean;
  unpushedCommits: boolean;
  branchMerged: boolean;
}

export interface WorktreeListResult {
  task_id: string;
  worktree_path: string;
  branch_name: string;
  base_branch: string;
  repo_path: string;
  created_at: string;
  updated_at: string;
  safety: WorktreeSafetyResult;
}

export interface DaemonStatusResult {
  version: string;
  protocolVersion: number;
  /** Daemon uptime in milliseconds. */
  uptime: number;
  activeSessions: number;
  connectedClients: number;
  /** Port the MCP/hook server is listening on, or null if not running. */
  mcpServerPort: number | null;
}

export interface SessionsRestoreAllResult {
  sessions: Array<{
    id: string;
    task_id: string | null;
    pid: number | null;
    status: string;
    working_directory: string | null;
    started_at: string | null;
    stopped_at: string | null;
    created_at: string;
  }>;
}

// ─── Event parameter types ─────────────────────────────────────────────

export interface PtyDataEvent {
  sessionId: string;
  data: string;
}

export interface PtyExitEvent {
  sessionId: string;
  exitCode: number;
}

export interface PidSweepSessionsDiedEvent {
  sessionIds: string[];
}

export interface SessionStatusChangedEvent {
  sessionId: string;
  status: string;
}

export interface SessionActivityChangedEvent {
  sessionId: string;
  active: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────

import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Bump this when the daemon protocol changes in a breaking way.
 * A mismatch forces a daemon restart even if sessions are active.
 * Non-breaking changes (new optional fields, new methods) don't need a bump.
 */
export const DAEMON_PROTOCOL_VERSION = 2;

const IS_DEV = process.env.NODE_ENV === 'development';
export const ORCA_DIR = join(homedir(), IS_DEV ? '.orca-dev' : '.orca');
export const DAEMON_SOCKET_PATH = join(ORCA_DIR, 'daemon.sock');
export const DAEMON_PID_FILE = join(ORCA_DIR, 'daemon.pid');
export const DAEMON_DB_PATH = join(ORCA_DIR, 'orca.db');
export const DAEMON_LOG_FILE = join(ORCA_DIR, 'daemon.log');
export const MAIN_LOG_FILE = join(ORCA_DIR, 'main.log');
export const DAEMON_HOOK_PORT = IS_DEV ? 19820 : 19819;
export const DAEMON_HOOK_PORT_FILE = join(ORCA_DIR, 'hook-port');
export const DAEMON_MCP_CONFIG_FILE = join(ORCA_DIR, 'mcp-config.json');
export const DAEMON_CLAUDE_SETTINGS_FILE = join(ORCA_DIR, 'claude-settings.json');
export const DAEMON_CLI_DIR = join(ORCA_DIR, 'bin');
export const DAEMON_CLI_SCRIPT = join(DAEMON_CLI_DIR, 'orca');

/** Methods the daemon supports */
export const DAEMON_METHODS = {
  AUTH_SET_TOKEN: 'auth.setToken',
  PTY_SPAWN: 'pty.spawn',
  PTY_WRITE: 'pty.write',
  PTY_RESIZE: 'pty.resize',
  PTY_KILL: 'pty.kill',
  PTY_REPLAY: 'pty.replay',
  PTY_CLEAR: 'pty.clear',
  PTY_SNAPSHOT: 'pty.snapshot',
  PTY_ACK: 'pty.ack',
  PTY_SUBSCRIBE: 'pty.subscribe',
  PTY_UNSUBSCRIBE: 'pty.unsubscribe',
  AGENT_LAUNCH: 'agent.launch',
  AGENT_STOP: 'agent.stop',
  AGENT_RESTART: 'agent.restart',
  AGENT_STATUS: 'agent.status',
  DB_GET_SESSIONS: 'db.getSessions',
  DB_GET_SESSIONS_BY_TASK: 'db.getSessionsByTask',
  DB_GET_SESSION: 'db.getSession',
  DB_CREATE_SESSION: 'db.createSession',
  DB_UPDATE_SESSION: 'db.updateSession',
  DB_DELETE_SESSION: 'db.deleteSession',
  SESSIONS_RESTORE_ALL: 'sessions.restoreAll',
  PROJECT_DIR_GET: 'projectDir.get',
  PROJECT_DIR_SET: 'projectDir.set',
  PROJECT_DIR_DELETE: 'projectDir.delete',
  WORKTREE_GET: 'worktree.get',
  WORKTREE_REMOVE: 'worktree.remove',
  WORKTREE_SAFETY: 'worktree.safety',
  WORKTREE_LIST: 'worktree.list',
  DAEMON_PING: 'daemon.ping',
  DAEMON_STATUS: 'daemon.status',
  DAEMON_SHUTDOWN: 'daemon.shutdown',
} as const;

/** Events the daemon pushes to subscribed clients */
export const DAEMON_EVENTS = {
  PTY_DATA: 'pty.data',
  PTY_EXIT: 'pty.exit',
  PID_SWEEP_SESSIONS_DIED: 'pid-sweep.sessions-died',
  SESSION_STATUS_CHANGED: 'session.statusChanged',
  SESSION_ACTIVITY_CHANGED: 'session.activityChanged',
} as const;
