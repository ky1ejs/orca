# Orca

## Workflow

You must NEVER make changes on main or in the main worktree. Always create a worktree before starting any work using the /create-worktree skill.

## Architecture

Orca is a work management tool for orchestrating AI agents (starting with Claude Code). It uses a **split-state client/server architecture**:

- **Server (backend/)**: Bun + GraphQL (graphql-yoga) + Prisma + Postgres — shared collaborative state (projects, tasks)
- **Client (web/)**: Electron + React (via electron-vite) — local agent/terminal state in SQLite (better-sqlite3), PTY management (node-pty), terminal rendering (xterm.js)
- **Shared (shared/)**: GraphQL SDL schema, shared TypeScript types and enums

The server holds data multiple users need (projects, tasks, status). The client holds local-only data (terminal sessions, PIDs, output buffers). Agent processes run locally via node-pty in the Electron main process.

## Monorepo Structure

Three independent packages, each with its own `bun install`:

- `@orca/shared` — shared types, GraphQL schema
- `@orca/backend` — Bun server
- `@orca/web` — Electron + React client

No workspaces — each package manages its own dependencies with `bun install`. Import shared code as `@orca/shared` (resolved via `file:../shared`).

## Code Style

- **ESLint** — flat config (`eslint.config.js`), TypeScript + React rules
- **Prettier** — single quotes, trailing commas, semicolons, 100 char width
- Run `bun run validate` before pushing (lint + format:check + typecheck + test)

## Testing

- **Vitest** for all packages
- Test files: `*.test.ts` / `*.test.tsx`, co-located next to source files
- Run: `bun run test` (runs all workspace tests via vitest workspace)

## GraphQL

- **Schema-first**: SDL defined in `shared/src/schema.graphql`
- **graphql-codegen** generates TypeScript types for both backend and web
- Resolvers in `backend/src/schema/`

## UI Validation in Browser

You can visually validate the UI by opening the Vite dev server in Chrome using your `claude-in-chrome` browser tools.

### Setup
1. Ensure `VITE_AUTH_TOKEN` is set in `web/.env` (token from `~/.orca/config.json`)
2. Start the backend and web: `bun run dev` (from the worktree root, or separately in `backend/` and `web/`)
3. The Vite dev server runs on `http://localhost:5173`

### Viewing the UI
1. Use `mcp__claude-in-chrome__tabs_create_mcp` to create a new Chrome tab
2. Navigate to `http://localhost:5173` with `mcp__claude-in-chrome__navigate`
3. Take screenshots with `mcp__claude-in-chrome__computer` (action: `screenshot`)
4. Interact with elements using `computer` (clicks), `read_page` (accessibility tree), and `find` (search for elements)

### What works in browser
- Layout, styling, and component rendering
- Navigation and interaction flows
- All GraphQL-driven data (projects, tasks, status)

### What doesn't work in browser
- Terminal rendering (xterm.js + node-pty)
- Local session state (SQLite via better-sqlite3)

These features require Electron's main process and cannot run in a plain browser.

## PR Workflow

- Branch naming: `<type>/<short-description>` (e.g., `feat/task-crud`, `fix/pty-cleanup`)
- All PRs target `main`
- CI must pass (lint, format, typecheck, test)

## Commands

- `bun run dev` — start backend + web concurrently
- `bun run lint` / `bun run lint:fix` — ESLint
- `bun run format` / `bun run format:check` — Prettier
- `bun run typecheck` — TypeScript check across all packages
- `bun run test` — Vitest across all packages
- `bun run validate` — all checks (lint + format:check + typecheck + test)
- `docker compose up -d` / `docker compose down` — Postgres
