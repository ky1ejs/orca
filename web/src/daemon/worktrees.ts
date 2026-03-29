/**
 * Task worktree CRUD for the daemon.
 */
import { eq } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { getDb } from './db.js';
import { taskWorktree } from '../shared/db/schema.js';

type TaskWorktree = InferSelectModel<typeof taskWorktree>;
type InsertTaskWorktree = InferInsertModel<typeof taskWorktree>;

export function getWorktree(taskId: string): TaskWorktree | undefined {
  const db = getDb();
  return db.select().from(taskWorktree).where(eq(taskWorktree.task_id, taskId)).get();
}

export function insertWorktree(
  input: Omit<InsertTaskWorktree, 'created_at' | 'updated_at'>,
): TaskWorktree {
  const db = getDb();
  db.insert(taskWorktree).values(input).run();
  return getWorktree(input.task_id)!;
}

export function deleteWorktree(taskId: string): void {
  const db = getDb();
  db.delete(taskWorktree).where(eq(taskWorktree.task_id, taskId)).run();
}
