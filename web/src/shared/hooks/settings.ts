import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger.js';
import { DAEMON_LOG_FILE } from '../daemon-protocol.js';

const logger = createLogger({ filePath: DAEMON_LOG_FILE, tag: 'hooks', stderr: true });

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

interface McpServerEntry {
  url: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
}

interface SettingsFile {
  hooks?: Record<string, MatcherGroup[]>;
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

// ── Shared file helpers ─────────────────────────────────────────────

function settingsPath(workingDirectory: string): string {
  return path.join(workingDirectory, '.claude', 'settings.local.json');
}

function readSettingsFile(workingDirectory: string): SettingsFile {
  const filePath = settingsPath(workingDirectory);
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as SettingsFile;
  } catch {
    logger.warn(`Invalid JSON in ${filePath}, overwriting`);
    return {};
  }
}

function writeSettingsFile(workingDirectory: string, settings: SettingsFile): void {
  const filePath = settingsPath(workingDirectory);
  if (Object.keys(settings).length === 0) {
    if (existsSync(filePath)) unlinkSync(filePath);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

// ── Shared constants ────────────────────────────────────────────────

const ORCA_ENV_VARS = [
  'ORCA_SESSION_ID',
  'ORCA_TASK_ID',
  'ORCA_TASK_UUID',
  'ORCA_TASK_TITLE',
  'ORCA_PROJECT_NAME',
  'ORCA_WORKSPACE_SLUG',
  'ORCA_TASK_DESCRIPTION',
  'ORCA_SERVER_URL',
];

// ── Hook helpers ────────────────────────────────────────────────────

function buildHookEntry(port: number): HookEntry {
  return {
    type: 'http',
    url: `http://127.0.0.1:${port}/orca-hooks`,
    headers: {
      'X-Orca-Session-Id': '$ORCA_SESSION_ID',
    },
    allowedEnvVars: ORCA_ENV_VARS,
  };
}

function buildMatcherGroup(port: number): MatcherGroup {
  return {
    matcher: '',
    hooks: [buildHookEntry(port)],
  };
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

function applyHooks(settings: SettingsFile, port: number): void {
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
}

function applyMcpConfig(settings: SettingsFile, port: number): void {
  if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
    settings.mcpServers = {};
  }

  settings.mcpServers.orca = {
    url: `http://127.0.0.1:${port}/mcp`,
    headers: {
      'X-Orca-Session-Id': '$ORCA_SESSION_ID',
    },
    allowedEnvVars: ORCA_ENV_VARS,
  };
}

function stripHooks(settings: SettingsFile): void {
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
}

function stripMcpConfig(settings: SettingsFile): void {
  if (!settings.mcpServers || typeof settings.mcpServers !== 'object') return;

  delete settings.mcpServers.orca;

  if (Object.keys(settings.mcpServers).length === 0) {
    delete settings.mcpServers;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function ensureHooks(workingDirectory: string, port: number): void {
  const settings = readSettingsFile(workingDirectory);
  applyHooks(settings, port);
  writeSettingsFile(workingDirectory, settings);
}

export function ensureMcpConfig(workingDirectory: string, port: number): void {
  const settings = readSettingsFile(workingDirectory);
  applyMcpConfig(settings, port);
  writeSettingsFile(workingDirectory, settings);
}

export function ensureOrcaSettings(workingDirectory: string, port: number): void {
  const settings = readSettingsFile(workingDirectory);
  applyHooks(settings, port);
  applyMcpConfig(settings, port);
  writeSettingsFile(workingDirectory, settings);
}

export function removeHooks(workingDirectory: string): void {
  try {
    const settings = readSettingsFile(workingDirectory);
    stripHooks(settings);
    writeSettingsFile(workingDirectory, settings);
  } catch (err) {
    logger.error('Failed to remove hooks', err);
  }
}

export function removeMcpConfig(workingDirectory: string): void {
  try {
    const settings = readSettingsFile(workingDirectory);
    stripMcpConfig(settings);
    writeSettingsFile(workingDirectory, settings);
  } catch (err) {
    logger.error('Failed to remove MCP config', err);
  }
}

export function removeOrcaSettings(workingDirectory: string): void {
  try {
    const settings = readSettingsFile(workingDirectory);
    stripHooks(settings);
    stripMcpConfig(settings);
    writeSettingsFile(workingDirectory, settings);
  } catch (err) {
    logger.error('Failed to remove Orca settings', err);
  }
}
