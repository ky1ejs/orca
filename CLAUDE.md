# Orca

## Architecture

Orca is a work management tool for orchestrating AI agents (starting with Claude Code). It uses a **split-state client/server architecture**:

- **Server (backend/)**: Bun + GraphQL (graphql-yoga) + Prisma + Postgres — shared collaborative state (projects, tasks)
- **Client (web/)**: Electron + React (via electron-vite) — local agent/terminal state in SQLite (better-sqlite3), PTY management (node-pty), terminal rendering (xterm.js)
- **Shared (shared/)**: GraphQL SDL schema, shared TypeScript types and enums

The server holds data multiple users need (projects, tasks, status). The client holds local-only data (terminal sessions, PIDs, output buffers). Agent processes run locally via node-pty in the Electron main process.

## Monorepo Structure

Bun workspaces for backend + shared, pnpm for web (Electron):

- `@orca/shared` — shared types, GraphQL schema (bun workspace)
- `@orca/backend` — Bun server (bun workspace)
- `@orca/web` — Electron + React client (pnpm, separate from bun workspace)

Web uses pnpm because Bun's module hoisting breaks `@electron/rebuild` for native modules (better-sqlite3). Import shared code as `@orca/shared` (resolved via `link:../shared` in web, workspace linking in backend).

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
