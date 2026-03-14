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

  it('evicts oldest 25% of chunks when over 1MB', () => {
    const buf = new RingBuffer();
    // Create 4 chunks that total > 1MB
    const chunkSize = 300 * 1024; // 300KB each, 4 chunks = 1.2MB
    for (let i = 0; i < 4; i++) {
      buf.append('x'.repeat(chunkSize));
    }
    // After eviction, oldest 25% (1 chunk) should be removed
    expect(buf.size).toBe(chunkSize * 3);
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
