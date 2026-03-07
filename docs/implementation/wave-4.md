# Wave 4: Polish || Hardening + Distribution

**Status**: Complete (4A merged, 4B in review)
**Depends on**: Wave 3 fully merged to `main`
**Agents**: 2 in parallel (4A and 4B)
**Merge order**: Either order

## Why These Parallelize

Polish work focuses on renderer-side UI components and interactions. Hardening focuses on main-process infrastructure (auth, PID management) and build/distribution tooling. Minimal file overlap.

---

## Agent 4A: Polish + Onboarding + Keyboard Shortcuts

**Status**: Merged (PR #17)
**Branch**: `wave-4/polish`

### Agent Startup

Before writing any code, read these files in order:

1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-4.md) — your deliverables are in the "Agent 4A" section only
4. `web/src/renderer/` — explore the existing component structure to understand the UI

### File Ownership

This agent may ONLY modify files in:

- `web/src/renderer/**` (modify/create)
- `web/package.json` (add dependencies if needed)

Do NOT touch `web/src/main/`, `web/src/preload/`, `shared/`, or `backend/`.

### Context

After Wave 3, the full app works end-to-end: create projects/tasks, launch agents, see terminal output, switch between tabs, status transitions work, errors display. This wave makes it feel polished and approachable.

### Deliverables

- [x] **Onboarding flow**:
  - [x] First-run detection (no projects exist)
  - [x] Guided steps: create project -> create task (with working dir) -> launch agent
  - [x] Empty state designs for: project list, task list, terminal area
- [x] **Keyboard shortcuts**:
  - [x] `Cmd+N` — new task in current project
  - [x] `Cmd+Shift+N` — new project
  - [x] `Cmd+T` — new standalone terminal (not task-attached)
  - [x] `Cmd+1` through `Cmd+9` — switch terminal tabs
  - [x] `Cmd+W` — close current terminal tab
  - [x] `Cmd+Enter` — launch or restart agent on current task
  - [x] `Cmd+/` or `?` — shortcut help modal
  - [x] Keyboard event handler (register globally, prevent conflicts with terminal input)
- [ ] **UI polish**:
  - [x] Loading states for all GraphQL operations (skeletons or spinners)
  - [ ] Optimistic updates for mutations (instant feedback) — deferred, subscriptions provide near-instant refresh
  - [x] Sidebar collapse/expand toggle
  - [x] Consistent spacing, colors, typography across all views
  - [x] Terminal/task detail split view refinement
- [x] **Real-time subscription verification**:
  - [x] Confirm subscriptions update UI in real-time
  - [x] Test: change task status via GraphQL directly, UI updates without refresh

### Tests

- [x] Keyboard shortcuts: each shortcut triggers correct action
- [x] Keyboard shortcuts: terminal input not intercepted when terminal focused
- [x] Onboarding: first-run detection works when no projects exist
- [x] Empty states: render correctly for each view
- [x] Loading states: display during async operations

### Validation

```bash
bun run validate                     # Must pass
# Full-stack test:
docker compose up -d && cd backend && bun run dev &
cd web && bun run dev
# Verify:
# - Fresh app (no data): onboarding flow appears
# - Follow onboarding to create project -> task -> launch agent
# - Test all keyboard shortcuts
# - Verify UI feels cohesive and responsive
# - Answer: "Do I reach for Orca instead of raw terminal tabs?"
```

---

## Agent 4B: Auth Hardening + PID Management + Distribution

**Status**: In Review (PR #18)
**Branch**: `wave-4/hardening`

### Agent Startup

Before writing any code, read these files in order:

1. `CLAUDE.md` — project conventions and architecture
2. `docs/implementation/agent-protocol.md` — git workflow and validation rules
3. This file (wave-4.md) — your deliverables are in the "Agent 4B" section only
4. `web/src/main/pty/manager.ts` — PTY manager (PID tracking)
5. `web/src/main/db/sessions.ts` — session CRUD (stale session sweep)
6. `backend/src/auth/token.ts` — existing auth implementation

### Reference: Auth Token Storage

Auth tokens are stored in `~/.orca/config.json` (shared between backend and client). The backend generates the token on first run and writes it to this file. The client reads it via the `db:getAuthToken` IPC handler.

> **Note**: Auth storage will need revisiting for deployment (e.g., proper token exchange, Electron `safeStorage`, per-user credentials). The current shared config file approach is sufficient for local development.

### File Ownership

This agent may ONLY modify files in:

- `web/src/main/**` (modify — auth, PID management)
- `web/src/preload/index.ts` (extend if needed)
- `web/package.json` (add dependencies, build scripts)
- `web/electron-builder.yml` or `web/electron-builder.config.js` (create)
- `backend/src/auth/**` (modify if needed)
- `README.md` at repo root (create — tester instructions)

### Context

After Wave 3, auth exists but is basic (token generated on first run). PID tracking works but doesn't have periodic sweeps. The app runs in dev mode only — no packaged distribution.

### Deliverables

- [x] **Auth hardening**:
  - [x] Server generates persistent token, stores in `~/.orca/config.json` (already implemented)
  - [x] Token displayed on first run with copy instructions
  - [x] Client reads token from `~/.orca/config.json` via `db:getAuthToken` IPC (already implemented)
  - [x] All GraphQL requests require valid token
  - [x] SSE subscriptions authenticated (graphql-yoga uses SSE, NOT WebSocket)
  - [x] Clear error when token is missing or invalid
- [x] **PID management improvements**:
  - [x] Periodic sweep every 60s checking if tracked PIDs are alive (`process.kill(pid, 0)`)
  - [x] Dead PIDs: update session to ERROR, notify renderer
  - [x] Graceful cleanup on app close: SIGTERM all managed PTY processes
  - [x] On startup: sweep all RUNNING/STARTING sessions, verify PIDs
  - [x] Surface to user: "N sessions were interrupted since last run"
- [x] **Distribution prep**:
  - [x] electron-builder config for macOS (DMG + zip)
  - [x] App icon (placeholder — simple icon or text-based)
  - [x] Build scripts: `build:mac` in `web/package.json`
  - [ ] Verify packaged app opens and functions
- [x] **README.md** (repo root):
  - [x] Prerequisites (Bun, Docker, Claude Code)
  - [x] Setup instructions (clone, `bun install` in root + each package, docker compose up, run)
  - [x] How to get the auth token
  - [x] How to share with testers

### Tests

- [x] Auth: request without token returns 401/error
- [x] Auth: request with invalid token returns 401/error
- [x] Auth: request with valid token succeeds
- [x] PID sweep: detects dead PID and updates session
- [x] Cleanup: app close sends SIGTERM to managed PTYs
- [x] Startup sweep: stale RUNNING sessions marked ERROR

### Validation

```bash
bun run validate                     # Must pass (from repo root)
# Auth test:
# - Start server, attempt GraphQL query without token -> rejected
# - Use valid token -> succeeds
# PID test:
# - Launch agent, kill process externally, wait 60s -> session marked ERROR
# Distribution test:
cd web && bun run build:mac
# Open the .dmg / .app — verify it launches and works
```

---

## End-to-End Verification (Post Wave 4)

After both Wave 4 PRs are merged, run through the full checklist:

- [ ] `docker compose up -d` starts Postgres
- [ ] `bun run dev` (from repo root) starts backend + Electron client
- [ ] Create project and tasks through sidebar UI
- [ ] Markdown renders in project/task descriptions
- [ ] Click "Launch Agent" -> Claude Code starts in embedded terminal
- [ ] Live terminal output in xterm.js
- [ ] Switch between terminal tabs, ring buffer replays
- [ ] Agent status updates display correctly (RUNNING, WAITING_FOR_INPUT, EXITED, ERROR)
- [ ] Task status auto-transitions (IN_PROGRESS, IN_REVIEW)
- [ ] Multiple simultaneous agents stable (test 2-3)
- [ ] Stop agent -> EXITED, task -> IN_REVIEW
- [ ] Close and reopen Electron -> stale sessions detected
- [ ] Error scenarios show clear messages with suggestions
- [ ] Test with 2-3 simultaneous agents
- [ ] Kill agent externally -> PID sweep detects it
- [ ] Packaged macOS app opens and functions
- [ ] **User validation: Do I reach for Orca instead of raw terminal tabs?**
