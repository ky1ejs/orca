import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 4444;
let serverProcess: ChildProcess;
let authToken: string;

async function gql(query: string, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('server integration', () => {
  beforeAll(async () => {
    const backendDir = resolve(__dirname, '..');

    await new Promise<void>((resolve, reject) => {
      serverProcess = spawn('bun', ['run', 'src/index.ts'], {
        cwd: backendDir,
        env: { ...process.env, PORT: String(TEST_PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      serverProcess.stdout!.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const tokenMatch = output.match(/Auth token: (\S+)/);
        if (tokenMatch) {
          authToken = tokenMatch[1];
        }
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
        if (!authToken) reject(new Error(`Server exited with code ${code}: ${stderr}`));
      });

      setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    });
  }, 15000);

  afterAll(() => {
    serverProcess?.kill();
  });

  it('rejects requests without auth token', async () => {
    const { body } = await gql('{ projects { id } }');
    const errors = body.errors as Array<{ message: string }>;
    expect(errors).toBeDefined();
    expect(errors[0].message).toContain('Missing Authorization header');
  });

  it('rejects requests with invalid auth token', async () => {
    const { body } = await gql('{ projects { id } }', 'invalid-token');
    const errors = body.errors as Array<{ message: string }>;
    expect(errors).toBeDefined();
    expect(errors[0].message).toContain('Invalid auth token');
  });

  it('accepts requests with valid auth token', async () => {
    const { body } = await gql('{ projects { id name } }', authToken);
    expect(body.errors).toBeUndefined();
    const data = body.data as { projects: unknown[] };
    expect(data.projects).toEqual([]);
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
