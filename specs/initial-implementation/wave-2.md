# Wave 2: Navigation UI || PTY Engine

**Status**: Complete
**Depends on**: Wave 1 fully merged to `main`
**Agents**: 2 in parallel (2A and 2B)
**Merge order**: Either order (no file overlap except `web/package.json`)

## Why These Parallelize

Navigation UI lives in `web/src/renderer/`. PTY engine lives in `web/src/main/pty/`. They operate on different sides of the Electron process boundary with no file overlap.

---

## Agent 2A: GraphQL Client + Project/Task Navigation UI

**Status**: Complete
**Branch**: `wave-2/navigation-ui` (merged to `feat/wave-2`)

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

**Auth**: All requests require `Authorization: Bearer <token>` header. The token is stored in `~/.orca/config.json`, accessible via IPC (`db:getAuthToken`).

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

- [x] **GraphQL client** (`web/src/renderer/graphql/`):
  - [x] urql client with HTTP transport (to `http://localhost:4000/graphql`)
  - [x] SSE transport for subscriptions via `graphql-sse` (graphql-yoga uses Server-Sent Events, NOT WebSocket)
  - [x] Auth token retrieval from `~/.orca/config.json` via IPC (`window.orca.db.getAuthToken()`)
  - [x] Provider wrapping the app (`GraphQLProvider` with loading/error states)
- [x] **graphql-codegen for client** (`web/codegen.ts`):
  - [x] Generates typed operations from SDL + client documents via `@graphql-codegen/typed-document-node`
  - [x] `codegen` script in `web/package.json`
- [x] **Query/mutation/subscription documents** (`web/src/renderer/graphql/`):
  - [x] `queries.ts` — ProjectsQuery, ProjectQuery (with nested tasks), TasksQuery, TaskQuery
  - [x] `mutations.ts` — Create/Update/Delete for Project and Task (6 mutations)
  - [x] `subscriptions.ts` — ProjectChangedSubscription, TaskChangedSubscription
- [x] **Navigation components** (`web/src/renderer/components/`):
  - [x] `layout/Sidebar.tsx` — Project list, expandable to show tasks per project, subscription-driven updates
  - [x] `layout/AppShell.tsx` — Updated with sidebar + content routing via navigation context
  - [x] `projects/ProjectList.tsx` — List with create button, loading/error states
  - [x] `projects/ProjectDetail.tsx` — Name, description (markdown), task list, edit/delete
  - [x] `tasks/TaskList.tsx` — Tasks within project, status badges, create button
  - [x] `tasks/TaskDetail.tsx` — Editable fields, status dropdown, working directory
  - [x] `tasks/TaskStatusBadge.tsx` — Color-coded status badge (gray/blue/yellow/green)
  - [x] `markdown/MarkdownRenderer.tsx` — react-markdown + remark-gfm with dark theme
- [x] **Hooks** (`web/src/renderer/hooks/`):
  - [x] `useGraphQL.ts` — 4 query hooks, 6 mutation hooks, 2 subscription hooks
- [x] **Routing**: Stack-based navigation context (`web/src/renderer/navigation/context.tsx`) with navigate/goBack
- [x] **Real-time**: Subscriptions auto-update UI — Sidebar, ProjectList, ProjectDetail, TaskDetail all refetch on subscription events

### Deviations from Plan

- Component named `TaskStatusBadge.tsx` instead of `TaskStatus.tsx` (clearer name)
- Auth token read from `~/.orca/config.json` via IPC instead of SQLite `auth_token` table (simpler, shared with backend)
- Added `web/src/renderer/types/global.d.ts` for `window.orca` type declaration

### Tests

- [x] Component render tests — ProjectList (4 tests), TaskList (4 tests) with mocked urql client
- [x] Status badge renders correct colors for each status (4 tests)
- [x] Navigation context tests — navigate/goBack/stack behavior (6 tests)
- [x] MarkdownRenderer tests — plain text, bold, headings, links, GFM tables, strikethrough (7 tests)

**Total: 25 renderer tests across 5 test files**

### Validation

```bash
bun run validate                     # Must pass ✅ (53 tests, typecheck, build)
# Full-stack test:
docker compose up -d
cd backend && bun run dev &
cd web && bun run dev
# Verify: create project, create tasks, navigate views, markdown renders
```

---

## Agent 2B: node-pty Integration + PTY Manager

**Status**: Complete
**Branch**: `wave-2/pty-engine` (merged to `feat/wave-2`)

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
  status            TEXT NOT NULL DEFAULT 'STARTING',
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

**Result: PASSED** — node-pty works within Electron's main process. Native module is rebuilt for Electron's ABI via `prebuild-install` with `node-gyp` fallback. All 8 PtyManager tests pass using real node-pty under `ELECTRON_RUN_AS_NODE=1`.

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

- [x] **`PtyManager` class** (`web/src/main/pty/manager.ts`):
  - [x] `spawn(sessionId, command, args, cwd)` — spawns PTY via node-pty with xterm-256color
  - [x] `write(sessionId, data)` — sends input to PTY
  - [x] `resize(sessionId, cols, rows)` — resizes PTY
  - [x] `kill(sessionId)` — kills PTY process
  - [x] Map of sessionId -> PtyProcess instance
  - [x] Event emission: `onData` (broadcasts to all BrowserWindows via `pty:data:<sessionId>`), `onExit` (via `pty:exit:<sessionId>`)
  - [x] `killAll()` for clean shutdown, called from `before-quit` handler
  - [x] `disposed` flag for graceful handling of async callbacks during shutdown
- [x] **Output ring buffer** (`web/src/main/pty/output-buffer.ts`):
  - [x] Stores last 1MB of output per session in SQLite (terminal_output_buffer table)
  - [x] `appendOutput(sessionId, data)` — add output chunk with auto-incrementing sequence
  - [x] `replayOutput(sessionId)` — return all buffered output concatenated in sequence order
  - [x] `clearOutput(sessionId)` — clear buffer for a session
  - [x] In-memory size tracking per session, evicts oldest 25% when over 1MB
- [x] **IPC handlers for PTY** (extend `web/src/main/ipc/handlers.ts`):
  - [x] `pty:spawn` — create new PTY session
  - [x] `pty:write` — send data to PTY
  - [x] `pty:resize` — resize PTY
  - [x] `pty:kill` — kill PTY
  - [x] `pty:replay` — get ring buffer contents
  - [x] `pty:onData` / `pty:onExit` — renderer subscribes via `ipcRenderer.on` with per-session channels and unsubscribe functions (in preload)
- [x] **Session lifecycle integration**:
  - [x] On spawn: updates terminal_session record (status RUNNING, sets pid)
  - [x] On exit: updates record (EXITED or ERROR based on exit code, sets stoppedAt)
  - [x] On app startup: `sweepStaleSessions()` already handles orphaned sessions
- [x] **Claude Code spawn helper** (`web/src/main/pty/claude.ts`):
  - [x] `spawnClaudeCode(manager, sessionId, cwd, initialContext?)` function
  - [x] `findClaudePath()` — cross-platform detection via `which` (Unix) / `where` (Windows)
  - [x] Clear error message if not found (throws descriptive error)
  - [x] Optional `--print` flag for initial context
- [x] **node-pty native module rebuild**: `web/scripts/rebuild-native.mjs` (renamed from `rebuild-sqlite.mjs`) rebuilds both better-sqlite3 and node-pty for Electron's ABI via `prebuild-install` with `node-gyp` fallback

### Deviations from Plan

- `spawn()` takes `args: string[]` parameter (not just command) for flexibility
- Session record is updated (not created) on spawn — caller creates the session first via IPC
- Exit status uses `EXITED` instead of `COMPLETED` (clearer for process termination)
- `PtyManager` singleton managed via `getPtyManager()` in handlers.ts
- Barrel export at `web/src/main/pty/index.ts`

### Tests

- [x] node-pty spawns `/bin/echo hello` and captures output via replay (+ 7 more manager tests)
- [x] Output buffer: append + replay returns correct ordered data (+ 5 more buffer tests)
- [x] Output buffer: respects size limit (oldest chunks evicted)
- [x] Session lifecycle: spawn updates record to RUNNING with pid
- [x] Claude Code PATH detection: returns null when not found, throws on spawnClaudeCode

**Total: 28 main-process tests across 5 test files (including existing db tests)**

### Gating Check Documentation

node-pty works within Electron's main process. No fallback needed. Key findings:

- `prebuild-install` does not have prebuilt binaries for Electron 35.x, but `node-gyp` fallback compiles successfully
- Tests run under `ELECTRON_RUN_AS_NODE=1` with the Electron-compiled native module
- All spawn/write/resize/kill operations work correctly

### Important: Native Module & Testing Notes

- **No workspaces**: `web/` manages its own dependencies with `bun install`. Shared code is linked via `"@orca/shared": "file:../shared"` in `web/package.json`.
- **Native modules**: Do NOT use `@electron/rebuild`. Instead, `web/scripts/rebuild-native.mjs` rebuilds both better-sqlite3 and node-pty for Electron's ABI using `prebuild-install --runtime electron --target <electron-version>` with `node-gyp` fallback.
- **Tests run under Electron's Node.js**: The test script uses `ELECTRON_RUN_AS_NODE=1 electron ./node_modules/.bin/vitest run`, so native modules compiled for Electron work in tests too. No ABI swapping needed.
- **Validation**: Run `bun run validate` from `web/`.

### Validation

```bash
bun run validate                     # Must pass ✅ (53 tests, typecheck, build)
cd web && bun run dev
# Verify via dev tools or temp test button:
# - Spawn a PTY with /bin/bash, verify output
# - Kill PTY, verify cleanup
# - Spawn claude (if installed), verify it works
# Document: node-pty in Electron works? YES ✅
```

---

## Merge Notes

Both branches were developed in parallel worktrees from `feat/wave-2` and merged back:

1. `wave-2/navigation-ui` merged first (clean)
2. `wave-2/pty-engine` merged second — resolved conflicts in `web/package.json` (combined deps), `web/src/main/ipc/channels.ts` (kept both), `web/src/main/ipc/handlers.ts` (kept both), `web/bun.lock` (regenerated)

### Post-Merge Fixes

- **Preload CJS output**: Electron's sandboxed preload requires CommonJS. Configured `electron.vite.config.ts` to output preload as CJS (`format: 'cjs'`, `entryFileNames: '[name].js'`) instead of ESM (`.mjs`).
- **Auth header**: Made `fetchOptions` in urql client a function for per-request header evaluation; cached auth token.

### Pre-task: Auth Token IPC

Added `getAuthToken` IPC channel before agent work began (shared dependency):

- `web/src/main/ipc/channels.ts` — `DB_GET_AUTH_TOKEN: 'db:getAuthToken'`
- `web/src/main/ipc/handlers.ts` — reads `~/.orca/config.json` and returns `authToken`
- `web/src/preload/index.ts` — `getAuthToken: () => Promise<string | null>` on `OrcaAPI.db`
