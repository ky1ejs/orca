/**
 * Cold persistence layer for terminal output.
 * Periodically flushes dirty ring buffers to SQLite in a single transaction.
 * On daemon startup, loads persisted output to populate ring buffers for crash recovery.
 */
import { eq, asc } from 'drizzle-orm';
import { getDb } from './db.js';
import { terminalOutputBuffer } from '../shared/db/schema.js';
import type { DaemonPtyManager } from './pty-manager.js';
import { logger } from './logger.js';

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

const FLUSH_INTERVAL_MS = 5_000;

export class OutputPersistence {
  private dirtySessionIds = new Set<string>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private ptyManager: DaemonPtyManager;

  constructor(ptyManager: DaemonPtyManager) {
    this.ptyManager = ptyManager;
  }

  markDirty(sessionId: string): void {
    this.dirtySessionIds.add(sessionId);
  }

  /** Remove a session from the dirty set (e.g. before deleting the session row). */
  removeSession(sessionId: string): void {
    this.dirtySessionIds.delete(sessionId);
  }

  start(): void {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  flush(): void {
    if (this.dirtySessionIds.size === 0) return;

    const sessionIds = [...this.dirtySessionIds];
    this.dirtySessionIds.clear();

    for (const sessionId of sessionIds) {
      this.tryPersistSession(sessionId);
    }

    logger.debug(`Flushed output for ${sessionIds.length} session(s)`);
  }

  flushSession(sessionId: string): void {
    this.dirtySessionIds.delete(sessionId);
    this.tryPersistSession(sessionId);
  }

  loadAll(): void {
    const db = getDb();
    const rows = db
      .select({
        session_id: terminalOutputBuffer.session_id,
        chunk: terminalOutputBuffer.chunk,
      })
      .from(terminalOutputBuffer)
      .orderBy(asc(terminalOutputBuffer.session_id), asc(terminalOutputBuffer.sequence))
      .all();

    const grouped = new Map<string, Buffer[]>();
    for (const row of rows) {
      const chunks = grouped.get(row.session_id) ?? [];
      chunks.push(row.chunk);
      grouped.set(row.session_id, chunks);
    }

    let restored = 0;
    for (const [sessionId, chunks] of grouped) {
      const content = Buffer.concat(chunks).toString();
      if (content) {
        this.ptyManager.restoreBuffer(sessionId, content);
        restored++;
      }
    }

    if (restored > 0) {
      logger.info(`Restored output for ${restored} session(s)`);
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  private tryPersistSession(sessionId: string): void {
    try {
      const db = getDb();
      db.transaction((tx) => this.persistSession(tx, sessionId));
    } catch (err) {
      logger.warn(`Failed to persist output for session ${sessionId}: ${err}`);
    }
  }

  private persistSession(tx: Tx, sessionId: string): void {
    tx.delete(terminalOutputBuffer).where(eq(terminalOutputBuffer.session_id, sessionId)).run();

    const content = this.ptyManager.getSnapshot(sessionId) ?? this.ptyManager.replay(sessionId);
    if (content) {
      tx.insert(terminalOutputBuffer)
        .values({
          session_id: sessionId,
          chunk: Buffer.from(content),
          sequence: 0,
        })
        .run();
    }
  }
}
