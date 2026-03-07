import { getDb } from '../db/client.js';

const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB per session
const sizeMap = new Map<string, number>();

export function appendOutput(sessionId: string, data: string): void {
  const db = getDb();
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

  // Track size
  const currentSize = (sizeMap.get(sessionId) ?? 0) + chunk.length;
  sizeMap.set(sessionId, currentSize);

  // Evict oldest if over limit
  if (currentSize > MAX_BUFFER_SIZE) {
    evict(sessionId);
  }
}

function evict(sessionId: string): void {
  const db = getDb();
  // Delete oldest 25% of chunks
  const count = db
    .prepare('SELECT COUNT(*) as cnt FROM terminal_output_buffer WHERE session_id = ?')
    .get(sessionId) as { cnt: number };

  const toDelete = Math.max(1, Math.floor(count.cnt * 0.25));
  db.prepare(
    `DELETE FROM terminal_output_buffer WHERE session_id = ? AND sequence IN (
      SELECT sequence FROM terminal_output_buffer WHERE session_id = ? ORDER BY sequence ASC LIMIT ?
    )`,
  ).run(sessionId, sessionId, toDelete);

  // Recalculate size
  const sizeRow = db
    .prepare(
      'SELECT COALESCE(SUM(LENGTH(chunk)), 0) as total FROM terminal_output_buffer WHERE session_id = ?',
    )
    .get(sessionId) as { total: number };
  sizeMap.set(sessionId, sizeRow.total);
}

export function replayOutput(sessionId: string): string {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT chunk FROM terminal_output_buffer WHERE session_id = ? ORDER BY sequence ASC',
    )
    .all(sessionId) as Array<{ chunk: Buffer }>;

  return Buffer.concat(rows.map((r) => r.chunk)).toString();
}

export function clearOutput(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM terminal_output_buffer WHERE session_id = ?').run(sessionId);
  sizeMap.delete(sessionId);
}
