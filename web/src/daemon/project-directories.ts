/**
 * Project directory CRUD for the daemon.
 */
import { eq, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { getDb } from './db.js';
import { projectDirectory } from '../shared/db/schema.js';

type ProjectDirectory = InferSelectModel<typeof projectDirectory>;

export function getProjectDirectory(projectId: string): ProjectDirectory | undefined {
  const db = getDb();
  return db.select().from(projectDirectory).where(eq(projectDirectory.project_id, projectId)).get();
}

export function setProjectDirectory(projectId: string, directory: string): ProjectDirectory {
  const db = getDb();
  db.insert(projectDirectory)
    .values({
      project_id: projectId,
      directory,
    })
    .onConflictDoUpdate({
      target: projectDirectory.project_id,
      set: {
        directory,
        updated_at: sql`datetime('now')`,
      },
    })
    .run();

  return getProjectDirectory(projectId)!;
}

export function deleteProjectDirectory(projectId: string): void {
  const db = getDb();
  db.delete(projectDirectory).where(eq(projectDirectory.project_id, projectId)).run();
}
