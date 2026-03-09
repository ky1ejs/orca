# Claude Code Lifecycle Detection via Hooks
---
created: 2026-03-08
author: Kyle (spec-writer skill, reviewed by spec-orchestrator)
status: Implemented
pr: https://github.com/ky1ejs/orca/pull/69
worktree: ../worktrees/orca/feat/claude-lifecycle-hooks
branch: feat/claude-lifecycle-hooks
---

## TL;DR

Replace Orca's fragile regex-based terminal output detection (`InputDetector`) with Claude Code's official HTTP hooks system. Hooks POST lifecycle events (Stop, PermissionRequest, UserPromptSubmit) to a lightweight HTTP server in Orca's Electron main process, giving deterministic status detection. Adds a new `AWAITING_PERMISSION` status to distinguish permission prompts from end-of-turn waiting.

## Purpose

### Problem Statement

Orca needs to know when a Claude Code session is waiting for user input so it can surface accurate status to users managing multiple concurrent agents. The current `InputDetector` (`web/src/main/pty/input-detection.ts`, 68 lines) uses 8 regex patterns matched against the last 500 characters of terminal output, polled every 500ms:

```
/\?\s*$/              — false positive: Claude's rhetorical questions, file content
/\(y\/N\)\s*$/i       — missed when ANSI codes split the prompt
/>\s*$/               — false positive: markdown blockquotes, HTML, code diffs
/Press Enter/i        — false positive: appears in Claude's explanatory text
/Continue\?/i         — false positive: appears in non-interactive output
```

**Impact:**
- **False positive "waiting"**: user switches to a session that appears stuck, but Claude is working. Unnecessary context switch.
- **False negative "running"**: Claude is waiting for permission approval but shows as "running." The agent silently stalls and the user doesn't know to intervene. This is the worse failure — agents block without visibility.

### Goals

- Deterministic lifecycle state detection using Claude Code's official hooks API
- Distinguish permission prompts from end-of-turn waiting (new `AWAITING_PERMISSION` status)
- Near-instant status updates (HTTP POST vs 500ms polling + 500ms debounce)
- Graceful fallback for sessions where hooks don't fire (old Claude versions, manual `claude` invocation)

### Non-Goals (Out of Scope)

- Notifications/escalation when agents need attention (future feature enabled by this infrastructure)
- Replacing the PTY/xterm.js terminal with a custom UI (Agent SDK approach — different product decision)
- Richer lifecycle states beyond permission vs. end-of-turn (e.g., thinking, tool execution — future)
- Changing how sessions are launched (login shell flow preserved)

---

## Requirements

### Functional Requirements

1. **Hook-based status detection**: When Claude fires a `Stop` hook, session status updates to `WAITING_FOR_INPUT`. When `PermissionRequest` fires, status updates to `AWAITING_PERMISSION`. When `UserPromptSubmit` fires, status updates to `RUNNING`.
2. **Hooks config management**: Orca writes its hooks to `.claude/settings.local.json` in the project directory before session launch. Orca hooks are identified by URL path (`/orca-hooks`) and are merged with (not replacing) any existing user config. On session stop, Orca hooks are removed.
3. **Session identification**: Each PTY is spawned with `ORCA_SESSION_ID` env var. HTTP hooks interpolate this into a header (`X-Orca-Session-Id`) via `allowedEnvVars`, routing events to the correct session.
4. **Fallback**: `InputDetector` starts alongside hooks for every session. On the first hook event received for a session, that session's `InputDetector` is disabled. Sessions that never receive hooks (old Claude, manual invocation) continue using regex detection.
5. **New status in UI**: `AWAITING_PERMISSION` displayed as orange pulsing badge with "Needs permission" label.
6. **Instant renderer updates**: Hook-driven status changes pushed to renderer via IPC (existing `BrowserWindow.webContents.send()` pattern), supplementing the 2s polling in `useTerminalSessions`.

### Non-Functional Requirements

- **Performance:** HTTP server responds `200` immediately to avoid blocking Claude. Stop events debounced at 200ms; debounce cancelled by any RUNNING transition.
- **Security:** Server binds to `127.0.0.1` only (loopback, no network exposure). Local-only attack surface acceptable for desktop app.
- **Compatibility:** No breaking changes. Login shell launch flow unchanged. Existing sessions and status transitions continue to work.

---

## Architecture & Design

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Electron Main Process                                       │
│                                                             │
│  ┌──────────────┐    ┌──────────────────┐                   │
│  │  HookServer   │◄───│ Claude Code Hook  │                  │
│  │  (127.0.0.1:0)│    │ HTTP POST         │                  │
│  └──────┬───────┘    └──────────────────┘                   │
│         │                                                    │
│         │ emit('hook', { sessionId, eventName })             │
│         ▼                                                    │
│  ┌──────────────┐    ┌──────────────────┐                   │
│  │ StatusManager │───►│ SQLite sessions   │                  │
│  │  (hook        │    │ (status update)   │                  │
│  │   listener)   │    └──────────────────┘                   │
│  └──────┬───────┘                                           │
│         │ BrowserWindow.send('session:status-changed')       │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │  Renderer     │  AgentStatus.tsx shows updated badge      │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘

Configuration:
  StatusManager.launch()
    → ensureHooks(workingDir, port)  writes to .claude/settings.local.json
    → PtyManager.spawn(env: { ORCA_SESSION_ID })
    → login shell starts → user/Orca types `claude` → Claude reads hooks from settings
```

### Data Model

**`SessionStatus` enum** (`web/src/shared/session-status.ts`) — add one value:

```typescript
export enum SessionStatus {
  Starting = 'STARTING',
  Running = 'RUNNING',
  WaitingForInput = 'WAITING_FOR_INPUT',
  AwaitingPermission = 'AWAITING_PERMISSION',  // NEW
  Exited = 'EXITED',
  Error = 'ERROR',
}
```

Add `AwaitingPermission` to `ACTIVE_SESSION_STATUSES` and `statusDotClass`.

No SQLite schema changes — `status` column already stores strings.

### Component Design

#### `HookServer` (`web/src/main/hooks/server.ts`)

Lightweight HTTP server using Node's built-in `http` module (zero dependencies):

- Binds to `127.0.0.1:0` (OS-assigned port)
- Handles `POST /orca-hooks` — reads `X-Orca-Session-Id` header, parses JSON body for `hook_event_name`
- Emits typed events via `EventEmitter` (typed interface, not string-based)
- Responds `200 OK` immediately — must not block Claude
- Guards: ignores events for sessions in `EXITED` or `ERROR` state
- Lifecycle: `start()` → `stop()` → `getPort()`

#### Hook settings functions (`web/src/main/hooks/settings.ts`)

Stateless functions (not a class) for managing `.claude/settings.local.json`:

- `ensureHooks(workingDirectory: string, port: number): void` — reads existing file, deep-merges Orca hook entries (identified by `/orca-hooks` in URL), writes back. Idempotent — safe to call multiple times. Creates `.claude/` directory if needed.
- `removeHooks(workingDirectory: string): void` — removes only Orca-identified hooks (URL contains `/orca-hooks`), preserves all other user config. If resulting object is empty (`{}`), deletes the file.

#### `PtyManager.spawn()` change (`web/src/main/pty/manager.ts`)

Add optional `env` parameter:

```typescript
spawn(sessionId: string, command: string, args: string[], cwd: string, env?: Record<string, string>): void
```

When `env` is provided, passes `{ ...process.env, ...env }` to `pty.spawn()` options. When omitted, current behavior preserved (node-pty uses `process.env`).

#### `StatusManager` changes (`web/src/main/pty/status.ts`)

- Constructor accepts `hookServerPort` in options
- `launch()`: calls `ensureHooks(workingDirectory, port)` before spawn, passes `{ ORCA_SESSION_ID: sessionId }` to `PtyManager.spawn()`
- `startMonitoring()`: starts both `InputDetector` (existing) AND registers hook event listener
- Hook listener: maps `hook_event_name` → `SessionStatus`, updates SQLite, pushes to renderer
- On first hook event for a session: disables that session's `InputDetector` (sets a `hooksActive` flag, stops feeding output to detector)
- `Stop` events debounced 200ms — **cancelled** by `UserPromptSubmit` or `PermissionRequest` events
- `PermissionRequest` → `AWAITING_PERMISSION` (no debounce — always user-blocking)
- `UserPromptSubmit` → `RUNNING` (immediate)
- `stop()`: calls `removeHooks(workingDirectory)` (best-effort, catches errors)

### Error Handling

| Failure Mode | Behavior |
|---|---|
| HookServer fails to start | Log warning, continue without hooks. InputDetector provides fallback. |
| Hook POST arrives for unknown session | Silently ignored (guard check in listener). |
| Hook POST arrives for EXITED/ERROR session | Silently ignored (guard check). |
| `.claude/settings.local.json` write fails | Log error, continue. Session launches without hooks; InputDetector provides fallback. |
| `.claude/settings.local.json` has invalid JSON | Overwrite with Orca hooks only. Log warning. |
| Claude Code doesn't support hooks | No POSTs arrive. InputDetector remains active (never disabled). |
| Orca crashes, orphaned hooks in settings | Harmless — POST to dead server gets connection refused, Claude continues normally. Cleaned up on next `ensureHooks()` call (port updated). |
| Debounce race (Stop then immediate UserPromptSubmit) | UserPromptSubmit cancels pending Stop debounce. Status correctly shows RUNNING. |

---

## Implementation Steps

| Step | Task | Description | Depends On |
|------|------|-------------|------------|
| 1 | HookServer | Create `web/src/main/hooks/server.ts` — HTTP server with typed EventEmitter | None |
| 2 | Hook settings | Create `web/src/main/hooks/settings.ts` — `ensureHooks`/`removeHooks` functions | None |
| 3 | PtyManager env | Add optional `env` param to `PtyManager.spawn()` | None |
| 4 | SessionStatus enum | Add `AwaitingPermission` to enum, active statuses, dot classes | None |
| 5 | AgentStatus UI | Add `AWAITING_PERMISSION` config to `AgentStatus.tsx` | Step 4 |
| 6 | StatusManager | Integrate hook listener, dual-mode with InputDetector, debounce logic | Steps 1-4 |
| 7 | App lifecycle | Init HookServer in `index.ts`, pass port to StatusManager via handlers | Steps 1, 6 |
| 8 | Renderer push | Add `onSessionStatusChanged` to preload, listen in `useTerminalSessions` | Step 6 |
| 9 | Tests | Unit tests for HookServer, settings functions, StatusManager hook integration | Steps 1-8 |

---

## Validation & Testing Plan

### Unit Tests

- [ ] `web/src/main/hooks/server.test.ts`: Server starts on random port, POST with valid session header emits event, POST without header returns 400, POST with invalid JSON returns 400, GET returns 404, stop releases port
- [ ] `web/src/main/hooks/settings.test.ts`: `ensureHooks` creates file with correct hook config, merges with existing content, is idempotent; `removeHooks` removes only Orca hooks, preserves user hooks, deletes empty file
- [ ] `web/src/main/pty/manager.test.ts` (additions): `spawn` with env merges with process.env, `spawn` without env uses defaults
- [ ] `web/src/main/pty/status.test.ts` (additions): Hook `Stop` → WAITING_FOR_INPUT, `PermissionRequest` → AWAITING_PERMISSION, `UserPromptSubmit` → RUNNING; first hook disables InputDetector; debounce cancelled by UserPromptSubmit; events for unknown/terminated sessions ignored

### Manual Testing

- [ ] Launch session → verify `.claude/settings.local.json` has Orca hooks
- [ ] Trigger permission prompt → status shows "Needs permission" (orange pulse)
- [ ] Approve permission → status returns to "Running" (green)
- [ ] Claude finishes turn → status shows "Waiting for Input" (yellow pulse)
- [ ] Type response → status returns to "Running"
- [ ] Stop session → Orca hooks removed from settings file, user hooks preserved
- [ ] Two sessions in same project dir → independent status tracking
- [ ] Force-quit Orca → relaunch → verify orphaned hooks updated on next session launch

### Acceptance Criteria

- [ ] No false positives from Claude's output text (blockquotes, diffs, questions)
- [ ] Permission prompts detected within 1 second (vs current ~1.5s with polling + debounce)
- [ ] `bun run validate` passes in `web/`
- [ ] InputDetector fallback works when hooks don't fire

---

## Sub-agent Parallelization Plan

### Parallel Group 1: Foundation
**Can start immediately — no dependencies**

Tasks: Steps 1, 2, 3, 4
Agents needed: 2 (one for hooks infrastructure, one for PTY/status changes)
Description: HookServer, settings functions, PtyManager env param, and SessionStatus enum are all independent.

### Parallel Group 2: Integration
**Requires: Group 1 complete**

Tasks: Steps 5, 6, 7, 8
Agents needed: 2 (one for StatusManager + app lifecycle, one for renderer)
Description: Wire everything together — StatusManager hook listener, app lifecycle init, renderer updates.

### Sequential: Tests
**Requires: Group 2 complete**

Tasks: Step 9
Description: Write tests for all new and modified code.

### Execution Diagram

```
Group 1: [HookServer + settings] [PtyManager env + SessionStatus enum]  (parallel)
                        |
                        v
Group 2: [StatusManager + app lifecycle] [AgentStatus + preload + useTerminalSessions]  (parallel)
                        |
                        v
Sequential:  [Tests]
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude Code hook format changes in future version | Low | Med | Hooks identified by URL path — format changes would break all hook consumers, unlikely to happen silently |
| `allowedEnvVars` not supported for HTTP hooks | Low | High | Test before implementing. Fallback: use command hooks with `curl` instead |
| User confused by Orca hooks in settings.local.json | Med | Low | Hooks are clearly identifiable by `/orca-hooks` URL; file is gitignored |
| macOS firewall prompt for localhost HTTP server | Low | Med | Binding to `127.0.0.1` (not `0.0.0.0`) avoids firewall prompts for loopback traffic |
| Race condition: concurrent `ensureHooks` calls for same project | Low | Low | `ensureHooks` is idempotent — concurrent writes produce identical content |

---

## Open Questions

- [x] Should we use `.claude/settings.local.json` or `--settings`? → **Resolved: `.claude/settings.local.json`** (simpler, known merge behavior, preserves login shell)
- [x] Should we distinguish permission from end-of-turn? → **Resolved: Yes** (new `AWAITING_PERMISSION` status)
- [ ] Does Claude Code support `allowedEnvVars` for HTTP hook header interpolation? → **Must verify before implementation** (if not, fall back to command hooks with `curl`)
- [ ] What is the exact JSON field name for the hook event type in the POST body? → **Verify: is it `hook_event_name` or something else?**

---

## Appendix

### Related Files

- `web/src/main/pty/input-detection.ts` — Current regex-based InputDetector (68 lines, retained as fallback)
- `web/src/main/pty/status.ts` — StatusManager orchestrating session lifecycle
- `web/src/main/pty/manager.ts` — PtyManager wrapping node-pty
- `web/src/main/pty/claude.ts` — Claude CLI discovery and spawning (has `findClaudePath()`)
- `web/src/shared/session-status.ts` — SessionStatus enum and CSS classes
- `web/src/renderer/components/terminal/AgentStatus.tsx` — Status badge component
- `web/src/renderer/hooks/useTerminalSessions.ts` — React hook polling sessions every 2s
- `web/src/main/index.ts` — Electron app lifecycle
- `web/src/main/ipc/handlers.ts` — IPC handler registration, StatusManager creation
- `web/src/preload/index.ts` — OrcaAPI context bridge
- `.claude/settings.local.json` — Existing local Claude settings (gitignored)

### Hook Config Reference

Claude Code hooks support these event types relevant to lifecycle detection:
- `Stop` — Claude finished its turn (no matcher support, always fires)
- `PermissionRequest` — Permission dialog appears (matcher on tool name)
- `UserPromptSubmit` — User submitted a prompt (no matcher support, always fires)

HTTP hooks POST JSON containing at minimum `hook_event_name` and `session_id`. Headers can interpolate environment variables via `allowedEnvVars`.

---

## Review Discussion

### Key Feedback Addressed

- **"Don't bypass login shells"** (Pragmatic Architect): Resolved by choosing `.claude/settings.local.json` instead of `--settings` CLI flag. Login shell flow is completely unchanged — hooks are loaded from project settings when Claude starts.
- **"Resolve `--settings` merge behavior first"** (Pragmatic Architect): Eliminated the risk entirely by not using `--settings`. `.claude/settings.local.json` has known, documented merge behavior.
- **"Always start InputDetector, disable on first hook event"** (Paranoid Engineer): Adopted as the fallback strategy. Simple, requires no version detection, and InputDetector is only 68 lines — cheap insurance.
- **"Cancel pending debounce on RUNNING transition"** (Paranoid Engineer): Adopted. Stop debounce (200ms) is explicitly cancelled by UserPromptSubmit or PermissionRequest events.
- **"Single release, no phased migration"** (Simplifier): Adopted. This is an Electron app with binary releases, not a SaaS with rolling deploys. Dual-mode for 2 weeks doesn't make sense.
- **"Minimize file count"** (Simplifier): Reduced from original 5-file proposal to 2 new source files (server + settings functions).

### Tradeoffs Considered

- **Unix domain socket** (Simplifier): Not possible — Claude Code HTTP hooks only support `http://` URLs, not Unix sockets.
- **`--settings` CLI flag** (original Approach 4A): Switched away after reviews identified 3 problems: unknown merge behavior, login shell bypass requiring `bash -l -c` workaround, temp file lifecycle management. `.claude/settings.local.json` is simpler across all dimensions.
- **Deleting InputDetector entirely** (Simplifier): Kept as fallback per Paranoid Engineer's recommendation. 68 lines of code is cheap insurance for sessions where hooks don't fire.
- **Claude Agent SDK** (Approach 2): Would give the best programmatic integration but requires replacing PTY/xterm.js with a custom UI — a multi-week architectural rewrite, not an incremental improvement.

### Dissenting Perspectives

- **Simplifier** argued the whole solution should be ~150 lines in one class. The current design has 2 new source files. The HTTP server is inherently a separate concern from settings file management, and keeping them separate makes testing straightforward.
- **User Advocate** raised notification/escalation (surface "needs permission" beyond just the status dot, e.g., system notifications, sidebar badges). Deferred — the `AWAITING_PERMISSION` status infrastructure enables this, but notification UX design is a separate feature.
