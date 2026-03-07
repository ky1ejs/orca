# Wave 0: Foundation

**Status**: Not Started
**Mode**: Interactive with user (not agent-executed)
**Depends on**: Nothing

## Goal

Lay the foundation that every subsequent agent depends on. This must be solid — all future work branches from it.

## Deliverables

- [ ] **GitHub repo**: Push existing content, set up as public repo
- [ ] **Root `package.json`**: Bun workspaces with `["backend", "web", "shared"]`
- [ ] **`bunfig.toml`**: Bun configuration
- [ ] **`tsconfig.base.json`**: Strict mode, shared compiler options
- [ ] **`.gitignore`**: node_modules, dist, .env, \*.db, prisma generated, etc.
- [ ] **ESLint config**: Root config with TypeScript support
- [ ] **Prettier config**: Root `.prettierrc`
- [ ] **Vitest config**: `vitest.workspace.ts` for monorepo
- [ ] **`shared/` package skeleton**:
  - [ ] `package.json` (`@orca/shared`)
  - [ ] `tsconfig.json` (extends root)
  - [ ] `src/index.ts` (barrel export)
  - [ ] `src/types.ts` (shared enums: `TaskStatus`)
- [ ] **`backend/` package skeleton**:
  - [ ] `package.json` (`@orca/backend`)
  - [ ] `tsconfig.json` (extends root)
  - [ ] `src/index.ts` (placeholder entry point)
- [ ] **`web/` package skeleton**:
  - [ ] `package.json` (`@orca/web`)
  - [ ] `tsconfig.json` (extends root)
  - [ ] electron-vite scaffold (`src/main/index.ts`, `src/renderer/App.tsx`, `src/preload/index.ts`)
- [ ] **`docker-compose.yml`**: Postgres service (port 5432, data volume)
- [ ] **`.github/workflows/ci.yml`**: GitHub Actions CI pipeline
  - [ ] Triggers on PR to `main`
  - [ ] Steps: checkout, install bun, `bun install`, lint, format check, typecheck, test
- [ ] **`CLAUDE.md`**: Project conventions for agents
  - [ ] Architecture overview (monorepo, split-state)
  - [ ] Package naming and import conventions
  - [ ] Code style (ESLint + Prettier)
  - [ ] Testing conventions (Vitest, file naming)
  - [ ] GraphQL conventions (schema-first, SDL in shared/)
  - [ ] PR workflow (branch naming, review process)
- [ ] **Root scripts in `package.json`**:
  - [ ] `dev` — starts backend + web concurrently
  - [ ] `lint` — ESLint
  - [ ] `lint:fix` — ESLint with --fix
  - [ ] `format` — Prettier write
  - [ ] `format:check` — Prettier check
  - [ ] `typecheck` — tsc --noEmit across packages
  - [ ] `test` — vitest run
  - [ ] `validate` — lint + format:check + typecheck + test

## Verification

- [ ] `bun install` succeeds with no errors
- [ ] `bun run validate` passes (all checks green)
- [ ] `docker compose up -d` starts Postgres successfully
- [ ] `docker compose down` stops cleanly
- [ ] Push to GitHub, CI runs and passes on `main`

## Notes

This wave is built interactively between the developer and Claude Code. It is NOT delegated to an autonomous agent because the conventions set here govern all future work.
