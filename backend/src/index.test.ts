import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 4444;
const TEST_JWT_SECRET = 'test-jwt-secret-for-integration-tests';
let serverProcess: ChildProcess;
let authToken: string;

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

    // Login to get a JWT
    const loginRes = await gql(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) { token user { id name } }
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
    const loginData = loginRes.body.data as { login: { token: string } };
    authToken = loginData.login.token;
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
    const { body } = await gql('{ projects { id } }');
    const errors = body.errors as Array<{ message: string }>;
    expect(errors).toBeDefined();
    expect(errors[0].message).toContain('Missing or invalid authentication');
  });

  it('rejects requests with invalid auth token', async () => {
    const { body } = await gql('{ projects { id } }', 'invalid-token');
    const errors = body.errors as Array<{ message: string }>;
    expect(errors).toBeDefined();
    expect(errors[0].message).toContain('Missing or invalid authentication');
  });

  it('accepts requests with valid JWT', async () => {
    const { body } = await gql('{ projects { id name } }', authToken);
    expect(body.errors).toBeUndefined();
    const data = body.data as { projects: unknown[] };
    expect(data.projects).toEqual([]);
  });

  it('login returns token and user', async () => {
    const res = await gql(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) { token user { id name email } }
      }`,
      undefined,
      {
        operationName: 'Login',
        variables: { email: 'test@orca.local', password: 'test-password' },
      },
    );
    expect(res.body.errors).toBeUndefined();
    const data = res.body.data as { login: { token: string; user: { email: string } } };
    expect(data.login.token).toBeTruthy();
    expect(data.login.user.email).toBe('test@orca.local');
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

  it('creates and queries a project', async () => {
    const createRes = await gql(
      `mutation {
        createProject(input: { name: "Test Project", description: "A test" }) {
          id name description
        }
      }`,
      authToken,
    );
    expect(createRes.body.errors).toBeUndefined();
    const data = createRes.body.data as { createProject: { id: string; name: string } };
    expect(data.createProject.name).toBe('Test Project');

    const queryRes = await gql(
      `{ project(id: "${data.createProject.id}") { id name } }`,
      authToken,
    );
    const queryData = queryRes.body.data as { project: { name: string } };
    expect(queryData.project.name).toBe('Test Project');

    // Cleanup
    await gql(`mutation { deleteProject(id: "${data.createProject.id}") }`, authToken);
  });
});
