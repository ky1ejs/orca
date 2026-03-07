# Wave 1: Schema + Data Layer || Electron Shell

**Status**: Not Started
**Depends on**: Wave 0 complete and merged to `main`
**Agents**: 2 in parallel (1A and 1B)
**Merge order**: 1A first, then 1B

## Why These Parallelize

Backend work (`shared/`, `backend/`) has zero file overlap with Electron work (`web/`). Both depend on the foundation from Wave 0 but not on each other.

---

## Agent 1A: GraphQL Schema + Prisma + Backend API

**Status**: Not Started
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

- [ ] **GraphQL SDL** (`shared/src/schema.graphql`):
  - [ ] `Project` type (id, name, description, createdAt, updatedAt)
  - [ ] `Task` type (id, title, description, status, projectId, workingDirectory, createdAt, updatedAt)
  - [ ] `TaskStatus` enum (TODO, IN_PROGRESS, IN_REVIEW, DONE)
  - [ ] Queries: `projects`, `project(id)`, `tasks(projectId)`, `task(id)`
  - [ ] Mutations: `createProject`, `updateProject`, `deleteProject`, `createTask`, `updateTask`, `deleteTask`
  - [ ] Subscriptions: `projectChanged`, `taskChanged`
- [ ] **graphql-codegen** (`shared/codegen.ts`):
  - [ ] Config generating TypeScript types from SDL
  - [ ] Output to `shared/src/generated/graphql.ts`
  - [ ] `codegen` script in `shared/package.json`
- [ ] **Prisma schema** (`backend/prisma/schema.prisma`):
  - [ ] `Project` model matching GraphQL type
  - [ ] `Task` model matching GraphQL type
  - [ ] `TaskStatus` enum
  - [ ] Initial migration generated and applied
- [ ] **graphql-yoga server** (`backend/src/index.ts`):
  - [ ] HTTP server on port 4000
  - [ ] Binds to `127.0.0.1` in development
  - [ ] GraphQL endpoint at `/graphql`
  - [ ] WebSocket server for subscriptions
- [ ] **Resolvers** (`backend/src/schema/`):
  - [ ] `project.ts` — all Project queries and mutations
  - [ ] `task.ts` — all Task queries, mutations, and subscriptions
  - [ ] `index.ts` — schema assembly
- [ ] **Auth** (`backend/src/auth/token.ts`):
  - [ ] Generate token on first run
  - [ ] Persist token to `~/.orca/config.json`
  - [ ] Middleware validates `Authorization: Bearer <token>` header
  - [ ] WebSocket auth via connection params
- [ ] **Prisma client** (`backend/src/db/client.ts`)

### Tests

- [ ] Unit tests for each resolver (mocked Prisma client)
- [ ] Integration test: start server, run query, verify response
- [ ] Auth tests: requests without token are rejected
- [ ] Auth tests: requests with invalid token are rejected
- [ ] Auth tests: requests with valid token succeed

### Validation

```bash
bun run validate                     # Must pass
cd backend && bun run dev            # Server starts on :4000
# Verify: curl -X POST http://localhost:4000/graphql with a test query
```

---

## Agent 1B: Electron Shell + Local SQLite + IPC Foundation

**Status**: Not Started
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

- [ ] **electron-vite configuration** (`web/electron.vite.config.ts`):
  - [ ] Main process config (Node.js target, native module support)
  - [ ] Renderer process config (React, Tailwind CSS)
  - [ ] Preload script config
- [ ] **Electron main process** (`web/src/main/index.ts`):
  - [ ] BrowserWindow creation (nodeIntegration disabled, contextIsolation enabled)
  - [ ] Dev tools enabled in development
  - [ ] App lifecycle handlers (ready, window-all-closed, activate)
- [ ] **better-sqlite3 setup** (`web/src/main/db/`):
  - [ ] `client.ts` — SQLite database initialization (app data directory)
  - [ ] `migrations.ts` — Schema: terminal_session, terminal_output_buffer, auth_token tables
  - [ ] `sessions.ts` — CRUD operations for terminal sessions
  - [ ] Startup sweep: detect stale sessions (PIDs that no longer exist), mark terminated
- [ ] **IPC bridge** (`web/src/main/ipc/handlers.ts` + `web/src/preload/index.ts`):
  - [ ] Preload script exposes typed API via `contextBridge.exposeInMainWorld`
  - [ ] Typed IPC channel constants (shared between main and preload)
  - [ ] Handlers: `db:getSessions`, `db:getSession`, `db:createSession`, `db:updateSession`
- [ ] **React renderer shell** (`web/src/renderer/`):
  - [ ] `App.tsx` — Basic layout shell
  - [ ] `components/layout/AppShell.tsx` — Main layout wrapper (sidebar + content)
  - [ ] `components/layout/Sidebar.tsx` — Placeholder sidebar (static, no data)
  - [ ] Tailwind CSS configured and working
- [ ] **Native module rebuild**: electron-rebuild configured for better-sqlite3

### Tests

- [ ] SQLite client: table creation succeeds
- [ ] SQLite sessions: CRUD operations work
- [ ] Stale session sweep: dead PIDs detected and marked
- [ ] IPC type definitions compile

### Validation

```bash
bun run validate                     # Must pass
cd web && bun run dev                # Electron app opens with React shell
# Verify: window opens, dev tools work, SQLite DB created in app data dir
```
