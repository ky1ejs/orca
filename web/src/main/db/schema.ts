import { sqliteTable, text, integer, blob, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const terminalSession = sqliteTable('terminal_session', {
  id: text('id').primaryKey(),
  task_id: text('task_id'),
  pid: integer('pid'),
  status: text('status').notNull().default('STARTING'),
  working_directory: text('working_directory'),
  started_at: text('started_at'),
  stopped_at: text('stopped_at'),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const terminalOutputBuffer = sqliteTable(
  'terminal_output_buffer',
  {
    session_id: text('session_id')
      .notNull()
      .references(() => terminalSession.id, { onDelete: 'cascade' }),
    chunk: blob('chunk', { mode: 'buffer' }).notNull(),
    sequence: integer('sequence').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.session_id, table.sequence] })],
);

export const projectDirectory = sqliteTable('project_directory', {
  project_id: text('project_id').primaryKey(),
  directory: text('directory').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const userPreference = sqliteTable('user_preference', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const authToken = sqliteTable('auth_token', {
  id: text('id').primaryKey(),
  token: text('token').notNull(),
  server_url: text('server_url').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
