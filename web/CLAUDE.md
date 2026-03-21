# Web (@orca/web)

Electron + React client with local SQLite state, PTY management, and a daemon process.

## Bootstrapping

```bash
# 1. Install dependencies
bun install

# 2. Full setup (codegen + rebuild native modules)
bun run setup

# 3. (Optional) Set env vars in .env for browser dev
# VITE_AUTH_TOKEN=<jwt>        — required for browser-based testing
# VITE_BACKEND_URL=<url>       — defaults to https://orca-api.fly.dev
```

`bun run setup` runs both `bun run codegen` and `node scripts/rebuild-native.mjs` (rebuilds better-sqlite3 and node-pty for Electron's Node version).

## Commands

| Command                    | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `bun run dev`              | Setup + build daemon + start electron-vite dev server             |
| `bun run build`            | Setup + electron-vite build + build daemon                        |
| `bun run build:mac`        | Build + package macOS app (dmg, zip)                              |
| `bun run build:daemon`     | Build daemon bundle (`out/daemon/index.js`)                       |
| `bun run lint`             | ESLint check                                                      |
| `bun run lint:fix`         | ESLint auto-fix                                                   |
| `bun run format`           | Prettier format                                                   |
| `bun run format:check`     | Prettier check                                                    |
| `bun run typecheck`        | Codegen + TypeScript check (`tsc --noEmit`)                       |
| `bun run test`             | Setup + run tests via Electron's Node (`vitest run`)              |
| `bun run knip`             | Dead code detection                                               |
| `bun run validate`         | All checks: lint + format:check + knip + typecheck + test + build |
| `bun run codegen`          | Generate GraphQL types from backend schema                        |
| `bun run drizzle:generate` | Generate Drizzle migrations                                       |
| `bun run setup`            | Codegen + rebuild native modules                                  |

## Code Generation

1. **GraphQL** (`bun run codegen`) — generates `src/renderer/graphql/__generated__/generated.ts` from `../backend/src/schema/schema.graphql`. Requires the backend directory to be adjacent. Config in `codegen.ts`.
2. **Drizzle** (`bun run drizzle:generate`) — generates SQLite migrations in `drizzle/` from `src/shared/db/schema.ts`. Only needed when changing the local DB schema.

After backend `schema.graphql` changes, run `bun run codegen` in web too.

## Source Structure

```
src/
├── main/                      — Electron main process
│   ├── index.ts               — Entry point, window management
│   ├── ipc/                   — IPC channel definitions and handlers
│   ├── daemon/                — Daemon connector (client, migrate-db)
│   ├── db/                    — SQLite schema and client (re-exports shared)
│   ├── pty/                   — PTY management (shell, auth)
│   ├── config/                — Settings, font listing
│   ├── menu.ts, updater.ts, logger.ts, dock-badge.ts
│   └── diagnostics.ts
├── daemon/                    — Standalone daemon process (survives Electron restarts)
│   ├── index.ts               — Entry point
│   ├── server.ts              — Unix socket server (NDJSON protocol)
│   ├── handlers.ts            — Message handling
│   ├── pty-manager.ts         — PTY process management
│   ├── sessions.ts            — Session lifecycle
│   ├── db.ts                  — SQLite init for daemon
│   ├── status-manager.ts      — Session status tracking
│   ├── output-persistence.ts  — Batched SQLite persistence for ring buffers
│   └── idle.ts, logger.ts, pid-sweep.ts
├── preload/index.ts           — Exposes window.orca API to renderer
├── renderer/                  — React UI
│   ├── index.tsx, App.tsx     — Entry and root component
│   ├── components/            — Feature-organized components
│   │   ├── tasks/             — Task list, detail, creation
│   │   ├── terminal/          — xterm.js terminal rendering
│   │   ├── projects/          — Project views
│   │   ├── initiatives/       — Initiative views
│   │   ├── layout/            — Shell, sidebar, navigation
│   │   └── auth/, labels/, members/, settings/, shared/, ...
│   ├── graphql/               — Operations and generated types
│   │   ├── queries.ts, mutations.ts, subscriptions.ts
│   │   ├── client.ts, provider.tsx
│   │   └── __generated__/     — Codegen output (do not edit)
│   ├── hooks/                 — Custom React hooks
│   ├── navigation/            — Routing
│   └── workspace/, preferences/, tokens/, utils/, types/
└── shared/                    — Code shared between main, daemon, and renderer
    ├── db/schema.ts           — Drizzle table definitions (SQLite)
    ├── daemon-protocol.ts     — Daemon IPC message types
    ├── errors.ts, shell.ts, claude.ts, logger.ts
    ├── input-detection.ts     — Terminal input detection
    ├── session-status.ts      — Session status types
    └── hooks/                 — Shared hooks (server, settings, mcp-tools)
```

## Architecture

```
[Renderer] <--IPC--> [Electron Main (thin relay)] <--Unix Socket--> [Daemon (Node)]
```

- **Renderer**: React + Tailwind CSS + urql (GraphQL client) + xterm.js
- **Main process**: Thin relay between renderer IPC and daemon socket. Owns auth (safeStorage).
- **Daemon**: Runs via `ELECTRON_RUN_AS_NODE=1`. Owns PTY processes (node-pty), SQLite database (`~/.orca/orca.db`), session monitoring. Communicates via NDJSON over Unix socket (`~/.orca/daemon.sock`).
- **Shared**: Electron-independent modules used by both daemon and main.

The daemon survives Electron restarts (e.g., during app updates). On normal quit, Electron tells daemon to shut down. Daemon has a 5-minute idle timeout.

## Testing

- **Framework**: Vitest (run through Electron's Node for native module compatibility)
- **React testing**: `@testing-library/react` with jsdom
- **Pattern**: `*.test.ts` / `*.test.tsx` co-located next to source files
- **Run**: `bun run test`
- **Config**: `vitest.config.ts` provides build-time constants (`__APP_VERSION__`, `__GIT_HASH__`)

## Build Pipeline

1. `bun run setup` — codegen + rebuild native modules
2. `electron-vite build` — bundles main, preload, and renderer
3. `bun run build:daemon` — esbuild bundles `src/daemon/index.ts` to `out/daemon/index.js` (externalizes node-pty, better-sqlite3)
4. `electron-builder` (for packaging) — creates dmg/zip, includes `out/`, `drizzle/`, and `resources/`

## Key Files

| File                         | Purpose                                |
| ---------------------------- | -------------------------------------- |
| `electron.vite.config.ts`    | Build config for main/preload/renderer |
| `electron-builder.yml`       | App packaging config                   |
| `drizzle.config.ts`          | Drizzle ORM migration config           |
| `vitest.config.ts`           | Test runner config                     |
| `codegen.ts`                 | GraphQL codegen config                 |
| `scripts/rebuild-native.mjs` | Rebuild native modules for Electron    |
| `scripts/build-daemon.mjs`   | Build daemon bundle with esbuild       |
