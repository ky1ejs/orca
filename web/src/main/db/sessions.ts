import { eq, desc, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';
import { terminalSession } from './schema.js';

export type TerminalSession = InferSelectModel<typeof terminalSession>;

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
  return db.select().from(terminalSession).orderBy(desc(terminalSession.created_at)).all();
}

export function getSession(id: string): TerminalSession | undefined {
  const db = getDb();
  return db.select().from(terminalSession).where(eq(terminalSession.id, id)).get();
}

export function createSession(input: CreateSessionInput): TerminalSession {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(terminalSession)
    .values({
      id,
      task_id: input.taskId ?? null,
      pid: input.pid ?? null,
      status: input.status ?? 'STARTING',
      working_directory: input.workingDirectory ?? null,
      started_at: now,
      created_at: now,
    })
    .run();

  return getSession(id)!;
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.delete(terminalSession).where(eq(terminalSession.id, id)).run();
}

export function updateSession(id: string, input: UpdateSessionInput): TerminalSession | undefined {
  const db = getDb();
  const updates: Partial<Record<string, unknown>> = {};

  if (input.pid !== undefined) updates.pid = input.pid;
  if (input.status !== undefined) updates.status = input.status;
  if (input.stoppedAt !== undefined) updates.stopped_at = input.stoppedAt;

  if (Object.keys(updates).length === 0) return getSession(id);

  db.update(terminalSession).set(updates).where(eq(terminalSession.id, id)).run();

  return getSession(id);
}

export interface SweepResult {
  sweptIds: string[];
  total: number;
}

export function sweepStaleSessions(): SweepResult {
  const db = getDb();
  const staleSessions = db
    .select({ id: terminalSession.id, pid: terminalSession.pid })
    .from(terminalSession)
    .where(
      sql`${terminalSession.status} IN ('RUNNING', 'STARTING') AND ${terminalSession.pid} IS NOT NULL`,
    )
    .all() as Array<{ id: string; pid: number }>;

  const sweptIds: string[] = [];

  for (const session of staleSessions) {
    try {
      process.kill(session.pid, 0);
    } catch {
      db.update(terminalSession)
        .set({ status: 'ERROR', stopped_at: sql`datetime('now')` })
        .where(eq(terminalSession.id, session.id))
        .run();
      sweptIds.push(session.id);
    }
  }

  return { sweptIds, total: sweptIds.length };
}

/**
 * Check if a specific PID is alive.
 * Returns true if the process exists, false otherwise.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all active sessions (RUNNING or STARTING with a PID).
 */
export function getActiveSessions(): Array<{ id: string; pid: number }> {
  const db = getDb();
  return db
    .select({ id: terminalSession.id, pid: terminalSession.pid })
    .from(terminalSession)
    .where(
      sql`${terminalSession.status} IN ('RUNNING', 'STARTING', 'WAITING_FOR_INPUT') AND ${terminalSession.pid} IS NOT NULL`,
    )
    .all() as Array<{ id: string; pid: number }>;
}
