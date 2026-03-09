/**
 * DaemonConnector: discovers, spawns, and maintains connection to the PTY daemon.
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { DaemonClient } from './client.js';
import { migrateDb } from './migrate-db.js';
import {
  DAEMON_SOCKET_PATH,
  DAEMON_PID_FILE,
  DAEMON_DB_PATH,
  DAEMON_METHODS,
  DAEMON_PROTOCOL_VERSION,
  ORCA_DIR,
} from '../../shared/daemon-protocol.js';
import type { DaemonStatusResult } from '../../shared/daemon-protocol.js';

const MAX_CONNECT_ATTEMPTS = 20;
const CONNECT_RETRY_MS = 150;
const VERSION_SHUTDOWN_WAIT_MS = 5000;
const VERSION_SHUTDOWN_POLL_MS = 200;

export interface EnsureRunningResult {
  reconnected: boolean;
  activeSessions: number;
  /** True when a breaking protocol change requires restart but sessions are still running. */
  pendingProtocolUpdate: boolean;
}

export class DaemonConnector {
  private client: DaemonClient;
  private reconnecting = false;
  private onReconnect: (() => void) | null = null;
  private onDisconnect: (() => void) | null = null;

  constructor(client: DaemonClient) {
    this.client = client;
  }

  setOnReconnect(cb: () => void): void {
    this.onReconnect = cb;
  }

  setOnDisconnect(cb: () => void): void {
    this.onDisconnect = cb;
  }

  /**
   * Ensure the daemon is running and connected.
   * Spawns a new daemon if needed. Migrates old DB if present.
   * Returns whether we reconnected to an existing daemon and how many active sessions it has.
   */
  async ensureRunning(): Promise<EnsureRunningResult> {
    // One-time DB migration from old Electron userData location
    const oldDbPath = join(app.getPath('userData'), 'orca.db');
    migrateDb(DAEMON_DB_PATH, oldDbPath);

    // Check if daemon is already running
    if (this.isDaemonAlive()) {
      try {
        await this.client.connect(DAEMON_SOCKET_PATH);

        // Check protocol compatibility.
        // - Protocol mismatch + no active sessions: restart immediately
        // - Protocol mismatch + active sessions: connect but flag for user to close sessions
        // - Same protocol, different app version, no sessions: restart to pick up new code
        // - Same protocol, different app version, active sessions: keep old daemon alive
        const versionCheck = await this.checkVersion();
        const needsRestart =
          versionCheck.protocolMismatch ||
          (!versionCheck.appMatch && versionCheck.activeSessions === 0);

        if (needsRestart && versionCheck.activeSessions === 0) {
          await this.shutdownAndRespawn();
          this.setupReconnection();
          return { reconnected: false, activeSessions: 0, pendingProtocolUpdate: false };
        }

        this.setupReconnection();
        return {
          reconnected: true,
          activeSessions: versionCheck.activeSessions,
          pendingProtocolUpdate: versionCheck.protocolMismatch,
        };
      } catch {
        // PID alive but socket not connectable — stale state
        this.cleanupStaleFiles();
      }
    } else {
      this.cleanupStaleFiles();
    }

    // Spawn new daemon
    this.spawnDaemon();

    // Wait for daemon to be ready
    await this.waitForConnection();
    this.setupReconnection();
    return { reconnected: false, activeSessions: 0, pendingProtocolUpdate: false };
  }

  private isDaemonAlive(): boolean {
    if (!existsSync(DAEMON_PID_FILE)) return false;

    try {
      const pid = parseInt(readFileSync(DAEMON_PID_FILE, 'utf-8').trim(), 10);
      if (isNaN(pid)) return false;
      process.kill(pid, 0); // Test if alive
      return true;
    } catch {
      return false;
    }
  }

  private cleanupStaleFiles(): void {
    try {
      if (existsSync(DAEMON_SOCKET_PATH)) unlinkSync(DAEMON_SOCKET_PATH);
    } catch {
      // Ignore
    }
    try {
      if (existsSync(DAEMON_PID_FILE)) unlinkSync(DAEMON_PID_FILE);
    } catch {
      // Ignore
    }
  }

  /**
   * Check if the connected daemon's protocol and app versions match.
   */
  private async checkVersion(): Promise<{
    protocolMismatch: boolean;
    appMatch: boolean;
    activeSessions: number;
  }> {
    try {
      const result = (await this.client.request(
        DAEMON_METHODS.DAEMON_STATUS,
      )) as DaemonStatusResult;
      return {
        protocolMismatch: (result.protocolVersion ?? 0) !== DAEMON_PROTOCOL_VERSION,
        appMatch: result.version === app.getVersion(),
        activeSessions: result.activeSessions,
      };
    } catch {
      // Can't get status — treat as protocol mismatch to be safe
      return { protocolMismatch: true, appMatch: false, activeSessions: 0 };
    }
  }

  /**
   * Shutdown the currently connected daemon (version mismatch) and spawn a new one.
   */
  private async shutdownAndRespawn(): Promise<void> {
    try {
      await this.client.request(DAEMON_METHODS.DAEMON_SHUTDOWN);
    } catch {
      // May fail if already shutting down
    }

    this.client.disconnect();

    // Wait for daemon to die
    const deadline = Date.now() + VERSION_SHUTDOWN_WAIT_MS;
    while (Date.now() < deadline) {
      if (!this.isDaemonAlive()) break;
      await sleep(VERSION_SHUTDOWN_POLL_MS);
    }

    this.cleanupStaleFiles();
    this.spawnDaemon();
    await this.waitForConnection();
  }

  /**
   * Get the executable path for spawning the daemon.
   * On macOS, creates a symlink at ~/.orca/node pointing to the Electron binary.
   * Spawning from outside the .app bundle prevents macOS from registering a dock icon.
   */
  private getDaemonExecutable(): string {
    if (process.platform !== 'darwin') return process.execPath;

    const symlinkPath = join(ORCA_DIR, 'node');
    mkdirSync(ORCA_DIR, { recursive: true });

    try {
      const target = readlinkSync(symlinkPath);
      if (target === process.execPath) return symlinkPath;
      unlinkSync(symlinkPath);
    } catch {
      // Symlink doesn't exist or isn't a symlink — create it below
    }

    symlinkSync(process.execPath, symlinkPath);
    return symlinkPath;
  }

  private spawnDaemon(): void {
    const electronPath = this.getDaemonExecutable();
    const daemonScript = this.getDaemonScriptPath();
    const migrationsFolder = this.getMigrationsFolder();
    const backendUrl = process.env.BACKEND_URL || __BACKEND_URL__;
    const version = app.getVersion();

    const child = spawn(
      electronPath,
      [
        daemonScript,
        '--db-path',
        DAEMON_DB_PATH,
        '--migrations',
        migrationsFolder,
        '--socket-path',
        DAEMON_SOCKET_PATH,
        '--backend-url',
        backendUrl,
        '--version',
        version,
      ],
      {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
      },
    );

    child.unref();
  }

  private getDaemonScriptPath(): string {
    return join(app.getAppPath(), 'out', 'daemon', 'index.js');
  }

  private getMigrationsFolder(): string {
    return join(app.getAppPath(), 'drizzle');
  }

  private async waitForConnection(): Promise<void> {
    for (let i = 0; i < MAX_CONNECT_ATTEMPTS; i++) {
      try {
        await this.client.connect(DAEMON_SOCKET_PATH);
        return;
      } catch {
        await sleep(CONNECT_RETRY_MS);
      }
    }
    throw new Error('Failed to connect to daemon after spawn');
  }

  private setupReconnection(): void {
    this.client.setOnDisconnect(() => {
      this.onDisconnect?.();
      this.startReconnection();
    });
  }

  private async startReconnection(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    let delay = 200;
    const maxDelay = 5000;

    while (this.reconnecting) {
      await sleep(delay);

      try {
        // Re-check if daemon is alive; spawn if not
        if (!this.isDaemonAlive()) {
          this.cleanupStaleFiles();
          this.spawnDaemon();
          await sleep(500); // Give daemon time to start
        }

        await this.client.connect(DAEMON_SOCKET_PATH);
        this.reconnecting = false;
        this.setupReconnection();
        this.onReconnect?.();
        return;
      } catch {
        delay = Math.min(delay * 1.5, maxDelay);
      }
    }
  }

  stopReconnection(): void {
    this.reconnecting = false;
  }

  /**
   * Force-restart the daemon (used after user confirms closing active sessions
   * on a breaking protocol update).
   */
  async forceRestart(): Promise<void> {
    await this.shutdownAndRespawn();
    this.setupReconnection();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
