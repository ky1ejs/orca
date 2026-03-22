import { describe, expect, it } from 'vitest';
import { buildMcpConfigJson, buildHooksConfigJson, HOOK_EVENT_TYPES } from './settings.js';

const EXPECTED_ENV_VARS = [
  'ORCA_SESSION_ID',
  'ORCA_TASK_ID',
  'ORCA_TASK_UUID',
  'ORCA_TASK_TITLE',
  'ORCA_PROJECT_NAME',
  'ORCA_WORKSPACE_SLUG',
  'ORCA_TASK_DESCRIPTION',
  'ORCA_SERVER_URL',
];

describe('buildMcpConfigJson', () => {
  it('returns valid JSON with mcpServers.orca', () => {
    const json = buildMcpConfigJson(4242);
    const parsed = JSON.parse(json) as {
      mcpServers: Record<
        string,
        { url: string; headers: Record<string, string>; allowedEnvVars: string[] }
      >;
    };

    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.orca).toBeDefined();
  });

  it('contains correct url with port', () => {
    const parsed = JSON.parse(buildMcpConfigJson(9999)) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(parsed.mcpServers.orca.url).toBe('http://127.0.0.1:9999/mcp');
  });

  it('contains session header and allowedEnvVars', () => {
    const parsed = JSON.parse(buildMcpConfigJson(4242)) as {
      mcpServers: Record<string, { headers: Record<string, string>; allowedEnvVars: string[] }>;
    };

    expect(parsed.mcpServers.orca.headers).toEqual({
      'X-Orca-Session-Id': '$ORCA_SESSION_ID',
    });
    expect(parsed.mcpServers.orca.allowedEnvVars).toEqual(EXPECTED_ENV_VARS);
  });

  it('uses different port values correctly', () => {
    const a = JSON.parse(buildMcpConfigJson(1111)) as {
      mcpServers: Record<string, { url: string }>;
    };
    const b = JSON.parse(buildMcpConfigJson(2222)) as {
      mcpServers: Record<string, { url: string }>;
    };

    expect(a.mcpServers.orca.url).toBe('http://127.0.0.1:1111/mcp');
    expect(b.mcpServers.orca.url).toBe('http://127.0.0.1:2222/mcp');
  });
});

describe('buildHooksConfigJson', () => {
  it('returns valid JSON with hooks for all 3 event types', () => {
    const json = buildHooksConfigJson(4242);
    const parsed = JSON.parse(json) as {
      hooks: Record<string, unknown[]>;
    };

    expect(parsed.hooks).toBeDefined();
    for (const eventType of HOOK_EVENT_TYPES) {
      expect(parsed.hooks[eventType]).toBeDefined();
      expect(parsed.hooks[eventType]).toHaveLength(1);
    }
  });

  it('each hook entry has correct matcher-group structure', () => {
    const parsed = JSON.parse(buildHooksConfigJson(4242)) as {
      hooks: Record<string, { matcher: string; hooks: { type: string; url: string }[] }[]>;
    };

    for (const eventType of HOOK_EVENT_TYPES) {
      const matcherGroup = parsed.hooks[eventType][0];
      expect(matcherGroup.matcher).toBe('');
      expect(matcherGroup.hooks).toHaveLength(1);
      expect(matcherGroup.hooks[0].type).toBe('http');
      expect(matcherGroup.hooks[0].url).toBe('http://127.0.0.1:4242/orca-hooks');
    }
  });

  it('contains session header and allowedEnvVars', () => {
    const parsed = JSON.parse(buildHooksConfigJson(4242)) as {
      hooks: Record<
        string,
        {
          hooks: { headers: Record<string, string>; allowedEnvVars: string[] }[];
        }[]
      >;
    };

    const entry = parsed.hooks.Stop[0].hooks[0];
    expect(entry.headers).toEqual({ 'X-Orca-Session-Id': '$ORCA_SESSION_ID' });
    expect(entry.allowedEnvVars).toEqual(EXPECTED_ENV_VARS);
  });

  it('uses different port values correctly', () => {
    const a = JSON.parse(buildHooksConfigJson(1111)) as {
      hooks: Record<string, { hooks: { url: string }[] }[]>;
    };
    const b = JSON.parse(buildHooksConfigJson(2222)) as {
      hooks: Record<string, { hooks: { url: string }[] }[]>;
    };

    expect(a.hooks.Stop[0].hooks[0].url).toBe('http://127.0.0.1:1111/orca-hooks');
    expect(b.hooks.Stop[0].hooks[0].url).toBe('http://127.0.0.1:2222/orca-hooks');
  });
});
