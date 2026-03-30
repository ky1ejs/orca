import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { type McpToolsDeps, toolSuccess } from './helpers.js';

// ─── Embedded documentation ─────────────────────────────────────────

const WORKTREES_DOC = `# Worktrees

When Orca launches an agent on a task, it creates a git worktree so the agent works in an isolated copy of the repository. Each worktree gets its own branch, working directory, and (via bootstrap hooks) its own port, database, and environment.

## Lifecycle

1. **Worktree creation** — Orca fetches the latest from origin/<base-branch>, then runs \`git worktree add -b feat/<TASK-ID>-<slug> <path> <start-point>\`. The worktree lives at \`~/.orca/worktrees/<repo>/<branch>/\`.
2. **Bootstrap** — If \`.orca/bootstrap\` exists and is executable, the daemon runs it. The session shows "Bootstrapping" status. Failure marks the session as "Error".
3. **Agent session** — Claude Code is spawned in the worktree with task context as environment variables.
4. **Teardown** — On removal, \`.orca/teardown\` runs first (best-effort), then \`git worktree remove\` and \`git branch -D\`.

## Idempotency

The daemon tracks a SHA-256 hash of the bootstrap script in \`.orca/.bootstrapped\`. If the hash matches, bootstrap is skipped on subsequent launches. If the script changes, bootstrap runs again.`;

const HOOKS_DOC = `# Hook Scripts

## .orca/bootstrap

Runs after worktree creation. Use this to install dependencies, create databases, generate config files, etc.

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
echo "Setting up worktree at $ORCA_WORKTREE_PATH"
npm install
cp .env.example .env
npm run setup
\`\`\`

## .orca/teardown

Runs before worktree removal. Use this to drop databases, release ports, or clean up other resources.

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
echo "Cleaning up worktree at $ORCA_WORKTREE_PATH"
# Drop the worktree's database, release resources, etc.
\`\`\`

Both scripts must be executable (\`chmod +x .orca/bootstrap .orca/teardown\`).

## Rules

- Bootstrap timeout: 10 minutes. Teardown timeout: 2 minutes.
- Bootstrap failure → session marked as Error. Teardown failure → warning logged, removal proceeds.
- CWD is set to the worktree root.
- Bootstrap is skipped if \`.orca/.bootstrapped\` hash matches the script.

## Deterministic Resource Isolation

When multiple worktrees run simultaneously, derive ports and database names from the worktree path hash to avoid conflicts:

\`\`\`bash
WORKTREE_PATH="$(pwd)"

# Hash the worktree path for a deterministic seed
HASH=$(echo -n "$WORKTREE_PATH" | shasum -a 256 | cut -c1-8)
HASH_INT=$((16#\${HASH}))

# Derive port (pick a base and range that won't collide with dev defaults)
PORT=$(( 5010 + (HASH_INT % 990) ))

# Derive database name
DB_NAME="myapp_wt_\${HASH}"
\`\`\`

This pattern is deterministic (same path → same config), collision-resistant, and requires no central coordination.

For .env generation, copy from the source repo as a template, then overlay worktree-specific values:

\`\`\`bash
if [[ -f "$ORCA_REPO_ROOT/.env" ]]; then
  cp "$ORCA_REPO_ROOT/.env" .env
fi
# Then set PORT, DATABASE_URL, etc. in .env
\`\`\`

Mirror the hash derivation in teardown to find and clean up the same resources.`;

const ENVIRONMENT_DOC = `# Environment Variables

## Available to hook scripts (.orca/bootstrap and .orca/teardown)

| Variable             | Description                                          |
|----------------------|------------------------------------------------------|
| ORCA_WORKTREE_PATH   | Absolute path to the worktree (same as CWD)          |
| ORCA_REPO_ROOT       | Absolute path to the original (main) repo root       |
| ORCA_TASK_ID         | Task display ID (e.g. PROJ-42)                       |
| ORCA_TASK_TITLE      | Task title                                           |
| ORCA_PROJECT_NAME    | Project name (empty string if none)                  |
| ORCA_WORKSPACE_SLUG  | Workspace slug                                       |

## Available to agent sessions

| Variable              | Description                                         |
|-----------------------|-----------------------------------------------------|
| ORCA_SESSION_ID       | Daemon session ID                                   |
| ORCA_WORKTREE_PATH    | Worktree path (only if different from working dir)   |
| ORCA_TASK_ID          | Task display ID (e.g. PROJ-42)                      |
| ORCA_TASK_UUID        | Task UUID                                           |
| ORCA_TASK_TITLE       | Task title                                          |
| ORCA_TASK_DESCRIPTION | Task description (truncated to 1000 chars)          |
| ORCA_PROJECT_NAME     | Project name                                        |
| ORCA_WORKSPACE_SLUG   | Workspace slug                                      |
| ORCA_SERVER_URL       | Orca backend server URL                             |`;

const TOPICS: Record<string, string> = {
  worktrees: WORKTREES_DOC,
  hooks: HOOKS_DOC,
  environment: ENVIRONMENT_DOC,
};

const ALL_TOPICS_DOC = Object.values(TOPICS).join('\n\n---\n\n');

// ─── Tool Registration ──────────────────────────────────────────────

export function registerDocTools(server: McpServer, _deps: McpToolsDeps): void {
  server.registerTool(
    'get_docs',
    {
      description:
        'Get Orca documentation for configuring worktrees, bootstrap hooks, and environment variables. Use this when you need to set up or troubleshoot `.orca/bootstrap` and `.orca/teardown` hooks in a repository.',
      inputSchema: {
        topic: z
          .enum(['worktrees', 'hooks', 'environment'])
          .optional()
          .describe(
            'Specific topic to retrieve. "worktrees" = lifecycle and idempotency, "hooks" = bootstrap/teardown setup and deterministic resource isolation, "environment" = env vars for hooks and agent sessions. Omit to get all topics.',
          ),
      },
    },
    async ({ topic }) => {
      if (topic) {
        return toolSuccess(TOPICS[topic]);
      }
      return toolSuccess(ALL_TOPICS_DOC);
    },
  );
}
