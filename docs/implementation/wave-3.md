# Wave 3: Terminal UI || Agent Launch + Status

**Status**: Not Started
**Depends on**: Wave 2 fully merged to `main`. node-pty gating check MUST have passed.
**Agents**: 2 in parallel (3A and 3B)
**Merge order**: 3A first (provides rendering surface), then 3B

## Why These Parallelize

Terminal UI is renderer-side (`web/src/renderer/components/terminal/`). Agent launch + status management is main-process-side (`web/src/main/pty/`) plus some hooks. They work on different sides of the IPC boundary.

---

## Agent 3A: xterm.js Terminal Component + Tabbed View

**Status**: Not Started
**Branch**: `wave-3/terminal-ui`

### Agent Startup

Before writing any code, read these files in order:

1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-3.md) — your deliverables are in the "Agent 3A" section only
4. `web/src/preload/index.ts` — the IPC API exposed to the renderer (PTY channels)
5. `web/src/renderer/components/layout/AppShell.tsx` — layout you'll modify to add terminal panel

### Reference: IPC Channels Available (from Wave 2B)

These PTY IPC channels are exposed via the preload script:

- `pty:spawn` — create new PTY session (params: command, cwd)
- `pty:write` — send data to PTY (params: sessionId, data)
- `pty:resize` — resize PTY (params: sessionId, cols, rows)
- `pty:kill` — kill PTY session (params: sessionId)
- `pty:replay` — get ring buffer contents (params: sessionId) -> returns buffered output
- `pty:onData` — subscribe to PTY output (params: sessionId, callback)
- `pty:onExit` — subscribe to PTY exit (params: sessionId, callback)

### File Ownership

This agent may ONLY modify files in:

- `web/src/renderer/components/terminal/**` (create)
- `web/src/renderer/hooks/useTerminal.ts` (create)
- `web/src/renderer/hooks/useTerminalSessions.ts` (create)
- `web/src/renderer/components/layout/AppShell.tsx` (modify — add terminal panel)
- `web/package.json` (add dependencies)

Do NOT touch `web/src/main/`, `web/src/preload/`, `shared/`, or `backend/`.

### Context

After Wave 2, the following exist:

- PTY manager in main process with IPC handlers (`pty:spawn`, `pty:write`, `pty:resize`, `pty:kill`, `pty:replay`, `pty:onData`, `pty:onExit`)
- Output ring buffer storing terminal output in SQLite
- Full navigation UI with project/task CRUD
- Preload script exposing PTY IPC channels to renderer

### Deliverables

- [ ] **`AgentTerminal.tsx`** (`web/src/renderer/components/terminal/`):
  - [ ] Renders xterm.js Terminal instance in a container
  - [ ] Connects to PTY output via IPC (`pty:onData`)
  - [ ] Sends user keyboard input to PTY via IPC (`pty:write`)
  - [ ] Handles terminal resize via `@xterm/addon-fit` + `pty:resize`
  - [ ] On mount: replays ring buffer via `pty:replay`
  - [ ] Addon: `@xterm/addon-web-links` (clickable URLs)
  - [ ] Proper cleanup on unmount (dispose xterm, remove IPC listeners)
- [ ] **`TerminalTabs.tsx`** (`web/src/renderer/components/terminal/`):
  - [ ] Tab bar showing all active terminal sessions
  - [ ] Each tab: session label (task title or "Terminal"), status dot
  - [ ] Click tab to switch active terminal
  - [ ] Close button on tabs (sends `pty:kill` via IPC)
  - [ ] Tab overflow handling (scrollable if many tabs)
- [ ] **`useTerminal` hook** (`web/src/renderer/hooks/useTerminal.ts`):
  - [ ] Takes `sessionId`, manages IPC connection for one session
  - [ ] Returns `{ write, resize, replay, isConnected }`
  - [ ] Handles cleanup on unmount
- [ ] **`useTerminalSessions` hook** (`web/src/renderer/hooks/useTerminalSessions.ts`):
  - [ ] Lists all active sessions from local SQLite via IPC
  - [ ] Auto-refreshes when sessions are created/destroyed
- [ ] **Layout integration**:
  - [ ] Terminal panel in main content area (below or beside task detail)
  - [ ] Terminal area visible when a session is active for the selected task

### Tests

- [ ] AgentTerminal: renders container, mocks xterm.js, verifies IPC wiring
- [ ] TerminalTabs: renders tabs, switching sets correct active session
- [ ] useTerminal: manages IPC lifecycle correctly
- [ ] Resize handling: fit addon triggers `pty:resize`

### Validation

```bash
bun run validate                     # Must pass (from repo root)
# Full-stack test:
docker compose up -d && cd backend && bun run dev &
cd web && bun run dev
# Verify:
# - Navigate to a task, terminal area visible
# - Open a terminal, type commands, see output
# - Switch between tabs, ring buffer replays
# - Resize window, terminal resizes
```

---

## Agent 3B: Agent Launch Flow + Status Management + Error Handling

**Status**: Not Started
**Branch**: `wave-3/agent-launch`

### Agent Startup

Before writing any code, read these files in order:

1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-3.md) — your deliverables are in the "Agent 3B" section only
4. `web/src/main/pty/manager.ts` — PTY manager you'll coordinate with
5. `web/src/main/db/sessions.ts` — session CRUD for updating status
6. `web/src/main/ipc/handlers.ts` — IPC handlers you'll extend
7. `web/src/renderer/components/tasks/TaskDetail.tsx` — component you'll modify

### Reference: Status Transition Rules

Task status (server-side) and terminal session status (client-side) are coordinated:

| Event                             | Session Status       | Task Status (GraphQL mutation) |
| --------------------------------- | -------------------- | ------------------------------ |
| Agent starts (PTY spawns)         | STARTING -> RUNNING  | -> IN_PROGRESS                 |
| Agent completes (exit 0)          | -> COMPLETED         | -> IN_REVIEW                   |
| Agent errors (non-zero exit)      | -> ERROR             | stays IN_PROGRESS              |
| Agent waiting for input           | -> WAITING_FOR_INPUT | stays IN_PROGRESS              |
| User manually changes task status | no effect            | user's choice                  |

#### Terminal Session Statuses

`IDLE` -> `STARTING` -> `RUNNING` -> `WAITING_FOR_INPUT` (bidirectional with RUNNING) -> `COMPLETED` or `ERROR`

#### Task Statuses (GraphQL enum)

`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`

### File Ownership

This agent may ONLY modify files in:

- `web/src/main/pty/status.ts` (create)
- `web/src/main/pty/input-detection.ts` (create)
- `web/src/main/pty/errors.ts` (create)
- `web/src/main/ipc/handlers.ts` (extend with agent handlers)
- `web/src/preload/index.ts` (extend with agent IPC channels)
- `web/src/renderer/components/tasks/TaskDetail.tsx` (modify — add launch button)
- `web/src/renderer/components/terminal/AgentStatus.tsx` (create)
- `web/package.json` (add dependencies if needed)

Do NOT touch `shared/`, `backend/`, or terminal rendering components (`AgentTerminal.tsx`, `TerminalTabs.tsx`).

### Context

After Wave 2, the following exist:

- PTY manager: `spawn`, `write`, `resize`, `kill` via IPC
- Session records in SQLite (terminal_session table)
- Claude Code spawn helper with PATH detection
- Task CRUD via GraphQL with status field (TODO, IN_PROGRESS, IN_REVIEW, DONE)
- TaskDetail component showing task info

### Deliverables

- [ ] **"Launch Agent" button** (modify `TaskDetail.tsx`):
  - [ ] Button on task detail view
  - [ ] Pre-launch checks: `claude` on PATH, working directory exists
  - [ ] Launch options: blank TUI (default) or pass task context (title + description)
  - [ ] Button states: "Launch" (no agent), "Running..." (agent active), "Restart" (agent errored)
- [ ] **Status transition engine** (`web/src/main/pty/status.ts`):
  - [ ] Agent starts -> session STARTING -> RUNNING; task -> IN_PROGRESS (GraphQL mutation)
  - [ ] Agent completes (exit 0) -> session COMPLETED; task -> IN_REVIEW (GraphQL mutation)
  - [ ] Agent errors (non-zero exit) -> session ERROR; task stays IN_PROGRESS
  - [ ] Agent waiting -> session WAITING_FOR_INPUT; task stays IN_PROGRESS
  - [ ] Updates both local SQLite and server-side task status
- [ ] **WAITING_FOR_INPUT detection** (`web/src/main/pty/input-detection.ts`):
  - [ ] Regex pattern matching on PTY output for Claude Code prompts
  - [ ] Configurable pattern list
  - [ ] Debounce: avoid flickering between RUNNING and WAITING_FOR_INPUT
- [ ] **`AgentStatus.tsx`** (`web/src/renderer/components/terminal/`):
  - [ ] Color-coded status badge:
    - Green = RUNNING
    - Yellow = WAITING_FOR_INPUT
    - Gray = COMPLETED
    - Red = ERROR
    - Blue = IDLE/STARTING
  - [ ] WAITING_FOR_INPUT displays prominently (pulsing or attention-grabbing)
  - [ ] Used on: task cards, terminal tabs, task detail
- [ ] **Error handling** (`web/src/main/pty/errors.ts`):
  - [ ] `ClaudeNotFoundError` — "Claude Code not installed. Install: ..."
  - [ ] `AuthNotConfiguredError` — "Claude Code auth not configured. Run: claude login"
  - [ ] `PtySpawnError` — "Failed to start terminal session. Try: ..."
  - [ ] `ProcessCrashError` — "Agent crashed. Exit code: N. You can restart."
  - [ ] `InvalidWorkingDirectoryError` — "Directory 'X' not found. Update task."
  - [ ] Each error has a `suggestion` field
  - [ ] Error display component in renderer
- [ ] **IPC handlers for agent lifecycle** (extend `web/src/main/ipc/handlers.ts`):
  - [ ] `agent:launch` — pre-checks + spawn Claude Code for a task
  - [ ] `agent:stop` — graceful stop (SIGTERM, then SIGKILL after timeout)
  - [ ] `agent:restart` — stop + re-launch
  - [ ] `agent:status` — get current status for a session

### Tests

- [ ] Status transitions: all paths from the rules above
- [ ] Error handling: each error type produces correct message + suggestion
- [ ] WAITING_FOR_INPUT: detects known prompt patterns in mock output
- [ ] WAITING_FOR_INPUT: debounce prevents rapid state flickering
- [ ] Pre-launch: missing `claude` binary produces ClaudeNotFoundError
- [ ] Pre-launch: invalid working directory produces InvalidWorkingDirectoryError
- [ ] Launch button: correct state for each agent status

### Validation

```bash
bun run validate                     # Must pass (from repo root)
# Full-stack test:
docker compose up -d && cd backend && bun run dev &
cd web && bun run dev
# Verify:
# - Create project + task with valid working directory
# - Click "Launch Agent" -> Claude Code starts (or error if not installed)
# - Task status changes to IN_PROGRESS in sidebar
# - Agent completes -> task moves to IN_REVIEW
# - Set invalid working dir -> clear error message
# - Kill agent process externally -> error state detected
```
