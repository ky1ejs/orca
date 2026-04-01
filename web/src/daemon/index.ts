/**
 * Daemon entry point.
 * Run via: ELECTRON_RUN_AS_NODE=1 electron ./out/daemon/index.js
 *
 * Args:
 *   --db-path <path>         Path to SQLite database (default: ~/.orca/orca.db)
 *   --migrations <path>      Path to drizzle migrations folder
 *   --socket-path <path>     Unix socket path (default: ~/.orca/daemon.sock)
 *   --backend-url <url>      Backend GraphQL URL
 *   --version <version>      App version string
 *   --log-level <level>      Log level: debug | info | warn | error (default: info)
 */
process.title = 'orca-daemon';

import { chmodSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { initDaemonDb, closeDaemonDb } from './db.js';
import { sweepStaleSessions } from './sessions.js';
import { DaemonServer } from './server.js';
import { DaemonPtyManager, type BroadcastFn } from './pty-manager.js';
import { DaemonStatusManager } from './status-manager.js';
import { WorktreeManager } from './worktree-manager.js';
import { HookServer } from '../shared/hooks/server.js';
import { DaemonPidSweepManager } from './pid-sweep.js';
import { IdleManager } from './idle.js';
import { createHandler } from './handlers.js';
import {
  DAEMON_SOCKET_PATH,
  DAEMON_PID_FILE,
  DAEMON_DB_PATH,
  DAEMON_HOOK_PORT,
  DAEMON_HOOK_PORT_FILE,
  DAEMON_MCP_CONFIG_FILE,
  DAEMON_CLAUDE_SETTINGS_FILE,
  DAEMON_CLI_DIR,
  DAEMON_CLI_SCRIPT,
  DAEMON_AUTH_TOKEN_FILE,
} from '../shared/daemon-protocol.js';
import { buildMcpConfigJson, buildHooksConfigJson } from '../shared/hooks/settings.js';
import { buildShellOrcaSystemPrompt } from '../shared/claude.js';
import { OutputPersistence } from './output-persistence.js';
import { enrichPathFromLoginShellAsync } from '../shared/shell.js';
import { logger } from './logger.js';

// ── Parse args ──────────────────────────────────────────────────────────

function getArg(name: string, defaultValue: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return defaultValue;
}

const dbPath = getArg('db-path', DAEMON_DB_PATH);
const migrationsFolder = getArg('migrations', '');
const socketPath = getArg('socket-path', DAEMON_SOCKET_PATH);
const backendUrl = getArg('backend-url', 'https://orca-api.fly.dev');
const version = getArg('version', '0.0.0');

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

// ── Auth token persistence ─────────────────────────────────────────────

function loadAuthToken(): string | null {
  try {
    const t = readFileSync(DAEMON_AUTH_TOKEN_FILE, 'utf-8').trim();
    return t || null;
  } catch {
    return null;
  }
}

function persistAuthToken(token: string | null): void {
  if (token) {
    writeFileSync(DAEMON_AUTH_TOKEN_FILE, token, { mode: 0o600 });
    chmodSync(DAEMON_AUTH_TOKEN_FILE, 0o600);
  } else {
    try {
      unlinkSync(DAEMON_AUTH_TOKEN_FILE);
    } catch {
      // File may not exist
    }
  }
}

// ── State ───────────────────────────────────────────────────────────────

let authToken: string | null = loadAuthToken();
const startTime = Date.now();
let shuttingDown = false;

// ── Initialize ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info(`Daemon starting (version=${version}, pid=${process.pid})`);
  logger.info(`DB: ${dbPath}, Socket: ${socketPath}, Migrations: ${migrationsFolder}`);

  if (!migrationsFolder) {
    logger.error('--migrations argument is required');
    process.exit(1);
  }

  // Run PATH enrichment (async login shell) in parallel with DB init.
  // PATH enrichment can take 1-5s depending on the user's shell config;
  // overlapping it with DB setup shaves that time off daemon startup.
  await Promise.all([
    enrichPathFromLoginShellAsync(),
    (async () => {
      // Ensure directories exist
      mkdirSync(dirname(dbPath), { recursive: true });
      mkdirSync(dirname(socketPath), { recursive: true });

      // Write PID file
      writeFileSync(DAEMON_PID_FILE, String(process.pid));

      // Remove stale socket file
      if (existsSync(socketPath)) {
        try {
          unlinkSync(socketPath);
        } catch {
          // May fail if in use
        }
      }

      // Initialize database
      initDaemonDb(dbPath, migrationsFolder);
      logger.info('Database initialized');

      // Sweep stale sessions from previous run
      const sweepResult = sweepStaleSessions();
      if (sweepResult.total > 0) {
        logger.info(`Swept ${sweepResult.total} stale session(s)`);
      }
    })(),
  ]);
  logger.info(`PATH: ${(process.env.PATH ?? '').split(':').length} entries`);

  // Create broadcast function — will be wired to server after creation
  let server: DaemonServer;
  let idleManager: IdleManager;

  const broadcast: BroadcastFn = (event, params) => {
    // eslint-disable-next-line no-restricted-syntax -- daemon protocol params are untyped at this boundary
    const p = params as Record<string, unknown>;
    const sessionId = (p?.sessionId as string) ?? null;

    if (event === 'pty.data' || event === 'pty.exit') {
      server.broadcastToSubscribed(sessionId, event, params);
    } else {
      server.broadcastToAll(event, params);
    }

    if (event === 'pty.exit') {
      idleManager.check();
    }
  };

  // Create and start hook server for Claude Code lifecycle events + MCP
  const hookServer = new HookServer({
    mcpDeps: {
      backendUrl,
      getToken: () => authToken,
      log: logger,
    },
    preferredPort: DAEMON_HOOK_PORT,
  });
  let hookServerPort: number | null = null;
  try {
    await hookServer.start();
    const port = hookServer.getPort();
    hookServerPort = port;
    logger.info(`Hook server started on port ${port}`);

    if (port) {
      // Write port file so other tools can discover the hook server
      writeFileSync(DAEMON_HOOK_PORT_FILE, String(port));

      // Write Orca-owned config files for Claude Code sessions
      writeFileSync(DAEMON_MCP_CONFIG_FILE, buildMcpConfigJson(port));
      writeFileSync(DAEMON_CLAUDE_SETTINGS_FILE, buildHooksConfigJson(port));

      // Write CLI wrapper so shell sessions can run `orca` to launch Claude with MCP + hooks
      const shellPrompt = buildShellOrcaSystemPrompt();
      mkdirSync(DAEMON_CLI_DIR, { recursive: true });
      writeFileSync(
        DAEMON_CLI_SCRIPT,
        [
          '#!/usr/bin/env bash',
          '# Orca CLI — launches Claude Code with Orca MCP tools and hooks',
          '',
          `ARGS=(--mcp-config "${DAEMON_MCP_CONFIG_FILE}" --settings "${DAEMON_CLAUDE_SETTINGS_FILE}")`,
          '',
          '# Append task context as system prompt if launched from an Orca session',
          'if [[ -n "$ORCA_TASK_ID" ]]; then',
          `  ARGS+=(--append-system-prompt "${shellPrompt}")`,
          'fi',
          '',
          'exec claude "${ARGS[@]}" "$@"',
          '',
        ].join('\n'),
      );
      chmodSync(DAEMON_CLI_SCRIPT, 0o755);
    }
  } catch (err) {
    logger.warn(`Failed to start hook server: ${err}`);
  }

  // Create components
  const worktreeManager = new WorktreeManager();
  const ptyManager = new DaemonPtyManager(broadcast);

  // Output persistence — flush dirty ring buffers to SQLite periodically.
  // loadAll() is deferred until after the server starts listening so clients
  // can connect while terminal output buffers are being restored.
  const outputPersistence = new OutputPersistence(ptyManager);
  ptyManager.setOnData((id) => outputPersistence.markDirty(id));
  ptyManager.setOnExit((id) => outputPersistence.flushSession(id));
  outputPersistence.start();

  const statusManager = new DaemonStatusManager(ptyManager, {
    backendUrl,
    getToken: () => authToken,
    hookServer: hookServerPort ? hookServer : null,
    hookPort: hookServerPort,
    broadcast,
    worktreeManager,
  });
  const pidSweepManager = new DaemonPidSweepManager(broadcast);

  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Daemon shutting down...');

    idleManager.dispose();
    outputPersistence.dispose();
    pidSweepManager.stop();
    statusManager.dispose();
    // Config files (mcp-config.json, claude-settings.json, orca CLI script) are
    // intentionally kept on disk — they are overwritten on every daemon startup
    // and must survive shutdown so agent launches work during daemon restarts.
    hookServer.stop().catch(() => {});
    ptyManager.killAll();

    server
      .stop()
      .then(() => {
        closeDaemonDb();
        try {
          unlinkSync(socketPath);
        } catch {
          // May already be gone
        }
        try {
          unlinkSync(DAEMON_PID_FILE);
        } catch {
          // May already be gone
        }
        try {
          unlinkSync(DAEMON_HOOK_PORT_FILE);
        } catch {
          // May already be gone
        }
        logger.info('Daemon stopped');
        process.exit(0);
      })
      .catch((err) => {
        logger.error('Error during shutdown', err);
        process.exit(1);
      });
  }

  // Create handler — uses server via closure (set below)
  const handler = createHandler({
    ptyManager,
    statusManager,
    worktreeManager,
    outputPersistence,
    get server() {
      return server;
    },
    setToken: (token) => {
      authToken = token || null;
      persistAuthToken(authToken);
    },
    getVersion: () => version,
    getUptime: () => Date.now() - startTime,
    getMcpServerPort: () => hookServerPort,
    shutdown,
  });

  server = new DaemonServer(handler);

  // Idle manager — include in-flight bootstraps as "active" to prevent
  // premature shutdown while a background bootstrap is still running.
  idleManager = new IdleManager(
    () => server.clientCount,
    () => ptyManager.activeCount + statusManager.bootstrapActiveCount(),
    () => {
      logger.info('Idle timeout — shutting down');
      shutdown();
    },
  );

  server.setOnClientCountChange(() => {
    idleManager.check();
  });

  // Start PID sweep
  pidSweepManager.start();

  // Start server
  await server.start(socketPath);
  logger.info(`Daemon listening on ${socketPath}`);

  // Restore persisted terminal output now that the server is accepting connections
  outputPersistence.loadAll();

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
