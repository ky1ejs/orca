# Wave 0: Foundation

**Status**: Complete
**Mode**: Interactive with user (not agent-executed)
**Depends on**: Nothing

## Goal

Lay the foundation that every subsequent agent depends on. This must be solid — all future work branches from it.

## Deliverables

- [x] **GitHub repo**: Push existing content, set up as public repo
- [x] **Root `package.json`**: Bun workspaces with `["backend", "web", "shared"]`
- [x] **`bunfig.toml`**: Bun configuration
- [x] **`tsconfig.base.json`**: Strict mode, shared compiler options
- [x] **`.gitignore`**: node_modules, dist, .env, \*.db, prisma generated, etc.
- [x] **ESLint config**: Root config with TypeScript support
- [x] **Prettier config**: Root `.prettierrc`
- [x] **Vitest config**: `vitest.config.ts` with `test.projects` for monorepo
- [x] **`shared/` package skeleton**:
  - [x] `package.json` (`@orca/shared`)
  - [x] `tsconfig.json` (extends root)
  - [x] `src/index.ts` (barrel export)
  - [x] `src/types.ts` (shared enums: `TaskStatus`)
- [x] **`backend/` package skeleton**:
  - [x] `package.json` (`@orca/backend`)
  - [x] `tsconfig.json` (extends root)
  - [x] `src/index.ts` (placeholder entry point)
- [x] **`web/` package skeleton**:
  - [x] `package.json` (`@orca/web`)
  - [x] `tsconfig.json` (extends root)
  - [x] electron-vite scaffold (`src/main/index.ts`, `src/renderer/App.tsx`, `src/preload/index.ts`)
- [x] **`docker-compose.yml`**: Postgres service (port 5432, data volume)
- [x] **`.github/workflows/ci.yml`**: GitHub Actions CI pipeline
  - [x] Triggers on PR to `main`
  - [x] Steps: checkout, install bun, `bun install`, lint, format check, typecheck, test
- [x] **`CLAUDE.md`**: Project conventions for agents
  - [x] Architecture overview (monorepo, split-state)
  - [x] Package naming and import conventions
  - [x] Code style (ESLint + Prettier)
  - [x] Testing conventions (Vitest, file naming)
  - [x] GraphQL conventions (schema-first, SDL in shared/)
  - [x] PR workflow (branch naming, review process)
- [x] **Root scripts in `package.json`**:
  - [x] `dev` — starts backend + web concurrently
  - [x] `lint` — ESLint
  - [x] `lint:fix` — ESLint with --fix
  - [x] `format` — Prettier write
  - [x] `format:check` — Prettier check
  - [x] `typecheck` — tsc --noEmit across packages
  - [x] `test` — vitest run
  - [x] `validate` — lint + format:check + typecheck + test

## Verification

- [x] `bun install` succeeds with no errors
- [x] `bun run validate` passes (all checks green)
- [x] `docker compose up -d` starts Postgres successfully
- [x] `docker compose down` stops cleanly
- [x] Push to GitHub, CI runs and passes on `main`

## Notes

This wave is built interactively between the developer and Claude Code. It is NOT delegated to an autonomous agent because the conventions set here govern all future work.
