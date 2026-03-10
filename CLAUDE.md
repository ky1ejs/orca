# Orca

Orca is a work management tool for orchestrating AI agents (starting with Claude Code). See `backend/CLAUDE.md` and `web/CLAUDE.md` for package-specific setup, commands, and structure.

## Workflow

### Worktrees

You must NEVER make changes on main or in the main worktree. Always create a worktree before starting any work using the /create-worktree skill.

### Task Context (Orca-managed sessions)

When launched by Orca, the following environment variables are set:

- `ORCA_TASK_ID` — Task display ID (e.g. `ORCA-42`)
- `ORCA_TASK_TITLE` — Task title
- `ORCA_PROJECT_NAME` — Project name (may be empty)
- `ORCA_TASK_DESCRIPTION` — Task description (max 1000 chars, may be empty)

When `ORCA_TASK_ID` is set, follow these conventions:

- **Branch name**: `feat/$ORCA_TASK_ID-short-description` (e.g. `feat/ORCA-42-add-user-auth`)
- **PR title**: `$ORCA_TASK_ID: Short description`
- **Commit messages**: Reference `$ORCA_TASK_ID` where relevant

### Run simplifier

When you've finished a coding pass, use the `/simplify` skill to refactor and simplify your code. This will help keep the codebase clean and maintainable.

### Commands

- Never chain shell commands with `&&` or `;` in Bash tool calls. Run each command as a separate Bash call.
- Never chain calls with `cd` and `git` as this causes permissions requesets to me, which slows us down.
- Avoid using `git -C` which also leads to permissions requests. Always `cd` into the correct directory first, then run git commands.

### Keep documentation up to date

When making changes, always check for documentation that may need updating (e.g., README files, CLAUDE.md, inline docs, code comments). Update any documentation that is affected by your changes.

### End with a PR

When you've verified that all criteria of the plan have been completed and all tests are passing, create a pull request and share the link so the developer can review it.

### Validation

Run the validation/testing steps as per the instructions in the relevant CLAUDE.md files to ensure your changes work as expected.

## Architecture

Split-state client/server architecture:

- **Server (`backend/`)**: Bun + GraphQL (graphql-yoga) + Prisma + Postgres — shared collaborative state (projects, tasks)
- **Client (`web/`)**: Electron + React (via electron-vite) — local agent/terminal state in SQLite (better-sqlite3), PTY management (node-pty), terminal rendering (xterm.js)

The server holds data multiple users need. The client holds local-only data (terminal sessions, PIDs, output buffers).

## Monorepo Structure

Two independent packages, each with its own `bun install` (no workspaces):

- `@orca/backend` — Bun server
- `@orca/web` — Electron + React client

GraphQL schema lives in `backend/src/schema/schema.graphql` and is the source of truth. Both packages run `graphql-codegen` to generate types from it.

## Auth

- JWT-based auth with per-user email/password accounts
- `JWT_SECRET` and `INVITE_CODE` env vars required in `backend/.env`
- Local dev: `bun run seed:dev` in `backend/` creates a default dev user (`dev@orca.local` / `dev-password`)
- Electron stores JWT via `safeStorage`; browser dev uses `VITE_AUTH_TOKEN` env var

## Deployment

- **Backend**: Fly.io (`orca-api.fly.dev`), auto-deploys on push to `main` via `.github/workflows/deploy-backend.yml`
- **Database**: Neon Postgres in production, Docker Compose locally (`docker compose up -d` from repo root)
- **Electron app**: `bun run build:mac` in `web/`

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

- Branch naming: `<type>/<short-description>` (e.g., `feat/task-crud`). When `ORCA_TASK_ID` is set, include it: `feat/ORCA-42-short-description`
- All PRs target `main`
- CI must pass (lint, format, knip, typecheck, test)
