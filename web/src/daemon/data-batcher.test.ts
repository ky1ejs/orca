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

  // --- Flow control (end-to-end: pause on unacked high watermark, resume on ack) ---

  it('calls pause when unacked bytes exceed high watermark after flush', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const paused: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // >= sizeThreshold → flush → unacked=100 → pause

    expect(paused).toEqual(['s1']);
    batcher.dispose();
  });

  it('calls pause after timer flush when unacked exceeds watermark', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 200 });
    const paused: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // below sizeThreshold, no immediate flush
    expect(paused).toHaveLength(0);

    vi.advanceTimersByTime(4); // timer flushes → unacked=100 → pause
    expect(paused).toEqual(['s1']);
    batcher.dispose();
  });

  it('does not call pause when unacked bytes stay below high watermark', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const paused: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(99)); // >= sizeThreshold → flush → unacked=99 < 100

    expect(paused).toHaveLength(0);
    batcher.dispose();
  });

  it('calls pause only once while paused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const paused: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=200, already paused

    expect(paused).toEqual(['s1']);
    batcher.dispose();
  });

  it('calls resume when ack brings unacked below low watermark', () => {
    const batcher = new DataBatcher({
      highWatermark: 100,
      lowWatermark: 50,
      sizeThreshold: 50,
    });
    const paused: string[] = [];
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    expect(paused).toEqual(['s1']);
    expect(resumed).toHaveLength(0);

    batcher.ack('s1', 60); // unacked=40 < lowWatermark=50 → resume
    expect(resumed).toEqual(['s1']);
    batcher.dispose();
  });

  it('does not resume if ack does not bring unacked below low watermark', () => {
    const batcher = new DataBatcher({
      highWatermark: 100,
      lowWatermark: 50,
      sizeThreshold: 50,
    });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    batcher.ack('s1', 40); // unacked=60 >= lowWatermark=50 → still paused

    expect(resumed).toHaveLength(0);
    batcher.dispose();
  });

  it('does not call resume if not paused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, lowWatermark: 50, sizeThreshold: 50 });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(10)); // flush → unacked=10 < highWatermark → not paused
    batcher.ack('s1', 10); // unacked=0, but not paused → no resume

    expect(resumed).toHaveLength(0);
    batcher.dispose();
  });

  it('ack on unknown session is a no-op', () => {
    const batcher = new DataBatcher();
    batcher.onFlush(() => {});

    expect(() => batcher.ack('nonexistent', 100)).not.toThrow();
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

  it('calls resume on remove when session is paused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    expect(resumed).toHaveLength(0);

    batcher.remove('s1'); // should resume before deleting
    expect(resumed).toEqual(['s1']);
    batcher.dispose();
  });

  it('calls resume on flushAndRemove when session is paused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    batcher.push('s1', 'more');
    batcher.flushAndRemove('s1'); // flush remaining + resume + delete

    expect(resumed).toEqual(['s1']);
    batcher.dispose();
  });

  it('does not call resume on remove when session is not paused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(10)); // flush → unacked=10 < 100 → not paused
    batcher.remove('s1');

    expect(resumed).toHaveLength(0);
    batcher.dispose();
  });

  it('clears paused state on remove so re-added session starts unpaused', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const paused: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // >= sizeThreshold → flush → unacked=100 → pause
    expect(paused).toEqual(['s1']);

    batcher.remove('s1');
    batcher.push('s1', 'y'.repeat(100)); // new session (unacked=0) → flush → unacked=100 → pause
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

  // --- Safety valve for stuck pauses ---

  it('auto-resumes a session stuck in paused state for 30+ seconds', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const paused: string[] = [];
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    expect(paused).toEqual(['s1']);
    expect(resumed).toHaveLength(0);

    // Advance 29 seconds — not yet expired
    vi.advanceTimersByTime(29_000);
    expect(resumed).toHaveLength(0);

    // Advance past 30 seconds — safety valve kicks in
    vi.advanceTimersByTime(1_001);
    expect(resumed).toEqual(['s1']);
    batcher.dispose();
  });

  it('does not trigger safety valve if session is resumed by ack before timeout', () => {
    const batcher = new DataBatcher({
      highWatermark: 100,
      lowWatermark: 50,
      sizeThreshold: 50,
    });
    const resumed: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause(() => {});
    batcher.onResume((sessionId) => resumed.push(sessionId));

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    batcher.ack('s1', 60); // unacked=40 < lowWatermark → resume
    expect(resumed).toEqual(['s1']);

    // Advance past 30 seconds — should NOT trigger again
    vi.advanceTimersByTime(31_000);
    expect(resumed).toEqual(['s1']); // still just the one resume
    batcher.dispose();
  });

  it('resets unackedSize to 0 when safety valve triggers', () => {
    const batcher = new DataBatcher({ highWatermark: 100, sizeThreshold: 50 });
    const paused: string[] = [];
    batcher.onFlush(() => {});
    batcher.onPause((sessionId) => paused.push(sessionId));
    batcher.onResume(() => {});

    batcher.push('s1', 'x'.repeat(100)); // flush → unacked=100 → pause
    vi.advanceTimersByTime(31_000); // safety valve triggers

    // Push more data — should flush normally without immediately re-pausing
    // because unackedSize was reset to 0
    paused.length = 0; // clear previous pauses
    batcher.push('s1', 'y'.repeat(50)); // flush → unacked=50 < 100 → no pause
    expect(paused).toHaveLength(0);
    batcher.dispose();
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
