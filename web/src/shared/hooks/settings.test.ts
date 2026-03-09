import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureHooks, removeHooks } from './settings.js';

const HOOK_EVENT_TYPES = ['Stop', 'PermissionRequest', 'UserPromptSubmit'] as const;

function readSettings(workDir: string): Record<string, unknown> {
  const filePath = path.join(workDir, '.claude', 'settings.local.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function settingsPath(workDir: string): string {
  return path.join(workDir, '.claude', 'settings.local.json');
}

describe('ensureHooks', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'orca-hooks-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('creates .claude/ directory and settings.local.json when they do not exist', () => {
    ensureHooks(workDir, 9999);

    expect(existsSync(path.join(workDir, '.claude'))).toBe(true);
    expect(existsSync(settingsPath(workDir))).toBe(true);
  });

  it('written file contains hooks for all 3 event types', () => {
    ensureHooks(workDir, 9999);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<string, unknown[]>;
    for (const eventType of HOOK_EVENT_TYPES) {
      expect(hooks[eventType]).toBeDefined();
      expect(hooks[eventType]).toHaveLength(1);
    }
  });

  it('each hook entry has correct nested matcher-group structure', () => {
    ensureHooks(workDir, 4242);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<
      string,
      { matcher: string; hooks: Record<string, unknown>[] }[]
    >;

    for (const eventType of HOOK_EVENT_TYPES) {
      const matcherGroup = hooks[eventType][0];
      expect(matcherGroup.matcher).toBe('');
      expect(matcherGroup.hooks).toHaveLength(1);

      const entry = matcherGroup.hooks[0];
      expect(entry.type).toBe('http');
      expect(entry.url).toBe('http://127.0.0.1:4242/orca-hooks');
      expect(entry.headers).toEqual({ 'X-Orca-Session-Id': '$ORCA_SESSION_ID' });
      expect(entry.allowedEnvVars).toEqual(['ORCA_SESSION_ID']);
    }
  });

  it('merges with existing settings — preserves other top-level keys', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(workDir),
      JSON.stringify({ customKey: 'customValue', another: 42 }),
      'utf-8',
    );

    ensureHooks(workDir, 9999);

    const settings = readSettings(workDir);
    expect(settings.customKey).toBe('customValue');
    expect(settings.another).toBe(42);
    expect(settings.hooks).toBeDefined();
  });

  it('merges with existing new-format non-Orca matcher group — preserves it', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(workDir),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', url: 'https://other-service.com/webhook' }],
            },
          ],
        },
      }),
      'utf-8',
    );

    ensureHooks(workDir, 9999);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<
      string,
      { matcher: string; hooks: Record<string, unknown>[] }[]
    >;
    expect(hooks.Stop).toHaveLength(2);
    expect(hooks.Stop[0]).toEqual({
      matcher: '',
      hooks: [{ type: 'command', url: 'https://other-service.com/webhook' }],
    });
    expect(hooks.Stop[1].hooks[0].url).toBe('http://127.0.0.1:9999/orca-hooks');
  });

  it('is idempotent — calling twice with same port produces same result', () => {
    ensureHooks(workDir, 9999);
    const first = readFileSync(settingsPath(workDir), 'utf-8');

    ensureHooks(workDir, 9999);
    const second = readFileSync(settingsPath(workDir), 'utf-8');

    expect(first).toBe(second);
  });

  it('updates port when called with different port', () => {
    ensureHooks(workDir, 1111);
    ensureHooks(workDir, 2222);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<
      string,
      { matcher: string; hooks: Record<string, unknown>[] }[]
    >;

    for (const eventType of HOOK_EVENT_TYPES) {
      expect(hooks[eventType]).toHaveLength(1);
      expect(hooks[eventType][0].hooks[0].url).toBe('http://127.0.0.1:2222/orca-hooks');
    }
  });

  it('handles invalid JSON in existing file by overwriting', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(settingsPath(workDir), '{invalid json!!!', 'utf-8');

    ensureHooks(workDir, 9999);

    const settings = readSettings(workDir);
    expect(settings.hooks).toBeDefined();
    const hooks = settings.hooks as Record<string, unknown[]>;
    for (const eventType of HOOK_EVENT_TYPES) {
      expect(hooks[eventType]).toHaveLength(1);
    }
  });

  it('migrates old flat-format entries and appends Orca hook', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(workDir),
      JSON.stringify({
        hooks: {
          Stop: [{ type: 'command', url: 'https://other-service.com/webhook' }],
        },
      }),
      'utf-8',
    );

    ensureHooks(workDir, 9999);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<
      string,
      { matcher: string; hooks: Record<string, unknown>[] }[]
    >;

    // Old entry should be wrapped in a matcher group
    expect(hooks.Stop).toHaveLength(2);
    expect(hooks.Stop[0]).toEqual({
      matcher: '',
      hooks: [{ type: 'command', url: 'https://other-service.com/webhook' }],
    });
    // Orca hook appended as new matcher group
    expect(hooks.Stop[1].matcher).toBe('');
    expect(hooks.Stop[1].hooks[0].url).toBe('http://127.0.0.1:9999/orca-hooks');
  });

  it('migrates old flat-format Orca entry and replaces it', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(workDir),
      JSON.stringify({
        hooks: {
          Stop: [{ type: 'http', url: 'http://127.0.0.1:1111/orca-hooks' }],
        },
      }),
      'utf-8',
    );

    ensureHooks(workDir, 2222);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<
      string,
      { matcher: string; hooks: Record<string, unknown>[] }[]
    >;

    // Should replace, not duplicate
    expect(hooks.Stop).toHaveLength(1);
    expect(hooks.Stop[0].hooks[0].url).toBe('http://127.0.0.1:2222/orca-hooks');
  });
});

describe('removeHooks', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'orca-hooks-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('removes Orca hooks from each event type', () => {
    ensureHooks(workDir, 9999);
    removeHooks(workDir);

    expect(existsSync(settingsPath(workDir))).toBe(false);
  });

  it('preserves non-Orca matcher groups', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(workDir),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', url: 'https://other-service.com/webhook' }],
            },
            {
              matcher: '',
              hooks: [{ type: 'http', url: 'http://127.0.0.1:9999/orca-hooks' }],
            },
          ],
        },
      }),
      'utf-8',
    );

    removeHooks(workDir);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<
      string,
      { matcher: string; hooks: Record<string, unknown>[] }[]
    >;
    expect(hooks.Stop).toHaveLength(1);
    expect(hooks.Stop[0].hooks[0].url).toBe('https://other-service.com/webhook');
  });

  it('migrates old flat-format entries and preserves non-Orca ones', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(workDir),
      JSON.stringify({
        hooks: {
          Stop: [
            { type: 'command', url: 'https://other-service.com/webhook' },
            { type: 'http', url: 'http://127.0.0.1:9999/orca-hooks' },
          ],
        },
      }),
      'utf-8',
    );

    removeHooks(workDir);

    const settings = readSettings(workDir);
    const hooks = settings.hooks as Record<
      string,
      { matcher: string; hooks: Record<string, unknown>[] }[]
    >;
    expect(hooks.Stop).toHaveLength(1);
    // Old entry should now be wrapped in a matcher group
    expect(hooks.Stop[0]).toEqual({
      matcher: '',
      hooks: [{ type: 'command', url: 'https://other-service.com/webhook' }],
    });
  });

  it('deletes file when settings become empty', () => {
    ensureHooks(workDir, 9999);
    expect(existsSync(settingsPath(workDir))).toBe(true);

    removeHooks(workDir);
    expect(existsSync(settingsPath(workDir))).toBe(false);
  });

  it('no-op when file does not exist', () => {
    expect(() => removeHooks(workDir)).not.toThrow();
  });

  it('preserves other top-level settings keys', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    ensureHooks(workDir, 9999);

    // Add a custom key after hooks are written
    const settings = readSettings(workDir);
    settings.customKey = 'preserved';
    writeFileSync(settingsPath(workDir), JSON.stringify(settings, null, 2) + '\n', 'utf-8');

    removeHooks(workDir);

    const result = readSettings(workDir);
    expect(result.customKey).toBe('preserved');
    expect(result.hooks).toBeUndefined();
  });
});
