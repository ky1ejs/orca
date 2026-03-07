# Wave 1: Schema + Data Layer || Electron Shell

**Status**: Complete
**Depends on**: Wave 0 complete and merged to `main`
**Agents**: 2 in parallel (1A and 1B)
**Merge order**: 1A first, then 1B

## Why These Parallelize

Backend work (`shared/`, `backend/`) has zero file overlap with Electron work (`web/`). Both depend on the foundation from Wave 0 but not on each other.

---

## Agent 1A: GraphQL Schema + Prisma + Backend API

**Status**: Complete
**Branch**: `wave-1/backend-data-layer`

### Agent Startup

Before writing any code, read these files in order:

1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-1.md) — your deliverables are in the "Agent 1A" section only

### Reference: Data Models

#### Prisma Schema (Server-side — Postgres)

```prisma
model Project {
  id          String   @id @default(uuid())
  name        String
  description String?  // Markdown supported
  tasks       Task[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Task {
  id               String     @id @default(uuid())
  title            String
  description      String?    // Markdown supported
  status           TaskStatus @default(TODO)
  project          Project    @relation(fields: [projectId], references: [id])
  projectId        String
  workingDirectory String     // Local path where the agent runs
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}
```

#### GraphQL Schema (to define in `shared/src/schema.graphql`)

The GraphQL SDL should mirror the Prisma models above. Include:

- Types: `Project`, `Task`, `TaskStatus` enum
- Queries: `projects: [Project!]!`, `project(id: ID!): Project`, `tasks(projectId: ID!): [Task!]!`, `task(id: ID!): Task`
- Mutations: `createProject`, `updateProject`, `deleteProject`, `createTask`, `updateTask`, `deleteTask` with appropriate input types
- Subscriptions: `projectChanged: Project!`, `taskChanged: Task!`

### File Ownership

This agent may ONLY modify files in:

- `shared/src/schema.graphql` (create)
- `shared/src/generated/` (create — codegen output)
- `shared/codegen.ts` (create)
- `shared/package.json` (add dependencies)
- `backend/src/**` (create/modify)
- `backend/prisma/**` (create)
- `backend/package.json` (add dependencies)
- `backend/codegen.ts` (create)

Do NOT touch any files in `web/`.

### Deliverables

- [x] **GraphQL SDL** (`shared/src/schema.graphql`):
  - [x] `Project` type (id, name, description, createdAt, updatedAt)
  - [x] `Task` type (id, title, description, status, projectId, workingDirectory, createdAt, updatedAt)
  - [x] `TaskStatus` enum (TODO, IN_PROGRESS, IN_REVIEW, DONE)
  - [x] Queries: `projects`, `project(id)`, `tasks(projectId)`, `task(id)`
  - [x] Mutations: `createProject`, `updateProject`, `deleteProject`, `createTask`, `updateTask`, `deleteTask`
  - [x] Subscriptions: `projectChanged`, `taskChanged`
- [x] **graphql-codegen** (`shared/codegen.ts`):
  - [x] Config generating TypeScript types from SDL
  - [x] Output to `shared/src/generated/graphql.ts`
  - [x] `codegen` script in `shared/package.json`
- [x] **Prisma schema** (`backend/prisma/schema.prisma`):
  - [x] `Project` model matching GraphQL type
  - [x] `Task` model matching GraphQL type
  - [x] `TaskStatus` enum
  - [x] Initial migration generated and applied
- [x] **graphql-yoga server** (`backend/src/index.ts`):
  - [x] HTTP server on port 4000
  - [x] Binds to `127.0.0.1` in development
  - [x] GraphQL endpoint at `/graphql`
  - [x] Subscriptions via SSE (graphql-yoga built-in, no separate WebSocket server needed)
- [x] **Resolvers** (`backend/src/schema/`):
  - [x] `project.ts` — all Project queries and mutations
  - [x] `task.ts` — all Task queries, mutations, and subscriptions
  - [x] `index.ts` — schema assembly
- [x] **Auth** (`backend/src/auth/token.ts`):
  - [x] Generate token on first run
  - [x] Persist token to `~/.orca/config.json`
  - [x] Context validates `Authorization: Bearer <token>` header (throws GraphQLError)
  - [ ] WebSocket auth via connection params (not applicable — using SSE subscriptions)
- [x] **Prisma client** (`backend/src/db/client.ts`)

### Tests

- [x] Unit tests for each resolver (mocked Prisma client) — 13 tests
- [x] Integration test: start server, run query, verify response — 2 tests
- [x] Auth tests: token validation (matching, non-matching, empty) — 3 tests
- [x] Auth tests: requests without token are rejected
- [x] Auth tests: requests with invalid token are rejected
- [x] Auth tests: requests with valid token succeed

### Deviations from Spec

- **Prisma IDs use `cuid()` instead of `uuid()`**: `cuid()` is Prisma's recommended default — shorter, URL-safe, and monotonically sortable.
- **SSE instead of WebSocket subscriptions**: graphql-yoga v5 uses Server-Sent Events for subscriptions by default, which is simpler and doesn't require a separate WebSocket server.
- **Server uses `Bun.serve()` instead of `node:http`**: Since the backend runs on Bun, using `Bun.serve()` with graphql-yoga's fetch API is more idiomatic and performant.
- **Cascade delete on Task→Project**: Added `onDelete: Cascade` to the Task→Project relation so deleting a project cleans up its tasks.

### Validation

```bash
bun run validate                     # Must pass
cd backend && bun run dev            # Server starts on :4000
# Verify: curl -X POST http://localhost:4000/graphql with a test query
```

---

## Agent 1B: Electron Shell + Local SQLite + IPC Foundation

**Status**: Complete
**Branch**: `wave-1/electron-shell`

### Agent Startup

Before writing any code, read these files in order:

1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-1.md) — your deliverables are in the "Agent 1B" section only

### Reference: SQLite Schema (Client-side)

```sql
CREATE TABLE terminal_session (
  id                TEXT PRIMARY KEY,
  task_id           TEXT,            -- References server-side Task.id (nullable for standalone terminals)
  pid               INTEGER,         -- OS process ID of the PTY
  status            TEXT NOT NULL DEFAULT 'IDLE',
    -- IDLE, STARTING, RUNNING, WAITING_FOR_INPUT, COMPLETED, ERROR
  working_directory TEXT,
  started_at        TEXT,            -- ISO timestamp
  stopped_at        TEXT,            -- ISO timestamp
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE terminal_output_buffer (
  session_id  TEXT NOT NULL REFERENCES terminal_session(id),
  chunk       BLOB NOT NULL,         -- Ring buffer chunks of terminal output
  sequence    INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, sequence)
);

CREATE TABLE auth_token (
  id          TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  server_url  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Terminal Session Status Values

| Status            | Meaning                                  |
| ----------------- | ---------------------------------------- |
| IDLE              | Session created but not yet started      |
| STARTING          | PTY process is spawning                  |
| RUNNING           | Agent is actively executing              |
| WAITING_FOR_INPUT | Agent blocked waiting for user input     |
| COMPLETED         | Agent finished successfully              |
| ERROR             | Agent crashed or terminated unexpectedly |

### File Ownership

This agent may ONLY modify files in:

- `web/src/**` (create/modify)
- `web/electron.vite.config.ts` (create)
- `web/package.json` (add dependencies)
- `web/tailwind.config.js` (create)
- `web/postcss.config.js` (create)

Do NOT touch any files in `shared/` or `backend/`.

### Deliverables

- [x] **electron-vite configuration** (`web/electron.vite.config.ts`):
  - [x] Main process config (Node.js target, native module support)
  - [x] Renderer process config (React, Tailwind CSS)
  - [x] Preload script config
- [x] **Electron main process** (`web/src/main/index.ts`):
  - [x] BrowserWindow creation (nodeIntegration disabled, contextIsolation enabled)
  - [x] Dev tools enabled in development
  - [x] App lifecycle handlers (ready, window-all-closed, activate)
- [x] **better-sqlite3 setup** (`web/src/main/db/`):
  - [x] `client.ts` — SQLite database initialization (app data directory)
  - [x] `migrations.ts` — Schema: terminal_session, terminal_output_buffer, auth_token tables
  - [x] `sessions.ts` — CRUD operations for terminal sessions
  - [x] Startup sweep: detect stale sessions (PIDs that no longer exist), mark terminated
- [x] **IPC bridge** (`web/src/main/ipc/handlers.ts` + `web/src/preload/index.ts`):
  - [x] Preload script exposes typed API via `contextBridge.exposeInMainWorld`
  - [x] Typed IPC channel constants (shared between main and preload)
  - [x] Handlers: `db:getSessions`, `db:getSession`, `db:createSession`, `db:updateSession`
- [x] **React renderer shell** (`web/src/renderer/`):
  - [x] `App.tsx` — Basic layout shell
  - [x] `components/layout/AppShell.tsx` — Main layout wrapper (sidebar + content)
  - [x] `components/layout/Sidebar.tsx` — Placeholder sidebar (static, no data)
  - [x] Tailwind CSS configured and working
- [x] **Native module rebuild**: handled by electron-vite's `externalizeDepsPlugin()` (no separate electron-rebuild needed)

### Tests

- [x] SQLite client: table creation succeeds — 2 tests
- [x] SQLite sessions: CRUD operations work — 4 tests
- [x] Stale session sweep: dead PIDs detected and marked — 2 tests
- [x] IPC type definitions compile (verified via typecheck)

### Deviations from Spec

- **Tailwind v4 with `@tailwindcss/vite`**: No `tailwind.config.js` or `postcss.config.js` needed. Tailwind v4 uses the Vite plugin directly with `@import 'tailwindcss'` in CSS.
- **Session default status is `STARTING`**: Changed from `IDLE` to `STARTING` as the more common initial state when creating a session.
- **No electron-rebuild**: electron-vite's `externalizeDepsPlugin()` handles native module externalization, making a separate rebuild step unnecessary.

### Validation

```bash
bun run validate                     # Must pass
cd web && bun run dev                # Electron app opens with React shell
# Verify: window opens, dev tools work, SQLite DB created in app data dir
```
