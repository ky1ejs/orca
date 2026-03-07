# Agent Protocol

Every agent MUST follow this protocol. Read this before starting any work.

## Before You Start

1. Read `/CLAUDE.md` for project conventions
2. Read your assigned wave file (`docs/implementation/wave-N.md`)
3. Do NOT read other wave files — they are not your concern

## Git Workflow

1. **Agents NEVER work on the `main` branch.** All agent work happens in worktrees on feature branches. No exceptions.
2. You are working in an auto-managed git worktree branched from `main` (created by the orchestrator)
3. Your branch name is specified in your wave file (e.g., `wave-1/backend-data-layer`)
4. Only modify files listed in your wave file's "File Ownership" section
5. Commit frequently with clear messages
6. When done, push your branch and create a PR targeting `main`
7. Do NOT create or manage worktrees yourself — that is handled for you

## Self-Validation (MANDATORY)

Before creating a PR, you MUST run and pass from the repo root:

```bash
bun run validate
```

This runs: lint + format check, then each package's validate (typecheck + test, plus build for web). ALL must pass.

**Important**: Each package manages its own dependencies. If you add a dependency, run `bun install` in that package's directory.

If any check fails, fix the issue before proceeding. Do not create a PR with failing checks.

## Testing Requirements

- Every deliverable must have corresponding tests
- Test files: `*.test.ts` or `*.test.tsx`, co-located with source or in `__tests__/`
- Framework: Vitest
- Write focused tests — test behavior, not implementation details

## Code Quality

- **Linter**: ESLint (run via `bun run lint`)
- **Formatter**: Prettier (run via `bun run format`)
- **Types**: TypeScript strict mode (`bun run typecheck`)
- Fix lint/format issues with `bun run format` and `bun run lint -- --fix`

## CI

GitHub Actions runs the same checks on every PR:

1. `bun install` (root + each package)
2. `bun run validate` (lint, format, then each package's typecheck + test + build)

Your PR will not be merged if CI fails.

## Package Management

There are **no workspaces**. Each package (`shared/`, `backend/`, `web/`) is independent:

- Run `bun install` in each package directory when adding dependencies
- Shared code is imported as `@orca/shared` (resolved via `"file:../shared"` in each package.json)
- Web tests run under Electron's Node.js (`ELECTRON_RUN_AS_NODE=1`) so native modules work
- Native modules (better-sqlite3, node-pty) must be rebuilt for Electron via `web/scripts/rebuild-sqlite.mjs` — do NOT use `@electron/rebuild`

## PR Description

Include in your PR description:

1. What was built (reference your wave file deliverables)
2. How to test it (manual steps if applicable)
3. Any deviations from the wave file and why

## Dependencies

When adding npm packages, follow `/DEPS.md`:

- Use latest stable versions
- Prefer small, well-maintained packages
- If the code needed is small, write it yourself

## Key Conventions

- Three independent packages: `@orca/shared`, `@orca/backend`, `@orca/web` (no workspaces)
- GraphQL schema source of truth: `shared/src/schema.graphql`
- Import shared types via `@orca/shared`
- Server binds to `127.0.0.1` in development
- Subscriptions use SSE (Server-Sent Events), NOT WebSocket
- Client-side state (terminal sessions, PIDs) lives in SQLite, not on the server
