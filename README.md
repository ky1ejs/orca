# Orca

Work management for AI agents. Orchestrate local Claude Code agents from a single UI instead of juggling terminal tabs.

## What is Orca?

Orca connects project management to agent orchestration. Create projects and tasks, launch Claude Code agents against them, and see every agent's status and terminal output at a glance — all from one Electron desktop app.

**Core idea:** Running multiple AI agents in terminal tabs doesn't scale. You lose track of what each agent is doing, which ones need input, and how their work maps to your project. Orca solves this by treating agent sessions as first-class objects tied to tasks.

## Architecture

```
┌─────────────────────────────────────┐
│       Electron Client (web/)        │
│                                     │
│  React + xterm.js                   │
│  Project/Task navigation            │
│  Agent terminal viewer (tabbed)     │
│  Local SQLite (terminal sessions)   │
│  node-pty (agent process mgmt)      │
└──────────┬──────────────────────────┘
           │ GraphQL + WebSocket
           ▼
┌─────────────────────────────────────┐
│       Bun Backend (backend/)        │
│                                     │
│  graphql-yoga + Prisma + Postgres   │
│  Projects, tasks, collaboration     │
└─────────────────────────────────────┘
```

**Split-state design:** The server holds shared collaborative data (projects, tasks). The client holds local agent state (terminal sessions, PIDs, output buffers). Agent processes run locally — their runtime state never leaves your machine.

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

```bash
# Install dependencies
bun install

# Start Postgres
docker compose up -d

# Start backend + Electron client
bun run dev

# Run all checks
bun run validate
```

### Scripts

| Command             | Description                            |
| ------------------- | -------------------------------------- |
| `bun run dev`       | Start backend + web concurrently       |
| `bun run lint`      | ESLint                                 |
| `bun run format`    | Prettier (write)                       |
| `bun run typecheck` | TypeScript check all packages          |
| `bun run test`      | Vitest all packages                    |
| `bun run validate`  | lint + format:check + typecheck + test |

## Project Structure

```
orca/
├── backend/     # Bun server — GraphQL API, Prisma, Postgres
├── web/         # Electron + React client — terminals, local state
├── shared/      # Shared types and GraphQL schema
└── docs/        # Implementation plans
```

## Status

Early development. Building toward a prototype for self-validation, then 5–10 teammates for feedback.

## License

Not yet determined.
