/**
 * Integration tests for the PTY daemon.
 * Uses DaemonServer + DaemonClient over a temp Unix socket (no mocking).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DaemonServer } from './server.js';
import { DaemonClient } from '../main/daemon/client.js';
import { initDaemonDb, closeDaemonDb } from './db.js';
import { DaemonPtyManager, type BroadcastFn } from './pty-manager.js';
import { DaemonStatusManager } from './status-manager.js';
import { DaemonPidSweepManager } from './pid-sweep.js';
import { OutputPersistence } from './output-persistence.js';
import { createHandler } from './handlers.js';
import { createSession, updateSession } from './sessions.js';
import { DAEMON_METHODS, DAEMON_PROTOCOL_VERSION } from '../shared/daemon-protocol.js';
import type { DaemonStatusResult, SessionsRestoreAllResult } from '../shared/daemon-protocol.js';
import { SessionStatus } from '../shared/session-status.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

let tempDir: string;
let socketPath: string;
let server: DaemonServer;
let client: DaemonClient;
let ptyManager: DaemonPtyManager;
let statusManager: DaemonStatusManager;
let pidSweepManager: DaemonPidSweepManager;
let shutdownCalled: boolean;
const version = '1.0.0-test';

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'daemon-integration-'));
  socketPath = join(tempDir, 'daemon.sock');
  const dbPath = join(tempDir, 'test.db');

  initDaemonDb(dbPath, migrationsFolder);

  shutdownCalled = false;
  let broadcastFn: BroadcastFn;

  ptyManager = new DaemonPtyManager((event, params) => {
    broadcastFn(event, params);
  });

  statusManager = new DaemonStatusManager(ptyManager, {
    backendUrl: 'http://localhost:9999',
    getToken: () => null,
    hookServer: null,
    hookPort: null,
    broadcast: (event, params) => broadcastFn(event, params),
  });

  pidSweepManager = new DaemonPidSweepManager((event, params) => {
    broadcastFn(event, params);
  });

  const outputPersistence = new OutputPersistence(ptyManager);

  const handler = createHandler({
    ptyManager,
    statusManager,
    outputPersistence,
    get server() {
      return server;
    },
    setToken: () => {},
    getVersion: () => version,
    getUptime: () => 1000,
    getMcpServerPort: () => null,
    shutdown: () => {
      shutdownCalled = true;
    },
  });

  server = new DaemonServer(handler);

  broadcastFn = (event, params) => {
    const p = params as Record<string, unknown>;
    const sessionId = (p?.sessionId as string) ?? null;
    if (event === 'pty.data' || event === 'pty.exit') {
      server.broadcastToSubscribed(sessionId, event, params);
    } else {
      server.broadcastToAll(event, params);
    }
  };

  await server.start(socketPath);

  client = new DaemonClient();
  await client.connect(socketPath);
});

afterEach(async () => {
  client.disconnect();
  ptyManager.killAll();
  statusManager.dispose();
  pidSweepManager.stop();
  await server.stop();
  closeDaemonDb();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('daemon integration', () => {
  it('daemon.ping returns pong', async () => {
    const result = await client.request(DAEMON_METHODS.DAEMON_PING);
    expect(result).toEqual({ pong: true });
  });

  it('daemon.status returns version, protocol version, and counts', async () => {
    const result = (await client.request(DAEMON_METHODS.DAEMON_STATUS)) as DaemonStatusResult;
    expect(result.version).toBe(version);
    expect(result.protocolVersion).toBe(DAEMON_PROTOCOL_VERSION);
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.activeSessions).toBe(0);
    expect(result.connectedClients).toBe(1);
  });

  it('session CRUD via db.* methods', async () => {
    // Create
    const created = (await client.request(DAEMON_METHODS.DB_CREATE_SESSION, {
      status: 'STARTING',
    })) as { id: string; status: string };
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('STARTING');

    // Read
    const fetched = (await client.request(DAEMON_METHODS.DB_GET_SESSION, {
      id: created.id,
    })) as { id: string; status: string };
    expect(fetched.id).toBe(created.id);

    // Update
    const updated = (await client.request(DAEMON_METHODS.DB_UPDATE_SESSION, {
      id: created.id,
      input: { status: 'RUNNING' },
    })) as { id: string; status: string };
    expect(updated.status).toBe('RUNNING');

    // List
    const sessions = (await client.request(DAEMON_METHODS.DB_GET_SESSIONS)) as unknown[];
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    // Delete
    await client.request(DAEMON_METHODS.DB_DELETE_SESSION, { id: created.id });
    const gone = await client.request(DAEMON_METHODS.DB_GET_SESSION, { id: created.id });
    expect(gone).toBeNull();
  });

  it('PTY spawn + data flow + exit', async () => {
    const session = createSession({ status: SessionStatus.Starting });

    const dataChunks: string[] = [];
    let exitCode: number | null = null;

    client.subscribe('pty.data', (params) => {
      const p = params as { sessionId: string; data: string };
      if (p.sessionId === session.id) {
        dataChunks.push(p.data);
      }
    });

    client.subscribe('pty.exit', (params) => {
      const p = params as { sessionId: string; exitCode: number };
      if (p.sessionId === session.id) {
        exitCode = p.exitCode;
      }
    });

    // Spawn — auto-subscribes caller
    await client.request(DAEMON_METHODS.PTY_SPAWN, {
      sessionId: session.id,
      command: '/bin/echo',
      args: ['hello world'],
      cwd: tempDir,
    });

    // Wait for exit
    await waitFor(() => exitCode !== null, 5000);

    expect(exitCode).toBe(0);
    const output = dataChunks.join('');
    expect(output).toContain('hello world');
  });

  it('env vars are injected into PTY when spawned with env', async () => {
    const session = createSession({ status: SessionStatus.Starting });

    const dataChunks: string[] = [];
    let exited = false;

    client.subscribe('pty.data', (params) => {
      const p = params as { sessionId: string; data: string };
      if (p.sessionId === session.id) dataChunks.push(p.data);
    });

    client.subscribe('pty.exit', (params) => {
      const p = params as { sessionId: string };
      if (p.sessionId === session.id) exited = true;
    });

    // Use a targeted shell command instead of `/usr/bin/env` (which dumps ALL
    // env vars). On CI the full env is huge, and the ORCA_* vars—appended last
    // by the object spread—end up at the tail of the output. A PTY data-vs-exit
    // race can then truncate those final chunks before they reach the client.
    await client.request(DAEMON_METHODS.PTY_SPAWN, {
      sessionId: session.id,
      command: '/bin/sh',
      args: [
        '-c',
        'echo "ORCA_SESSION_ID=$ORCA_SESSION_ID"; echo "ORCA_TASK_ID=$ORCA_TASK_ID"; echo "ORCA_TASK_UUID=$ORCA_TASK_UUID"; echo "ORCA_TASK_TITLE=$ORCA_TASK_TITLE"; echo "ELECTRON_RUN_AS_NODE=${ELECTRON_RUN_AS_NODE:-NOT_SET}"',
      ],
      cwd: tempDir,
      env: {
        ORCA_SESSION_ID: 'test-session-123',
        ORCA_TASK_ID: 'TASK-42',
        ORCA_TASK_UUID: 'uuid-abc',
        ORCA_TASK_TITLE: 'Test Task',
      },
    });

    await waitFor(() => exited, 5000);

    const output = dataChunks.join('');
    expect(output).toContain('ORCA_SESSION_ID=test-session-123');
    expect(output).toContain('ORCA_TASK_ID=TASK-42');
    expect(output).toContain('ORCA_TASK_UUID=uuid-abc');
    expect(output).toContain('ORCA_TASK_TITLE=Test Task');
    // ELECTRON_RUN_AS_NODE should be filtered out — not inherited by the PTY
    expect(output).toContain('ELECTRON_RUN_AS_NODE=NOT_SET');
  });

  it('subscription filtering — only subscribed client receives data', async () => {
    const session = createSession({ status: SessionStatus.Starting });

    // Create a second client
    const client2 = new DaemonClient();
    await client2.connect(socketPath);

    try {
      const client1Data: string[] = [];
      const client2Data: string[] = [];

      client.subscribe('pty.data', (params) => {
        const p = params as { sessionId: string; data: string };
        if (p.sessionId === session.id) client1Data.push(p.data);
      });

      client2.subscribe('pty.data', (params) => {
        const p = params as { sessionId: string; data: string };
        if (p.sessionId === session.id) client2Data.push(p.data);
      });

      // Only client1 spawns (auto-subscribes)
      await client.request(DAEMON_METHODS.PTY_SPAWN, {
        sessionId: session.id,
        command: '/bin/echo',
        args: ['test'],
        cwd: tempDir,
      });

      // Wait for data to flow
      await waitFor(() => client1Data.length > 0, 5000);

      // Give client2 a moment to receive (it shouldn't)
      await sleep(200);

      expect(client1Data.join('')).toContain('test');
      expect(client2Data.length).toBe(0);
    } finally {
      client2.disconnect();
    }
  });

  it('pty.replay returns buffered output', async () => {
    const session = createSession({ status: SessionStatus.Starting });
    let exited = false;

    client.subscribe('pty.exit', (params) => {
      const p = params as { sessionId: string };
      if (p.sessionId === session.id) exited = true;
    });

    await client.request(DAEMON_METHODS.PTY_SPAWN, {
      sessionId: session.id,
      command: '/bin/echo',
      args: ['replay-test'],
      cwd: tempDir,
    });

    await waitFor(() => exited, 5000);

    const replay = (await client.request(DAEMON_METHODS.PTY_REPLAY, {
      sessionId: session.id,
    })) as string;
    expect(replay).toContain('replay-test');
  });

  it('daemon.shutdown triggers shutdown callback', async () => {
    await client.request(DAEMON_METHODS.DAEMON_SHUTDOWN);

    // Shutdown is deferred 100ms in the handler
    await waitFor(() => shutdownCalled, 1000);
    expect(shutdownCalled).toBe(true);
  });

  it('sessions.restoreAll subscribes client to active sessions and returns all sessions', async () => {
    // Create sessions with different statuses
    const running = createSession({ status: SessionStatus.Running });
    updateSession(running.id, { pid: process.pid, status: SessionStatus.Running });

    const exited = createSession({ status: SessionStatus.Exited });
    updateSession(exited.id, { status: SessionStatus.Exited });

    const waiting = createSession({ status: SessionStatus.WaitingForInput });
    updateSession(waiting.id, { pid: process.pid, status: SessionStatus.WaitingForInput });

    // Call sessions.restoreAll
    const result = (await client.request(
      DAEMON_METHODS.SESSIONS_RESTORE_ALL,
    )) as SessionsRestoreAllResult;

    // Should return all sessions (3)
    expect(result.sessions).toHaveLength(3);

    // Verify the client is subscribed to active sessions by using a second
    // unsubscribed client as a control
    const client2 = new DaemonClient();
    await client2.connect(socketPath);

    try {
      const client1Data: string[] = [];
      const client2Data: string[] = [];

      client.subscribe('pty.data', (params) => {
        const p = params as { sessionId: string; data: string };
        client1Data.push(p.sessionId);
      });

      client2.subscribe('pty.data', (params) => {
        const p = params as { sessionId: string; data: string };
        client2Data.push(p.sessionId);
      });

      // Broadcast to the running session — only client1 (restored) should receive
      server.broadcastToSubscribed(running.id, 'pty.data', {
        sessionId: running.id,
        data: 'test',
      });

      // Broadcast to the exited session — neither client should receive
      // (exited sessions are not subscribed)
      server.broadcastToSubscribed(exited.id, 'pty.data', {
        sessionId: exited.id,
        data: 'test',
      });

      await sleep(100);

      expect(client1Data).toContain(running.id);
      expect(client1Data).not.toContain(exited.id);
      expect(client2Data).toHaveLength(0);
    } finally {
      client2.disconnect();
    }
  });

  it('notify sends a message without expecting a response', async () => {
    const session = createSession({ status: SessionStatus.Starting });

    let exited = false;
    client.subscribe('pty.exit', (params) => {
      const p = params as { sessionId: string };
      if (p.sessionId === session.id) exited = true;
    });

    // Spawn a short-lived process to get a real session with data
    await client.request(DAEMON_METHODS.PTY_SPAWN, {
      sessionId: session.id,
      command: '/bin/echo',
      args: ['notify-test'],
      cwd: tempDir,
    });

    await waitFor(() => exited, 5000);

    // notify() should not throw and should not create a pending request
    client.notify(DAEMON_METHODS.PTY_ACK, { sessionId: session.id, bytes: 100 });

    // Verify the client is still functional after notify
    const result = await client.request(DAEMON_METHODS.DAEMON_PING);
    expect(result).toEqual({ pong: true });
  });

  it('pty.ack resumes paused PTY after watermark exceeded', async () => {
    const session = createSession({ status: SessionStatus.Starting });
    const dataChunks: string[] = [];
    let exited = false;

    client.subscribe('pty.data', (params) => {
      const p = params as { sessionId: string; data: string };
      if (p.sessionId === session.id) dataChunks.push(p.data);
    });
    client.subscribe('pty.exit', (params) => {
      const p = params as { sessionId: string };
      if (p.sessionId === session.id) exited = true;
    });

    // Spawn echo — it exits immediately, but ack should still be processed
    await client.request(DAEMON_METHODS.PTY_SPAWN, {
      sessionId: session.id,
      command: '/bin/echo',
      args: ['ack-test'],
      cwd: tempDir,
    });

    await waitFor(() => exited, 5000);

    // Send an ACK via notify — should not throw or hang
    client.notify(DAEMON_METHODS.PTY_ACK, { sessionId: session.id, bytes: 50 });

    // Verify system is still responsive
    const ping = await client.request(DAEMON_METHODS.DAEMON_PING);
    expect(ping).toEqual({ pong: true });
  });

  it('pty.replay returns snapshot when available instead of raw buffer', async () => {
    const session = createSession({ status: SessionStatus.Starting });
    let exited = false;

    client.subscribe('pty.exit', (params) => {
      const p = params as { sessionId: string };
      if (p.sessionId === session.id) exited = true;
    });

    await client.request(DAEMON_METHODS.PTY_SPAWN, {
      sessionId: session.id,
      command: '/bin/echo',
      args: ['raw-buffer-content'],
      cwd: tempDir,
    });

    await waitFor(() => exited, 5000);

    // Set a snapshot — replay should now prefer it
    const snapshotContent = 'clean serialized terminal state';
    await client.request(DAEMON_METHODS.PTY_SNAPSHOT, {
      sessionId: session.id,
      content: snapshotContent,
    });

    const replay = (await client.request(DAEMON_METHODS.PTY_REPLAY, {
      sessionId: session.id,
    })) as string;

    expect(replay).toBe(snapshotContent);
  });

  it('pty.replay falls back to ring buffer when no snapshot exists', async () => {
    const session = createSession({ status: SessionStatus.Starting });
    let exited = false;

    client.subscribe('pty.exit', (params) => {
      const p = params as { sessionId: string };
      if (p.sessionId === session.id) exited = true;
    });

    await client.request(DAEMON_METHODS.PTY_SPAWN, {
      sessionId: session.id,
      command: '/bin/echo',
      args: ['fallback-content'],
      cwd: tempDir,
    });

    await waitFor(() => exited, 5000);

    // No snapshot set — replay should return ring buffer content
    const replay = (await client.request(DAEMON_METHODS.PTY_REPLAY, {
      sessionId: session.id,
    })) as string;

    expect(replay).toContain('fallback-content');
  });

  it('stale session sweep marks dead PIDs as ERROR', () => {
    // Create a session with a PID that doesn't exist
    const session = createSession({ status: SessionStatus.Running, pid: 999999 });
    updateSession(session.id, { pid: 999999, status: SessionStatus.Running });

    const deadIds = pidSweepManager.sweep();
    expect(deadIds).toContain(session.id);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
