# Orca

Work management for AI agents. Orchestrate local Claude Code agents from a single UI instead of juggling terminal tabs.

## What is Orca?

Orca connects project management to agent orchestration. There's a natural relationship between the two: you break work into tasks in a PM tool, then assign those tasks to agents. Orca makes that loop seamless -- create tasks, launch Claude Code agents against them, and see every agent's status and terminal output at a glance from one desktop app.

**The problem:** Running multiple AI agents in terminal tabs doesn't scale. You lose track of what each agent is doing, which ones need input, and how their work maps to your project. Existing PM tools (Linear, Jira, Asana) hold the metadata but can't show you a live view of your local agents or let you interact with them.

**Orca's approach:** Treat agent sessions as first-class objects tied to tasks. Every session has a status, a terminal, and a place in your project hierarchy.

## Features

### Project & Task Management

- Workspaces, projects, and tasks with a full CRUD workflow
- Task fields: status (Todo, In Progress, In Review, Done), priority (None, Low, Medium, High, Urgent), labels, assignee, markdown descriptions
- Auto-generated display IDs (e.g. `ORCA-42`) for easy reference
- Per-project default working directory for agent sessions
- Real-time collaboration via GraphQL subscriptions -- task and project changes broadcast to all workspace members

### Agent Terminal Integration

- Launch Claude Code agents directly from a task, with standard or plan permission modes
- Tabbed terminal view with live output streaming via xterm.js
- Status indicators per session: running (green), starting (blue), needs permission (orange pulse), waiting for input (orange pulse), exited (gray), error (red)
- Output replay -- terminal history is stored and replayed when you reopen a session
- Input detection via Claude Code lifecycle hooks -- Orca knows when an agent is waiting for your input vs. actively working
- Per-task session list with support for multiple concurrent sessions

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

### Workspace Collaboration

- Multi-user workspaces with Owner and Member roles
- Invite teammates by email -- invitations expire after 7 days
- Pending invitations shown in the sidebar; accept or decline inline
- Per-workspace labels with custom colors for organizing tasks

### Desktop App

- macOS Electron app with auto-updates (checks on launch, then every 4 hours)
- Onboarding wizard: Welcome, Create Project, Create Task, Open Terminal
- Diagnostics export (ZIP with system info, daemon logs, main process logs)
- Keyboard shortcuts with context-aware disabling (disabled when terminal is focused)

### Auth

- JWT-based email/password authentication (tokens expire after 30 days)
- Self-registration with invite codes
- Secure token storage via the OS keychain (Electron `safeStorage`)
- Default dev user via `bun run seed:dev` for local development

## Prerequisites

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
cd backend && bun run codegen && cd ..
cd web && bun run codegen && cd ..
```

### 5. Start the app

```bash
bun run dev
```

This starts both the backend server and the Electron client concurrently.

## Authentication

On first run, the backend generates an auth token and saves it to `~/.orca/config.json`. This token is shared between the backend and Electron client.

### How it works

- The backend generates a persistent token on first startup
- The Electron client reads the token automatically from `~/.orca/config.json`
- All GraphQL requests (queries, mutations, and SSE subscriptions) require a valid token
- Requests without a token or with an invalid token are rejected with a clear error

### For browser testing (without Electron)

If you want to test the UI in a regular browser via the Vite dev server:

1. Find your token: `cat ~/.orca/config.json`
2. Create `web/.env` with: `VITE_AUTH_TOKEN=<your-token>`
3. Open `http://localhost:5173` in your browser

## Architecture

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
