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

import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { initDaemonDb, closeDaemonDb } from './db.js';
import { sweepStaleSessions } from './sessions.js';
import { DaemonServer } from './server.js';
import { DaemonPtyManager, type BroadcastFn } from './pty-manager.js';
import { DaemonStatusManager } from './status-manager.js';
import { HookServer } from '../shared/hooks/server.js';
import { DaemonPidSweepManager } from './pid-sweep.js';
import { IdleManager } from './idle.js';
import { createHandler } from './handlers.js';
import { DAEMON_SOCKET_PATH, DAEMON_PID_FILE, DAEMON_DB_PATH } from '../shared/daemon-protocol.js';
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

// ── State ───────────────────────────────────────────────────────────────

let authToken: string | null = null;
const startTime = Date.now();
let shuttingDown = false;

// ── Initialize ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info(`Daemon starting (version=${version}, pid=${process.pid})`);
  logger.info(`DB: ${dbPath}, Socket: ${socketPath}, Migrations: ${migrationsFolder}`);

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
  if (!migrationsFolder) {
    logger.error('--migrations argument is required');
    process.exit(1);
  }
  initDaemonDb(dbPath, migrationsFolder);
  logger.info('Database initialized');

  // Sweep stale sessions from previous run
  const sweepResult = sweepStaleSessions();
  if (sweepResult.total > 0) {
    logger.info(`Swept ${sweepResult.total} stale session(s)`);
  }

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
    },
  });
  let hookServerPort: number | null = null;
  try {
    await hookServer.start();
    hookServerPort = hookServer.getPort();
    logger.info(`Hook server started on port ${hookServerPort}`);
  } catch (err) {
    logger.warn(`Failed to start hook server: ${err}`);
  }

  // Create components
  const ptyManager = new DaemonPtyManager(broadcast);
  const statusManager = new DaemonStatusManager(ptyManager, {
    backendUrl,
    getToken: () => authToken,
    hookServer: hookServerPort ? hookServer : null,
    broadcast,
  });
  const pidSweepManager = new DaemonPidSweepManager(broadcast);

  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Daemon shutting down...');

    idleManager.dispose();
    pidSweepManager.stop();
    statusManager.dispose();
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
    get server() {
      return server;
    },
    setToken: (token) => {
      authToken = token;
    },
    getVersion: () => version,
    getUptime: () => Date.now() - startTime,
    shutdown,
  });

  server = new DaemonServer(handler);

  // Idle manager
  idleManager = new IdleManager(
    () => server.clientCount,
    () => ptyManager.activeCount,
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

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
