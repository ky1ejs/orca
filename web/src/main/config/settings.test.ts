import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

const { getSetting, setSetting, getAllSettings, initSettingsPath } = await import('./settings.js');

describe('settings', () => {
  let tempDir: string;
  let settingsFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-settings-test-'));
    settingsFile = join(tempDir, 'settings.json');
    initSettingsPath(settingsFile);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns undefined for non-existent key', () => {
    expect(getSetting('missing')).toBeUndefined();
  });

  it('sets and gets a setting', () => {
    setSetting('terminal.fontFamily', 'MesloLGS NF');
    expect(getSetting('terminal.fontFamily')).toBe('MesloLGS NF');
  });

  it('updates an existing setting', () => {
    setSetting('terminal.fontFamily', 'monospace');
    setSetting('terminal.fontFamily', 'JetBrains Mono');
    expect(getSetting('terminal.fontFamily')).toBe('JetBrains Mono');
  });

  it('preserves other settings when updating', () => {
    setSetting('a', '1');
    setSetting('b', '2');
    expect(getSetting('a')).toBe('1');
    expect(getSetting('b')).toBe('2');
  });

  it('gets all settings', () => {
    setSetting('x', 1);
    setSetting('y', 'hello');
    expect(getAllSettings()).toEqual({ x: 1, y: 'hello' });
  });

  it('returns empty object when no settings exist', () => {
    expect(getAllSettings()).toEqual({});
  });

  it('writes pretty-printed JSON to disk', () => {
    setSetting('terminal.fontFamily', 'Fira Code');
    const raw = readFileSync(settingsFile, 'utf-8');
    expect(raw).toBe('{\n  "terminal.fontFamily": "Fira Code"\n}\n');
  });

  it('handles corrupted settings file gracefully', () => {
    writeFileSync(settingsFile, '{invalid json!!!');
    initSettingsPath(settingsFile); // reset cache
    expect(getAllSettings()).toEqual({});
  });

  it('persists across cache resets', () => {
    setSetting('key', 'value');
    initSettingsPath(settingsFile); // reset cache
    expect(getSetting('key')).toBe('value');
  });
});
