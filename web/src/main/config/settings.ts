import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// eslint-disable-next-line no-restricted-syntax -- settings store is intentionally schemaless
type Settings = Record<string, unknown>;

let settingsPath: string | null = null;
let cache: Settings | null = null;

function getSettingsPath(): string {
  if (!settingsPath) {
    settingsPath = join(app.getPath('userData'), 'settings.json');
  }
  return settingsPath;
}

function readSettings(): Settings {
  if (cache) return cache;
  const path = getSettingsPath();
  if (!existsSync(path)) {
    cache = {};
    return cache;
  }
  try {
    cache = JSON.parse(readFileSync(path, 'utf-8')) as Settings;
    return cache;
  } catch {
    cache = {};
    return cache;
  }
}

function writeSettings(settings: Settings): void {
  const path = getSettingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  cache = settings;
}

export function getSetting(key: string): unknown {
  const settings = readSettings();
  return settings[key];
}

export function setSetting(key: string, value: unknown): void {
  const settings = readSettings();
  settings[key] = value;
  writeSettings(settings);
}

export function getAllSettings(): Settings {
  return { ...readSettings() };
}

/** Override settings path (for testing). Clears cache. */
export function initSettingsPath(path: string): void {
  settingsPath = path;
  cache = null;
}
