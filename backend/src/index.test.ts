import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
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
        env: { ...process.env, PORT: String(TEST_PORT), JWT_SECRET: TEST_JWT_SECRET },
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
      expect(html).toContain('Connect Orca integration test to Orca');
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

    it('rotates refresh tokens and revokes the family when one is reused', async () => {
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

      // Reusing the old token fails and revokes the new one too.
      expect((await refresh(original)).status).toBe(400);
      expect((await refresh(rotated.refresh_token!)).status).toBe(400);
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
});
