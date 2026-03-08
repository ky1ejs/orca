/**
 * DaemonConnector: discovers, spawns, and maintains connection to the PTY daemon.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { DaemonClient } from './client.js';
import {
  ORCA_DIR,
  DAEMON_SOCKET_PATH,
  DAEMON_PID_FILE,
  DAEMON_DB_PATH,
} from '../../shared/daemon-protocol.js';

const MAX_CONNECT_ATTEMPTS = 20;
const CONNECT_RETRY_MS = 150;

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
   */
  async ensureRunning(): Promise<void> {
    // One-time DB migration from old Electron userData location
    this.migrateDbIfNeeded();

    // Check if daemon is already running
    if (this.isDaemonAlive()) {
      try {
        await this.client.connect(DAEMON_SOCKET_PATH);
        this.setupReconnection();
        return;
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

  private spawnDaemon(): void {
    const electronPath = process.execPath;
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
   * One-time migration: copy old DB from Electron userData to ~/.orca/
   */
  private migrateDbIfNeeded(): void {
    if (existsSync(DAEMON_DB_PATH)) return; // New location already exists

    const oldDbPath = join(app.getPath('userData'), 'orca.db');
    if (!existsSync(oldDbPath)) return; // No old DB to migrate

    try {
      mkdirSync(ORCA_DIR, { recursive: true });
      copyFileSync(oldDbPath, DAEMON_DB_PATH);

      // Also copy WAL/SHM files if they exist
      const walPath = oldDbPath + '-wal';
      const shmPath = oldDbPath + '-shm';
      if (existsSync(walPath)) copyFileSync(walPath, DAEMON_DB_PATH + '-wal');
      if (existsSync(shmPath)) copyFileSync(shmPath, DAEMON_DB_PATH + '-shm');
    } catch {
      // Migration failed — daemon will create a fresh DB
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
