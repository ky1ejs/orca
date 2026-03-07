# Create Worktree

Create an isolated worktree for parallel development with its own backend port and database.

## Usage

```
/create-worktree <name> [--base <branch>]
```

## What it does

1. Creates a git worktree at `../worktrees/orca/<name>`
2. Allocates a resource slot (port + database)
3. Creates the Postgres database
4. Generates `.env` files for backend and web
5. Installs dependencies and runs Prisma migrations

## Instructions

Run the worktree creation script:

```bash
./scripts/worktree create <name>
```

Options:

- `--base <branch>` — base branch (default: main)
- `--branch <name>` — branch name (default: same as worktree name)
- `--no-bootstrap` — skip `bun install` and migrations
- `-v` — verbose output

After creation, `cd` to the worktree path and run `bun run dev`.
