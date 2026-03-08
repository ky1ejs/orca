import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const HOOK_EVENT_TYPES = ['Stop', 'PermissionRequest', 'UserPromptSubmit'] as const;
const ORCA_HOOKS_MARKER = '/orca-hooks';

interface HookEntry {
  type: string;
  url: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
}

interface SettingsFile {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

function buildHookEntry(port: number): HookEntry {
  return {
    type: 'http',
    url: `http://127.0.0.1:${port}/orca-hooks`,
    headers: {
      'X-Orca-Session-Id': '$ORCA_SESSION_ID',
    },
    allowedEnvVars: ['ORCA_SESSION_ID'],
  };
}

function settingsPath(workingDirectory: string): string {
  return path.join(workingDirectory, '.claude', 'settings.local.json');
}

function isOrcaHook(entry: HookEntry): boolean {
  return entry.url?.includes(ORCA_HOOKS_MARKER) ?? false;
}

export function ensureHooks(workingDirectory: string, port: number): void {
  const filePath = settingsPath(workingDirectory);
  const dirPath = path.dirname(filePath);

  mkdirSync(dirPath, { recursive: true });

  let settings: SettingsFile = {};
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      settings = JSON.parse(raw) as SettingsFile;
    } catch {
      console.warn(`[orca] Invalid JSON in ${filePath}, overwriting with Orca hooks only`);
      settings = {};
    }
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }

  const entry = buildHookEntry(port);

  for (const eventType of HOOK_EVENT_TYPES) {
    const existing: HookEntry[] | undefined = settings.hooks[eventType];
    if (!Array.isArray(existing)) {
      settings.hooks[eventType] = [entry];
      continue;
    }

    const orcaIndex = existing.findIndex(isOrcaHook);
    if (orcaIndex >= 0) {
      existing[orcaIndex] = entry;
    } else {
      existing.push(entry);
    }
  }

  writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

export function removeHooks(workingDirectory: string): void {
  const filePath = settingsPath(workingDirectory);

  if (!existsSync(filePath)) return;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const settings = JSON.parse(raw) as SettingsFile;

    if (!settings.hooks || typeof settings.hooks !== 'object') return;

    for (const eventType of HOOK_EVENT_TYPES) {
      const existing = settings.hooks[eventType];
      if (!Array.isArray(existing)) continue;

      const filtered = existing.filter((entry) => !isOrcaHook(entry));
      if (filtered.length === 0) {
        delete settings.hooks[eventType];
      } else {
        settings.hooks[eventType] = filtered;
      }
    }

    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    if (Object.keys(settings).length === 0) {
      unlinkSync(filePath);
      return;
    }

    writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error('[orca] Failed to remove hooks:', err);
  }
}
