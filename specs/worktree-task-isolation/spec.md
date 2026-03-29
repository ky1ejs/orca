# Worktrees 1:1 with Tasks

**Status**: Approved
**Date**: 2026-03-22
**Task**: ORCA-22

## Problem

Orca orchestrates Claude Code sessions for tasks. Currently, all tasks in a project share the same `projectDirectory` — when Claude is launched, it runs in the project root. The CLAUDE.md instructs agents to manually create worktrees via `/create-worktree`, but this is:

1. **Unreliable** — agents sometimes skip worktree creation or create them inconsistently
2. **Invisible** — Orca UI has no awareness of worktrees, branches, or working directories
3. **Messy** — stale worktrees accumulate and are never cleaned up

When multiple agents run concurrently on different tasks, they collide in the same directory — editing the same files, switching branches, conflicting changes.

## Design Principle

Orca manages worktree lifecycle (create, track, clean up). Resource isolation (ports, databases, bootstrap) is the user's responsibility — they handle it via their own Claude skills, CLAUDE.md instructions, or project scripts. This keeps Orca simple and lets each project define its own infrastructure conventions.

## Solution

### Worktree Lifecycle

**When**: Worktree is created when an agent is launched on a task — not on task creation (too early, many tasks never get worked on).

**Where**: Daemon creates the worktree in `DaemonStatusManager.launch()`, before spawning the PTY. The daemon already owns the filesystem and PTY lifecycle.

**Reuse**: If a task already has a worktree and the directory exists on disk, reuse it. One task = one worktree.

**Base branch**: Detected dynamically via `git symbolic-ref refs/remotes/origin/HEAD` (falls back to `git rev-parse --abbrev-ref HEAD`). Never hardcode `main`.

#### Flow

```
User clicks "Open Terminal" on task ORCA-42
  → Renderer calls agent.launch(taskId, projectDir, ...)
  → Daemon: WorktreeManager.ensureWorktree(taskId, repoPath, metadata)
    → Acquire per-repo mutex (serialize concurrent creation)
    → Check task_worktree table
      → Row exists AND dir on disk → reuse, return path
      → Row exists but dir missing → delete stale row, proceed to create
      → No row → proceed to create
    → Detect base branch from repo
    → mkdir -p parent directory
    → git worktree add -b feat/ORCA-42-slug <path> <base-branch>
    → Insert into task_worktree table
      → If insert fails → rollback: git worktree remove <path>
    → Release mutex
  → Daemon: spawn PTY in worktree path (not project root)
  → Session working_directory = worktree path
  → Inject ORCA_WORKTREE_PATH env var
```

#### Worktree Location

```
<repo-parent>/<repo-name>-worktrees/<branch-name>/
```

Example: `/Users/kyle/projects/my-app-worktrees/feat/ORCA-42-add-auth/`

Since `feat/ORCA-42-slug` contains a `/`, this creates a nested directory. WorktreeManager must `mkdir -p` the parent before `git worktree add`.

#### Branch Naming

Format: `feat/<ORCA_TASK_ID>-<slug>`

Slug derived from task title: lowercase, non-alphanumeric characters → hyphens, consecutive hyphens collapsed, truncated to 40 chars.

If branch already exists (from a previous cleaned worktree), detect with `git rev-parse --verify <branch>` and use `git worktree add <path> <existing-branch>` (no `-b`).

#### Failure Behavior

If `git worktree add` fails, surface a clear error to the UI. Do NOT silently fall back to the project directory — falling back defeats the isolation goal and creates an inconsistent state where some tasks are isolated and others aren't.

#### Special Cases

- **Non-task terminals**: No worktree created. Agent launches in project directory directly.
- **Non-git projects**: Skip worktree creation, launch in project directory. Show clear notice: "This project is not a git repository. The agent will run in the project root directory. Worktree isolation is not available."

### No Resource Management

Orca does NOT manage ports, databases, or bootstrap commands. Users who need resource isolation handle it themselves via:

- **Claude Code skills**: e.g., a project-specific `/setup-worktree` skill
- **CLAUDE.md instructions**: e.g., "derive port from ORCA_SLOT"
- **Project scripts**: e.g., `scripts/setup-env.sh`

Orca injects `ORCA_WORKTREE_PATH` as an env var so skills/scripts know the worktree location.

### Data Model

#### Local SQLite (daemon) — new table

```sql
CREATE TABLE task_worktree (
  task_id         TEXT PRIMARY KEY,    -- backend Task.id (cuid)
  worktree_path   TEXT NOT NULL,       -- absolute path on disk
  branch_name     TEXT NOT NULL,       -- git branch name
  base_branch     TEXT NOT NULL,       -- detected base branch
  repo_path       TEXT NOT NULL,       -- project's git repo root
  created_at      TEXT NOT NULL,       -- ISO 8601 UTC
  updated_at      TEXT NOT NULL        -- ISO 8601 UTC
);
```

No `status` column. Row exists = worktree exists. Row deleted = worktree cleaned up. On any access, validate that `worktree_path` exists on disk; if not, delete the stale row.

### Cleanup (Manual Only)

No automated cleanup in v1. All cleanup is user-initiated.

**Single trigger**: "Remove worktree" button on task detail page.

**Confirmation dialog**: "This will permanently remove the worktree directory at `<path>` and delete the local branch `<branch>`. This cannot be undone."

If `git worktree remove` reports uncommitted changes, surface git's error message. Offer force option.

**Actions**: `git worktree remove <path>` → `git branch -D <branch>` → delete row from `task_worktree`.

**Deferred to v2**: Bulk prune, daemon startup sweep, auto-cleanup on archive, PR-merge safety checks.

### Daemon Protocol

Two new methods (minimal for v1):

```typescript
WORKTREE_GET: 'worktree.get'       // Get worktree info for a task
WORKTREE_REMOVE: 'worktree.remove' // Remove a specific worktree
```

New IPC channels + preload API: `window.orca.worktree.get(taskId)`, `window.orca.worktree.remove(taskId, force?)`.

Deferred: `WORKTREE_LIST`, `WORKTREE_PRUNE` → v2.

### Concurrency

**Per-repo mutex**: Serialize worktree creation for the same git repo to avoid `.git/index` lock contention. Different repos can proceed concurrently.

**Same-task guard**: Mutex + SQLite unique constraint on `task_id` ensures only one worktree per task.

### Observability

Structured logging for all worktree operations:

```
{ event: 'worktree.created', taskId, branch, path, baseBranch, durationMs }
{ event: 'worktree.reused', taskId, path }
{ event: 'worktree.error', taskId, error, repoPath }
{ event: 'worktree.removed', taskId, path }
{ event: 'worktree.stale-row-cleaned', taskId, path }
```

### UI Changes

**Task Detail**:
- When worktree exists: show worktree path + branch name (sourced from local SQLite `task_worktree` table via daemon IPC)
- "Remove worktree" button with confirmation dialog

**Task List**:
- Branch name shown as text (truncated if needed) with tooltip for full name (sourced from local SQLite)
- One-click copy of branch name
- Branch info is local-only — only visible on the machine where the worktree was created

**Non-git project**: Clear notice at agent launch explaining worktree isolation is unavailable.

### Edge Cases

| Case | Behavior |
|------|----------|
| Branch already exists | Detect via `git rev-parse --verify`. Use `git worktree add <path> <branch>` (no `-b`) |
| Task reopened | If row + dir exist → reuse. If row but no dir → delete row, create fresh. If no row → create fresh |
| Multiple machines | Each machine gets own local worktree, same branch. Push/pull handles sync |
| Worktree dir manually deleted | Next `ensureWorktree` detects missing dir, deletes stale row, creates fresh |
| Backend unreachable | Worktree still created locally. Not a launch blocker |
| `git worktree add` fails | Surface error to UI. Do not fall back to project dir |
| Concurrent launch, same task | Per-repo mutex + SQLite unique constraint prevent double creation |
| Concurrent launch, same repo | Per-repo mutex serializes. Second launch waits for first to complete |

## Review Discussion

### Key Feedback Addressed

- **Pragmatic Architect** raised `base_branch` hardcoding and slash-in-path issues; resolved by dynamic detection and `mkdir -p`
- **Paranoid Engineer** raised race conditions and partial-failure rollback; resolved by per-repo mutex and explicit rollback steps
- **Simplifier** recommended cutting automated cleanup, STALE status, LIST/PRUNE methods; all adopted — v1 is manual-only with minimal protocol surface
- **User Advocate** raised STALE terminology confusion and need for cleanup confirmation; resolved by removing status column entirely and adding explicit confirmation dialog
- **Operator** raised observability gaps; resolved by structured logging for all operations
- **Product Strategist** questioned concurrent-agent demand validation; acknowledged as enabling investment

### Tradeoffs Considered

- **Architect** suggested flattening branch names (replace `/` with `-`) vs. `mkdir -p` — went with `mkdir -p` to preserve git convention of `feat/` prefix branches
- **Simplifier** advocated for leanest possible v1 — adopted. Automated cleanup, bulk prune, and resource management all deferred
- **Paranoid Engineer** wanted auto-cleanup to block on uncommitted changes — moot since automated cleanup is cut entirely for v1

### Dissenting Perspectives

- **Product Strategist** raised concern that worktree isolation without resource isolation may set false expectations ("I got worktrees but agents still collide on ports"). Mitigated by clear documentation that resource isolation is the user's responsibility via skills/scripts. Remains a risk to monitor post-launch.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `web/src/daemon/worktree-manager.ts` | Core worktree lifecycle |
| Modify | `web/src/shared/db/schema.ts` | Add `taskWorktree` table |
| Modify | `web/src/daemon/status-manager.ts` | Call WorktreeManager in `launch()` |
| Modify | `web/src/shared/daemon-protocol.ts` | Add WORKTREE_GET + WORKTREE_REMOVE |
| Modify | `web/src/daemon/handlers.ts` | Wire worktree methods |
| Modify | `web/src/main/ipc/channels.ts` | Add worktree IPC channels |
| Modify | `web/src/main/ipc/handlers.ts` | Add worktree IPC handlers |
| Modify | `web/src/preload/index.ts` | Expose `window.orca.worktree` |
| Modify | `web/src/renderer/components/tasks/TaskDetail.tsx` | Worktree info + remove button |
