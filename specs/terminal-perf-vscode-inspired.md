# Bullet-Proof Terminal Implementation (Inspired by VS Code)

**Task**: ORCA-82
**Status**: Spec
**Created**: 2026-03-10

---

## Context

Orca's terminal has been a source of difficulty. VS Code has the most robust terminal implementation in the open-source ecosystem — they created xterm.js and have iterated on their terminal for 8+ years. This document analyzes VS Code's architecture, compares it with Orca's current implementation, and recommends concrete improvements to achieve a fast, reliable terminal experience.

---

## Current State: What Orca Does Well

Orca's terminal is already well-structured in several areas:
- **Daemon architecture**: PTY processes live in a separate daemon process (survives Electron restarts) — this mirrors VS Code's PTY Host separation
- **ResizeObserver**: Correct approach for layout-aware fitting (better than rAF)
- **Proper cleanup**: Comprehensive disposal in AgentTerminal.tsx (ResizeObserver, listeners, xterm instance)
- **Subscription model**: Only broadcasts PTY data to subscribed clients
- **Kitty keyboard bridge**: Creative workaround for xterm.js's lack of kitty protocol support

---

## Gap Analysis: Orca vs VS Code

### 1. Flow Control & Backpressure (HIGH IMPACT)

**VS Code's approach:**
- Watermark-based flow control between PTY host and renderer
- HIGH watermark (~500KB): pause PTY data forwarding when buffer exceeds this
- LOW watermark: resume when buffer drains below threshold
- TerminalProcess batches many small `onData` events into fewer, larger payloads before sending over IPC

**Orca's current approach:**
- Every `shell.onData()` event immediately: writes to SQLite, broadcasts over Unix socket, sends over Electron IPC, calls `terminal.write()`
- No batching, no flow control, no backpressure
- Fast-producing commands (e.g., `cat large-file`, `find /`, verbose build logs) generate hundreds of small data events per second, each triggering the full pipeline

**Recommendation:**
```
PTY onData -> Accumulate in memory buffer -> Flush on timer (every 4-8ms) or size threshold
                                          -> Apply HIGH/LOW watermarks to pause/resume PTY reads
```

**Files to modify:**
- `web/src/daemon/pty-manager.ts` — add DataBatcher class wrapping onData
- `web/src/daemon/output-buffer.ts` — batch SQLite writes (one INSERT per flush, not per event)

### 2. GPU-Accelerated Rendering (HIGH IMPACT)

**VS Code's approach:**
- Uses WebGL renderer by default (auto-detects, falls back to DOM)
- 5-45x faster than DOM rendering
- Texture atlas for ASCII characters (pre-rendered glyph cache)
- Only redraws changed cells

**Orca's current approach:**
- Uses default DOM renderer (no canvas or WebGL addon)
- Every cell update causes DOM manipulation

**Recommendation:**
Add `@xterm/addon-webgl` with graceful fallback:
```typescript
import { WebglAddon } from '@xterm/addon-webgl';
try {
  const webgl = new WebglAddon();
  webgl.onContextLoss(() => {
    webgl.dispose();
    // Falls back to DOM automatically
  });
  terminal.loadAddon(webgl);
} catch {
  // WebGL2 not available, DOM renderer is fine
}
```

**Files to modify:**
- `web/src/renderer/components/terminal/AgentTerminal.tsx`
- `web/package.json` (add `@xterm/addon-webgl`)

### 3. Output Buffer Strategy (MEDIUM IMPACT)

**VS Code's approach:**
- Configurable scrollback (default 1000, up to 50,000 lines)
- Serializes terminal state (not raw output) for persistence
- Uses xterm.js Serialize addon to capture full terminal state including cursor position, colors, styles

**Orca's current approach:**
- Stores raw PTY output chunks in SQLite blobs (up to 1MB per session)
- Eviction deletes oldest 25% of chunks — aggressive, loses potentially important context
- Replay concatenates all chunks and writes them to a fresh xterm instance
- Every onData event = 1 SQLite INSERT (high write amplification)

**Problems:**
1. Replaying raw output is fragile — escape sequences may span chunk boundaries
2. Evicting oldest 25% loses early output context (potentially the most important part showing what command was run)
3. Per-event SQLite INSERTs are expensive under high throughput

**Recommendation:**
- **Batch SQLite writes**: Accumulate chunks in memory, flush to DB every 100ms or on size threshold
- **Use Serialize addon for persistence**: Instead of storing raw chunks, periodically serialize the terminal state. This captures exactly what the user would see, handles escape sequences properly, and is more compact
- **Smarter eviction**: Keep first N chunks (command context) + last M chunks (recent output), evict middle

**Files to modify:**
- `web/src/daemon/output-buffer.ts` — batched writes, smarter eviction
- `web/src/renderer/components/terminal/AgentTerminal.tsx` — add Serialize addon
- `web/package.json` (add `@xterm/addon-serialize`)

### 4. Terminal Reconnection & Session Persistence (MEDIUM IMPACT)

**VS Code's approach:**
- **Window reload**: Reconnects to still-running PTY processes, restores terminal content
- **App restart**: Relaunches processes in original directory, restores persisted content
- **Parallel restoration**: Multiple terminals restored concurrently
- **Lifecycle awareness**: Reconnection happens after workspace is fully restored

**Orca's current approach:**
- Daemon survives Electron restarts (good!)
- Replay mechanism restores output from SQLite (good concept, but replays raw bytes)
- No reconnection awareness — if Electron main process reconnects to daemon, client must manually re-subscribe and replay

**Recommendation:**
- On daemon client connect, auto-re-subscribe to all active sessions for the workspace
- Use serialized terminal state for restoration instead of raw replay
- Add connection health monitoring (heartbeat ping/pong between main process and daemon)

**Files to modify:**
- `web/src/main/daemon/` — add heartbeat/reconnection logic
- `web/src/daemon/server.ts` — add PING/PONG support
- `web/src/daemon/handlers.ts` — add "restore all sessions" method

### 5. Error Recovery & Health Monitoring (MEDIUM IMPACT)

**VS Code's approach:**
- PTY Host responsiveness monitoring with periodic health checks
- Auto-restart PTY Host on crash
- User dialog offering to restart when unresponsive
- Trace logging for all terminal operations (available in "Pty Host" output channel)

**Orca's current approach:**
- PID sweep every 60s detects crashed processes (good)
- Daemon disconnect/reconnect events broadcast to renderer (good)
- But: no heartbeat monitoring, no auto-restart of daemon, no retry logic for failed IPC calls
- Silent error swallowing: DB errors during output append caught and ignored

**Recommendation:**
- Add heartbeat ping/pong (every 10s) from main process to daemon
- If 3 consecutive heartbeats missed, trigger daemon restart
- Add structured logging for terminal operations (spawn, exit, errors)
- Surface errors to the user instead of silently swallowing them

**Files to modify:**
- `web/src/main/daemon/` — heartbeat monitoring
- `web/src/daemon/server.ts` — respond to PING
- `web/src/daemon/pty-manager.ts` — structured error logging

### 6. Data Batching in IPC Layer (MEDIUM IMPACT)

**VS Code's approach:**
- TerminalProcess class batches data events internally before forwarding
- Direct communication channel from PTY host to renderer (bypass main process where possible)
- Reduced unnecessary RPC round-trips

**Orca's current approach:**
- Every PTY data event -> JSON.stringify -> socket.write per event
- Each event is a separate NDJSON line
- Electron main process relays every event individually to renderer via `webContents.send()`

**Recommendation:**
- Batch NDJSON events: accumulate events for 4ms, send as batch
- Consider consolidating multiple `pty.data` events for the same session into one message
- This reduces JSON serialization overhead and IPC crossing frequency

**Files to modify:**
- `web/src/daemon/server.ts` — add broadcast batching
- `web/src/daemon/pty-manager.ts` — accumulate before broadcast

### 7. Unicode Support (LOW IMPACT)

**VS Code's approach:**
- Uses Unicode 11 addon for correct character widths
- Handles CJK, emoji, and complex grapheme clusters properly

**Orca's current approach:**
- No Unicode addon loaded — default character width tables may misalign CJK/emoji characters

**Recommendation:**
Add `@xterm/addon-unicode11` for correct character width measurement:
```typescript
import { Unicode11Addon } from '@xterm/addon-unicode11';
terminal.loadAddon(new Unicode11Addon());
terminal.unicode.activeVersion = '11';
```

### 8. Search in Terminal Output (LOW IMPACT)

**VS Code's approach:**
- Built-in terminal search (Ctrl+F in terminal)
- Provided by xterm.js Search addon

**Recommendation:**
Consider adding `@xterm/addon-search` for a future UX improvement.

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 days)
1. **WebGL renderer addon** — biggest visual performance improvement, ~10 lines of code
2. **Unicode11 addon** — 3 lines of code, fixes character alignment issues

### Phase 2: Data Pipeline (2-3 days)
3. **PTY data batching** — accumulate onData events, flush every 4-8ms
4. **Batched SQLite writes** — one INSERT per flush instead of per event
5. **Batched IPC broadcasts** — consolidate NDJSON events before socket write

### Phase 3: Persistence & Recovery (2-3 days)
6. **Serialize addon for session persistence** — replace raw chunk replay with serialized terminal state
7. **Smarter output buffer eviction** — keep first+last chunks, evict middle
8. **Heartbeat monitoring** — ping/pong between main process and daemon

### Phase 4: Polish (1-2 days)
9. **Auto-reconnection** — re-subscribe to all active sessions on daemon reconnect
10. **Structured error logging** — replace silent catches with surfaced errors
11. **Search addon** — terminal output search

---

## Key Files

| File | Role |
|------|------|
| `web/src/renderer/components/terminal/AgentTerminal.tsx` | xterm.js React wrapper — addons, rendering |
| `web/src/daemon/pty-manager.ts` | PTY spawn/lifecycle, data flow origin |
| `web/src/daemon/output-buffer.ts` | SQLite output persistence, eviction |
| `web/src/daemon/server.ts` | Unix socket NDJSON server, broadcasting |
| `web/src/daemon/kitty-keyboard.ts` | Kitty protocol interceptor |
| `web/src/main/daemon/` | Electron<->Daemon connection management |
| `web/src/preload/index.ts` | IPC bridge to renderer |
| `web/package.json` | Dependencies (new addons) |

---

## New Dependencies

| Package | Phase | Purpose |
|---------|-------|---------|
| `@xterm/addon-webgl` | 1 | GPU-accelerated rendering |
| `@xterm/addon-unicode11` | 1 | Correct CJK/emoji character widths |
| `@xterm/addon-serialize` | 3 | Terminal state serialization for persistence |

---

## Verification

- **Performance**: Compare `time cat large-file.txt` rendering speed before/after WebGL addon
- **Flow control**: Run `yes` command, verify terminal stays responsive to keyboard input
- **Persistence**: Kill Electron, relaunch, verify terminal content restores correctly
- **Reconnection**: Restart daemon while Electron is running, verify terminals recover
- **Resize**: Rapidly resize terminal pane, verify no dimension mismatch or content corruption
- **Unicode**: Echo CJK characters and emoji, verify alignment
- **Memory**: Open multiple long-running sessions, monitor heap size over time

---

## VS Code Reference Sources

- [Terminal Performance Blog (Canvas/WebGL)](https://code.visualstudio.com/blogs/2017/10/03/terminal-renderer)
- [Terminal Advanced Configuration](https://code.visualstudio.com/docs/terminal/advanced)
- [Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration)
- [xterm.js Flow Control Guide](https://xtermjs.org/docs/guides/flowcontrol/)
- [VS Code Terminal Source](https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib/terminal)
- [Working with xterm.js Wiki](https://github.com/microsoft/vscode-wiki/blob/main/Working-with-xterm.js.md)
