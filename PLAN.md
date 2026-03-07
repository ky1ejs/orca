# Orca Prototype Plan

## Context

Orca is a work management tool for orchestrating AI agents (starting with Claude Code). The core hypothesis to validate: **an agent orchestration UI that directly connected to project management is meaningfully better than managing agents in terminal tabs — for developers and non-developers alike.** The prototype targets initial self-validation, then 5-10 teammates for early feedback.

The architecture is client/server from day one — Electron desktop client connecting to a Bun backend over GraphQL and WebSockets. The server holds shared state (projects, tasks) in Postgres so teammates can collaborate and the system is deployable. The Electron client holds local state (terminal sessions, agent process tracking) in SQLite, because local agents are local — their runtime state should not live on a server.

### Broader Audience

This is not exclusively for developers. Orca aims to democratize access to AI agents for less experienced users by providing a clear, navigable UI. Terminal UX should remain directly in reach for power users, feeling as seamless as using the terminal directly, so there is minimal trade-off for terminal-native users.

## What We're Validating

The prototype needs to answer one question: *Do I (and then my teammates) prefer managing Claude Code agents through Orca over raw terminal tabs?*

To answer this, the MVP must deliver:
1. A project list view with navigation, and task list within each project
2. Launch Claude Code from a task with one click (or start a blank TUI and optionally pass task context)
3. Embedded terminal (xterm.js) to see and interact with each agent
4. Ability to see multiple agents' status at a glance and switch between them
5. Sidebar navigation across projects and tasks

### Success Criteria

Success is progressive:
1. **Stage 1**: I personally find this useful for managing my work and reach for Orca instead of going directly to the terminal
2. **Stage 2**: My teammates find it useful to manage their work
3. If neither stage is reached, stop building

### Kill Criteria

Stop building if any of these prove true:
1. We are not able to keep the UX close to using the terminal directly
2. We cannot safely and reliably manage terminal state in line with tasks
3. I do not reach for this tool instead of going directly to the terminal myself

### Time-box

The prototype must be in testers' hands within 6 weeks of development start. Self-testing should begin by end of Phase 2.

## Architecture

```
┌───────────────────────────────────────────┐
│           Electron Client (web/)          │
│                                           │
│  React + xterm.js                         │
│  Project/Task navigation (sidebar)        │
│  Agent terminal viewer (tabbed)           │
│  GraphQL client (urql or Apollo)          │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  Local SQLite (better-sqlite3)      │  │
│  │  - Terminal session state           │  │
│  │  - Agent PID tracking               │  │
│  │  - Terminal output ring buffer      │  │
│  │  - Auth tokens                      │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  PTY Manager (node-pty)                   │
│  - Spawns Claude Code locally             │
│  - Manages terminal sessions              │
│  - Streams I/O to xterm.js via IPC        │
│                                           │
└──────────┬──────────────────────────────────┘
           │ GraphQL/HTTP + WebSocket
           │ (projects, tasks, subscriptions)
           ▼
┌─────────────────────────────────────────┐
│         Bun Backend (backend/)          │
│                                         │
│  GraphQL API (graphql-yoga)             │
│  Prisma + Postgres                      │
│  WebSocket server (GraphQL subs)        │
│  Token-based auth                       │
│                                         │
└──────────┬──────────────────────────────┘
           │
   ┌───────┴───────┐
   │   Postgres    │
   │   (Docker)    │
   └───────────────┘
```

### Key Architectural Insight: Split State

**Server-side (Postgres):** Shared, collaborative state — projects, tasks, task status, descriptions. This is the data multiple users need to see and modify.

**Client-side (SQLite):** Local agent/terminal state — PIDs, terminal session info, output ring buffers, agent runtime status. Local agents are local; their runtime state should not live on a server. This means:
- The server does NOT know about running agent processes
- Each Electron client tracks its own terminal sessions independently
- Agent status displayed in the UI comes from the local SQLite, not from the server
- Task status (TODO, IN_PROGRESS, etc.) syncs to the server; agent/terminal session status stays local
- On client startup, the client sweeps its local SQLite for stale sessions (PIDs that no longer exist) and marks them as terminated

### PTY Architecture: node-pty in the Client

Because agents are local, the PTY management (node-pty) lives in the Electron main process, not on the backend server. This means:
- Terminal I/O does NOT traverse the network — xterm.js connects to node-pty within the same Electron app via IPC
- The backend is purely for shared data (projects, tasks) and collaboration
- No PTY WebSocket endpoint on the server (eliminating server-side PTY security concerns entirely)
- The client-side SQLite tracks which task is associated with which terminal session/PID

### tmux Consideration

node-pty is sufficient for Orca's needs:
- node-pty spawns PTY sessions directly, giving full control over the process lifecycle
- xterm.js renders the terminal output in the Electron app natively
- tmux would add an external dependency users must install
- tmux session management adds complexity without clear benefit when we already have programmatic PTY control
- If session persistence across client restarts becomes important later, tmux could be reconsidered

### WebSocket Channels

Two separate concerns, simplified by the client-side PTY architecture:
1. **GraphQL subscriptions** (client ↔ server): Real-time task status updates, project changes, and collaboration events between multiple users
2. **Terminal I/O** (within Electron): node-pty streams directly to xterm.js via Electron IPC — no network WebSocket needed

## Auth

### Prototype Auth Design

For the prototype, auth is simple token-based:

1. **Server generates a session token** on startup (or on first run) — stored in a config file
2. **Client stores the token** in its local SQLite `auth_token` table
3. **All GraphQL requests** include the token in the `Authorization` header
4. **GraphQL subscriptions** pass the token during WebSocket handshake
5. **No user accounts** in the prototype — the token is a shared secret for the deployment

For team testing, the server generates a token that is shared with testers (e.g., via a setup script or displayed on first run). Sufficient for a prototype, easy to upgrade to proper user accounts later.

### Security

- **Server binding**: Backend binds to `127.0.0.1` in development mode (configurable for deployment)
- **GraphQL endpoint**: Token required for all requests
- **WebSocket subscriptions**: Authenticated via the same token mechanism
- **Client-side PTY**: Runs under the user's own OS permissions, same as opening a terminal directly

## Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Bun | Fast, TS-native, built-in WebSocket support |
| Server Database | Postgres (Docker) | Production-ready, deployable from day one for team testing |
| Client Database | better-sqlite3 | Local terminal/agent state; synchronous, embedded, zero-config |
| ORM | Prisma (server) | Strong TS integration, migration tooling for Postgres |
| API | GraphQL (graphql-yoga, schema-first) | Flexible, future-proof for multiple clients (mobile, VS Code extension). Declarative contract between client and server |
| Schema | GraphQL SDL in shared/ | Source-of-truth schema as SDL, shared across backend and web |
| Type Generation | graphql-codegen | Generate TypeScript types for both backend and web from the SDL |
| Real-time | GraphQL Subscriptions over WebSocket | Task/project status updates across clients |
| Client | Electron + React (via electron-vite) | Desktop app with embedded terminal; accessible to non-developers |
| Terminal | xterm.js | Embedded terminal rendering in Electron |
| Agent PTY | node-pty (in Electron main process) | Spawning and managing Claude Code CLI sessions locally |
| Styling | Tailwind CSS | Fast UI iteration |
| Monorepo | Bun workspaces | Shared GraphQL schema/types between backend and web |

## Data Model

### Server-side (Prisma / Postgres)

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
  workingDirectory String     // Local path where the agent runs (e.g. repo checkout)
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

### Client-side (SQLite via better-sqlite3)

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

### Terminal Session Status Values

| Status | Meaning |
|--------|---------|
| IDLE | Session created but not yet started |
| STARTING | PTY process is spawning |
| RUNNING | Agent is actively executing |
| WAITING_FOR_INPUT | Agent is blocked waiting for user input (detected via PTY output patterns). Surfaces in UI to elevate tasks needing attention. |
| COMPLETED | Agent finished successfully |
| ERROR | Agent crashed or was terminated unexpectedly |

### Status Transition Rules

Task status and terminal session status are coordinated:
- Agent starts (PTY spawns) → session becomes STARTING then RUNNING; task moves to IN_PROGRESS (synced to server)
- Agent completes → session becomes COMPLETED; task moves to IN_REVIEW (synced to server)
- Agent errors → session becomes ERROR; task stays IN_PROGRESS (user can retry)
- Agent detects input prompt → session becomes WAITING_FOR_INPUT; task stays IN_PROGRESS
- User manually changes task status → no effect on terminal session status (independent in this direction)

### Task ↔ Terminal Session Relationship

Tasks have a 1:1 relationship with terminal sessions for now. A task can have at most one active terminal session. If the user wants to retry, the previous session is marked COMPLETED or ERROR and a new session is created. This can be migrated to one-to-many later if users need history of previous runs.

## Project Structure

```
orca/
├── backend/                # Bun backend server
│   ├── src/
│   │   ├── index.ts              # Entry point, HTTP + WS server
│   │   ├── schema/
│   │   │   ├── index.ts          # GraphQL schema setup (graphql-yoga)
│   │   │   ├── project.ts        # Project resolvers
│   │   │   └── task.ts           # Task resolvers
│   │   ├── db/
│   │   │   └── client.ts         # Prisma client
│   │   └── auth/
│   │       └── token.ts          # Token generation and validation
│   ├── prisma/
│   │   └── schema.prisma
│   ├── codegen.ts                # graphql-codegen config (server)
│   └── package.json
├── web/                    # Electron + React client
│   ├── src/
│   │   ├── main/                 # Electron main process
│   │   │   ├── index.ts
│   │   │   ├── pty/
│   │   │   │   ├── manager.ts    # PTY lifecycle management (node-pty)
│   │   │   │   └── output-buffer.ts  # Ring buffer for terminal output
│   │   │   ├── db/
│   │   │   │   ├── client.ts     # better-sqlite3 client
│   │   │   │   ├── migrations.ts # SQLite schema setup
│   │   │   │   └── sessions.ts   # Terminal session CRUD
│   │   │   └── ipc/
│   │   │       └── handlers.ts   # IPC handlers for renderer ↔ main
│   │   ├── renderer/             # React app
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── Sidebar.tsx       # Project/task navigation
│   │   │   │   │   └── AppShell.tsx      # Main layout wrapper
│   │   │   │   ├── projects/
│   │   │   │   │   ├── ProjectList.tsx
│   │   │   │   │   └── ProjectDetail.tsx
│   │   │   │   ├── tasks/
│   │   │   │   │   ├── TaskList.tsx
│   │   │   │   │   ├── TaskDetail.tsx
│   │   │   │   │   └── TaskStatus.tsx
│   │   │   │   ├── terminal/
│   │   │   │   │   ├── AgentTerminal.tsx  # xterm.js terminal component
│   │   │   │   │   ├── TerminalTabs.tsx   # Tab switcher for multiple terminals
│   │   │   │   │   └── AgentStatus.tsx    # Agent status indicator
│   │   │   │   └── markdown/
│   │   │   │       └── MarkdownRenderer.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useGraphQL.ts          # GraphQL client hook
│   │   │   │   └── useTerminal.ts         # Terminal session management hook
│   │   │   ├── graphql/
│   │   │   │   ├── queries.ts             # GraphQL query documents
│   │   │   │   ├── mutations.ts           # GraphQL mutation documents
│   │   │   │   └── subscriptions.ts       # GraphQL subscription documents
│   │   │   └── App.tsx
│   │   └── preload/
│   │       └── index.ts                   # Preload script exposing IPC
│   ├── codegen.ts                         # graphql-codegen config (client)
│   └── package.json
├── shared/                 # Shared GraphQL schema and types
│   ├── src/
│   │   ├── schema.graphql          # Source-of-truth GraphQL SDL
│   │   └── types.ts                # Shared enums, constants
│   └── package.json
├── docker-compose.yml      # Postgres
├── package.json            # Workspace root
└── bunfig.toml
```

## Implementation Phases

### Phase 1: Dev Environment, Scaffolding & Gating Checks

**Goal**: Everything starts, connects, and the riskiest technical assumption is validated.

- Initialize Bun workspace monorepo with `backend/`, `web/`, `shared/` at root level
- Docker Compose with Postgres
- Prisma schema (Project, Task) + initial migration
- Bun server with health check endpoint
- Electron app shell (electron-vite + React)
- Set up better-sqlite3 in Electron main process with initial schema (terminal_session, terminal_output_buffer, auth_token tables)
- **Gating check: node-pty in Electron main process** — spawn a PTY process from Electron's main process, verify it works. If it does not work, document the fallback (Node.js child_process with pseudo-TTY) before proceeding.
- Verify: `docker compose up` starts Postgres, `bun run dev` starts both backend and Electron client, both databases initialize

### Phase 2: Data Layer, GraphQL API & Navigation UI

**Goal**: Full project/task CRUD through the UI with sidebar navigation. Self-testing begins.

- Define GraphQL schema in `shared/schema.graphql` (Project, Task types, queries, mutations, subscriptions)
- Set up graphql-codegen for both backend and web
- Implement graphql-yoga resolvers on the backend:
  - `projects` (list), `project` (by id), `createProject`, `updateProject`, `deleteProject`
  - `tasks` (by project), `task` (by id), `createTask`, `updateTask`, `deleteTask`
- Set up GraphQL client in Electron renderer
- Implement prototype auth: server generates token, client stores and sends it
- Server binds to `127.0.0.1` in dev mode
- Build navigation UI:
  - Sidebar with project list
  - Project detail view with task list
  - Task detail view with markdown-rendered description
  - Task status management (TODO, IN_PROGRESS, IN_REVIEW, DONE)
- Set up GraphQL subscriptions over WebSocket for real-time task/project updates
- **Self-testing checkpoint**: Start using the project/task management UI for real work

### Phase 3: Terminal Engine & Agent UX (Core Differentiator)

**Goal**: Launch Claude Code from a task, see live terminal output, manage multiple agents. Error handling is core to this phase.

- PTY Manager in Electron main process:
  - Spawn Claude Code via node-pty in the task's working directory (Task.workingDirectory)
  - Track session in local SQLite (PID, status, task association)
  - SIGTERM/SIGINT handlers to clean up PTY processes on app quit
  - On app startup: sweep local SQLite for stale sessions (check PIDs), mark dead sessions as ERROR/COMPLETED
- Terminal output ring buffer:
  - Store last N bytes of output per session in SQLite
  - On tab switch or reconnect, replay buffer into xterm.js
- xterm.js terminal component connected to node-pty via Electron IPC
- Agent launch UX:
  - "Launch Agent" button on tasks → spawns Claude Code in Task.workingDirectory
  - Default: start a blank Claude Code TUI
  - Optional: user can choose to pass task title/description as initial context
- Agent status indicators on task cards (color-coded, including WAITING_FOR_INPUT to elevate tasks needing attention)
- WAITING_FOR_INPUT detection: pattern matching on PTY output to detect when Claude Code is waiting for user input
- Tabbed terminal view for switching between active agent sessions
- Status transition enforcement: agent starts → task IN_PROGRESS, agent completes → task IN_REVIEW, agent errors → task stays IN_PROGRESS
- **Error handling** (core to this phase, not polish):
  - Human-readable error messages for common failures:
    - Claude Code not installed or not on PATH
    - Claude Code auth not configured
    - PTY spawn failure
    - Process crash during execution
  - Each error message includes a "what to do next" suggestion
  - Agent restart capability for errored sessions

### Phase 4: Polish, Security Hardening & Distribution

**Goal**: Ready for teammates to test.

- Auth hardening:
  - Server generates a persistent token (stored in config)
  - Token shared with testers via setup script or displayed on first run
  - All GraphQL requests and subscriptions require valid token
- PID tracking improvements:
  - Periodic sweep (e.g., every 60s) checking if tracked PIDs are still alive
  - Graceful cleanup on app close (SIGTERM all managed PTY processes)
- UI polish:
  - Onboarding flow (create project → create task with working directory → launch agent)
  - Keyboard shortcuts for common actions
  - Terminal resizing support
- README with setup instructions for testers
- Package Electron app for macOS distribution (electron-builder)
- Test with 2-3 simultaneous agents to verify stability

## Verification

1. `docker compose up` starts Postgres
2. `bun run dev` starts both backend and Electron client
3. Local SQLite database initializes in Electron on first run
4. Create a project and tasks (with working directory) through the sidebar UI
5. Markdown renders correctly in project/task descriptions
6. Click "Launch Agent" on a task → Claude Code starts in the embedded terminal
7. See live terminal output in the embedded xterm.js terminal
8. Switch between terminal tabs → output ring buffer replays previous output
9. Agent status updates (RUNNING, WAITING_FOR_INPUT, COMPLETED, ERROR) display correctly
10. Task status automatically transitions when agent status changes
11. Open multiple agents, switch between them in the tabbed view
12. Stop an agent → terminal session status updates to COMPLETED, task to IN_REVIEW
13. Close and reopen Electron → stale sessions detected and marked appropriately
14. Test with 2-3 simultaneous agents to verify stability
15. Test error scenarios: kill agent process externally, verify error message appears
16. **User validation**: Do I reach for Orca instead of raw terminal tabs?

## Key Risks & Mitigations

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| node-pty + Electron compatibility | Medium | High | Gating test in Phase 1. Fallback: Node.js child_process with pseudo-TTY |
| node-pty native module rebuild for Electron | Medium | High | electron-rebuild handles native modules; test early |
| better-sqlite3 in Electron | Low | Medium | Well-established pattern (used by Signal, VS Code extensions). Native module rebuild required |
| xterm.js rendering performance with verbose output | Low | Medium | Ring buffer caps memory; xterm.js handles high throughput well in practice |
| Electron + Vite setup complexity | Low | Medium | Use electron-vite which handles the config |
| Claude Code interactive prompt detection | Medium | Medium | Pattern match on PTY output for known prompt patterns. May need updates as Claude Code UI changes |
| graphql-codegen + Bun compatibility | Low | Low | Runs as a build step; can use Node.js for codegen if needed |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users don't need a GUI for agent management | Medium | Critical | Kill criterion #3: if I don't reach for Orca over raw terminal, stop |
| UX adds too much friction over raw terminal | Medium | High | Kill criterion #1: keep UX close to terminal. Default to blank TUI, don't force context |
| Terminal state management is unreliable | Medium | High | Kill criterion #2: invest in PID tracking, stale session cleanup, error recovery |
| Scope creep delays getting to testers | Medium | High | 6-week time-box. Self-testing starts end of Phase 2 |
| Non-developer users find the terminal intimidating | Low | Medium | UX should make the terminal approachable; consider guided onboarding |

## Deviations from BEGINNING.md

| BEGINNING.md | This Plan | Why |
|---|---|---|
| Workspace → Project → Task | Project → Task | Workspaces add an entity-creation step before users reach the core action. Projects and Tasks are sufficient for the prototype. Can add Workspaces later if team/org separation is needed. |
| tmux | node-pty + xterm.js | tmux is an external dependency users must install. node-pty spawns PTY sessions directly in the Electron process, and xterm.js renders them in-app. Cleaner UX, fewer external dependencies, and full programmatic control. |
| Server-side agent management | Client-side PTY + local SQLite | Local agents are local. Their runtime state (PIDs, terminal output, session status) belongs on the client, not the server. The server stores only shared collaborative state (projects, tasks). This eliminates server-side PTY security concerns. |
