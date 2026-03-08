import { describe, expect, it, afterEach } from 'vitest';
import { getDefaultShell, getLoginShellArgs } from './shell.js';

describe('getDefaultShell', () => {
  const originalShell = process.env.SHELL;

  afterEach(() => {
    if (originalShell !== undefined) {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }
  });

  it('returns SHELL env var when set', () => {
    process.env.SHELL = '/bin/zsh';
    expect(getDefaultShell()).toBe('/bin/zsh');
  });

  it('falls back to /bin/sh when SHELL is not set', () => {
    delete process.env.SHELL;
    expect(getDefaultShell()).toBe('/bin/sh');
  });
});

describe('getLoginShellArgs', () => {
  it('returns -l on non-Windows platforms', () => {
    // This test runs on macOS/Linux in CI
    if (process.platform !== 'win32') {
      expect(getLoginShellArgs()).toEqual(['-l']);
    }
  });
});
