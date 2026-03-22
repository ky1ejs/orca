export const HOOK_EVENT_TYPES = ['Stop', 'PermissionRequest', 'UserPromptSubmit'] as const;

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
  type: string;
  url: string;
  headers?: Record<string, string>;
}

interface SettingsFile {
  hooks?: Record<string, MatcherGroup[]>;
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
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

function applyHooks(settings: SettingsFile, port: number): void {
  settings.hooks = {};
  const matcherGroup = buildMatcherGroup(port);
  for (const eventType of HOOK_EVENT_TYPES) {
    settings.hooks[eventType] = [matcherGroup];
  }
}

function applyMcpConfig(settings: SettingsFile, port: number): void {
  settings.mcpServers = {
    orca: {
      type: 'http',
      url: `http://127.0.0.1:${port}/mcp`,
      headers: {
        'X-Orca-Session-Id': '${ORCA_SESSION_ID}',
      },
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────

export function buildMcpConfigJson(port: number): string {
  const config: SettingsFile = {};
  applyMcpConfig(config, port);
  return JSON.stringify(config, null, 2) + '\n';
}

export function buildHooksConfigJson(port: number): string {
  const config: SettingsFile = {};
  applyHooks(config, port);
  return JSON.stringify(config, null, 2) + '\n';
}
