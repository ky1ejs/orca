# Menu Bar Tray Status Indicator Specification
---
created: 2026-03-09
author: spec-writer skill
status: Draft
---

## TL;DR

Add a macOS menu bar tray item to the Electron app that shows at-a-glance agent status counts: in-progress, idle, and needs-attention. The tray appears only when active sessions exist, and clicking it focuses the main Orca window.

## Purpose

### Problem Statement

Users running multiple Claude Code agents have no persistent, ambient visibility into agent status without switching to the Orca window. The existing dock badge only shows the "needs attention" count, and it's easy to miss. Users must context-switch to Orca to check whether agents are working, stuck, or waiting.

### Goals

- Show a persistent, scannable summary of agent states in the macOS menu bar
- Distinguish three categories: actively working (▶), idle/no recent output (⏸), and blocked on user action (⚠)
- Keep the menu bar clean by only showing the tray when there are active sessions
- Provide one-click access to the main Orca window

### Non-Goals (Out of Scope)

- Dropdown menu with per-agent details (future enhancement — would also address the limitation that `⚠` groups `WaitingForInput`, `AwaitingPermission`, and `Error` into a single count without distinguishing them)
- Clicking individual counts to filter/navigate to specific agents
- Windows/Linux system tray support (Electron `Tray` works cross-platform, but this spec targets macOS only)
- Replacing the existing dock badge (both will coexist)

---

## Requirements

### Functional Requirements

1. **Tray creation**: A macOS menu bar tray item is created when at least one active session exists (status is `Starting`, `Running`, `WaitingForInput`, or `AwaitingPermission`).
2. **Tray destruction**: The tray is destroyed when no active sessions remain.
3. **Display format**: The tray shows a monochrome Orca template icon followed by three counts with symbols: `[icon] 2▶ 0⏸ 1⚠`. All three categories are always shown, even when zero, for consistent layout.
4. **Tooltip**: The tray shows a tooltip on hover: `"2 working, 0 idle, 1 needs attention"` — providing a self-documenting explanation of the symbols for first-time users.
5. **Category definitions**:
   - **▶ In progress**: Sessions with status `Running` or `Starting` that have had PTY output within the last 20 seconds.
   - **⏸ Idle**: Sessions with status `Running` or `Starting` that have had no PTY output for 20+ seconds. Note: agents may appear idle when reading large codebases or thinking deeply — this is a known limitation. The 20-second threshold is a named constant that can be tuned based on user feedback.
   - **⚠ Needs attention**: Sessions with status `WaitingForInput`, `AwaitingPermission`, or `Error`.
6. **Click behavior**: Clicking the tray icon focuses the main Orca window. If the window was closed (but the app is still running on macOS), it recreates and shows the window (using the existing `createWindow()` function).
7. **Real-time updates**: Counts update in real-time as session statuses and activity states change.

### Non-Functional Requirements

- **Performance**: Tray title updates are debounced (100ms) to prevent flickering during rapid state changes.
- **Platform**: Uses Electron's `Tray` API with macOS template image convention (automatic light/dark mode adaptation).
- **Reliability**: Tray hides on daemon disconnect and reinitializes on reconnect. On reconnect, all sessions are initialized as "not idle" — they may show as in-progress for up to 20 seconds before the idle timer kicks in. This is an acceptable tradeoff vs. adding idle-state queries to the daemon protocol.

---

## Architecture & Design

### Overview

The feature is contained entirely in the Electron main process. No daemon changes are needed — the existing `SESSION_ACTIVITY_CHANGED` event (1.5-second threshold) provides the activity signal, and `TrayManager` applies its own 20-second idle timer per session.

```
Daemon (status-manager.ts) — UNCHANGED
  └── Broadcasts existing events:
      ├── session.statusChanged
      ├── session.activityChanged (active: boolean, 1.5s threshold)
      └── pid-sweep.sessions-died
         │
         ▼
Electron Main (index.ts)
  ├── Forwards events to TrayManager (new)
  ├── TrayManager — maintains session state map, per-session idle timers, computes counts, updates Tray
  └── DockBadgeManager (existing) — unchanged
```

### Data Model

No database or protocol schema changes. The idle state is derived entirely in `TrayManager` using per-session timers that start when `SESSION_ACTIVITY_CHANGED` fires with `active: false` and cancel when it fires with `active: true`.

**TrayManager internal state:**

```typescript
interface TrackedSession {
  status: string;
  idle: boolean;       // true when no PTY output for 20s
  idleTimer: ReturnType<typeof setTimeout> | null;
}

// Map<sessionId, TrackedSession>
```

### API Changes

No GraphQL, backend, or daemon protocol changes.

### Component Design

#### Electron Main: `TrayManager` (`web/src/main/tray-manager.ts`)

New class following the same pattern as `DockBadgeManager`:

```typescript
import { app, Tray, BrowserWindow, nativeImage } from 'electron';
import { isActiveSessionStatus, isNeedsAttentionStatus } from '../shared/session-status.js';

const DEBOUNCE_MS = 100;
const IDLE_TIMEOUT_MS = 20_000;

interface TrackedSession {
  status: string;
  idle: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export class TrayManager {
  private tray: Tray | null = null;
  private sessions = new Map<string, TrackedSession>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private iconPath: string;
  private createWindowFn: () => void;

  constructor(iconPath: string, createWindowFn: () => void) {
    this.iconPath = iconPath;
    this.createWindowFn = createWindowFn;
  }

  handleStatusChange(sessionId: string, status: string): void {
    if (isActiveSessionStatus(status)) {
      const existing = this.sessions.get(sessionId);
      this.sessions.set(sessionId, {
        status,
        idle: existing?.idle ?? false,
        idleTimer: existing?.idleTimer ?? null,
      });
    } else {
      const existing = this.sessions.get(sessionId);
      if (existing?.idleTimer) clearTimeout(existing.idleTimer);
      this.sessions.delete(sessionId);
    }
    this.scheduleUpdate();
  }

  handleActivityChange(sessionId: string, active: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (active) {
      // Activity resumed — cancel idle timer, mark as not idle
      if (session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
      }
      if (session.idle) {
        session.idle = false;
        this.scheduleUpdate();
      }
    } else {
      // Activity stopped — start idle timer (20s)
      if (!session.idleTimer && !session.idle) {
        session.idleTimer = setTimeout(() => {
          session.idleTimer = null;
          session.idle = true;
          this.scheduleUpdate();
        }, IDLE_TIMEOUT_MS);
      }
    }
  }

  handleSessionsDied(sessionIds: string[]): void {
    for (const id of sessionIds) {
      const existing = this.sessions.get(id);
      if (existing?.idleTimer) clearTimeout(existing.idleTimer);
      this.sessions.delete(id);
    }
    this.scheduleUpdate();
  }

  initFromSessions(sessions: Array<{ id: string; status: string }>): void {
    // Clear all existing timers
    for (const session of this.sessions.values()) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
    }
    this.sessions.clear();
    for (const s of sessions) {
      if (isActiveSessionStatus(s.status)) {
        this.sessions.set(s.id, { status: s.status, idle: false, idleTimer: null });
      }
    }
    this.scheduleUpdate();
  }

  clear(): void {
    for (const session of this.sessions.values()) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
    }
    this.sessions.clear();
    this.destroyTray();
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.updateTray();
    }, DEBOUNCE_MS);
  }

  private updateTray(): void {
    if (this.sessions.size === 0) {
      this.destroyTray();
      return;
    }

    let inProgress = 0;
    let idle = 0;
    let attention = 0;

    for (const session of this.sessions.values()) {
      if (isNeedsAttentionStatus(session.status)) {
        attention++;
      } else if (session.idle) {
        idle++;
      } else {
        inProgress++;
      }
    }

    const title = ` ${inProgress}▶ ${idle}⏸ ${attention}⚠`;
    const tooltip = `${inProgress} working, ${idle} idle, ${attention} needs attention`;

    if (!this.tray) {
      const icon = nativeImage.createFromPath(this.iconPath);
      icon.setTemplateImage(true);
      this.tray = new Tray(icon);
      this.tray.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.show();
          win.focus();
        } else {
          this.createWindowFn();
        }
      });
    }

    this.tray.setTitle(title);
    this.tray.setToolTip(tooltip);
  }

  private destroyTray(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
```

#### Electron Main: Integration (`index.ts`)

Wire the `TrayManager` alongside `DockBadgeManager`:

```typescript
const trayIconPath = path.join(__dirname, '../../resources/orcaTemplate.png');
const trayManager = new TrayManager(trayIconPath, createWindow);

// In setupDaemonEventForwarding, add to existing SESSION_STATUS_CHANGED handler:
trayManager.handleStatusChange(sessionId, status);

// In existing SESSION_ACTIVITY_CHANGED handler, add:
trayManager.handleActivityChange(sessionId, active);

// In existing PID_SWEEP_SESSIONS_DIED handler, add:
trayManager.handleSessionsDied(sessionIds);

// In resubscribeToActiveSessions, add:
trayManager.initFromSessions(sessions);

// In before-quit, add:
trayManager.clear();

// On daemon disconnect, add:
trayManager.clear();

// On daemon reconnect (inside resubscribeToActiveSessions):
// initFromSessions already handles this
```

#### `isNeedsAttentionStatus` Update (`session-status.ts`)

Add `Error` to `NEEDS_ATTENTION_STATUSES` so that both the dock badge and tray treat error sessions consistently:

```typescript
const NEEDS_ATTENTION_STATUSES: readonly SessionStatus[] = [
  SessionStatus.AwaitingPermission,
  SessionStatus.WaitingForInput,
  SessionStatus.Error,  // Added — error sessions need user attention
];
```

This is the right change because `Error` sessions genuinely need attention (the agent crashed/failed), and having the dock badge and tray disagree would erode user trust in both indicators.

#### Template Image Asset

Create a 16x16 monochrome PNG of the Orca logo:

- `web/resources/orcaTemplate.png` (16x16, 1x)
- `web/resources/orcaTemplate@2x.png` (32x32, 2x)

The `Template` suffix tells macOS to automatically adapt the image for light/dark menu bar. The image should be black with alpha transparency — macOS handles the color inversion.

### Error Handling

- **Daemon disconnect**: `TrayManager.clear()` is called, destroying the tray and all idle timers. On reconnect, `initFromSessions()` rebuilds state (all sessions start as "not idle," which self-corrects within 20 seconds).
- **Window closed but app running**: The tray remains visible. Clicking it calls `createWindowFn()` to recreate the window.
- **Session exits to `Exited`**: `handleStatusChange` removes the session and clears its idle timer. If no active sessions remain, tray is destroyed.
- **`Error` status sessions**: Counted under ⚠ via `isNeedsAttentionStatus`. Consistent with dock badge behavior.

---

## Implementation Steps

| Step | Task | Description | Depends On |
|------|------|-------------|------------|
| 1 | Create template image assets | Create `orcaTemplate.png` and `orcaTemplate@2x.png` in `web/resources/`. | None |
| 2 | Add `Error` to `isNeedsAttentionStatus` | Update `NEEDS_ATTENTION_STATUSES` in `session-status.ts` to include `SessionStatus.Error`. | None |
| 3 | Create `TrayManager` class | New file `web/src/main/tray-manager.ts` with the class implementation including per-session idle timers. | None |
| 4 | Wire `TrayManager` into `index.ts` | Hook into existing daemon event subscriptions, initialize on startup/reconnect, clean up on quit/disconnect. | Step 3 |
| 5 | Write unit tests | Test `TrayManager` count computation, tray creation/destruction, idle timer behavior, debouncing. | Step 3 |
| 6 | Manual validation | Build and run the app, launch agents, verify tray appears/disappears, counts update, click behavior works. | Steps 1-4 |

---

## Validation & Testing Plan

### Unit Tests

- [ ] `TrayManager`: creates tray when first active session is added
- [ ] `TrayManager`: destroys tray when last active session is removed
- [ ] `TrayManager`: correctly counts in-progress (active, not idle, not attention)
- [ ] `TrayManager`: correctly counts idle (idle timer has fired)
- [ ] `TrayManager`: correctly counts attention (`WaitingForInput`, `AwaitingPermission`, `Error`)
- [ ] `TrayManager`: `handleStatusChange` removes session when status transitions to `Exited`
- [ ] `TrayManager`: `handleSessionsDied` removes sessions and clears idle timers
- [ ] `TrayManager`: `initFromSessions` rebuilds state from session list with all sessions not idle
- [ ] `TrayManager`: debounces rapid updates (multiple changes within 100ms result in single tray update)
- [ ] `TrayManager`: formats title correctly as ` N▶ N⏸ N⚠`
- [ ] `TrayManager`: sets tooltip as `"N working, N idle, N needs attention"`
- [ ] `TrayManager`: `handleActivityChange` with `active: false` starts 20s idle timer
- [ ] `TrayManager`: `handleActivityChange` with `active: true` cancels idle timer and resets idle state
- [ ] `TrayManager`: idle timer fires after 20s and marks session as idle
- [ ] `TrayManager`: click creates window when no windows exist
- [ ] `TrayManager`: `clear()` cleans up all idle timers

### Manual Testing

- [ ] Launch an agent, verify tray appears in menu bar with `1▶ 0⏸ 0⚠`
- [ ] Wait 20+ seconds without agent output, verify count shifts to `0▶ 1⏸ 0⚠`
- [ ] Trigger a permission prompt, verify count shifts to `0▶ 0⏸ 1⚠`
- [ ] Stop all agents, verify tray disappears
- [ ] Click tray icon, verify Orca window focuses
- [ ] Close Orca window, click tray icon, verify window is recreated
- [ ] Hover over tray icon, verify tooltip shows human-readable status
- [ ] Verify tray adapts to light/dark menu bar theme
- [ ] Launch multiple agents, verify counts are correct across categories
- [ ] Verify dock badge now also shows count for `Error` sessions

### Acceptance Criteria

- [ ] Tray appears in menu bar only when active sessions exist
- [ ] Three counts always displayed: in-progress, idle, attention
- [ ] Tooltip provides human-readable labels for the symbols
- [ ] Idle detection triggers after 20 seconds of no PTY output
- [ ] Clicking tray focuses the Orca window (or recreates it)
- [ ] Tray disappears when all sessions end
- [ ] Template image adapts to light/dark mode
- [ ] Dock badge and tray agree on what "needs attention" means

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Template image doesn't look good at 16x16 | Medium | Low | Use a simplified version of the logo (e.g., just the orca fin). Can iterate on the asset without code changes. |
| 20-second idle threshold too aggressive (agents thinking/reading appear idle) | Medium | Low | Extract as a named constant (`IDLE_TIMEOUT_MS`). Easy to tune later based on user feedback. The tooltip helps — "idle" is explained as a neutral state, not an error. |
| Tray title flickering during rapid state transitions | Low | Medium | 100ms debounce on `scheduleUpdate()` prevents visible flickering. |
| Adding `Error` to `isNeedsAttentionStatus` changes dock badge behavior | Medium | Low | This is intentional — `Error` sessions genuinely need attention. The dock badge should show them too. Verify in manual testing that the dock badge still works correctly. |

---

## Open Questions

- [x] ~~Should `Error` sessions count as "needs attention" or be ignored?~~ Needs attention (⚠), and `isNeedsAttentionStatus` is updated to match, keeping dock badge and tray consistent.
- [x] ~~Should the idle threshold be configurable?~~ No — hardcode at 20 seconds, tune if needed later.
- [x] ~~Should the tray have a right-click context menu?~~ No — click to focus is sufficient for v1.
- [x] ~~Should idle detection be in the daemon or main process?~~ Main process (TrayManager). Uses existing `SESSION_ACTIVITY_CHANGED` event + per-session timers. Zero daemon changes.
- [ ] What simplified icon works well at 16x16 for the template image? (Deferred to implementation — try the full logo first, simplify if needed.)

---

## Review Discussion

### Key Feedback Addressed

- **Simplifier**: Eliminated the daemon idle detection extension entirely. Instead of adding a new `session.idleChanged` event and modifying `MonitorState` in the daemon, idle detection is handled purely in `TrayManager` via per-session timers triggered by the existing `SESSION_ACTIVITY_CHANGED` event. This removes all daemon changes, the new protocol event, and simplifies the feature to a single new file + wiring.
- **User Advocate**: Added `Tray.setToolTip()` with human-readable labels (`"2 working, 0 idle, 1 needs attention"`) so first-time users can understand the symbols without documentation.
- **User Advocate**: Fixed click behavior to recreate the window when no windows exist (using a `createWindowFn` callback), eliminating the dead-end UX when clicking the tray with no open window.
- **User Advocate**: Added `Error` to `isNeedsAttentionStatus` so dock badge and tray agree on what "needs attention" means, preventing inconsistency that would erode user trust.

### Tradeoffs Considered

- **Simplifier suggested hiding zero-count categories** to reduce noise. However, the user explicitly chose "always show all three" during idea exploration for consistent layout. Keeping the user's decision.
- **Simplifier suggested removing the parallelization plan**. Agreed — removed it. The feature is small enough for sequential implementation.
- **User Advocate suggested a linger period** (showing the tray for 5-10 seconds after sessions end). Deferred — adds complexity for marginal benefit. The dock badge and main window already confirm completion.

### Dissenting Perspectives

- **User Advocate raised concern about 20-second idle threshold** being too aggressive (agents may appear idle while thinking/reading). Acknowledged in the spec as a known limitation with the mitigation being a named constant for easy tuning. The tooltip framing ("idle" vs. "needs attention") helps users understand this is informational, not an error state.

---

## Appendix

### Related Files

- `web/src/main/dock-badge.ts` — Existing pattern for tracking session status in main process
- `web/src/main/index.ts` — Daemon event forwarding, app lifecycle, `createWindow()`
- `web/src/shared/session-status.ts` — Status enums, `isActiveSessionStatus`, `isNeedsAttentionStatus`
- `web/src/shared/daemon-protocol.ts` — Daemon event types (`SESSION_ACTIVITY_CHANGED`)
- `web/src/daemon/status-manager.ts` — Session monitoring, PTY activity tracking (unchanged)
- `web/resources/icon.icns` — Existing app icon (reference for template image creation)
