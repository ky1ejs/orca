# Worktrees & Bootstrapping

When Orca launches an agent on a task, it creates a [git worktree](https://git-scm.com/docs/git-worktree) so the agent works in an isolated copy of the repository. Each worktree gets its own branch, working directory, and (via bootstrap hooks) its own port, database, and environment — so multiple agents can run in parallel without conflicts.

## Worktree Lifecycle

```
Agent Launch
  │
  ▼
ensureWorktree()          Create git worktree + DB row
  │                       Branch: feat/<TASK-ID>-<slug>
  │                       Path:   ~/.orca/worktrees/<repo>/<branch>/
  ▼
.orca/pre-terminal        Fast blocking setup (symlinks, config)
  │
  ▼
Agent session             Claude Code runs in the worktree
  │
  ▼ (concurrent)
.orca/bootstrap           Heavy async setup (deps, ports, DB, migrations)
  │
  ... (agent works) ...
  │
  ▼
.orca/teardown            Clean up resources (best-effort)
  │
  ▼
git worktree remove       Remove worktree directory + delete branch
```

1. **Worktree creation** — Orca fetches the latest from `origin/<base-branch>`, then runs `git worktree add -b feat/<TASK-ID>-<slug> <path> <start-point>`. If the branch already exists it reuses it. The worktree path and metadata are recorded in the daemon's SQLite database.
2. **Pre-terminal** — If `.orca/pre-terminal` exists and is executable, the daemon runs it synchronously before spawning the agent. Use this for fast setup the agent needs immediately, such as symlinking config files (e.g., `.claude/settings.local.json`). 30-second timeout. Failure marks the session as "Error".
3. **Agent session** — Claude Code (or a shell) is spawned in the worktree directory with task context injected as environment variables.
4. **Bootstrap** — If `.orca/bootstrap` exists and is executable, the daemon runs it asynchronously after the agent spawns. Use this for heavy setup: installing dependencies, creating databases, running migrations, etc. The UI shows a "Setting up..." indicator. 10-minute timeout.
5. **Teardown** — When the worktree is removed, `.orca/teardown` runs first (best-effort — failure doesn't block removal). Then `git worktree remove` and `git branch -D` clean up. If the worktree directory was already deleted externally, teardown and git cleanup are skipped — only the daemon's DB record is removed.

### Idempotency

The daemon tracks a SHA-256 prefix (first 16 hex characters) of the `.orca/bootstrap` script in `.orca/.bootstrapped`. If the stored prefix matches, bootstrap is skipped on subsequent launches for the same worktree. If the script changes, bootstrap runs again.

## Setting Up Hooks

To enable worktree hooks in your repo, create executable scripts in `.orca/`:

### `.orca/pre-terminal`

Runs synchronously before the agent/terminal spawns. Use this for fast setup the agent needs immediately — e.g., symlinking config files like `.claude/settings.local.json`.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Symlink Claude settings from main repo so the agent has correct permissions
ln -sf "$ORCA_REPO_ROOT/.claude/settings.local.json" .claude/settings.local.json
```

### `.orca/bootstrap`

Runs asynchronously after the agent/terminal spawns. Use this for heavy setup: installing dependencies, creating databases, running migrations, etc. The agent is already running when this executes.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Setting up worktree at $ORCA_WORKTREE_PATH"

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run migrations, codegen, etc.
npm run setup
```

### `.orca/teardown`

Runs before worktree removal. Use this to drop databases, release ports, or clean up other external resources.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Cleaning up worktree at $ORCA_WORKTREE_PATH"

# Drop the worktree's database, release resources, etc.
```

Make scripts executable:

```bash
chmod +x .orca/pre-terminal .orca/bootstrap .orca/teardown
```

### Hook Rules

| Property | Pre-terminal | Bootstrap | Teardown |
|----------|-------------|-----------|----------|
| Timing | Before agent spawn (blocking) | After agent spawn (async) | Before worktree removal |
| Timeout | 30 seconds | 10 minutes | 2 minutes |
| On failure | Session marked as Error | Warning shown in UI | Warning logged, removal proceeds |
| CWD | Worktree root | Worktree root | Worktree root |
| Skipped if | Script not found or not executable | `.orca/.bootstrapped` hash matches | Script not found or not executable |

## Environment Variables

### Available to hook scripts

These are set by the daemon when running `.orca/pre-terminal`, `.orca/bootstrap`, and `.orca/teardown`:

| Variable | Description |
|----------|-------------|
| `ORCA_WORKTREE_PATH` | Absolute path to the worktree (same as CWD) |
| `ORCA_REPO_ROOT` | Absolute path to the original (main) repo root |
| `ORCA_TASK_ID` | Task display ID (e.g. `PROJ-42`) |
| `ORCA_TASK_TITLE` | Task title |
| `ORCA_PROJECT_NAME` | Project name (empty string if none) |
| `ORCA_WORKSPACE_SLUG` | Workspace slug |

### Available to agent sessions

These are set when Claude Code is spawned in the worktree:

| Variable | Description |
|----------|-------------|
| `ORCA_SESSION_ID` | Daemon session ID |
| `ORCA_WORKTREE_PATH` | Worktree path (only set if different from working directory) |
| `ORCA_REPO_ROOT` | Original repo root (only set if using a worktree) |
| `ORCA_TASK_ID` | Task display ID (e.g. `PROJ-42`) |
| `ORCA_TASK_UUID` | Task UUID |
| `ORCA_TASK_TITLE` | Task title |
| `ORCA_TASK_DESCRIPTION` | Task description (truncated to 1000 chars) |
| `ORCA_PROJECT_NAME` | Project name |
| `ORCA_WORKSPACE_SLUG` | Workspace slug |
| `ORCA_SERVER_URL` | Orca backend server URL |

## Deterministic Resource Isolation

When multiple worktrees run simultaneously, each needs its own port, database, and config to avoid conflicts. The recommended pattern is to derive these deterministically from the worktree path using a hash — this way the same worktree always gets the same resources, and different worktrees never collide.

### The pattern

> **Portability note**: The examples below use `shasum` and `sed -i ''` (macOS). On Linux, use `sha256sum` instead of `shasum -a 256`, and `sed -i` (no empty quotes) instead of `sed -i ''`.

```bash
#!/usr/bin/env bash
set -euo pipefail

WORKTREE_PATH="$(pwd)"

# 1. Hash the worktree path for a deterministic, unique seed
HASH=$(echo -n "$WORKTREE_PATH" | shasum -a 256 | cut -c1-8)
HASH_INT=$((16#${HASH}))

# 2. Derive a port from the hash
#    Pick a base port and range that won't collide with your dev defaults.
#    Example: base=5010, range=990 → ports 5010-5999
BASE_PORT=5010
PORT_RANGE=990
PORT=$(( BASE_PORT + (HASH_INT % PORT_RANGE) ))

# 3. Derive a database name from the hash
DB_NAME="myapp_wt_${HASH}"

# 4. Generate .env with worktree-specific values
#    Copy from the source repo as a template, then overlay
if [[ -f "$ORCA_REPO_ROOT/.env" ]]; then
  cp "$ORCA_REPO_ROOT/.env" .env
else
  touch .env
fi

# Helper: set or update a key in .env
set_env() {
  local key="$1" value="$2" file="${3:-.env}"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

set_env PORT "$PORT"
set_env DATABASE_URL "postgresql://postgres:postgres@localhost:5432/${DB_NAME}"

# 5. Create the database (if using Postgres)
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || true

# 6. Install deps, run migrations, etc.
npm install
npm run db:migrate
```

### Why this works

- **Deterministic**: The same worktree path always produces the same hash, port, and DB name. Re-running bootstrap is safe.
- **Collision-resistant**: SHA-256 distributes evenly, so two worktrees are very unlikely to get the same 8-hex-char prefix.
- **No coordination needed**: Each worktree derives its config independently — no central port allocator or lock file.

### Teardown

Mirror the hash derivation in your teardown script to find and remove the same resources:

```bash
#!/usr/bin/env bash
set -euo pipefail

HASH=$(echo -n "$(pwd)" | shasum -a 256 | cut -c1-8)
DB_NAME="myapp_wt_${HASH}"

docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
```

## Orca's Own Bootstrap

Orca uses this exact pattern for its own development. The `scripts/bootstrap` script:

- Derives port `4010 + (hash % 990)` and database `orca_wt_<hash>` from the worktree path
- Ensures Postgres is running via `docker compose`
- Creates a worktree-specific Postgres database
- Generates `backend/.env` (PORT, DATABASE_URL, JWT_SECRET) and `web/.env` (VITE_BACKEND_PORT)
- Delegates to `backend/scripts/bootstrap` (bun install, Prisma generate, migrations) and `web/scripts/bootstrap` (bun install, codegen, native module rebuild)

The `scripts/teardown` script mirrors the hash derivation, runs per-package teardown, and drops the database.

## Script Reference

| Script | Role |
|--------|------|
| `.orca/pre-terminal` | Daemon hook: fast blocking setup before agent spawn |
| `.orca/bootstrap` | Daemon hook: heavy async setup after agent spawn |
| `.orca/teardown` | Daemon hook: cleanup before worktree removal |
| `scripts/bootstrap` | Main bootstrap logic (port/DB derivation, env generation, delegation) |
| `scripts/teardown` | Main teardown logic (DB drop, delegation) |
| `backend/scripts/bootstrap` | Backend deps, Prisma client generation, migrations |
| `backend/scripts/teardown` | Backend teardown (currently no-op) |
| `web/scripts/bootstrap` | Web deps, codegen, native module rebuild |
| `web/scripts/teardown` | Web teardown (currently no-op) |
