# Orca

Work management for AI agents. Orchestrate local Claude Code agents from a single UI instead of juggling terminal tabs.

## What is Orca?

Orca connects project management to agent orchestration. Create projects and tasks, launch Claude Code agents against them, and see every agent's status and terminal output at a glance -- all from one Electron desktop app.

**Core idea:** Running multiple AI agents in terminal tabs doesn't scale. You lose track of what each agent is doing, which ones need input, and how their work maps to your project. Orca solves this by treating agent sessions as first-class objects tied to tasks.

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
|  Local SQLite (terminal sessions)   |
|  node-pty (agent process mgmt)      |
+----------+--------------------------+
           | GraphQL + SSE
           v
+-------------------------------------+
|       Bun Backend (backend/)        |
|                                     |
|  graphql-yoga + Prisma + Postgres   |
|  Projects, tasks, collaboration     |
+-------------------------------------+
```

**Split-state design:** The server holds shared collaborative data (projects, tasks). The client holds local agent state (terminal sessions, PIDs, output buffers). Agent processes run locally -- their runtime state never leaves your machine.

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
└── docs/        # Implementation plans
```

## Process Management

Orca tracks all spawned agent processes (PIDs) and manages their lifecycle:

- **Startup sweep:** On app launch, detects sessions left in RUNNING/STARTING state from a previous run and marks them as ERROR
- **Periodic sweep:** Every 60 seconds, checks if tracked PIDs are still alive. Dead processes are marked as ERROR and the UI is notified
- **Graceful shutdown:** On app close, sends SIGTERM to all managed PTY processes for clean termination

## Status

Early development. Building toward a prototype for self-validation, then 5-10 teammates for feedback.

## License

Not yet determined.
