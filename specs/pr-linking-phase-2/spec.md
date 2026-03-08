# PR Linking Phase 2: MCP Server + Environment Variable Injection

## TL;DR

Phase 1 gave tasks human-readable display IDs (e.g., `ORCA-42`). Phase 2 makes those IDs actionable by injecting task metadata into agent terminal environments and providing a local MCP server that Claude Code can call. When a user clicks "Open Terminal" on a task, the spawned shell receives `ORCA_TASK_ID`, `ORCA_TASK_TITLE`, and other env vars. A `.claude/settings.md` file is written into the project directory with instructions telling Claude Code to use the display ID in branch names and PR titles. A lightweight MCP server running inside the Electron app gives Claude Code the ability to query task details, update task status, and add notes -- closing the loop between the AI agent and the work management system.

## Purpose

### Problem Statement

Today, when an agent terminal is launched for a task, there is no connection between the task's metadata and the agent's environment. Claude Code has no way to know which task it is working on, what the task ID is, or what conventions to follow for branch naming and PR creation. Users must manually copy-paste task IDs into prompts or remember to tell the agent what to name things. This creates friction and makes it impossible to automatically link PRs back to tasks.

### Goals

1. **Zero-config task awareness**: When an agent launches from a task, it should automatically know the task's display ID, title, project, and workspace without any user intervention.
2. **Consistent branch/PR naming**: Claude Code should automatically use `feat/ORCA-42-short-description` branch names and `ORCA-42: Short description` PR titles, creating a traceable link between code changes and tasks.
3. **Bidirectional task updates**: Claude Code should be able to read task details and update task status (e.g., move to IN_PROGRESS when starting work, IN_REVIEW when creating a PR) without the user switching back to Orca.
4. **Non-invasive**: The injected files and env vars should not pollute the user's project. Cleanup should be automatic when the session ends.

### Non-Goals

- **GitHub webhook integration**: Automatically detecting merged PRs and closing tasks is a future phase. This phase provides the naming convention; automated detection comes later.
- **PR metadata storage**: Storing PR URLs, branch names, or commit SHAs on the task model is deferred. This phase focuses on outbound context (Orca -> agent), not inbound tracking (GitHub -> Orca).
- **Multi-agent coordination**: This phase assumes one agent per task at a time (already enforced by the UI). Concurrent agents on the same task are out of scope.
- **Remote MCP server**: The MCP server runs locally inside the Electron app. A shared/remote MCP server for CI or non-Electron contexts is a future consideration.

## Requirements

### Functional Requirements

#### FR-1: Environment Variable Injection

When `StatusManager.launch()` spawns a terminal for a task, the following environment variables MUST be set in the PTY process:

| Variable | Value | Example |
|---|---|---|
| `ORCA_TASK_ID` | Task display ID | `ORCA-42` |
| `ORCA_TASK_TITLE` | Task title | `Add user authentication` |
| `ORCA_PROJECT_NAME` | Project name | `Backend API` |
| `ORCA_WORKSPACE_SLUG` | Workspace slug | `orca` |
| `ORCA_TASK_DESCRIPTION` | Task description (truncated to 1000 chars) | `Implement JWT-based auth...` |
| `ORCA_SERVER_URL` | Backend GraphQL URL | `http://localhost:4000` |

These env vars must be inherited from the parent process env (so PATH and other system vars are preserved) with the Orca-specific vars added on top.

#### FR-2: CLAUDE.md / Settings Injection

When an agent terminal is launched for a task, Orca MUST write a `.claude/settings.md` file in the project's working directory containing:

- The task's display ID, title, and description
- Instructions to use the display ID in branch names (e.g., `feat/ORCA-42-short-description`)
- Instructions to use the display ID in PR titles (e.g., `ORCA-42: Short description`)
- Instructions to use the display ID in commit messages where appropriate
- A note that this file is managed by Orca and should not be edited manually

The file MUST be created before the shell process starts (or immediately after, before any user input). If the file already exists (e.g., from a previous session for the same task), it MUST be overwritten with current task metadata.

#### FR-3: Settings Injection Cleanup

When a terminal session ends (exit or kill), Orca SHOULD clean up the `.claude/settings.md` file if and only if:
- The file still contains the Orca-managed header comment
- No other active session is using the same working directory

If cleanup is not possible (e.g., directory was deleted, permissions issue), the failure should be logged but not surfaced to the user.

#### FR-4: MCP Server - Task Context

The MCP server MUST expose a `get_current_task` tool that returns:
- `displayId` (e.g., `ORCA-42`)
- `title`
- `description`
- `status` (TODO, IN_PROGRESS, IN_REVIEW, DONE)
- `priority` (NONE, LOW, MEDIUM, HIGH, URGENT)
- `projectName`
- `workspaceSlug`

The tool should derive the current task from the `ORCA_TASK_ID` environment variable available in the calling process's environment.

#### FR-5: MCP Server - Status Updates

The MCP server MUST expose an `update_task_status` tool that accepts:
- `status`: One of `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`

The tool updates the task's status via the backend GraphQL API using the stored auth token. It returns the updated task or an error message.

#### FR-6: MCP Server - Task Notes

The MCP server MUST expose an `add_task_note` tool that accepts:
- `content`: Markdown string

This adds a note/comment to the task. **Open question**: This requires a new `TaskNote` model on the backend -- see Open Questions section.

#### FR-7: MCP Server Registration

When an agent terminal is launched, the MCP server configuration MUST be written to `.claude/settings.json` in the project directory (or the user's global Claude Code config) so that Claude Code automatically discovers and connects to the MCP server. The configuration should use the `stdio` transport, pointing to a Node.js script bundled with the Electron app.

#### FR-8: Task Metadata Passed Through IPC

The `agent:launch` IPC channel currently accepts `(taskId, workingDirectory)`. To inject env vars and write settings files, the main process needs task metadata (display ID, title, project name, workspace slug). The renderer MUST pass this metadata to the main process at launch time, either by:
- (a) Expanding the IPC payload to include metadata, or
- (b) Having the main process fetch task metadata from the backend using the taskId and stored auth token

### Non-Functional Requirements

#### NFR-1: Latency

Environment variable injection and settings file creation must add no more than 100ms to the terminal launch time.

#### NFR-2: Security

The MCP server must authenticate requests using the stored auth token. It must not expose any task data from workspaces the user does not belong to. The auth token must never be written to the settings file or any file in the project directory.

#### NFR-3: Idempotency

Launching a terminal for the same task multiple times must produce the same environment and settings file content. There should be no accumulation of stale files or duplicate MCP server instances.

#### NFR-4: Graceful Degradation

If the backend is unreachable when the MCP server tries to update task status, the operation should fail gracefully with a descriptive error message. The agent terminal must still function normally without the MCP server.

## Architecture & Design

### Overview

The implementation touches three layers of the Electron app's main process:

```
Renderer (TaskDetail.tsx)
    |
    | IPC: agent:launch(taskId, workDir, metadata)
    v
Main Process (StatusManager)
    |
    |--- 1. Write .claude/settings.md (task context for Claude Code)
    |--- 2. Write .claude/settings.json (MCP server config)
    |--- 3. Spawn PTY with ORCA_* env vars
    |--- 4. Start MCP server process (or expose via stdio script)
    |
    v
PTY Shell -> Claude Code
    |
    | stdio (MCP protocol)
    v
MCP Server (local Node.js process)
    |
    | GraphQL over HTTP
    v
Backend API
```

### Component Design

#### 1. PtyManager: Environment Variable Support

The `PtyManager.spawn()` method currently does not accept an `env` parameter. It must be extended:

```typescript
// Current signature
spawn(sessionId: string, command: string, args: string[], cwd: string): void

// New signature
spawn(sessionId: string, command: string, args: string[], cwd: string, env?: Record<string, string>): void
```

When `env` is provided, the PTY is spawned with `{ ...process.env, ...env }`. When omitted, behavior is unchanged (inherits `process.env` via node-pty default).

#### 2. StatusManager: Task Metadata Flow

The `StatusManager.launch()` method is the orchestration point. It currently:
1. Validates the working directory
2. Creates a session in SQLite
3. Spawns a shell via `PtyManager`
4. Updates task status to IN_PROGRESS via GraphQL
5. Starts monitoring

The new flow adds steps before spawning:

1. Validates the working directory
2. **Fetches task metadata from the backend** (display ID, title, description, project name, workspace slug)
3. **Writes `.claude/settings.md`** with task context and branch/PR naming instructions
4. **Writes `.claude/settings.json`** with MCP server configuration
5. Creates a session in SQLite
6. Spawns a shell via `PtyManager` **with `ORCA_*` env vars**
7. Updates task status to IN_PROGRESS via GraphQL
8. Starts monitoring
9. **Registers cleanup handler** for settings files on session exit

The task metadata can be fetched from the backend using the existing `updateTaskStatus` pattern (raw GraphQL fetch with stored auth token), or the renderer can pass it through IPC. See Open Questions.

#### 3. Settings File Writer

A new module `web/src/main/pty/settings-writer.ts` handles file I/O for Claude Code configuration:

```typescript
interface TaskMetadata {
  displayId: string;       // e.g., "ORCA-42"
  title: string;
  description: string | null;
  projectName: string;
  workspaceSlug: string;
}

/**
 * Writes .claude/settings.md with task context and agent instructions.
 * Creates the .claude/ directory if it doesn't exist.
 */
function writeTaskSettings(cwd: string, metadata: TaskMetadata): void

/**
 * Writes .claude/settings.json with MCP server configuration.
 * Merges with existing settings if present (preserves user's other MCP servers).
 */
function writeMcpConfig(cwd: string, mcpServerPath: string, env: Record<string, string>): void

/**
 * Removes Orca-managed settings files if they still contain the Orca header.
 * Returns true if cleanup was performed, false if skipped.
 */
function cleanupTaskSettings(cwd: string): boolean
```

The `.claude/settings.md` content would look like:

```markdown
<!-- Managed by Orca. Do not edit manually. -->

# Current Task

- **Task ID**: ORCA-42
- **Title**: Add user authentication
- **Project**: Backend API
- **Workspace**: orca

## Description

Implement JWT-based authentication with email/password login...

## Conventions

When working on this task:

- **Branch name**: `feat/ORCA-42-short-description` (use the task ID as a prefix, followed by a kebab-case summary)
- **PR title**: `ORCA-42: Short description` (use the task ID as a prefix)
- **Commit messages**: Reference `ORCA-42` in commit messages where relevant
```

#### 4. MCP Server

The MCP server is a standalone Node.js script that communicates via stdio (stdin/stdout) using the Model Context Protocol. It is spawned by Claude Code as a child process based on the configuration in `.claude/settings.json`.

**Transport**: stdio (not HTTP). This is the simplest transport and is natively supported by Claude Code's MCP client. The server script reads JSON-RPC messages from stdin and writes responses to stdout.

**Location**: `web/src/main/mcp/server.ts` -- bundled as a separate entry point by electron-vite. The built script is placed at a known path relative to the Electron app resources.

**Authentication**: The MCP server receives the backend URL and auth token via environment variables (`ORCA_SERVER_URL` and `ORCA_AUTH_TOKEN`) set by the parent PTY process. These env vars are set by the StatusManager when writing the MCP config, but `ORCA_AUTH_TOKEN` is passed only through the MCP server's process env (set in `.claude/settings.json`'s `env` field), never written to any file in the project directory.

**Tools exposed**:

| Tool | Description | Parameters | Returns |
|---|---|---|---|
| `get_current_task` | Get details of the current task | None (reads `ORCA_TASK_ID` from env) | Task object (displayId, title, description, status, priority, projectName, workspaceSlug) |
| `update_task_status` | Update the current task's status | `status: "TODO" \| "IN_PROGRESS" \| "IN_REVIEW" \| "DONE"` | Updated task object or error |
| `add_task_note` | Add a note to the current task | `content: string` (Markdown) | Created note or error |

**Implementation approach**: Use the `@modelcontextprotocol/sdk` package, which provides a typed framework for building MCP servers. The server is minimal -- it translates MCP tool calls into GraphQL mutations against the backend.

```typescript
// Pseudocode for the MCP server structure
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "orca", version: "1.0.0" });

server.tool("get_current_task", {}, async () => {
  const taskId = process.env.ORCA_TASK_ID;
  // Fetch from backend using ORCA_SERVER_URL and ORCA_AUTH_TOKEN
  // Return task details
});

server.tool("update_task_status", { status: z.enum([...]) }, async ({ status }) => {
  // GraphQL mutation to update task status
});

server.tool("add_task_note", { content: z.string() }, async ({ content }) => {
  // GraphQL mutation to add note
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### 5. MCP Config in `.claude/settings.json`

The `.claude/settings.json` file tells Claude Code about available MCP servers. Orca writes/merges its server config into this file:

```json
{
  "mcpServers": {
    "orca": {
      "command": "node",
      "args": ["/path/to/orca/mcp-server.js"],
      "env": {
        "ORCA_TASK_ID": "ORCA-42",
        "ORCA_SERVER_URL": "http://localhost:4000",
        "ORCA_AUTH_TOKEN": "<jwt-token>"
      }
    }
  }
}
```

**Important**: The auth token is written to `.claude/settings.json` which is inside the project directory. This file MUST be added to `.gitignore` by the settings writer (or the `.claude/` directory as a whole). The settings writer should check for and append to `.gitignore` if needed.

**Alternative**: Write the MCP config to Claude Code's global config (`~/.claude/settings.json`) with a project-scoped key. This avoids writing secrets to the project directory entirely. See Open Questions.

#### 6. IPC Changes

The `agent:launch` IPC channel needs task metadata. Two approaches:

**Option A: Renderer passes metadata (recommended)**

The renderer already has the full task object from the GraphQL query. Pass it through IPC:

```typescript
// Preload API change
agent: {
  launch: (taskId: string, workingDirectory: string, metadata: TaskMetadata) => Promise<AgentLaunchResult>;
}

// IPC handler change
ipcMain.handle(IPC_CHANNELS.AGENT_LAUNCH, (_event, taskId: string, workingDirectory: string, metadata: TaskMetadata) => {
  return sm.launch(taskId, workingDirectory, metadata);
});
```

This avoids an extra network request from the main process and keeps the main process simple.

**Option B: Main process fetches metadata**

The main process fetches the task from the backend using the stored auth token. This adds latency and complexity but keeps the IPC interface unchanged.

**Recommendation**: Option A. The renderer already has the data, and the IPC boundary is within the same machine (no serialization cost for small objects).

### Data Model Changes

#### Backend: TaskNote Model (Conditional)

If FR-6 (task notes) is included in this phase, a new model is needed:

```prisma
model TaskNote {
  id        String   @id @default(cuid())
  content   String
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([taskId])
}
```

And corresponding GraphQL schema additions:

```graphql
type TaskNote {
  id: ID!
  content: String!
  author: User!
  createdAt: String!
}

# On Task type:
type Task {
  # ... existing fields ...
  notes: [TaskNote!]!
}

# New mutation:
type Mutation {
  # ... existing mutations ...
  addTaskNote(taskId: ID!, content: String!): TaskNote!
}
```

This is a significant addition. See Open Questions for whether to defer this.

#### Client: No Local Schema Changes

No changes to the SQLite schema. The terminal session table already has `task_id` which links sessions to tasks. The env vars and settings files are ephemeral and do not need persistence.

### API Changes

#### GraphQL: Task Query Enhancement

The MCP server needs to fetch a task by display ID (since that is what it has in the env var). A new query field is needed:

```graphql
type Query {
  # ... existing queries ...
  taskByDisplayId(displayId: String!): Task
}
```

The resolver looks up the task by its `displayId` field (which is already unique-indexed in Postgres).

## Implementation Steps

| Step | Description | Files | Estimated Effort |
|---|---|---|---|
| 1 | **Extend PtyManager with env support** -- Add optional `env` parameter to `spawn()`. Pass `{ ...process.env, ...env }` to `pty.spawn()`. | `web/src/main/pty/manager.ts` | Small |
| 2 | **Create settings writer module** -- Implement `writeTaskSettings()`, `writeMcpConfig()`, and `cleanupTaskSettings()`. Handle `.claude/` directory creation, `.gitignore` management, and idempotent writes. | `web/src/main/pty/settings-writer.ts` (new) | Medium |
| 3 | **Update IPC to pass task metadata** -- Extend `agent:launch` channel to accept a `TaskMetadata` object. Update preload API, IPC handler, and renderer call site. | `web/src/preload/index.ts`, `web/src/main/ipc/handlers.ts`, `web/src/main/ipc/channels.ts`, `web/src/renderer/components/tasks/TaskDetail.tsx` | Small |
| 4 | **Update StatusManager for env injection + settings** -- Fetch/receive task metadata, call settings writer, pass env vars to PtyManager. Add cleanup on session exit. | `web/src/main/pty/status.ts` | Medium |
| 5 | **Add `taskByDisplayId` query to backend** -- New resolver that looks up tasks by display ID. | `backend/src/schema/schema.graphql`, `backend/src/schema/resolvers/task.ts` | Small |
| 6 | **Build MCP server** -- Implement the stdio MCP server with `get_current_task`, `update_task_status` tools. Bundle as a separate electron-vite entry point. | `web/src/main/mcp/server.ts` (new), `web/electron.vite.config.ts` | Large |
| 7 | **Add `add_task_note` support (if included)** -- Create TaskNote model, migration, GraphQL types, resolvers. Add `add_task_note` tool to MCP server. | `backend/prisma/schema.prisma`, `backend/src/schema/schema.graphql`, `backend/src/schema/resolvers/task-note.ts` (new), `web/src/main/mcp/server.ts` | Large |
| 8 | **MCP server bundling** -- Configure electron-vite to build the MCP server as a standalone script. Ensure the built path is deterministic and accessible at runtime. | `web/electron.vite.config.ts` | Medium |
| 9 | **End-to-end testing** -- Test the full flow: launch terminal -> verify env vars -> verify settings files -> verify MCP tools work -> verify cleanup on exit. | `web/src/main/pty/settings-writer.test.ts` (new), `web/src/main/mcp/server.test.ts` (new) | Medium |
| 10 | **Documentation** -- Update CLAUDE.md with MCP server details. Document env vars in project README or inline. | `CLAUDE.md` | Small |

## Validation & Testing Plan

### Unit Tests

1. **Settings Writer**
   - `writeTaskSettings()` creates `.claude/settings.md` with correct content
   - `writeTaskSettings()` creates `.claude/` directory if missing
   - `writeTaskSettings()` overwrites existing Orca-managed file
   - `writeMcpConfig()` creates `.claude/settings.json` with correct MCP config
   - `writeMcpConfig()` merges with existing settings.json (preserves other MCP servers)
   - `cleanupTaskSettings()` removes file when Orca header is present
   - `cleanupTaskSettings()` skips removal when file was modified by user
   - `.gitignore` management: appends `.claude/settings.json` if not already present

2. **PtyManager**
   - `spawn()` with env parameter passes combined env to pty.spawn
   - `spawn()` without env parameter preserves existing behavior

3. **StatusManager**
   - `launch()` passes task metadata env vars to PtyManager
   - `launch()` calls settings writer before spawning PTY
   - Session exit triggers settings cleanup
   - Graceful degradation when backend is unreachable during metadata fetch

4. **MCP Server**
   - `get_current_task` returns correct task data from env + backend query
   - `update_task_status` sends correct GraphQL mutation
   - `update_task_status` returns error when backend is unreachable
   - `add_task_note` sends correct GraphQL mutation (if included)
   - Server handles malformed requests gracefully

5. **Backend: taskByDisplayId**
   - Returns task when display ID exists
   - Returns null when display ID does not exist
   - Respects workspace authorization (user must be a member)

### Integration Tests

1. **Full launch flow**: Launch agent terminal for a task -> verify `ORCA_TASK_ID` is set in the shell environment -> verify `.claude/settings.md` exists with correct content -> verify `.claude/settings.json` has MCP config
2. **MCP round-trip**: Launch agent -> invoke `get_current_task` via MCP -> verify response matches task data -> invoke `update_task_status` -> verify task status changed in backend
3. **Cleanup on exit**: Launch agent -> exit terminal -> verify settings files are cleaned up
4. **Re-launch idempotency**: Launch agent -> exit -> re-launch -> verify settings files are correct (not duplicated or corrupted)

### Manual Testing

1. Open a task in Orca, click "Open Terminal"
2. In the spawned shell, run `echo $ORCA_TASK_ID` -- should print the display ID
3. Launch Claude Code in the terminal
4. Ask Claude Code: "What task am I working on?" -- should use MCP to get task details
5. Ask Claude Code: "Create a branch and PR for this task" -- should use the display ID in naming
6. Verify in Orca that the task status was updated to IN_PROGRESS on terminal launch
7. Exit the terminal and verify settings files are cleaned up

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **`.claude/settings.json` contains auth token in project directory** | High -- token could be committed to git | Medium | Write `.claude/settings.json` to `.gitignore`. Consider using global Claude config instead. Log warning if `.gitignore` write fails. |
| **MCP server bundling complexity** | Medium -- electron-vite may not easily support a second entry point | Medium | Investigate early. Fallback: ship MCP server as a standalone script in app resources, not built by electron-vite. |
| **Claude Code does not read `.claude/settings.md`** | High -- agent instructions would not work | Low | Verify that Claude Code reads this file. If not, investigate the correct path (may be `.claude/CLAUDE.md` or project root `CLAUDE.md`). The env vars provide a fallback regardless. |
| **MCP SDK compatibility** | Medium -- `@modelcontextprotocol/sdk` may have breaking changes | Low | Pin the SDK version. The MCP protocol is stable. |
| **Race condition: settings written after shell starts** | Low -- agent could start before settings are ready | Low | Write settings synchronously before `PtyManager.spawn()`. File writes are fast (<10ms). |
| **Stale settings from killed sessions** | Low -- leftover files if process is killed without cleanup | Medium | Add cleanup sweep on app startup (similar to `sweepStaleSessions`). Check for orphaned `.claude/settings.md` files. |
| **Backend down during MCP calls** | Low -- MCP tools would fail | Medium | Return descriptive errors from MCP tools. Claude Code handles tool errors gracefully. Agent terminal continues to work. |

## Open Questions

### OQ-1: Where to write MCP config -- project-local vs global?

**Option A (project-local)**: Write `.claude/settings.json` in the project directory. Simple, works immediately, but puts an auth token in the project directory (mitigated by `.gitignore`).

**Option B (global)**: Write to `~/.claude/settings.json` with project-scoped config. No secrets in the project directory, but requires understanding Claude Code's global config format and may conflict with user's existing global config.

**Recommendation**: Start with Option A (project-local) since it is simpler and the `.gitignore` mitigation is sufficient. Move to global config in a future iteration if the token-in-project concern proves problematic.

### OQ-2: Should `add_task_note` (FR-6) be in this phase?

Adding task notes requires a new backend model, migration, resolver, and GraphQL types. This is significant scope. The `get_current_task` and `update_task_status` tools provide most of the value.

**Recommendation**: Defer `add_task_note` to Phase 3. Ship Phase 2 with `get_current_task` and `update_task_status` only. This keeps the backend changes minimal (just the `taskByDisplayId` query).

### OQ-3: How to pass task metadata to the main process?

**Option A**: Expand the IPC payload (renderer passes metadata).
**Option B**: Main process fetches from backend.

See the IPC Changes section above for the full analysis. Option A is recommended.

### OQ-4: Should `.claude/settings.md` be used, or should Orca append to the project's existing `CLAUDE.md`?

Appending to `CLAUDE.md` is risky -- it modifies a user-maintained file. Creating a separate `.claude/settings.md` is safer but requires Claude Code to read that path.

**Action needed**: Verify which files Claude Code reads for project context. If `.claude/settings.md` is not supported, alternatives include:
- Writing a `.claude/CLAUDE.md` file (Claude Code reads `.claude/` directory contents)
- Creating a temporary `CLAUDE.local.md` that Claude Code picks up
- Relying solely on env vars and MCP tools (no file-based instructions)

### OQ-5: MCP server lifecycle -- per-session or shared?

**Option A (per-session)**: Each Claude Code instance spawns its own MCP server process via stdio. Simple, isolated, but means N processes for N terminals.

**Option B (shared)**: A single MCP server runs as part of the Electron app, and Claude Code connects via HTTP/SSE. More efficient but more complex.

**Recommendation**: Option A (per-session via stdio). Claude Code natively supports stdio MCP servers, and the overhead of a lightweight Node.js process is negligible. The server only lives as long as the Claude Code session.

### OQ-6: How to resolve the MCP server script path at runtime?

The MCP server script needs to be bundled and its path known at runtime when writing `.claude/settings.json`. In development, it is in the source tree. In production, it is inside the Electron app bundle (`app.asar`). Scripts inside `app.asar` cannot be executed directly by `node`.

**Options**:
- Extract the MCP server to `app.getPath('userData')` at startup
- Use electron-vite's `extraResources` to place it outside `app.asar`
- Bundle it as a standalone executable

**Action needed**: Investigate electron-vite's resource handling to determine the best approach.
