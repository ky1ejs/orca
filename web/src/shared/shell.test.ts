import { describe, expect, it, afterEach } from 'vitest';
import { enrichPathFromLoginShell } from './shell.js';

describe('enrichPathFromLoginShell', () => {
  const originalPath = process.env.PATH;
  const originalShell = process.env.SHELL;

  afterEach(() => {
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
    } else {
      delete process.env.PATH;
    }
    if (originalShell !== undefined) {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }
  });

  it('preserves existing PATH entries', () => {
    if (process.platform === 'win32') return;

    const customPath = '/my/custom/test/path';
    process.env.PATH = `/usr/bin:${customPath}`;
    enrichPathFromLoginShell();

    const entries = (process.env.PATH ?? '').split(':');
    expect(entries).toContain(customPath);
    expect(entries).toContain('/usr/bin');
  });

  it('does not introduce duplicate entries', () => {
    if (process.platform === 'win32') return;

    const before = (process.env.PATH ?? '').split(':');
    const dupesBefore = before.length - new Set(before).size;

    enrichPathFromLoginShell();

    const after = (process.env.PATH ?? '').split(':');
    const dupesAfter = after.length - new Set(after).size;

    expect(dupesAfter).toBe(dupesBefore);
  });

  it('does not throw when SHELL points to nonexistent binary', () => {
    if (process.platform === 'win32') return;

    const before = process.env.PATH;
    process.env.SHELL = '/nonexistent/shell';
    enrichPathFromLoginShell();

    // PATH unchanged — function failed gracefully
    expect(process.env.PATH).toBe(before);
  });

  it('is a no-op on Windows', () => {
    if (process.platform !== 'win32') return;

    const before = process.env.PATH;
    enrichPathFromLoginShell();
    expect(process.env.PATH).toBe(before);
  });
});
