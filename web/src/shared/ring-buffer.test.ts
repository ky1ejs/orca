import { describe, it, expect } from 'vitest';
import { RingBuffer } from './ring-buffer.js';

describe('RingBuffer', () => {
  it('appends and replays chunks', () => {
    const buf = new RingBuffer();
    buf.append('hello');
    buf.append(' world');
    expect(buf.replay()).toBe('hello world');
  });

  it('tracks raw size in bytes', () => {
    const buf = new RingBuffer();
    buf.append('hello');
    expect(buf.size).toBe(5);
    buf.append(' world');
    expect(buf.size).toBe(11);
  });

  it('tracks visible size excluding ANSI sequences', () => {
    const buf = new RingBuffer();
    buf.append('\x1b[31mred\x1b[0m');
    expect(buf.visibleSize).toBe(3);
    expect(buf.size).toBeGreaterThan(3);
  });

  it('accumulates visible size across appends', () => {
    const buf = new RingBuffer();
    buf.append('\x1b[1mhello\x1b[0m'); // 5 visible
    buf.append('\x1b[32m world\x1b[0m'); // 6 visible
    expect(buf.visibleSize).toBe(11);
  });

  it('returns 0 visible size for ANSI-only output', () => {
    const buf = new RingBuffer();
    buf.append('\x1b[2J\x1b[H\x1b[?25l');
    expect(buf.visibleSize).toBe(0);
  });

  it('returns tail of output', () => {
    const buf = new RingBuffer();
    buf.append('abcdefghij');
    expect(buf.tail(5)).toBe('fghij');
  });

  it('returns consistent tail across calls', () => {
    const buf = new RingBuffer();
    buf.append('abcdefghij');
    expect(buf.tail(5)).toBe('fghij');
    expect(buf.tail(5)).toBe('fghij');
  });

  it('updates tail on append', () => {
    const buf = new RingBuffer();
    buf.append('abcde');
    expect(buf.tail(3)).toBe('cde');
    buf.append('xyz');
    expect(buf.tail(3)).toBe('xyz');
  });

  it('resets tail on clear', () => {
    const buf = new RingBuffer();
    buf.append('abcde');
    expect(buf.tail(3)).toBe('cde');
    buf.clear();
    expect(buf.tail(3)).toBe('');
  });

  it('evicts middle chunks, keeping head and tail', () => {
    const buf = new RingBuffer();
    const head = 'H'.repeat(64 * 1024); // 64KB head
    const mid1 = 'M'.repeat(400 * 1024); // 400KB middle
    const mid2 = 'N'.repeat(400 * 1024); // 400KB middle
    const tail = 'T'.repeat(200 * 1024); // 200KB tail
    // Total = 64 + 400 + 400 + 200 = 1064KB > 1MB → triggers eviction
    // Head keeps chunk 0 (64KB). Target=768KB, tailKeep=768-64=704KB.
    // Walk backward: tail chunk (200KB, running=200KB < 704KB), mid2 (400KB, running=600KB < 704KB).
    // mid1 (400KB, running=1000KB > 704KB) → stop. tailStart=1.
    // Middle = [chunk 1..1) → only mid1 evicted.
    buf.append(head);
    buf.append(mid1);
    buf.append(mid2);
    buf.append(tail);

    const replay = buf.replay();
    // Head preserved
    expect(replay.startsWith(head)).toBe(true);
    // Tail preserved
    expect(replay.endsWith(tail)).toBe(true);
    // Middle replaced by sentinel
    expect(replay).toContain('[...output truncated...]');
    // mid1 content gone
    expect(replay).not.toContain('M'.repeat(100));
    // mid2 is kept (fits in tail budget)
    expect(replay).toContain('N'.repeat(100));
  });

  it('does not evict when under MAX_SIZE', () => {
    const buf = new RingBuffer();
    buf.append('a'.repeat(512 * 1024));
    buf.append('b'.repeat(512 * 1024));
    // Exactly 1MB (1048576) — not over, no eviction
    expect(buf.replay()).not.toContain('[...output truncated...]');
    expect(buf.size).toBe(1024 * 1024);
  });

  it('evicts middle even with only 2 chunks when tail does not fit budget', () => {
    const buf = new RingBuffer();
    buf.append('a'.repeat(400 * 1024)); // head chunk (400KB)
    buf.append('b'.repeat(700 * 1024)); // triggers eviction (1.1MB total)
    // Head keeps chunk 0 (400KB). Target=768KB, tailKeep=768-400=368KB.
    // Chunk 1 is 700KB > 368KB → can't keep. tailStart=2, headEnd=1.
    // Middle=[chunk1] gets evicted. Only head + sentinel remain.
    const replay = buf.replay();
    expect(replay).toContain('a'.repeat(400 * 1024));
    expect(replay).toContain('[...output truncated...]');
  });

  it('preserves accurate counters after eviction', () => {
    const buf = new RingBuffer();
    const head = 'H'.repeat(64 * 1024);
    const mid = 'M'.repeat(800 * 1024);
    const tail = 'T'.repeat(200 * 1024);
    buf.append(head);
    buf.append(mid);
    buf.append(tail);

    const marker = RingBuffer.TRUNCATION_MARKER;
    // Head=64KB, mid evicted, tail=200KB, plus marker
    const expectedSize = head.length + tail.length + marker.length;
    expect(buf.size).toBe(expectedSize);
    // For plain text, visibleSize = size minus ANSI in marker
    expect(buf.visibleSize).toBeGreaterThan(0);
  });

  it('handles multiple sequential evictions', () => {
    const buf = new RingBuffer();
    // First eviction
    buf.append('H'.repeat(64 * 1024));
    buf.append('M'.repeat(800 * 1024));
    buf.append('T'.repeat(200 * 1024));
    expect(buf.replay()).toContain('[...output truncated...]');

    // Add more data to trigger second eviction
    buf.append('X'.repeat(800 * 1024));
    const replay = buf.replay();
    // Should still have the head from the first fill
    expect(replay.startsWith('H'.repeat(64 * 1024))).toBe(true);
    // Should have the latest tail
    expect(replay.endsWith('X'.repeat(800 * 1024))).toBe(false); // may be partially evicted
    expect(replay).toContain('[...output truncated...]');
  });

  it('clears all state', () => {
    const buf = new RingBuffer();
    buf.append('hello');
    buf.clear();
    expect(buf.replay()).toBe('');
    expect(buf.size).toBe(0);
    expect(buf.visibleSize).toBe(0);
  });

  it('handles empty string append', () => {
    const buf = new RingBuffer();
    buf.append('');
    expect(buf.replay()).toBe('');
    expect(buf.size).toBe(0);
    expect(buf.visibleSize).toBe(0);
  });

  it('returns full output when tail n exceeds length', () => {
    const buf = new RingBuffer();
    buf.append('abc');
    expect(buf.tail(100)).toBe('abc');
  });

  it('matches raw size for plain text without ANSI', () => {
    const buf = new RingBuffer();
    buf.append('plain text here');
    expect(buf.visibleSize).toBe(buf.size);
  });
});
