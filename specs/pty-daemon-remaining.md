# PTY Daemon — Remaining Work

## Status

Phases 1–6 are complete and merged. The daemon architecture is fully wired:
- Shared code extracted to `web/src/shared/`
- NDJSON protocol defined in `web/src/shared/daemon-protocol.ts`
- Daemon process in `web/src/daemon/` (PTY manager, status manager, PID sweep, idle timeout, Unix socket server)
- Daemon client + connector in `web/src/main/daemon/`
- Electron main rewired as thin proxy to daemon
- Updater no longer warns about session termination
- Build pipeline includes daemon (`bun run build:daemon`)
- All 204 existing tests pass, lint/format/typecheck clean

## What's Left

### 1. Manual Integration Testing

The core scenario that validates the entire feature:

1. `bun run dev` in `web/` — launch the app
2. Start a terminal session (e.g., run `sleep 300`)
3. Verify `~/.orca/daemon.sock` and `~/.orca/daemon.pid` exist
4. Quit Electron (Cmd+Q) — verify daemon shuts down (PID file gone, socket gone)
5. Relaunch, start a session, then **simulate an update restart**:
   - Set `isAutoUpdateRestart = true` in updater.ts (or call `installUpdate()` with a mock)
   - Quit — verify daemon stays alive (PID file still exists)
   - Relaunch — verify session is still running, output replays correctly, new input works
6. Verify idle timeout: quit with no sessions, confirm daemon exits within 5 minutes

**Likely issues to find:**
- Daemon spawn path in dev mode — `app.getAppPath()` may not resolve to the right place when running via `electron-vite dev`
- Socket permissions on different OS versions
- Native module loading in the daemon process (path resolution for `node-pty` and `better-sqlite3` when bundled)
- Race conditions during rapid connect/disconnect cycles

### 2. Daemon Version Mismatch Handling

When the app updates to a new version but the daemon is still running the old version:

- On connect, the Electron client should call `daemon.status` and compare `result.version` against `app.getVersion()`
- If mismatched: send `daemon.shutdown`, wait for socket to close, spawn the new daemon
- Active sessions are lost in this case (acceptable for v1 — version mismatches only happen on updates, which is infrequent)

**Implementation:**
- Add version check to `DaemonConnector.ensureRunning()` after successful connect
- If mismatch detected, call `daemon.shutdown`, wait, then fall through to the spawn-new-daemon path

### 3. Reconnection UI

The renderer needs to know when the daemon disconnects/reconnects so it can show appropriate UI:

- `daemon:disconnected` and `daemon:reconnected` IPC events are already wired in the preload
- `onDaemonReconnected` and `onDaemonDisconnected` are exposed on `window.orca.lifecycle`
- **TODO**: Add a UI banner/toast in the renderer that shows "Reconnecting to sessions..." during disconnect and "Reconnected — X sessions still running" on reconnect
- Consider re-subscribing to active sessions' PTY data on reconnect (call `pty.subscribe` for each)

### 4. Startup Reconnection Notification

When the app starts and connects to an already-running daemon (e.g., after an update restart):

- Query `daemon.status` to get `activeSessions` count
- If > 0, send a notification to the renderer: "X sessions are still running"
- The renderer should show this as a toast/notification
- The preload already has `onInterruptedSessions` — could repurpose or add a new `onResumedSessions` event

### 5. PTY Subscription on Reconnect

After reconnecting to the daemon, the Electron client needs to re-subscribe to PTY data for any sessions the renderer is currently viewing:

- Option A: Subscribe to all active sessions on reconnect (simple, may send unnecessary data)
- Option B: Have the renderer tell main which sessions it cares about, and main re-subscribes those
- The subscription model (`pty.subscribe`/`pty.unsubscribe`) is already implemented in the daemon

### 6. Integration Tests

Programmatic tests that validate the daemon lifecycle without manual intervention:

```
spawn daemon → connect client → launch session → verify pty.data events flow →
disconnect client → reconnect → verify session still running → replay output →
send daemon.shutdown → verify clean exit
```

- Use the POC script pattern (`ELECTRON_RUN_AS_NODE=1`) for test setup
- Test files: `web/src/daemon/*.test.ts`
- Key scenarios:
  - Basic request/response round-trip
  - PTY spawn + data flow + exit
  - Subscription filtering (only subscribed clients get pty.data)
  - Client disconnect + reconnect
  - Idle timeout triggers shutdown
  - Stale session sweep on startup

### 7. DB Migration Edge Cases

- Test the one-time DB migration from `<Electron userData>/orca.db` to `~/.orca/orca.db`
- Verify WAL/SHM files are copied correctly
- Verify the old DB is not deleted (user can roll back if needed)
- Consider: should we delete the old DB after successful migration to avoid confusion?

## Key Design Decisions (for context)

- **`ELECTRON_RUN_AS_NODE=1`**: Uses the Electron binary as a plain Node.js runtime. No external Node/Bun dependency. Native modules (node-pty, better-sqlite3) share the same ABI.
- **NDJSON over Unix socket**: Simple, debuggable protocol. Each message is a single JSON line. No HTTP overhead.
- **Subscription model**: Clients must call `pty.subscribe(sessionId)` to receive `pty.data` events. Prevents flooding on reconnect. `agent.launch` and `pty.spawn` auto-subscribe the caller.
- **Auth token in memory**: Daemon holds the JWT in memory only (set via `auth.setToken` from Electron). No file-based token storage in the daemon — safeStorage stays in Electron.
- **Idle timeout**: 5-minute safety net. Normal shutdown is explicit via `daemon.shutdown` on quit.
- **DB location**: `~/.orca/orca.db` — shared location outside Electron's userData so the daemon can access it independently.
