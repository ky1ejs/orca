import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatMonitor } from './heartbeat.js';
import { DAEMON_METHODS } from '../../shared/daemon-protocol.js';

// Stub the logger to suppress output during tests
vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function createMockClient() {
  return { request: vi.fn() };
}

describe('HeartbeatMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls daemon.ping on each interval tick', async () => {
    const client = createMockClient();
    client.request.mockResolvedValue({ pong: true });
    const onFailure = vi.fn();

    const monitor = new HeartbeatMonitor(client as never, onFailure);
    monitor.start();

    // Advance past first heartbeat interval (10s)
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(DAEMON_METHODS.DAEMON_PING);

    // Second tick
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.request).toHaveBeenCalledTimes(2);

    expect(onFailure).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('fires onFailure after 3 consecutive failures', async () => {
    const client = createMockClient();
    client.request.mockRejectedValue(new Error('Connection error'));
    const onFailure = vi.fn();

    const monitor = new HeartbeatMonitor(client as never, onFailure);
    monitor.start();

    // First two failures — no trigger yet
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFailure).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFailure).not.toHaveBeenCalled();

    // Third failure — triggers onFailure
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFailure).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('resets failure counter on successful ping', async () => {
    const client = createMockClient();
    const onFailure = vi.fn();

    const monitor = new HeartbeatMonitor(client as never, onFailure);
    monitor.start();

    // Two failures
    client.request.mockRejectedValue(new Error('fail'));
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    // One success resets the counter
    client.request.mockResolvedValue({ pong: true });
    await vi.advanceTimersByTimeAsync(10_000);

    // Two more failures — still under threshold
    client.request.mockRejectedValue(new Error('fail'));
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFailure).not.toHaveBeenCalled();

    // Third consecutive failure — now triggers
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFailure).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('stop() prevents further pings', async () => {
    const client = createMockClient();
    client.request.mockResolvedValue({ pong: true });
    const onFailure = vi.fn();

    const monitor = new HeartbeatMonitor(client as never, onFailure);
    monitor.start();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.request).toHaveBeenCalledTimes(1);

    monitor.stop();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire when ping is still in-flight at next interval', async () => {
    const client = createMockClient();
    // Request hangs forever — no resolution, no rejection
    client.request.mockReturnValue(new Promise(() => {}));
    const onFailure = vi.fn();

    const monitor = new HeartbeatMonitor(client as never, onFailure);
    monitor.start();

    // First tick at 10s starts a ping
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.request).toHaveBeenCalledTimes(1);

    // At 13s — only 3s into the 5s timeout, the ping is still in-flight.
    // If another interval were to fire here, the pending guard would skip it.
    // (With 10s intervals this won't happen, but the guard is defensive.)
    // Advance to just before the timeout fires to confirm no extra calls.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(client.request).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('stale in-flight ping does not affect state after stop + restart', async () => {
    const client = createMockClient();
    const onFailure = vi.fn();

    const monitor = new HeartbeatMonitor(client as never, onFailure);

    // Start with 2 failures to get close to the threshold
    client.request.mockRejectedValue(new Error('fail'));
    monitor.start();
    await vi.advanceTimersByTimeAsync(10_000); // fail 1
    await vi.advanceTimersByTimeAsync(10_000); // fail 2

    // Now make request hang, then stop + restart while it's in-flight
    let rejectHanging: ((err: Error) => void) | null = null;
    client.request.mockImplementation(
      () =>
        new Promise<unknown>((_, reject) => {
          rejectHanging = reject;
        }),
    );
    await vi.advanceTimersByTimeAsync(10_000); // ping 3 starts (in-flight)

    // Stop and restart — this should invalidate the in-flight ping
    monitor.stop();
    client.request.mockRejectedValue(new Error('fail'));
    monitor.start();

    // Resolve the stale in-flight ping — should be ignored (wrong generation)
    rejectHanging!(new Error('stale fail'));
    await vi.advanceTimersByTimeAsync(0); // flush microtasks

    // The restarted monitor should have a fresh failure counter.
    // 2 more failures should NOT trigger onFailure (need 3 from scratch)
    await vi.advanceTimersByTimeAsync(10_000); // fail 1 (new generation)
    await vi.advanceTimersByTimeAsync(10_000); // fail 2
    expect(onFailure).not.toHaveBeenCalled();

    // Third failure in new generation triggers
    await vi.advanceTimersByTimeAsync(10_000); // fail 3
    expect(onFailure).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('triggers onFailure via timeout when daemon hangs', async () => {
    const client = createMockClient();
    // Request hangs forever — heartbeat timeout (5s) will reject first
    client.request.mockReturnValue(new Promise(() => {}));
    const onFailure = vi.fn();

    const monitor = new HeartbeatMonitor(client as never, onFailure);
    monitor.start();

    // Each tick: 10s interval wait + 5s timeout = 15s per heartbeat cycle
    // Need 3 failures: tick at 10s, timeout at 15s, tick at 20s (skipped — still pending)
    // Actually with the pending flag, after timeout rejects at 15s, pending resets.
    // So: tick@10s -> timeout@15s (fail 1), tick@20s -> timeout@25s (fail 2), tick@30s -> timeout@35s (fail 3)

    // Advance through 3 full cycles (each ~15s: 10s wait + 5s timeout)
    await vi.advanceTimersByTimeAsync(15_000); // fail 1
    expect(onFailure).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000); // tick 2 at 25s, timeout at 30s
    await vi.advanceTimersByTimeAsync(5_000); // fail 2
    expect(onFailure).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000); // tick 3 at 40s, timeout at 45s
    await vi.advanceTimersByTimeAsync(5_000); // fail 3
    expect(onFailure).toHaveBeenCalledTimes(1);

    monitor.stop();
  });
});
