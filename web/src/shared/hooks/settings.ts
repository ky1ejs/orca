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

interface MatcherGroup {
  matcher: string;
  hooks: HookEntry[];
}

interface SettingsFile {
  hooks?: Record<string, MatcherGroup[]>;
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

function buildMatcherGroup(port: number): MatcherGroup {
  return {
    matcher: '',
    hooks: [buildHookEntry(port)],
  };
}

function settingsPath(workingDirectory: string): string {
  return path.join(workingDirectory, '.claude', 'settings.local.json');
}

function isOrcaHookEntry(entry: HookEntry): boolean {
  return entry.url?.includes(ORCA_HOOKS_MARKER) ?? false;
}

function isOrcaMatcherGroup(group: MatcherGroup): boolean {
  return group.hooks.some(isOrcaHookEntry);
}

function isMatcherGroup(entry: unknown): entry is MatcherGroup {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'matcher' in entry &&
    'hooks' in entry &&
    Array.isArray((entry as MatcherGroup).hooks)
  );
}

function migrateToMatcherGroups(entries: unknown[]): MatcherGroup[] {
  return entries.map((entry) => {
    if (isMatcherGroup(entry)) return entry;
    return { matcher: '', hooks: [entry as HookEntry] };
  });
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

  const matcherGroup = buildMatcherGroup(port);

  for (const eventType of HOOK_EVENT_TYPES) {
    const existing = settings.hooks[eventType];
    if (!Array.isArray(existing)) {
      settings.hooks[eventType] = [matcherGroup];
      continue;
    }

    const migrated = migrateToMatcherGroups(existing);
    const orcaIndex = migrated.findIndex(isOrcaMatcherGroup);
    if (orcaIndex >= 0) {
      migrated[orcaIndex] = matcherGroup;
    } else {
      migrated.push(matcherGroup);
    }
    settings.hooks[eventType] = migrated;
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

      const migrated = migrateToMatcherGroups(existing);
      const filtered = migrated.filter((group) => !isOrcaMatcherGroup(group));
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
