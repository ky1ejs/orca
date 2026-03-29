# Create Worktree

Worktrees are managed automatically by Orca. When you launch an agent on a task, the daemon creates a git worktree and runs `.orca/bootstrap` to set up isolated resources (port, database, dependencies).

## Manual worktree creation

If you need to create a worktree outside of Orca (e.g. for development on Orca itself), use the bootstrap script directly:

```bash
# 1. Create the git worktree
git worktree add ../worktrees/orca/<name> -b <branch> main

# 2. Bootstrap it
./scripts/bootstrap ../worktrees/orca/<name>
```

The bootstrap script derives a deterministic port and database name from the worktree path (via hash), installs dependencies, and runs package-specific setup.

## What bootstrap does

1. Derives port (4010–4999) and DB name from worktree path hash
2. Ensures Postgres is running
3. Creates the database
4. Generates `.env` files for backend and web
5. Installs dependencies (`bun install`)
6. Runs `backend/scripts/bootstrap` (Prisma generate + migrate)
7. Runs `web/scripts/bootstrap` (codegen + native module rebuild)
