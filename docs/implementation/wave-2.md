# Wave 2: Navigation UI || PTY Engine

**Status**: Not Started
**Depends on**: Wave 1 fully merged to `main`
**Agents**: 2 in parallel (2A and 2B)
**Merge order**: Either order (no file overlap)

## Why These Parallelize

Navigation UI lives in `web/src/renderer/`. PTY engine lives in `web/src/main/pty/`. They operate on different sides of the Electron process boundary with no file overlap.

---

## Agent 2A: GraphQL Client + Project/Task Navigation UI

**Status**: Not Started
**Branch**: `wave-2/navigation-ui`

### Agent Startup

Before writing any code, read these files in order:
1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-2.md) — your deliverables are in the "Agent 2A" section only
4. `shared/src/schema.graphql` — the GraphQL SDL you'll be writing queries/mutations against

### Reference: GraphQL Operations

The backend (from Wave 1A) exposes these operations at `http://localhost:4000/graphql`:

**Queries**: `projects`, `project(id)`, `tasks(projectId)`, `task(id)`
**Mutations**: `createProject`, `updateProject`, `deleteProject`, `createTask`, `updateTask`, `deleteTask`
**Subscriptions**: `projectChanged`, `taskChanged`

**Auth**: All requests require `Authorization: Bearer <token>` header. The token is stored in local SQLite `auth_token` table, accessible via IPC (`db:getAuthToken` or similar).

**TaskStatus enum**: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`

### File Ownership

This agent may ONLY modify files in:
- `web/src/renderer/**` (create/modify)
- `web/codegen.ts` (create)
- `web/package.json` (add dependencies)

Do NOT touch `web/src/main/`, `web/src/preload/`, `shared/`, or `backend/`.

### Context

After Wave 1, the following exist:
- GraphQL schema at `shared/src/schema.graphql` with Project/Task types
- Generated TypeScript types at `shared/src/generated/graphql.ts`
- Backend server running graphql-yoga with all CRUD resolvers
- Electron shell with AppShell layout and placeholder Sidebar
- IPC bridge for accessing local SQLite from renderer

### Deliverables

- [ ] **GraphQL client** (`web/src/renderer/graphql/`):
  - [ ] urql client with HTTP transport (to `http://localhost:4000/graphql`)
  - [ ] WebSocket transport for subscriptions
  - [ ] Auth token retrieval from local SQLite via IPC
  - [ ] Provider wrapping the app
- [ ] **graphql-codegen for client** (`web/codegen.ts`):
  - [ ] Generates typed operations from SDL + client documents
  - [ ] `codegen` script in `web/package.json`
- [ ] **Query/mutation/subscription documents** (`web/src/renderer/graphql/`):
  - [ ] `queries.ts` — projects list, project by id, tasks by project, task by id
  - [ ] `mutations.ts` — create/update/delete project, create/update/delete task
  - [ ] `subscriptions.ts` — projectChanged, taskChanged
- [ ] **Navigation components** (`web/src/renderer/components/`):
  - [ ] `layout/Sidebar.tsx` — Project list, expandable to show tasks per project
  - [ ] `layout/AppShell.tsx` — Updated with sidebar + content routing
  - [ ] `projects/ProjectList.tsx` — List with create button
  - [ ] `projects/ProjectDetail.tsx` — Name, description (markdown), task list
  - [ ] `tasks/TaskList.tsx` — Tasks within project, status badges, create button
  - [ ] `tasks/TaskDetail.tsx` — Editable fields, status dropdown, working directory
  - [ ] `tasks/TaskStatus.tsx` — Color-coded status badge (TODO/IN_PROGRESS/IN_REVIEW/DONE)
  - [ ] `markdown/MarkdownRenderer.tsx` — Renders markdown descriptions
- [ ] **Hooks** (`web/src/renderer/hooks/`):
  - [ ] `useGraphQL.ts` — Wrapper hooks for urql operations
- [ ] **Routing**: Navigate between project list, project detail, task detail views
- [ ] **Real-time**: Subscriptions auto-update UI on project/task changes

### Tests

- [ ] Component render tests (projects list renders, task list renders)
- [ ] GraphQL operation tests (mock urql, verify queries fire)
- [ ] Status badge renders correct colors for each status

### Validation

```bash
bun run validate                     # Must pass
# Full-stack test:
docker compose up -d
cd backend && bun run dev &
cd web && bun run dev
# Verify: create project, create tasks, navigate views, markdown renders
```

---

## Agent 2B: node-pty Integration + PTY Manager

**Status**: Not Started
**Branch**: `wave-2/pty-engine`

### Agent Startup

Before writing any code, read these files in order:
1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-2.md) — your deliverables are in the "Agent 2B" section only
4. `web/src/main/db/sessions.ts` — existing session CRUD you'll integrate with
5. `web/src/main/ipc/handlers.ts` — existing IPC handlers you'll extend
6. `web/src/preload/index.ts` — existing preload script you'll extend

### Reference: SQLite Tables You'll Use

```sql
-- You write to this table when sessions are created/updated
CREATE TABLE terminal_session (
  id                TEXT PRIMARY KEY,
  task_id           TEXT,
  pid               INTEGER,
  status            TEXT NOT NULL DEFAULT 'IDLE',
    -- IDLE, STARTING, RUNNING, WAITING_FOR_INPUT, COMPLETED, ERROR
  working_directory TEXT,
  started_at        TEXT,
  stopped_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- You write to this table for the ring buffer
CREATE TABLE terminal_output_buffer (
  session_id  TEXT NOT NULL REFERENCES terminal_session(id),
  chunk       BLOB NOT NULL,
  sequence    INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, sequence)
);
```

### GATING CHECK

This is the most critical technical risk in the project. If node-pty does not work within Electron's main process, the entire terminal architecture must be reconsidered. Document findings thoroughly.

### File Ownership

This agent may ONLY modify files in:
- `web/src/main/pty/**` (create)
- `web/src/main/ipc/handlers.ts` (extend with PTY handlers)
- `web/src/preload/index.ts` (extend with PTY IPC channels)
- `web/package.json` (add dependencies)

Do NOT touch `web/src/renderer/`, `shared/`, or `backend/`.

### Context

After Wave 1, the following exist:
- Electron main process with BrowserWindow and app lifecycle
- better-sqlite3 with terminal_session and terminal_output_buffer tables
- IPC bridge with typed channels and contextBridge API
- Session CRUD in `web/src/main/db/sessions.ts`

### Deliverables

- [ ] **`PtyManager` class** (`web/src/main/pty/manager.ts`):
  - [ ] `spawn(sessionId, command, cwd)` — spawns PTY via node-pty
  - [ ] `write(sessionId, data)` — sends input to PTY
  - [ ] `resize(sessionId, cols, rows)` — resizes PTY
  - [ ] `kill(sessionId)` — kills PTY process
  - [ ] Map of sessionId -> pty instance
  - [ ] Event emission: `onData`, `onExit` per session
  - [ ] SIGTERM/SIGINT handlers: clean up all PTY processes on app quit
- [ ] **Output ring buffer** (`web/src/main/pty/output-buffer.ts`):
  - [ ] Stores last 1MB of output per session in SQLite (terminal_output_buffer table)
  - [ ] `append(sessionId, data)` — add output chunk with sequence number
  - [ ] `replay(sessionId)` — return all buffered output ordered by sequence
  - [ ] `clear(sessionId)` — clear buffer for a session
- [ ] **IPC handlers for PTY** (extend `web/src/main/ipc/handlers.ts`):
  - [ ] `pty:spawn` — create new PTY session
  - [ ] `pty:write` — send data to PTY
  - [ ] `pty:resize` — resize PTY
  - [ ] `pty:kill` — kill PTY
  - [ ] `pty:replay` — get ring buffer contents
  - [ ] `pty:onData` — renderer subscribes to PTY output (IPC streaming)
  - [ ] `pty:onExit` — renderer subscribes to PTY exit events
- [ ] **Session lifecycle integration**:
  - [ ] On spawn: create terminal_session record (status STARTING -> RUNNING)
  - [ ] On exit: update record (COMPLETED or ERROR based on exit code)
  - [ ] On app startup: sweep stale sessions, kill orphaned PTYs
- [ ] **Claude Code spawn helper**:
  - [ ] `spawnClaudeCode(sessionId, cwd, initialContext?)` function
  - [ ] Detect if `claude` is on PATH
  - [ ] Clear error message if not found
- [ ] **electron-rebuild**: configured for node-pty native module

### Tests

- [ ] node-pty spawns a process (e.g., `/bin/echo hello`) and captures output
- [ ] Output buffer: append + replay returns correct ordered data
- [ ] Output buffer: respects size limit (oldest chunks evicted)
- [ ] Session lifecycle: spawn creates record, exit updates record
- [ ] Claude Code PATH detection: returns error when not found

### Gating Check Documentation

If node-pty fails in Electron, the agent MUST:
1. Document the exact error
2. Document what was attempted
3. Describe the fallback: Node.js `child_process` with pseudo-TTY
4. Stop and flag for developer review — do NOT proceed to implement the fallback

### Validation

```bash
bun run validate                     # Must pass
cd web && bun run test               # PTY tests pass
cd web && bun run dev
# Verify via dev tools or temp test button:
# - Spawn a PTY with /bin/bash, verify output
# - Kill PTY, verify cleanup
# - Spawn claude (if installed), verify it works
# Document: node-pty in Electron works? YES / NO
```
