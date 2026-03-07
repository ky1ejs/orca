# Orca Prototype Plan

## Context

Orca is a work management tool for orchestrating AI agents (starting with Claude Code). The core hypothesis to validate: **an agent orchestration UI is meaningfully better than managing agents in terminal tabs.** The prototype targets 5-10 developers for early feedback.

The architecture is client/server from day one — Electron desktop client connecting to a Bun backend over WebSockets — so teammates can collaborate and the system is deployable later.

## What We're Validating

The prototype needs to answer one question: *Do developers prefer managing their Claude Code agents through Orca over raw terminal tabs?*

To answer this, the MVP must deliver:
1. A dashboard showing all tasks with live agent status
2. Launch Claude Code from a task with one click
3. Embedded terminal (xterm.js) to see and interact with each agent
4. Ability to see multiple agents' status at a glance and switch between them

## Architecture

```
┌─────────────────────────┐       WebSocket/HTTP       ┌─────────────────────────┐
│   Electron Client       │ ◄─────────────────────────► │   Bun Backend           │
│                         │                             │                         │
│  React + xterm.js       │                             │  Prisma + Postgres      │
│  Task management UI     │                             │  Agent process manager  │
│  Agent terminal viewer  │                             │  node-pty (Claude Code) │
│                         │                             │  WebSocket server       │
└─────────────────────────┘                             └─────────────────────────┘
                                                                  │
                                                          ┌───────┴───────┐
                                                          │   Postgres    │
                                                          │   (Docker)    │
                                                          └───────────────┘
```

## Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Bun | Fast, TS-native, built-in WebSocket support |
| Database | Postgres (Docker) | Production-ready from day one |
| ORM | Prisma | Strong TS integration, migration tooling |
| API | tRPC | Type-safe client/server with minimal boilerplate. Much faster to prototype than GraphQL — can migrate to GraphQL later if needed |
| Real-time | WebSockets (native Bun) | Agent output streaming, status updates |
| Client | Electron + React (via electron-vite) | Desktop app with embedded terminal |
| Terminal | xterm.js + xterm-addon-attach | Embedded terminal connected to backend PTY via WebSocket |
| Agent PTY | node-pty | Spawning and managing Claude Code CLI sessions |
| Styling | Tailwind CSS | Fast UI iteration |
| Monorepo | Bun workspaces | Shared types between client/server |

## Data Model (Prisma)

```prisma
model Workspace {
  id        String   @id @default(uuid())
  name      String
  projects  Project[]
  createdAt DateTime @default(now())
}

model Project {
  id          String   @id @default(uuid())
  name        String
  description String?
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  workspaceId String
  tasks       Task[]
  createdAt   DateTime @default(now())
}

model Task {
  id          String     @id @default(uuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  project     Project    @relation(fields: [projectId], references: [id])
  projectId   String
  agent       Agent?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Agent {
  id        String      @id @default(uuid())
  status    AgentStatus @default(IDLE)
  task      Task        @relation(fields: [taskId], references: [id])
  taskId    String      @unique
  pid       Int?
  startedAt DateTime?
  stoppedAt DateTime?
  createdAt DateTime    @default(now())
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}

enum AgentStatus {
  IDLE
  STARTING
  RUNNING
  WAITING_FOR_INPUT
  COMPLETED
  ERROR
}
```

## Project Structure

```
orca/
├── packages/
│   ├── server/          # Bun backend
│   │   ├── src/
│   │   │   ├── index.ts           # Entry point, HTTP + WS server
│   │   │   ├── router.ts          # tRPC router
│   │   │   ├── agents/
│   │   │   │   ├── manager.ts     # Agent lifecycle management
│   │   │   │   └── pty.ts         # node-pty wrapper for Claude Code
│   │   │   ├── ws/
│   │   │   │   └── terminal.ts    # WebSocket handler for PTY streaming
│   │   │   └── db/
│   │   │       └── client.ts      # Prisma client
│   │   └── package.json
│   ├── client/          # Electron + React
│   │   ├── src/
│   │   │   ├── main/              # Electron main process
│   │   │   ├── renderer/          # React app
│   │   │   │   ├── components/
│   │   │   │   │   ├── TaskBoard.tsx
│   │   │   │   │   ├── TaskCard.tsx
│   │   │   │   │   ├── AgentTerminal.tsx
│   │   │   │   │   └── AgentStatus.tsx
│   │   │   │   ├── hooks/
│   │   │   │   └── App.tsx
│   │   │   └── preload/
│   │   └── package.json
│   └── shared/          # Shared types
│       ├── src/
│       │   └── types.ts
│       └── package.json
├── prisma/
│   └── schema.prisma
├── docker-compose.yml   # Postgres
├── package.json         # Workspace root
└── bunfig.toml
```

## Implementation Phases

### Phase 1: Dev Environment & Scaffolding
- Initialize Bun workspace monorepo
- Docker Compose with Postgres
- Prisma schema + initial migration
- Bun server with health check endpoint
- Electron app shell (electron-vite + React)
- Verify everything starts and connects

### Phase 2: Data Layer & API
- Prisma client setup
- tRPC router with CRUD procedures:
  - `workspace.create`, `workspace.get`
  - `project.create`, `project.list`, `project.get`
  - `task.create`, `task.list`, `task.update`, `task.get`
- Connect Electron client to tRPC
- Basic task list/board UI (no agents yet)

### Phase 3: Agent Engine (Core Differentiator)
- `AgentManager` class: spawn, stop, restart Claude Code via node-pty
- WebSocket endpoint for PTY streaming (`/ws/terminal/:agentId`)
- Agent lifecycle: IDLE -> STARTING -> RUNNING -> COMPLETED/ERROR
- Agent status broadcasting via WebSocket subscriptions
- Store agent state in Postgres

### Phase 4: Agent UX in Electron
- "Launch Agent" button on tasks -> spawns Claude Code with task context
- xterm.js terminal component connected to backend WebSocket
- Agent status indicators on task cards (color-coded)
- Split/tabbed view for multiple agent terminals
- Real-time status updates across the UI

### Phase 5: Polish & Share
- Error handling for agent crashes/disconnects
- Agent restart capability
- Basic onboarding flow (create workspace -> project -> task -> launch agent)
- README with setup instructions for testers
- Package for distribution to test group

## Verification

1. `docker compose up` starts Postgres
2. `bun run dev` starts both server and Electron client
3. Create a workspace -> project -> task through the UI
4. Click "Launch Agent" on a task -> Claude Code starts on the backend
5. See live terminal output in the embedded xterm.js terminal
6. Open multiple agents, switch between them
7. Agent status updates in real-time on the task board
8. Stop an agent -> status updates to COMPLETED
9. Test with 2-3 simultaneous agents to verify stability

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| node-pty + Bun compatibility | Test early in Phase 1. Fallback: use Node.js subprocess for PTY management |
| xterm.js WebSocket latency | Use binary WebSocket frames, test with verbose agent output |
| Electron + Vite setup complexity | Use electron-vite which handles the config |
| Claude Code interactive prompts | Detect "waiting for input" patterns in PTY output to update agent status |

## Deviations from BEGINNING.md

| BEGINNING.md | This Plan | Why |
|---|---|---|
| GraphQL | tRPC | Single client (Electron) doesn't need GraphQL's flexibility. tRPC gives type-safe RPC with ~5x less boilerplate. Can migrate later if multiple clients emerge. |
| tmux | node-pty + xterm.js | tmux is a dependency users must install. node-pty spawns PTY sessions directly, and xterm.js renders them in-app. Cleaner UX, fewer external dependencies. |
