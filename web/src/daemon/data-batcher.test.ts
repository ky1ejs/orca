import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataBatcher } from './data-batcher.js';

describe('DataBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Basic batching ---

  it('concatenates pushed data on flushAll', () => {
    const batcher = new DataBatcher();
    const flushed: { sessionId: string; data: string }[] = [];
    batcher.onFlush((sessionId, data) => flushed.push({ sessionId, data }));

    batcher.push('s1', 'hello');
    batcher.push('s1', ' world');
    batcher.flushAll();

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual({ sessionId: 's1', data: 'hello world' });
    batcher.dispose();
  });

  it('flushes each session independently', () => {
    const batcher = new DataBatcher();
    const flushed: { sessionId: string; data: string }[] = [];
    batcher.onFlush((sessionId, data) => flushed.push({ sessionId, data }));

    batcher.push('s1', 'aaa');
    batcher.push('s2', 'bbb');
    batcher.flushAll();

    expect(flushed).toHaveLength(2);
    expect(flushed.find((f) => f.sessionId === 's1')?.data).toBe('aaa');
    expect(flushed.find((f) => f.sessionId === 's2')?.data).toBe('bbb');
    batcher.dispose();
  });

  it('skips empty data pushes', () => {
    const batcher = new DataBatcher();
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', '');
    batcher.flushAll();

    expect(flushed).toHaveLength(0);
    batcher.dispose();
  });

  it('does not flush when no data is pending', () => {
    const batcher = new DataBatcher();
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.flushAll();

    expect(flushed).toHaveLength(0);
    batcher.dispose();
  });

  // --- Timer-based flushing ---

  it('flushes on timer interval', () => {
    const batcher = new DataBatcher({ flushIntervalMs: 4 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'tick');
    vi.advanceTimersByTime(4);

    expect(flushed).toEqual(['tick']);
    batcher.dispose();
  });

  it('does not flush before timer fires', () => {
    const batcher = new DataBatcher({ flushIntervalMs: 4 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'tick');
    vi.advanceTimersByTime(3);

    expect(flushed).toHaveLength(0);
    batcher.dispose();
  });

  it('batches multiple pushes into single timer flush', () => {
    const batcher = new DataBatcher({ flushIntervalMs: 4 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'a');
    batcher.push('s1', 'b');
    batcher.push('s1', 'c');
    vi.advanceTimersByTime(4);

    expect(flushed).toEqual(['abc']);
    batcher.dispose();
  });

  // --- Size threshold ---

  it('flushes immediately when size threshold is exceeded', () => {
    const batcher = new DataBatcher({ sizeThreshold: 10 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'x'.repeat(10));

    expect(flushed).toEqual(['x'.repeat(10)]);
    batcher.dispose();
  });

  it('does not flush immediately below size threshold', () => {
    const batcher = new DataBatcher({ sizeThreshold: 10 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'x'.repeat(9));

    expect(flushed).toHaveLength(0);
    batcher.dispose();
  });

  it('accumulates to threshold across multiple pushes', () => {
    const batcher = new DataBatcher({ sizeThreshold: 10 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'xxxxx'); // 5 bytes
    expect(flushed).toHaveLength(0);

    batcher.push('s1', 'yyyyy'); // 10 bytes total → flush
    expect(flushed).toEqual(['xxxxxyyyyy']);
    batcher.dispose();
  });

  // --- Flow control ---

  it('calls pause at high watermark', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 200 });
    const paused: string[] = [];
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(100));

    expect(paused).toEqual(['s1']);
    batcher.dispose();
  });

  it('calls pause when a single push exceeds highWatermark even with lower sizeThreshold', () => {
    // Validates that watermark check fires before size-threshold flush
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const paused: string[] = [];
    const flushed: string[] = [];
    batcher.onPause((sessionId) => paused.push(sessionId));
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'x'.repeat(100));

    expect(paused).toEqual(['s1']);
    expect(flushed).toHaveLength(1); // also flushed due to size threshold
    batcher.dispose();
  });

  it('does not call pause below high watermark', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 200 });
    const paused: string[] = [];
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(99));

    expect(paused).toHaveLength(0);
    batcher.dispose();
  });

  it('calls pause only once while paused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 500 });
    const paused: string[] = [];
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(100));
    batcher.push('s1', 'x'.repeat(100));

    expect(paused).toEqual(['s1']);
    batcher.dispose();
  });

  it('calls resume after flush drops below low watermark', () => {
    const batcher = new DataBatcher({
      highWatermark: 100,
      lowWatermark: 50,
      sizeThreshold: 500,
    });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // triggers pause
    batcher.flushAll(); // pendingSize → 0 < lowWatermark → resume

    expect(resumed).toEqual(['s1']);
    batcher.dispose();
  });

  it('does not call resume if not paused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, lowWatermark: 50 });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(10));
    batcher.flushAll();

    expect(resumed).toHaveLength(0);
    batcher.dispose();
  });

  // --- Session removal ---

  it('discards pending data on remove', () => {
    const batcher = new DataBatcher();
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'data');
    batcher.remove('s1');
    batcher.flushAll();

    expect(flushed).toHaveLength(0);
    batcher.dispose();
  });

  it('clears paused state on remove so re-added session starts unpaused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 500 });
    const paused: string[] = [];
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // pause
    expect(paused).toEqual(['s1']);

    batcher.remove('s1');
    batcher.push('s1', 'y'.repeat(100)); // new session state → pause again
    expect(paused).toEqual(['s1', 's1']);
    batcher.dispose();
  });

  // --- Flush and remove ---

  it('flushAndRemove flushes pending data then removes session', () => {
    const batcher = new DataBatcher();
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'last-output');
    batcher.flushAndRemove('s1');

    expect(flushed).toEqual(['last-output']);

    // Session is removed — subsequent flushAll should not flush it
    batcher.push('s1', 'new');
    batcher.remove('s1');
    batcher.flushAll();
    expect(flushed).toHaveLength(1);
    batcher.dispose();
  });

  it('flushAndRemove is safe on unknown session', () => {
    const batcher = new DataBatcher();
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.flushAndRemove('nonexistent');

    expect(flushed).toHaveLength(0);
    batcher.dispose();
  });

  // --- Dispose ---

  it('flushes remaining data on dispose', () => {
    const batcher = new DataBatcher();
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'final');
    batcher.dispose();

    expect(flushed).toEqual(['final']);
  });

  it('stops timer on dispose', () => {
    const batcher = new DataBatcher({ flushIntervalMs: 4 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.dispose();
    batcher.push('s1', 'after-dispose');
    vi.advanceTimersByTime(100);

    expect(flushed).toHaveLength(0);
  });

  it('push after dispose is a no-op', () => {
    const batcher = new DataBatcher();
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.dispose();
    batcher.push('s1', 'nope');
    batcher.flushAll();

    expect(flushed).toHaveLength(0);
  });

  // --- Single chunk optimization ---

  it('passes single chunk directly without join', () => {
    const batcher = new DataBatcher({ sizeThreshold: 5 });
    const flushed: string[] = [];
    batcher.onFlush((_, data) => flushed.push(data));

    batcher.push('s1', 'hello');

    expect(flushed).toEqual(['hello']);
    batcher.dispose();
  });
});
