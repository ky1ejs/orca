import { describe, it, expect } from 'vitest';
import { stripAnsi, visibleLength } from './ansi.js';

describe('stripAnsi', () => {
  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('strips SGR color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
    expect(stripAnsi('\x1b[1;32mbold green\x1b[0m')).toBe('bold green');
  });

  it('strips cursor movement sequences', () => {
    expect(stripAnsi('\x1b[2Ahello')).toBe('hello');
    expect(stripAnsi('\x1b[10;20Hhere')).toBe('here');
    expect(stripAnsi('\x1b[Khello')).toBe('hello');
  });

  it('strips OSC sequences (e.g. window title)', () => {
    expect(stripAnsi('\x1b]0;my title\x07rest')).toBe('rest');
    expect(stripAnsi('\x1b]0;my title\x1b\\rest')).toBe('rest');
  });

  it('strips DCS sequences', () => {
    expect(stripAnsi('\x1bPsome data\x1b\\visible')).toBe('visible');
  });

  it('strips C0 control chars (except \\n, \\r, \\t)', () => {
    expect(stripAnsi('hello\x00world')).toBe('helloworld');
    expect(stripAnsi('a\x07b')).toBe('ab');
  });

  it('preserves newlines, carriage returns, and tabs', () => {
    expect(stripAnsi('line1\nline2\r\ncol1\tcol2')).toBe('line1\nline2\r\ncol1\tcol2');
  });

  it('handles mixed ANSI and visible content', () => {
    const input = '\x1b[1m\x1b[34m> \x1b[0mHello \x1b[2;5HWorld\x1b[K';
    expect(stripAnsi(input)).toBe('> Hello World');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('handles string with only ANSI sequences', () => {
    expect(stripAnsi('\x1b[31m\x1b[0m\x1b[K')).toBe('');
  });
});

describe('visibleLength', () => {
  it('returns length of plain text', () => {
    expect(visibleLength('hello')).toBe(5);
  });

  it('excludes ANSI sequences from length', () => {
    expect(visibleLength('\x1b[31mred\x1b[0m')).toBe(3);
  });

  it('returns 0 for ANSI-only string', () => {
    expect(visibleLength('\x1b[2J\x1b[H')).toBe(0);
  });

  it('handles mixed content correctly', () => {
    // ">" + space + "Hello " + "World" = 13 visible chars
    const input = '\x1b[1m\x1b[34m> \x1b[0mHello \x1b[2;5HWorld\x1b[K';
    expect(visibleLength(input)).toBe(13);
  });
});
