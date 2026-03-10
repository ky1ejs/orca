/**
 * Terminal output buffer for the daemon.
 * Same logic as main/pty/output-buffer.ts but uses daemon's DB instance.
 */
import { getRawDb } from './db.js';
import { visibleLength } from '../shared/ansi.js';

const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB per session
const sizeMap = new Map<string, number>();
const visibleSizeMap = new Map<string, number>();

export function appendOutput(sessionId: string, data: string): void {
  const db = getRawDb();
  const chunk = Buffer.from(data);

  // Get next sequence number
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sequence), -1) + 1 as next FROM terminal_output_buffer WHERE session_id = ?',
    )
    .get(sessionId) as { next: number };

  db.prepare(
    'INSERT INTO terminal_output_buffer (session_id, chunk, sequence) VALUES (?, ?, ?)',
  ).run(sessionId, chunk, row.next);

  // Track size (raw and visible)
  const currentSize = (sizeMap.get(sessionId) ?? 0) + chunk.length;
  sizeMap.set(sessionId, currentSize);

  const currentVisible = (visibleSizeMap.get(sessionId) ?? 0) + visibleLength(data);
  visibleSizeMap.set(sessionId, currentVisible);

  // Evict oldest if over limit
  if (currentSize > MAX_BUFFER_SIZE) {
    evict(sessionId);
  }
}

function evict(sessionId: string): void {
  const db = getRawDb();
  // Delete oldest 25% of chunks
  const count = db
    .prepare('SELECT COUNT(*) as cnt FROM terminal_output_buffer WHERE session_id = ?')
    .get(sessionId) as { cnt: number };

  const toDelete = Math.max(1, Math.floor(count.cnt * 0.25));

  // Sum visible length of the chunks we're about to delete so we can subtract it
  const toDeleteRows = db
    .prepare(
      'SELECT chunk FROM terminal_output_buffer WHERE session_id = ? ORDER BY sequence ASC LIMIT ?',
    )
    .all(sessionId, toDelete) as Array<{ chunk: Buffer }>;
  let deletedVisible = 0;
  for (const row of toDeleteRows) {
    deletedVisible += visibleLength(Buffer.from(row.chunk).toString());
  }

  db.prepare(
    `DELETE FROM terminal_output_buffer WHERE session_id = ? AND sequence IN (
      SELECT sequence FROM terminal_output_buffer WHERE session_id = ? ORDER BY sequence ASC LIMIT ?
    )`,
  ).run(sessionId, sessionId, toDelete);

  // Recalculate raw size via SQL aggregate
  const sizeRow = db
    .prepare(
      'SELECT COALESCE(SUM(LENGTH(chunk)), 0) as total FROM terminal_output_buffer WHERE session_id = ?',
    )
    .get(sessionId) as { total: number };
  sizeMap.set(sessionId, sizeRow.total);

  // Subtract deleted visible length from the running total
  visibleSizeMap.set(sessionId, Math.max(0, (visibleSizeMap.get(sessionId) ?? 0) - deletedVisible));
}

export function replayOutput(sessionId: string): string {
  const db = getRawDb();
  const rows = db
    .prepare('SELECT chunk FROM terminal_output_buffer WHERE session_id = ? ORDER BY sequence ASC')
    .all(sessionId) as Array<{ chunk: Buffer }>;

  return Buffer.concat(rows.map((r) => r.chunk)).toString();
}

export function getOutputSize(sessionId: string): number {
  return sizeMap.get(sessionId) ?? 0;
}

export function getVisibleOutputSize(sessionId: string): number {
  return visibleSizeMap.get(sessionId) ?? 0;
}

export function clearOutput(sessionId: string): void {
  const db = getRawDb();
  db.prepare('DELETE FROM terminal_output_buffer WHERE session_id = ?').run(sessionId);
  sizeMap.delete(sessionId);
  visibleSizeMap.delete(sessionId);
}
