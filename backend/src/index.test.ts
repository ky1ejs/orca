import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { chromium, type Browser } from 'playwright-core';
import { resolve, dirname, join } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { attachmentStorageKey, createFilesystemStorage } from './attachments/storage.js';
import { signAccessToken } from './oauth/tokens.js';
import { requestFingerprint } from './api/v1/task-input.js';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  UnauthorizedError,
  type OAuthClientProvider,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 4444;
const TEST_JWT_SECRET = 'test-jwt-secret-for-integration-tests';
let serverProcess: ChildProcess;
let authToken: string;
let workspaceId: string;
let workspaceSlug: string;
const attachmentStorageDir = mkdtempSync(join(tmpdir(), 'orca-test-attachments-'));

async function gql(
  query: string,
  token?: string,
  options?: { operationName?: string; variables?: Record<string, unknown> },
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      operationName: options?.operationName,
      variables: options?.variables,
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('server integration', () => {
  beforeAll(async () => {
    const backendDir = resolve(__dirname, '..');

    // Seed two test users: the second checks cross-workspace isolation
    for (const [email, name] of [
      ['test@orca.local', 'Test User'],
      ['other@orca.local', 'Other User'],
    ]) {
      const seedProcess = spawn(
        'bun',
        [
          'run',
          'src/scripts/seed.ts',
          '--email',
          email,
          '--name',
          name,
          '--password',
          'test-password',
        ],
        {
          cwd: backendDir,
          env: { ...process.env, JWT_SECRET: TEST_JWT_SECRET },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      await new Promise<void>((resolve, reject) => {
        seedProcess.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Seed failed with code ${code}`));
        });
        seedProcess.on('error', reject);
      });
    }

    // Start the server
    await new Promise<void>((resolve, reject) => {
      serverProcess = spawn('bun', ['run', 'src/index.ts'], {
        cwd: backendDir,
        env: {
          ...process.env,
          PORT: String(TEST_PORT),
          JWT_SECRET: TEST_JWT_SECRET,
          ATTACHMENT_STORAGE_DIR: attachmentStorageDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      serverProcess.stdout!.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes('Orca server running')) {
          resolve();
        }
      });

      let stderr = '';
      serverProcess.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      serverProcess.on('error', reject);
      serverProcess.on('exit', (code) => {
        reject(new Error(`Server exited with code ${code}: ${stderr}`));
      });

      setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    });

    // Login to get a JWT and workspaces
    const loginRes = await gql(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          token
          user { id name }
          workspaces { id slug }
        }
      }`,
      undefined,
      {
        operationName: 'Login',
        variables: { email: 'test@orca.local', password: 'test-password' },
      },
    );
    if (loginRes.body.errors) {
      throw new Error(`Login failed: ${JSON.stringify(loginRes.body.errors)}`);
    }
    const loginData = loginRes.body.data as {
      login: {
        token: string;
        workspaces: Array<{ id: string; slug: string }>;
      };
    };
    authToken = loginData.login.token;
    workspaceId = loginData.login.workspaces[0].id;
    workspaceSlug = loginData.login.workspaces[0].slug;
  }, 30000);

  afterAll(() => {
    serverProcess?.kill();
    rmSync(attachmentStorageDir, { recursive: true, force: true });
  });

  it('health check returns 200', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('rejects requests without auth token', async () => {
    const { body } = await gql('{ workspaces { id } }');
    const errors = body.errors as Array<{ message: string }>;
    expect(errors).toBeDefined();
    expect(errors[0].message).toContain('Missing or invalid authentication');
  });

  it('rejects requests with invalid auth token', async () => {
    const { body } = await gql('{ workspaces { id } }', 'invalid-token');
    const errors = body.errors as Array<{ message: string }>;
    expect(errors).toBeDefined();
    expect(errors[0].message).toContain('Missing or invalid authentication');
  });

  it('lists workspaces', async () => {
    const { body } = await gql('{ workspaces { id name slug } }', authToken);
    expect(body.errors).toBeUndefined();
    const data = body.data as { workspaces: Array<{ name: string; slug: string }> };
    expect(data.workspaces.length).toBeGreaterThanOrEqual(1);
  });

  it('fetches workspace by slug with projects', async () => {
    const { body } = await gql(
      `query Workspace($slug: String!) {
        workspace(slug: $slug) { id name slug projects { id name } }
      }`,
      authToken,
      { operationName: 'Workspace', variables: { slug: workspaceSlug } },
    );
    expect(body.errors).toBeUndefined();
    const data = body.data as { workspace: { name: string; slug: string } };
    expect(data.workspace.slug).toBe(workspaceSlug);
  });

  it('login returns token, user, and workspaces', async () => {
    const res = await gql(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          token
          user { id name email }
          workspaces { id slug }
        }
      }`,
      undefined,
      {
        operationName: 'Login',
        variables: { email: 'test@orca.local', password: 'test-password' },
      },
    );
    expect(res.body.errors).toBeUndefined();
    const data = res.body.data as {
      login: { token: string; user: { email: string }; workspaces: Array<{ id: string }> };
    };
    expect(data.login.token).toBeTruthy();
    expect(data.login.user.email).toBe('test@orca.local');
    expect(data.login.workspaces.length).toBeGreaterThanOrEqual(1);
  });

  it('login rejects wrong password', async () => {
    const res = await gql(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) { token }
      }`,
      undefined,
      {
        operationName: 'Login',
        variables: { email: 'test@orca.local', password: 'wrong-password' },
      },
    );
    const errors = res.body.errors as Array<{ message: string }>;
    expect(errors).toBeDefined();
    expect(errors[0].message).toBe('Incorrect email or password.');
  });

  it('me query returns current user', async () => {
    const { body } = await gql('{ me { id name email } }', authToken);
    expect(body.errors).toBeUndefined();
    const data = body.data as { me: { email: string; name: string } };
    expect(data.me.email).toBe('test@orca.local');
    expect(data.me.name).toBe('Test User');
  });

  it('creates and queries a project in a workspace', async () => {
    const createRes = await gql(
      `mutation CreateProject($input: CreateProjectInput!) {
        createProject(input: $input) { id name description workspaceId }
      }`,
      authToken,
      {
        operationName: 'CreateProject',
        variables: {
          input: { name: 'Test Project', description: 'A test', workspaceId },
        },
      },
    );
    expect(createRes.body.errors).toBeUndefined();
    const data = createRes.body.data as {
      createProject: { id: string; name: string; workspaceId: string };
    };
    expect(data.createProject.name).toBe('Test Project');
    expect(data.createProject.workspaceId).toBe(workspaceId);

    const queryRes = await gql(
      `query Project($id: ID!) { project(id: $id) { id name } }`,
      authToken,
      { operationName: 'Project', variables: { id: data.createProject.id } },
    );
    const queryData = queryRes.body.data as { project: { name: string } };
    expect(queryData.project.name).toBe('Test Project');

    // Cleanup
    await gql(`mutation DeleteProject($id: ID!) { deleteProject(id: $id) }`, authToken, {
      operationName: 'DeleteProject',
      variables: { id: data.createProject.id },
    });
  });

  it('creates and deletes a workspace', async () => {
    const createRes = await gql(
      `mutation CreateWorkspace($input: CreateWorkspaceInput!) {
        createWorkspace(input: $input) { id name slug }
      }`,
      authToken,
      {
        operationName: 'CreateWorkspace',
        variables: { input: { name: 'Test WS', slug: 'test-ws' } },
      },
    );
    expect(createRes.body.errors).toBeUndefined();
    const data = createRes.body.data as {
      createWorkspace: { id: string; name: string; slug: string };
    };
    expect(data.createWorkspace.slug).toBe('test-ws');

    // Delete
    const deleteRes = await gql(
      `mutation DeleteWorkspace($id: ID!) { deleteWorkspace(id: $id) }`,
      authToken,
      { operationName: 'DeleteWorkspace', variables: { id: data.createWorkspace.id } },
    );
    expect(deleteRes.body.errors).toBeUndefined();
  });

  const apiKeysQuery = `query Keys($workspaceId: ID!) {
    apiKeys(workspaceId: $workspaceId) { id revokedAt }
  }`;

  const errorCode = (body: { errors?: unknown }) =>
    (body.errors as Array<{ extensions?: { code?: string } }> | undefined)?.[0]?.extensions?.code;

  const loginAs = async (email: string) => {
    const res = await gql(
      `mutation Login($email: String!) { login(email: $email, password: "test-password") { token } }`,
      undefined,
      { operationName: 'Login', variables: { email } },
    );
    return (res.body.data as { login: { token: string } }).login.token;
  };

  const revokedAtAsOwner = async (wsId: string, keyId: string) => {
    const res = await gql(apiKeysQuery, authToken, {
      operationName: 'Keys',
      variables: { workspaceId: wsId },
    });
    const keys = (res.body.data as { apiKeys: Array<{ id: string; revokedAt: string | null }> })
      .apiKeys;
    return keys.find((k) => k.id === keyId)?.revokedAt;
  };

  it('lets an owner create, list and revoke API keys, which JWT paths refuse', async () => {
    const createRes = await gql(
      `mutation Create($input: CreateApiKeyInput!) {
        createApiKey(input: $input) { key apiKey { id name displayHint scopes revokedAt createdBy { id } } }
      }`,
      authToken,
      {
        operationName: 'Create',
        variables: { input: { workspaceId, name: 'cut-api', scopes: ['TASKS_CREATE'] } },
      },
    );
    expect(createRes.body.errors).toBeUndefined();
    const created = (
      createRes.body.data as {
        createApiKey: {
          key: string;
          apiKey: { id: string; name: string; displayHint: string; revokedAt: string | null };
        };
      }
    ).createApiKey;
    expect(created.key).toMatch(/^orca_/);
    expect(created.apiKey).toMatchObject({ name: 'cut-api', displayHint: created.key.slice(-4) });

    const listRes = await gql(apiKeysQuery, authToken, {
      operationName: 'Keys',
      variables: { workspaceId },
    });
    const keys = (listRes.body.data as { apiKeys: Array<{ id: string }> }).apiKeys;
    expect(keys.map((k) => k.id)).toContain(created.apiKey.id);
    expect(JSON.stringify(listRes.body)).not.toContain(created.key);

    // The key never authenticates as a user on GraphQL, MCP or the WebSocket.
    const graphqlRes = await gql('{ workspaces { id } }', created.key);
    expect((graphqlRes.body.errors as Array<{ message: string }>)[0].message).toContain(
      'Missing or invalid authentication',
    );
    const mcpRes = await fetch(`http://127.0.0.1:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${created.key}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(mcpRes.status).toBe(401);
    const wsResult = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/graphql`, 'graphql-transport-ws');
      ws.onopen = () =>
        ws.send(JSON.stringify({ type: 'connection_init', payload: { token: created.key } }));
      ws.onmessage = (event) => {
        resolve(JSON.parse(String(event.data)).type);
        ws.close();
      };
      ws.onclose = (event) => resolve(`closed:${event.code}`);
    });
    // 4403 is what graphql-ws sends when onConnect refuses the connection;
    // any other close (wrong path, crash) would be a different code.
    expect(wsResult).toBe('closed:4403');

    // Someone outside the workspace can neither list nor revoke the key.
    const otherToken = await loginAs('other@orca.local');
    const otherList = await gql(apiKeysQuery, otherToken, {
      operationName: 'Keys',
      variables: { workspaceId },
    });
    expect(errorCode(otherList.body)).toBe('NOT_FOUND');
    const revokeQuery = `mutation Revoke($id: ID!) { revokeApiKey(id: $id) { id revokedAt } }`;
    const otherRevoke = await gql(revokeQuery, otherToken, {
      operationName: 'Revoke',
      variables: { id: created.apiKey.id },
    });
    expect(errorCode(otherRevoke.body)).toBe('NOT_FOUND');
    expect(await revokedAtAsOwner(workspaceId, created.apiKey.id)).toBeNull();

    const revokeRes = await gql(revokeQuery, authToken, {
      operationName: 'Revoke',
      variables: { id: created.apiKey.id },
    });
    expect(revokeRes.body.errors).toBeUndefined();
    expect(
      (revokeRes.body.data as { revokeApiKey: { revokedAt: string | null } }).revokeApiKey
        .revokedAt,
    ).not.toBeNull();
  });

  it('refuses API key management to a workspace member who is not an owner', async () => {
    // A separate workspace, so adding a member doesn't change the shared one.
    const wsRes = await gql(
      `mutation CreateWorkspace($input: CreateWorkspaceInput!) {
        createWorkspace(input: $input) { id }
      }`,
      authToken,
      {
        operationName: 'CreateWorkspace',
        variables: { input: { name: 'Key Members', slug: 'key-members' } },
      },
    );
    const memberWorkspaceId = (wsRes.body.data as { createWorkspace: { id: string } })
      .createWorkspace.id;

    try {
      const addRes = await gql(
        `mutation Add($input: AddMemberInput!) {
          addMember(input: $input) {
            ... on MemberAdded { member { id } }
            ... on InvitationCreated { invitation { id } }
          }
        }`,
        authToken,
        {
          operationName: 'Add',
          variables: {
            input: { workspaceId: memberWorkspaceId, email: 'other@orca.local', role: 'MEMBER' },
          },
        },
      );
      expect(addRes.body.errors).toBeUndefined();
      const memberToken = await loginAs('other@orca.local');
      const invitationId = (addRes.body.data as { addMember: { invitation?: { id: string } } })
        .addMember.invitation?.id;
      if (invitationId) {
        const accept = await gql(
          `mutation Accept($id: ID!) { acceptInvitation(id: $id) { id } }`,
          memberToken,
          { operationName: 'Accept', variables: { id: invitationId } },
        );
        expect(accept.body.errors).toBeUndefined();
      }

      const createQuery = `mutation Create($input: CreateApiKeyInput!) {
        createApiKey(input: $input) { apiKey { id } }
      }`;
      const ownerCreate = await gql(createQuery, authToken, {
        operationName: 'Create',
        variables: {
          input: { workspaceId: memberWorkspaceId, name: 'owner-key', scopes: ['TASKS_CREATE'] },
        },
      });
      const keyId = (ownerCreate.body.data as { createApiKey: { apiKey: { id: string } } })
        .createApiKey.apiKey.id;

      const memberList = await gql(apiKeysQuery, memberToken, {
        operationName: 'Keys',
        variables: { workspaceId: memberWorkspaceId },
      });
      expect(errorCode(memberList.body)).toBe('NOT_FOUND');

      const memberCreate = await gql(createQuery, memberToken, {
        operationName: 'Create',
        variables: {
          input: { workspaceId: memberWorkspaceId, name: 'member-key', scopes: ['TASKS_CREATE'] },
        },
      });
      expect(errorCode(memberCreate.body)).toBe('NOT_FOUND');

      const memberRevoke = await gql(
        `mutation Revoke($id: ID!) { revokeApiKey(id: $id) { id } }`,
        memberToken,
        { operationName: 'Revoke', variables: { id: keyId } },
      );
      expect(errorCode(memberRevoke.body)).toBe('NOT_FOUND');
      expect(await revokedAtAsOwner(memberWorkspaceId, keyId)).toBeNull();
    } finally {
      await gql(`mutation Delete($id: ID!) { deleteWorkspace(id: $id) }`, authToken, {
        operationName: 'Delete',
        variables: { id: memberWorkspaceId },
      });
    }
  });

  it('serves task attachments to workspace members only, over HTTP, GraphQL and MCP', async () => {
    const prisma = new PrismaClient();
    try {
      const created = await gql(
        `mutation Create($input: CreateTaskInput!) { createTask(input: $input) { id displayId } }`,
        authToken,
        {
          operationName: 'Create',
          variables: { input: { workspaceId, title: 'Has a screenshot' } },
        },
      );
      const task = (created.body.data as { createTask: { id: string; displayId: string } })
        .createTask;
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId: task.id,
          workspaceId,
          filename: 'screenshot-1.png',
          mimeType: 'image/png',
          byteSize: bytes.byteLength,
          storageKey: attachmentStorageKey(workspaceId, randomBytes(8).toString('hex')),
        },
      });
      await createFilesystemStorage(attachmentStorageDir).put(
        attachment.storageKey,
        new Blob([bytes]),
        'image/png',
      );

      const url = `http://127.0.0.1:${TEST_PORT}/attachments/${attachment.id}`;
      const download = (token?: string) =>
        fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

      expect((await download()).status).toBe(401);
      // A real API key and a real OAuth access token are both refused: the
      // route takes session JWTs only.
      const keyRes = await gql(
        `mutation Key($input: CreateApiKeyInput!) { createApiKey(input: $input) { key } }`,
        authToken,
        {
          operationName: 'Key',
          variables: { input: { workspaceId, name: 'attachments-test', scopes: ['TASKS_CREATE'] } },
        },
      );
      const apiKey = (keyRes.body.data as { createApiKey: { key: string } }).createApiKey.key;
      expect((await download(apiKey)).status).toBe(401);
      const me = await gql('{ me { id } }', authToken);
      const previousSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = TEST_JWT_SECRET;
      const oauthToken = await signAccessToken({
        userId: (me.body.data as { me: { id: string } }).me.id,
        clientId: 'test-client',
        resource: `http://127.0.0.1:${TEST_PORT}/mcp`,
      });
      process.env.JWT_SECRET = previousSecret;
      expect((await download(oauthToken)).status).toBe(401);
      const otherLogin = await gql(
        `mutation { login(email: "other@orca.local", password: "test-password") { token } }`,
      );
      const otherToken = (otherLogin.body.data as { login: { token: string } }).login.token;
      expect((await download(otherToken)).status).toBe(404);

      const res = await download(authToken);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);

      const preflight = await fetch(url, { method: 'OPTIONS' });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-headers')).toBe('Authorization');

      const viaGraphql = await gql(
        `query T($id: ID!) { task(id: $id) { isExternal attachments { id filename byteSize } } }`,
        authToken,
        { operationName: 'T', variables: { id: task.id } },
      );
      expect(viaGraphql.body.data).toEqual({
        task: {
          isExternal: false,
          attachments: [{ id: attachment.id, filename: 'screenshot-1.png', byteSize: 8 }],
        },
      });

      const callTool = async (name: string, args: Record<string, unknown>) => {
        const mcpRes = await fetch(`http://127.0.0.1:${TEST_PORT}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        });
        return (await mcpRes.json()) as {
          result: {
            isError?: boolean;
            content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
          };
        };
      };

      // An external task carries the untrusted-input notice in every tool result.
      await prisma.task.update({ where: { id: task.id }, data: { isExternal: true } });
      const image = await callTool('get_task_attachment', { attachmentId: attachment.id });
      expect(image.result.isError).toBeUndefined();
      expect(image.result.content[0].text).toContain('untrusted input');
      expect(image.result.content[1]).toEqual({
        type: 'image',
        mimeType: 'image/png',
        data: Buffer.from(bytes).toString('base64'),
      });
      const details = await callTool('get_task', { id: task.id });
      const parsed = JSON.parse(details.result.content[0].text!) as {
        isExternal: boolean;
        untrustedNotice?: string;
        attachments: Array<{ id: string }>;
      };
      expect(parsed.isExternal).toBe(true);
      expect(parsed.untrustedNotice).toContain('untrusted input');
      expect(parsed.attachments.map((a) => a.id)).toEqual([attachment.id]);
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('public API', () => {
    // The test database persists between local runs, so keys differ per run.
    const runId = Date.now();
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

    const createKey = async (scopes: string[]) => {
      const res = await gql(
        `mutation Key($input: CreateApiKeyInput!) {
          createApiKey(input: $input) { key apiKey { id } }
        }`,
        authToken,
        {
          operationName: 'Key',
          variables: { input: { workspaceId, name: 'intake-test', scopes } },
        },
      );
      return (res.body.data as { createApiKey: { key: string; apiKey: { id: string } } })
        .createApiKey;
    };

    // Builds the multipart body up front, so the request carries a Content-Length.
    const postTask = async (
      key: string | null,
      idempotencyKey: string | null,
      task: unknown,
      files: Array<{ bytes: Uint8Array<ArrayBuffer>; type: string }> = [],
      extraParts: Array<[string, string]> = [],
    ) => {
      const form = new FormData();
      form.set(
        'task',
        new Blob([typeof task === 'string' ? task : JSON.stringify(task)], {
          type: 'application/json',
        }),
        'task.json',
      );
      files.forEach((f, i) =>
        form.append('attachment', new Blob([f.bytes], { type: f.type }), `f${i}`),
      );
      for (const [name, value] of extraParts) form.append(name, value);
      const encoded = new Request('http://x', { method: 'POST', body: form });
      const headers: Record<string, string> = {
        'Content-Type': encoded.headers.get('content-type')!,
      };
      if (key) headers.Authorization = `Bearer ${key}`;
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/tasks`, {
        method: 'POST',
        headers,
        body: await encoded.arrayBuffer(),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };

    const purge = async (key: string, ref: string) => {
      const res = await fetch(
        `http://127.0.0.1:${TEST_PORT}/api/v1/external-tasks?externalUserRef=${ref}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${key}` } },
      );
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };

    it('creates an external task with an attachment, once per Idempotency-Key', async () => {
      const { key } = await createKey(['TASKS_CREATE']);
      const labelRes = await gql(
        `mutation L($input: CreateLabelInput!) { createLabel(input: $input) { id } }`,
        authToken,
        {
          operationName: 'L',
          variables: {
            input: { workspaceId, name: `Intake Bug ${Date.now()}`, color: '#EB5757' },
          },
        },
      );
      const labelId = (labelRes.body.data as { createLabel: { id: string } }).createLabel.id;
      const task = {
        title: 'Bug report [bug]: feed is empty',
        description: 'The feed shows nothing.',
        labelIds: [labelId],
        externalUserRef: `ref-intake-${runId}`,
      };

      const first = await postTask(key, `cut-bug-report:1-${runId}`, task, [
        { bytes: PNG, type: 'image/png' },
      ]);
      expect(first.status).toBe(201);
      const replay = await postTask(key, `cut-bug-report:1-${runId}`, task, [
        { bytes: PNG, type: 'image/png' },
      ]);
      expect(replay).toEqual({ status: 200, body: first.body });

      const created = await gql(
        `query T($id: ID!) {
          task(id: $id) { isExternal title labels { id } attachments { id filename mimeType } }
        }`,
        authToken,
        { operationName: 'T', variables: { id: first.body.id } },
      );
      const fetched = (
        created.body.data as {
          task: {
            isExternal: boolean;
            title: string;
            labels: Array<{ id: string }>;
            attachments: Array<{ id: string; filename: string; mimeType: string }>;
          };
        }
      ).task;
      expect(fetched).toMatchObject({
        isExternal: true,
        title: task.title,
        labels: [{ id: labelId }],
        attachments: [{ filename: 'attachment-1.png', mimeType: 'image/png' }],
      });
      const download = await fetch(
        `http://127.0.0.1:${TEST_PORT}/attachments/${fetched.attachments[0].id}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(PNG);

      const prisma = new PrismaClient();
      try {
        expect(await prisma.task.count({ where: { externalUserRef: task.externalUserRef } })).toBe(
          1,
        );

        // A key whose request is still running gets 409.
        await prisma.apiIdempotencyKey.create({
          data: {
            workspaceId,
            key: `cut-bug-report:in-progress-${runId}`,
            reservationId: 'still-running',
            fingerprint: await requestFingerprint(JSON.stringify(task), []),
            pendingStorageKeys: [],
          },
        });
        const busy = await postTask(key, `cut-bug-report:in-progress-${runId}`, task);
        expect(busy.status).toBe(409);

        // The same key with a different request is refused.
        const reused = await postTask(key, `cut-bug-report:1-${runId}`, { title: 'Other' });
        expect(reused.status).toBe(422);
      } finally {
        await prisma.$disconnect();
      }
    });

    it('refuses bad keys, missing scopes and invalid requests', async () => {
      const task = { title: 'Refused' };
      expect((await postTask(null, 'k', task)).status).toBe(401);
      expect((await postTask('orca_unknown', 'k', task)).status).toBe(401);
      expect((await postTask(authToken, 'k', task)).status).toBe(401);

      const revoked = await createKey(['TASKS_CREATE']);
      await gql(`mutation R($id: ID!) { revokeApiKey(id: $id) { id } }`, authToken, {
        operationName: 'R',
        variables: { id: revoked.apiKey.id },
      });
      expect((await postTask(revoked.key, 'k', task)).status).toBe(401);

      const deleteOnly = await createKey(['TASKS_DELETE_EXTERNAL']);
      expect((await postTask(deleteOnly.key, 'k', task)).status).toBe(403);

      const { key } = await createKey(['TASKS_CREATE']);
      expect((await postTask(key, null, task)).status).toBe(400);
      expect((await postTask(key, 'k2', '{not json')).status).toBe(400);
      expect((await postTask(key, 'k3', { title: '' })).status).toBe(400);
      expect(
        (await postTask(key, 'k4', task, [{ bytes: new Uint8Array([1, 2, 3]), type: 'image/png' }]))
          .status,
      ).toBe(400);
      expect((await postTask(key, 'k5', { title: 'x', labelIds: ['missing'] })).status).toBe(403);
      expect((await postTask(key, 'k6', task, [], [['task', '{"title":"second"}']])).status).toBe(
        400,
      );
      expect((await postTask(key, 'k7', task, [], [['note', 'unexpected']])).status).toBe(400);
    });

    it('purges an external user’s tasks and their files', async () => {
      const creator = await createKey(['TASKS_CREATE']);
      const purger = await createKey(['TASKS_DELETE_EXTERNAL']);
      const made = await postTask(
        creator.key,
        `purge-1-${runId}`,
        { title: 'To purge', externalUserRef: `ref-purge-${runId}` },
        [{ bytes: PNG, type: 'image/png' }],
      );
      const prisma = new PrismaClient();
      try {
        const attachment = await prisma.taskAttachment.findFirstOrThrow({
          where: { taskId: made.body.id as string },
        });
        const storage = createFilesystemStorage(attachmentStorageDir);
        expect(await storage.get(attachment.storageKey)).not.toBeNull();

        expect((await purge(creator.key, `ref-purge-${runId}`)).status).toBe(403);
        expect(await purge(purger.key, `ref-purge-${runId}`)).toEqual({
          status: 200,
          body: { deletedTaskCount: 1, deletedTaskDisplayIds: [made.body.displayId] },
        });
        expect(await prisma.task.findUnique({ where: { id: made.body.id as string } })).toBeNull();
        expect(await storage.get(attachment.storageKey)).toBeNull();
        expect(await purge(purger.key, `ref-purge-${runId}`)).toEqual({
          status: 200,
          body: { deletedTaskCount: 0, deletedTaskDisplayIds: [] },
        });
        expect((await purge(purger.key, 'bad ref')).status).toBe(400);
      } finally {
        await prisma.$disconnect();
      }
    });
    it('cleans up after a failure and lets the retry succeed', async () => {
      const { key } = await createKey(['TASKS_CREATE']);
      const task = { title: 'Retried', externalUserRef: `ref-retry-${runId}` };
      // Storage fails: a file stands where the workspace's attachment folder goes.
      const folder = join(attachmentStorageDir, 'attachments', workspaceId);
      const moved = `${folder}.moved-${runId}`;
      mkdirSync(join(attachmentStorageDir, 'attachments'), { recursive: true });
      if (existsSync(folder)) renameSync(folder, moved);
      writeFileSync(folder, 'not a folder');
      let failed;
      try {
        failed = await postTask(key, `retry-${runId}`, task, [{ bytes: PNG, type: 'image/png' }]);
      } finally {
        rmSync(folder, { force: true });
        if (existsSync(moved)) renameSync(moved, folder);
      }
      expect(failed.status).toBe(500);

      const prisma = new PrismaClient();
      try {
        expect(
          await prisma.apiIdempotencyKey.findUnique({
            where: { workspaceId_key: { workspaceId, key: `retry-${runId}` } },
          }),
        ).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
      const retried = await postTask(key, `retry-${runId}`, task, [
        { bytes: PNG, type: 'image/png' },
      ]);
      expect(retried.status).toBe(201);
    });

    it('after a purge, refuses both a retried create and new tasks for the person', async () => {
      const creator = await createKey(['TASKS_CREATE']);
      const purger = await createKey(['TASKS_DELETE_EXTERNAL']);
      const ref = `ref-gone-${runId}`;
      const task = { title: 'Gone soon', externalUserRef: ref };
      const made = await postTask(creator.key, `gone-${runId}`, task);
      expect(made.status).toBe(201);

      // A person's task linked to the external one, and an audit event on it.
      const linked = await gql(
        `mutation C($input: CreateTaskInput!) { createTask(input: $input) { id } }`,
        authToken,
        { operationName: 'C', variables: { input: { workspaceId, title: 'Linked by a person' } } },
      );
      const linkedId = (linked.body.data as { createTask: { id: string } }).createTask.id;
      await gql(
        `mutation R($input: CreateTaskRelationshipInput!) { createTaskRelationship(input: $input) { id } }`,
        authToken,
        {
          operationName: 'R',
          variables: {
            input: { sourceTaskId: linkedId, targetTaskId: made.body.id, type: 'RELATES_TO' },
          },
        },
      );

      const purged = await purge(purger.key, ref);
      expect(purged).toEqual({
        status: 200,
        body: { deletedTaskCount: 1, deletedTaskDisplayIds: [made.body.displayId] },
      });

      expect((await postTask(creator.key, `gone-${runId}`, task)).status).toBe(410);
      expect((await postTask(creator.key, `gone-new-${runId}`, task)).status).toBe(410);

      const prisma = new PrismaClient();
      try {
        expect(await prisma.auditEvent.count({ where: { entityId: made.body.id as string } })).toBe(
          0,
        );
        expect(await prisma.taskRelationship.count({ where: { sourceTaskId: linkedId } })).toBe(0);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

  it('serves MCP tools over /mcp as the authenticated user', async () => {
    const callTool = async (name: string, args: Record<string, unknown>, token = authToken) => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });
      return res;
    };

    expect((await callTool('list_workspaces', {}, 'bad-token')).status).toBe(401);

    const createRes = await callTool('create_task', { workspaceId, title: 'Remote MCP task' });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    expect(created.result.isError).toBeUndefined();
    const task = JSON.parse(created.result.content[0].text) as { id: string; title: string };
    expect(task.title).toBe('Remote MCP task');

    const getRes = await callTool('get_task', { id: task.id });
    const fetched = (await getRes.json()) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(fetched.result.content[0].text)).toMatchObject({
      id: task.id,
      title: 'Remote MCP task',
    });

    // A user outside the workspace must not be able to read the task
    const otherLogin = await gql(
      `mutation { login(email: "other@orca.local", password: "test-password") { token } }`,
    );
    const otherToken = (otherLogin.body.data as { login: { token: string } }).login.token;
    const otherRes = await callTool('get_task', { id: task.id }, otherToken);
    expect(otherRes.status).toBe(200);
    const denied = (await otherRes.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    expect(denied.result.isError).toBe(true);
    expect(denied.result.content[0].text).not.toContain('Remote MCP task');
  });

  describe('MCP OAuth sign-in', () => {
    const base = `http://127.0.0.1:${TEST_PORT}`;
    const redirectUrl = 'http://localhost:33418/callback';

    /** In-memory provider, like the one an MCP client such as Claude Code keeps. */
    function createProvider() {
      const store: {
        client?: OAuthClientInformationMixed;
        tokens?: OAuthTokens;
        verifier?: string;
        authorizationUrl?: URL;
      } = {};
      const provider: OAuthClientProvider = {
        redirectUrl,
        clientMetadata: {
          client_name: 'Orca integration test',
          redirect_uris: [redirectUrl],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
        clientInformation: () => store.client,
        saveClientInformation: (info) => {
          store.client = info;
        },
        tokens: () => store.tokens,
        saveTokens: (tokens) => {
          store.tokens = tokens;
        },
        redirectToAuthorization: (url) => {
          store.authorizationUrl = url;
        },
        saveCodeVerifier: (verifier) => {
          store.verifier = verifier;
        },
        codeVerifier: () => store.verifier!,
      };
      return { provider, store };
    }

    /** Plays the user's browser: loads the sign-in page and submits it. */
    async function signInInBrowser(
      authorizationUrl: URL,
      email: string,
      password: string,
      action = 'allow',
    ) {
      const pageRes = await fetch(authorizationUrl);
      expect(pageRes.status).toBe(200);
      const html = await pageRes.text();
      expect(html).toContain('Allow an app on this computer to access Orca?');
      expect(html).toContain('The app calls itself <strong>Orca integration test</strong>');
      const sealed = /name="request" value="([^"]+)"/.exec(html)?.[1];
      expect(sealed).toBeDefined();

      return fetch(`${base}/oauth/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ request: sealed!, email, password, action }),
        redirect: 'manual',
      });
    }

    async function connect(provider: OAuthClientProvider) {
      const client = new Client({ name: 'oauth-test', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        authProvider: provider,
      });
      await client.connect(transport);
      return { client, transport };
    }

    it('signs in through discovery, registration, the browser page and PKCE', async () => {
      const { provider, store } = createProvider();

      // 1. First connect has no token: the SDK discovers metadata, registers,
      //    and asks the client to open the authorization URL.
      const first = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        authProvider: provider,
      });
      await expect(
        new Client({ name: 'oauth-test', version: '1.0.0' }).connect(first),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(store.client?.client_id).toBeDefined();
      expect(store.authorizationUrl?.toString()).toContain(`${base}/oauth/authorize`);

      // 2. A wrong password re-renders the page instead of redirecting.
      const wrong = await signInInBrowser(store.authorizationUrl!, 'test@orca.local', 'nope');
      expect(wrong.status).toBe(401);
      expect(await wrong.text()).toContain('Incorrect email or password.');

      // 3. The right password redirects back with a code and the issuer.
      const ok = await signInInBrowser(store.authorizationUrl!, 'test@orca.local', 'test-password');
      expect(ok.status).toBe(302);
      const callback = new URL(ok.headers.get('location')!);
      expect(`${callback.origin}${callback.pathname}`).toBe(redirectUrl);
      expect(callback.searchParams.get('iss')).toBe(base);
      const code = callback.searchParams.get('code')!;

      // 4. The client exchanges the code and can now use the tools.
      await first.finishAuth(code);
      expect(store.tokens?.refresh_token).toBeDefined();
      const { client } = await connect(provider);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('list_workspaces');
      const result = (await client.callTool({ name: 'list_workspaces', arguments: {} })) as {
        content: Array<{ text: string }>;
      };
      expect(JSON.parse(result.content[0].text)).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: workspaceId })]),
      );
      await client.close();

      // 5. The code is single-use.
      const replay = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: store.client!.client_id,
          redirect_uri: redirectUrl,
          code_verifier: store.verifier!,
        }),
      });
      expect(replay.status).toBe(400);
      expect(((await replay.json()) as { error: string }).error).toBe('invalid_grant');

      // 6. The access token is scoped to /mcp and cannot call /graphql.
      const { body } = await gql('{ me { id } }', store.tokens!.access_token);
      expect(body.errors).toBeDefined();
    });

    it('rotates refresh tokens', async () => {
      const { provider, store } = createProvider();
      const first = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        authProvider: provider,
      });
      await expect(
        new Client({ name: 'oauth-test', version: '1.0.0' }).connect(first),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      const ok = await signInInBrowser(store.authorizationUrl!, 'test@orca.local', 'test-password');
      await first.finishAuth(new URL(ok.headers.get('location')!).searchParams.get('code')!);

      const refresh = (refreshToken: string) =>
        fetch(`${base}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: store.client!.client_id,
          }),
        });

      const original = store.tokens!.refresh_token!;
      const rotatedRes = await refresh(original);
      expect(rotatedRes.status).toBe(200);
      const rotated = (await rotatedRes.json()) as OAuthTokens;
      expect(rotated.refresh_token).not.toBe(original);
    });

    it('redirects with access_denied when the user cancels', async () => {
      const { provider, store } = createProvider();
      const first = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        authProvider: provider,
      });
      await expect(
        new Client({ name: 'oauth-test', version: '1.0.0' }).connect(first),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      const res = await signInInBrowser(store.authorizationUrl!, '', '', 'deny');
      expect(res.status).toBe(302);
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('access_denied');
    });

    it('refuses unregistered redirect URIs without redirecting', async () => {
      const reg = await fetch(`${base}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['https://app.example/callback'] }),
      });
      expect(reg.status).toBe(201);
      const { client_id } = (await reg.json()) as { client_id: string };

      const url = new URL(`${base}/oauth/authorize`);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id,
        redirect_uri: 'https://evil.example/callback',
        code_challenge: 'x'.repeat(43),
        code_challenge_method: 'S256',
      }).toString();
      const res = await fetch(url, { redirect: 'manual' });
      expect(res.status).toBe(400);
      expect(res.headers.get('location')).toBeNull();
    });

    it('rejects registrations with non-HTTPS redirect URIs', async () => {
      const reg = await fetch(`${base}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['http://app.example/callback'] }),
      });
      expect(reg.status).toBe(400);
      expect(((await reg.json()) as { error: string }).error).toBe('invalid_redirect_uri');
    });
  });

  describe('MCP OAuth flow details', () => {
    const base = `http://127.0.0.1:${TEST_PORT}`;
    const prisma = new PrismaClient();

    afterAll(async () => {
      await prisma.$disconnect();
    });

    function pkce() {
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      return { verifier, challenge };
    }

    async function register(redirectUri: string, name = 'Flow test') {
      const res = await fetch(`${base}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: name, redirect_uris: [redirectUri] }),
      });
      expect(res.status).toBe(201);
      return ((await res.json()) as { client_id: string }).client_id;
    }

    function authorizeUrl(clientId: string, redirectUri: string, challenge: string) {
      const url = new URL(`${base}/oauth/authorize`);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'st',
        resource: `${base}/mcp`,
      }).toString();
      return url;
    }

    /** Runs the sign-in with fetch and returns the code from the redirect. */
    async function getCode(clientId: string, redirectUri: string, challenge: string) {
      const html = await (await fetch(authorizeUrl(clientId, redirectUri, challenge))).text();
      const sealed = /name="request" value="([^"]+)"/.exec(html)![1];
      const res = await fetch(`${base}/oauth/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          request: sealed,
          email: 'test@orca.local',
          password: 'test-password',
          action: 'allow',
        }),
        redirect: 'manual',
      });
      const location = new URL(res.headers.get('location')!);
      expect(location.searchParams.get('state')).toBe('st');
      return location.searchParams.get('code')!;
    }

    async function tokenRequest(params: Record<string, string>) {
      const res = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      });
      return { status: res.status, body: (await res.json()) as Record<string, string> };
    }

    async function signIn(redirectUri = 'https://app.example/callback') {
      const clientId = await register(redirectUri);
      const { verifier, challenge } = pkce();
      const code = await getCode(clientId, redirectUri, challenge);
      const { status, body } = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      expect(status).toBe(200);
      return { clientId, tokens: body };
    }

    it.each([
      ['a wrong code_verifier', { code_verifier: 'z'.repeat(43) }, 'invalid_grant'],
      ['a different redirect_uri', { redirect_uri: 'https://app.example/other' }, 'invalid_grant'],
      ['another client_id', { client_id: 'not-the-client' }, 'invalid_grant'],
      ['a different resource', { resource: 'https://other.example/mcp' }, 'invalid_target'],
    ])('rejects a code exchanged with %s', async (_label, override, error) => {
      const redirectUri = 'https://app.example/callback';
      const clientId = await register(redirectUri);
      const { verifier, challenge } = pkce();
      const code = await getCode(clientId, redirectUri, challenge);
      const { status, body } = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        ...override,
      });
      expect(status).toBe(400);
      expect(body.error).toBe(error);
    });

    it('rejects an expired code', async () => {
      const redirectUri = 'https://app.example/callback';
      const clientId = await register(redirectUri);
      const { verifier, challenge } = pkce();
      const code = await getCode(clientId, redirectUri, challenge);
      await prisma.oAuthAuthorizationCode.updateMany({
        where: { clientId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const { status, body } = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      expect(status).toBe(400);
      expect(body.error).toBe('invalid_grant');
    });

    it('accepts a loopback redirect on a different port than registered', async () => {
      const clientId = await register('http://localhost:33418/callback');
      const redirectUri = 'http://localhost:40123/callback';
      const { verifier, challenge } = pkce();
      const code = await getCode(clientId, redirectUri, challenge);
      const { status } = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      expect(status).toBe(200);
    });

    it('lets concurrent refreshes with one token all succeed', async () => {
      // Several rounds, because the original bug only showed up when one
      // request landed between another's rotation and its insert.
      for (let round = 0; round < 5; round++) {
        const { clientId, tokens } = await signIn();
        const refresh = (refreshToken: string) =>
          tokenRequest({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
          });
        const results = await Promise.all([1, 2, 3].map(() => refresh(tokens.refresh_token)));
        expect(results.map((r) => r.status)).toEqual([200, 200, 200]);

        // Every new token still works: the race did not revoke the family.
        for (const next of results) {
          expect((await refresh(next.body.refresh_token)).status).toBe(200);
        }
      }
    });

    it('revokes the family when a rotated token is reused after the grace period', async () => {
      const { clientId, tokens } = await signIn();
      const rotated = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      });
      expect(rotated.status).toBe(200);

      await prisma.oAuthRefreshToken.updateMany({
        where: { clientId, rotatedAt: { not: null } },
        data: { rotatedAt: new Date(Date.now() - 60_000) },
      });

      const reuse = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      });
      expect(reuse.status).toBe(400);
      const next = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: rotated.body.refresh_token,
        client_id: clientId,
      });
      expect(next.status).toBe(400);
    });

    it('keeps the family expiry when refreshing', async () => {
      const { clientId, tokens } = await signIn();
      const [first] = await prisma.oAuthRefreshToken.findMany({ where: { clientId } });
      await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      });
      const all = await prisma.oAuthRefreshToken.findMany({ where: { clientId } });
      expect(all).toHaveLength(2);
      expect(new Set(all.map((t) => t.expiresAt.getTime()))).toEqual(
        new Set([first.expiresAt.getTime()]),
      );
    });

    it('rejects OAuth access tokens on the GraphQL WebSocket', async () => {
      const { tokens } = await signIn();
      const connect = (token: string) =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/graphql`, 'graphql-transport-ws');
          ws.onopen = () =>
            ws.send(JSON.stringify({ type: 'connection_init', payload: { token } }));
          ws.onmessage = (event) => {
            resolve(JSON.parse(String(event.data)).type);
            ws.close();
          };
          ws.onclose = (event) => resolve(`closed:${event.code}`);
        });

      expect(await connect(authToken)).toBe('connection_ack');
      expect(await connect(tokens.access_token)).toBe('closed:4403');
    });

    it('allows the redirect origin in the sign-in page CSP', async () => {
      const clientId = await register('https://app.example/callback');
      const res = await fetch(
        authorizeUrl(clientId, 'https://app.example/callback', 'c'.repeat(43)),
      );
      expect(res.headers.get('content-security-policy')).toContain(
        "form-action 'self' https://app.example",
      );
    });

    describe('in a real browser', () => {
      let browser: Browser | undefined;
      let callbackServer: Server | undefined;
      let callbackPort: number;
      let callbacks: URL[] = [];

      // A cold Chrome start on a CI runner can take well over vitest's 10s default.
      const BROWSER_START_TIMEOUT_MS = 60_000;

      beforeAll(async () => {
        const server = createServer((req, res) => {
          const url = new URL(req.url!, 'http://localhost');
          if (url.pathname === '/callback') callbacks.push(url);
          res.end('ok');
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
        callbackServer = server;
        const addr = server.address();
        callbackPort = typeof addr === 'object' && addr ? addr.port : 0;

        try {
          browser = await chromium.launch({
            ...(process.env.CHROME_PATH
              ? { executablePath: process.env.CHROME_PATH }
              : { channel: 'chrome' }),
            timeout: BROWSER_START_TIMEOUT_MS,
          });
        } catch (err) {
          // CI must run this test; locally it is skipped when Chrome is missing.
          if (process.env.CI) throw err;
        }
      }, BROWSER_START_TIMEOUT_MS + 5_000);

      afterAll(async () => {
        await browser?.close();
        await new Promise<void>((r) => (callbackServer ? callbackServer.close(() => r()) : r()));
      });

      it.each(['allow', 'deny'])(
        'follows the redirect back to the client on %s',
        async (action) => {
          if (!browser) return;
          callbacks = [];
          const redirectUri = `http://localhost:${callbackPort}/callback`;
          const clientId = await register(redirectUri, 'Browser test');
          const { challenge } = pkce();

          const page = await browser.newPage();
          await page.goto(authorizeUrl(clientId, redirectUri, challenge).toString());
          if (action === 'allow') {
            await page.fill('#email', 'test@orca.local');
            await page.fill('#password', 'test-password');
            await page.click('button[value="allow"]');
          } else {
            await page.click('button[value="deny"]');
          }
          await page.waitForURL(/\/callback/);
          await page.close();

          expect(callbacks).toHaveLength(1);
          const params = callbacks[0].searchParams;
          expect(params.get('state')).toBe('st');
          if (action === 'allow') expect(params.get('code')).toBeTruthy();
          else expect(params.get('error')).toBe('access_denied');
        },
        30_000,
      );
    });
  });
});
