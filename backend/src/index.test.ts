import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

    // Seed a test user first
    const seedProcess = spawn(
      'bun',
      [
        'run',
        'src/scripts/seed.ts',
        '--email',
        'test@orca.local',
        '--name',
        'Test User',
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
});
