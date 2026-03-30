# Orca

[**Download the latest release**](https://github.com/ky1ejs/orca/releases/latest)

![](./docs/orca-screenshot.png)

## What is Orca?

Orca brings project management and agent orchestration into one tool.

## Why is Orca?

### The problem
Paralellizing your work across multiple AI agents in multiple terminal tabs, tools and web apps doesn't scale. 

You lose track of what each agent is doing, which ones need input, and how their work maps to you projects and the bigger picture. 

Existing project management tools (e.g. Linear, Jira, Asana) are the natural home of context and metadata for what work is being carried out by whom, but they can't show you a live view of both your local agents and your background agents. 

Orca aims to solve this problem in one common interface so you can see where best to direct your attention while agents do thy bidding.

### Orca's approach

**Local and background agents are first class member of the tool**<br>
Orca treats agent sessions as first-class objects tied to tasks and offer a integrated terminal experience for managing local agents. Every session has a status, a terminal, and a place in your project hierarchy.

**Automate the admin of project management**<br>
Orca injects context into both local and background agents sessions so that agents can: 
- report progress
- create relationships and add to context in the wider work
- break bigger chunks of work into smaller tasks that in turn can be assigned to agents and monitored

## Features

1. **Project & Task Management**: Create workspaces, projects, and tasks with rich metadata (status, priority, labels, assignees). Real-time collaboration via GraphQL subscriptions.
2. **Agent Terminal Integration**: Launch Claude Code agents directly from tasks, with live output streaming in a tabbed terminal view. Status indicators and output replay for session management.
3. **PTY Daemon**: Agent processes run in a separate daemon that survives Electron restarts.
4. **GitHub PR Integration**: Orca's backend auto-link tasks to GitHub PRs, with status sync and quick access to code reviews. Agents are also aware of PR context when working on related tasks.
5. **Agent status tracking**: Orca detects when agents are waiting for user input vs. actively working, and surfaces this in the UI via status indicators, dock icon badge and menu bar status tracking to help you prioritize your attention.
6. **Orca CLI, MCP and API**: Agents can acccess project data and context and update it as they work (e.g. if agents identify further work that is too big to include in the work you're doing, they can automatically create projects and tasks to handle this separately.)

## Desktop App

- macOS Electron app with auto-updates (checks on launch, then every 4 hours)
- Onboarding wizard: Welcome, Create Project, Create Task, Open Terminal
- Diagnostics export (ZIP with system info, daemon logs, main process logs)
- Keyboard shortcuts with context-aware disabling (disabled when terminal is focused)

## Development Pre-requisites

- **[Bun](https://bun.sh/)** (v1.0+) -- JavaScript runtime and package manager
- **[Docker](https://www.docker.com/)** -- for running Postgres
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** -- the AI agent that Orca orchestrates (must be on your PATH)

## Quick Start

### 1. Clone and install dependencies

```bash
git clone https://github.com/ky1ejs/orca.git
cd orca

# Install root dependencies
bun install

# Install each package's dependencies
cd backend && bun install && cd ..
cd web && bun install && cd ..
```

### 2. Start Postgres

```bash
docker compose up -d
```

### 3. Set up the database

```bash
cd backend
bunx prisma migrate deploy
cd ..
```

### 4. Generate code

```bash
cd backend && bun run codegen 
cd web && bun run codegen 
```

### 5. Start the app

```bash
cd backend && bun run dev
cd web && bun bun run dev
```

## Testing
### For browser testing (without Electron)

If you want to test the UI in a regular browser via the Vite dev server:

1. Find your token: `cat ~/.orca/config.json`
2. Create `web/.env` with: `VITE_AUTH_TOKEN=<your-token>`
3. Open `http://localhost:5173` in your browser

## Architecture


### Overview

```
+-------------------------------------+
|       Electron Client (web/)        |
|                                     |
|  React + xterm.js                   |
|  Project/Task navigation            |
|  Agent terminal viewer (tabbed)     |
+----------+--------------------------+
           | IPC
           v
+-------------------------------------+
|     PTY Daemon (~/.orca/)           |
|                                     |
|  node-pty (agent processes)         |
|  SQLite (terminal sessions)         |
|  Claude Code hook server            |
+----------+--------------------------+
           |
           | GraphQL + SSE
           v
+-------------------------------------+
|       Bun Backend (backend/)        |
|                                     |
|  graphql-yoga + Prisma + Postgres   |
|  Projects, tasks, collaboration     |
+-------------------------------------+
```

**Split-state design:** The server holds shared collaborative data (projects, tasks, workspaces). The client holds local agent state (terminal sessions, PIDs, output buffers) in a daemon process. Agent processes run locally -- their runtime state never leaves your machine.

### PTY Daemon

Agent processes run in a separate daemon that survives Electron restarts (e.g. during auto-updates):

```
[Renderer] <--IPC--> [Electron Main] <--Unix Socket--> [Daemon]
```

- Communicates over NDJSON on a Unix domain socket (`~/.orca/daemon.sock`)
- Owns all PTY processes (node-pty) and a local SQLite database (`~/.orca/orca.db`)
- **Startup sweep:** Detects orphaned sessions (RUNNING/STARTING status but PID dead) and marks them as ERROR
- **Periodic PID sweep:** Background monitor checks tracked PIDs and reaps dead sessions
- **Graceful shutdown:** On app close, sends SIGTERM to all managed PTY processes
- **Idle timeout:** 5-minute safety net shuts down the daemon if no clients are connected and no sessions are active

### Worktrees & Agent Isolation

Each agent session runs in its own [git worktree](https://git-scm.com/docs/git-worktree), giving it an isolated working directory, port, and database. The daemon creates worktrees on agent launch and runs a repo-provided bootstrap hook to set up resources. See **[Worktrees & Bootstrapping](docs/worktrees.md)** for the full reference on lifecycle, hook setup, environment variables, and deterministic resource isolation.

## Tech Stack

| Layer     | Technology                       |
| --------- | -------------------------------- |
| Runtime   | Bun                              |
| Server DB | Postgres                         |
| Client DB | SQLite (better-sqlite3)          |
| ORM       | Prisma                           |
| API       | GraphQL (graphql-yoga)           |
| Client    | Electron + React (electron-vite) |
| Terminal  | xterm.js + node-pty              |
| Styling   | Tailwind CSS                     |

## Development

### Scripts

| Command                | Description                            |
| ---------------------- | -------------------------------------- |
| `bun run dev`          | Start backend + web concurrently       |
| `bun run lint`         | ESLint                                 |
| `bun run lint:fix`     | ESLint with auto-fix                   |
| `bun run format`       | Prettier (write)                       |
| `bun run format:check` | Prettier (check only)                  |
| `bun run typecheck`    | TypeScript check all packages          |
| `bun run test`         | Vitest all packages                    |
| `bun run validate`     | lint + format:check + typecheck + test |
| `docker compose up -d` | Start Postgres                         |
| `docker compose down`  | Stop Postgres                          |

### Web package scripts

| Command                       | Description                          |
| ----------------------------- | ------------------------------------ |
| `cd web && bun run dev`       | Start Electron client only           |
| `cd web && bun run build`     | Build the Electron app               |
| `cd web && bun run build:mac` | Build macOS distribution (DMG + zip) |

### Running checks

```bash
# Run all validation (lint, format, typecheck, test)
bun run validate
```

## Building for Distribution

### macOS

```bash
cd web
bun run build:mac
```

This produces a DMG and zip in `web/dist-electron/`. The build uses electron-builder with:

- macOS DMG installer with drag-to-Applications
- Universal binary support (arm64 + x64)
- Hardened runtime for macOS security requirements

### Sharing with testers

1. Build the app: `cd web && bun run build:mac`
2. Share the `.dmg` file from `web/dist-electron/`
3. Testers need Docker running with `docker compose up -d` from the repo root
4. Testers need the backend running: `cd backend && bun run dev`
5. The auth token is generated automatically on first backend run

## Project Structure

```
orca/
├── backend/     # Bun server -- GraphQL API, Prisma, Postgres, GraphQL schema
├── web/         # Electron + React client -- terminals, local state
│   └── src/
│       ├── daemon/     # PTY daemon -- session management, SQLite, hook server
│       ├── main/       # Electron main process -- IPC relay, auth, auto-updates
│       ├── renderer/   # React UI -- projects, tasks, terminals
│       ├── shared/     # Electron-independent modules shared by daemon and main
│       └── preload/    # Preload scripts exposing window.orca API
└── docs/        # Implementation plans
```

## Status

Active development. The core workflow is functional: create workspaces and projects, manage tasks, launch Claude Code agents, and monitor their output in real time. Currently used for self-validation, expanding to a small group of teammates for feedback.

## License

Not yet determined.
