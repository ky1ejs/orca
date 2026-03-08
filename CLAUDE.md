# Orca

## Workflow

### Worktrees
You must NEVER make changes on main or in the main worktree. Always create a worktree before starting any work using the /create-worktree skill.

### Commands
- Never chain shell commands with `&&` or `;` in Bash tool calls. Run each command as a separate Bash call.
- Never chain calls with `cd` and `git` as this causes permissions requesets to me, which slows us down.
- Avoid using `git -C` which also leads to permissions requests. Always `cd` into the correct directory first, then run git commands.

### Keep documentation up to date
When making changes, always check for documentation that may need updating (e.g., README files, CLAUDE.md, inline docs, code comments). Update any documentation that is affected by your changes.

## Architecture

Orca is a work management tool for orchestrating AI agents (starting with Claude Code). It uses a **split-state client/server architecture**:

- **Server (backend/)**: Bun + GraphQL (graphql-yoga) + Prisma + Postgres — shared collaborative state (projects, tasks), GraphQL SDL schema
- **Client (web/)**: Electron + React (via electron-vite) — local agent/terminal state in SQLite (better-sqlite3), PTY management (node-pty), terminal rendering (xterm.js)

The server holds data multiple users need (projects, tasks, status). The client holds local-only data (terminal sessions, PIDs, output buffers).

### PTY Daemon

Agent/terminal processes run in a **separate daemon process** that survives Electron restarts (e.g., during app updates). The architecture:

```
[Renderer] <--IPC--> [Electron Main (thin client)] <--Unix Socket--> [Daemon (Node)]
```

- **Daemon (`web/src/daemon/`)**: Runs via `ELECTRON_RUN_AS_NODE=1`. Owns PTY processes (node-pty), SQLite database (`~/.orca/orca.db`), session monitoring, PID sweep, output buffers. Communicates via NDJSON over a Unix domain socket (`~/.orca/daemon.sock`).
- **Electron main (`web/src/main/`)**: Thin relay between renderer IPC and daemon socket. Owns auth (safeStorage) and pushes token to daemon.
- **Shared code (`web/src/shared/`)**: Electron-independent modules (errors, shell, claude, input-detection, db/schema, daemon-protocol) used by both daemon and main.
- **Renderer/preload**: Unchanged `window.orca` API.

**Lifecycle**: On normal quit, Electron tells the daemon to shut down. On update restart, Electron just disconnects — the daemon stays alive with all sessions. The daemon also has a 5-minute idle timeout (no clients + no sessions) as a safety net.

**Build**: Daemon is bundled separately via `bun run build:daemon` (esbuild) to `out/daemon/index.js`. Included in the app package via `out/**/*` in electron-builder.

## Monorepo Structure

Two independent packages, each with its own `bun install`:

- `@orca/backend` — Bun server
- `@orca/web` — Electron + React client

No workspaces — each package manages its own dependencies with `bun install`.

## Code Style

- **ESLint** — flat config (`eslint.config.js`) per package, TypeScript + React rules (web only)
- **Prettier** — single quotes, trailing commas, semicolons, 100 char width (`.prettierrc` per package)
- Run `bun run validate` in each package before pushing (lint + format:check + typecheck + test)

## Testing

- **Vitest** for all packages
- Test files: `*.test.ts` / `*.test.tsx`, co-located next to source files
- Run: `bun run test` (runs all workspace tests via vitest workspace)

## GraphQL

- **Schema-first**: SDL defined in `backend/src/schema/schema.graphql`
- **graphql-codegen** generates TypeScript types for both backend and web
- Resolvers in `backend/src/schema/`

## Auth

- **JWT-based auth** with per-user email/password accounts
- Users can self-register via invite code, or be created via `bun run seed` in `backend/`
- `JWT_SECRET` env var required in `backend/.env` for all environments
- `INVITE_CODE` env var required in `backend/.env` to enable user registration
- Local dev: `bun run seed:dev` creates a default dev user (`dev@orca.local` / `dev-password`)
- Electron stores JWT via `safeStorage`; browser dev uses `VITE_AUTH_TOKEN` env var
- JWT expires after 30 days — user must re-login

## Deployment

- **Backend**: Deployed to Fly.io (`orca-api.fly.dev`) from `backend/`
- **Database**: Neon Postgres in production, Docker Compose locally
- **CI/CD**: Push to `main` with backend changes auto-deploys via `.github/workflows/deploy-backend.yml`
- **Manual deploy**: `fly deploy` from `backend/`
- **Prod build**: `bun run build:mac` in `web/` (production backend URL is the default; override with `VITE_BACKEND_URL` env var if needed)
- Migrations: Run automatically via `bun run start`, which runs `prisma migrate deploy` before starting the server

## UI Validation in Browser

You can visually validate the UI by opening the Vite dev server in Chrome using your `claude-in-chrome` browser tools.

### Setup

1. Ensure `VITE_AUTH_TOKEN` is set in `web/.env` (a valid JWT for browser-based testing)
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

All commands are run within each package directory (`backend/`, `web/`):

- `bun run dev` — start the service (backend or web)
- `bun run lint` / `bun run lint:fix` — ESLint
- `bun run format` / `bun run format:check` — Prettier
- `bun run typecheck` — TypeScript check
- `bun run test` — Vitest
- `bun run validate` — all checks (lint + format:check + typecheck + test)
- `bun run seed --email <email> --name <name> --password <pass>` — create/update a user (backend)
- `bun run seed:dev` — create default dev user (backend)
- `docker compose up -d` / `docker compose down` — Postgres
