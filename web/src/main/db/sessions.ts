import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';

export interface TerminalSession {
  id: string;
  task_id: string | null;
  pid: number | null;
  status: string;
  working_directory: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
}

export interface CreateSessionInput {
  taskId?: string;
  pid?: number;
  status?: string;
  workingDirectory?: string;
}

export interface UpdateSessionInput {
  pid?: number;
  status?: string;
  stoppedAt?: string;
}

export function getSessions(): TerminalSession[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM terminal_session ORDER BY created_at DESC')
    .all() as TerminalSession[];
}

export function getSession(id: string): TerminalSession | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM terminal_session WHERE id = ?').get(id) as
    | TerminalSession
    | undefined;
}

export function createSession(input: CreateSessionInput): TerminalSession {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO terminal_session (id, task_id, pid, status, working_directory, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.taskId ?? null,
    input.pid ?? null,
    input.status ?? 'STARTING',
    input.workingDirectory ?? null,
    now,
    now,
  );

  return getSession(id)!;
}

export function updateSession(id: string, input: UpdateSessionInput): TerminalSession | undefined {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.pid !== undefined) {
    sets.push('pid = ?');
    values.push(input.pid);
  }
  if (input.status !== undefined) {
    sets.push('status = ?');
    values.push(input.status);
  }
  if (input.stoppedAt !== undefined) {
    sets.push('stopped_at = ?');
    values.push(input.stoppedAt);
  }

  if (sets.length === 0) return getSession(id);

  values.push(id);
  db.prepare(`UPDATE terminal_session SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getSession(id);
}

export function sweepStaleSessions(): void {
  const db = getDb();
  const staleSessions = db
    .prepare(
      "SELECT id, pid FROM terminal_session WHERE status IN ('RUNNING', 'STARTING') AND pid IS NOT NULL",
    )
    .all() as Array<{ id: string; pid: number }>;

  for (const session of staleSessions) {
    try {
      process.kill(session.pid, 0);
    } catch {
      db.prepare(
        "UPDATE terminal_session SET status = 'ERROR', stopped_at = datetime('now') WHERE id = ?",
      ).run(session.id);
    }
  }
}
