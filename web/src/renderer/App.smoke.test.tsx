// @vitest-environment jsdom
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 4445;
const TEST_JWT_SECRET = 'smoke-test-jwt-secret';
let serverProcess: ChildProcess;
let authToken: string;

// Mock window.orca (normally provided by Electron preload)
const mockOrca = {
  platform: 'darwin',
  db: {
    getSessions: vi.fn().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue({}),
    updateSession: vi.fn().mockResolvedValue(undefined),
  },
  auth: {
    storeToken: vi.fn().mockResolvedValue(undefined),
    readToken: vi.fn(),
    clearToken: vi.fn().mockResolvedValue(undefined),
  },
  pty: {
    spawn: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    replay: vi.fn(),
    onData: vi.fn().mockReturnValue(() => {}),
    onExit: vi.fn().mockReturnValue(() => {}),
  },
  lifecycle: {
    onSessionsDied: vi.fn().mockReturnValue(() => {}),
    onInterruptedSessions: vi.fn().mockReturnValue(() => {}),
    onSessionStatusChanged: vi.fn().mockReturnValue(() => {}),
    onDaemonReconnected: vi.fn().mockReturnValue(() => {}),
    onDaemonDisconnected: vi.fn().mockReturnValue(() => {}),
    onProtocolUpdateRequired: vi.fn().mockReturnValue(() => {}),
    forceRestartDaemon: vi.fn().mockResolvedValue(undefined),
  },
  shell: {
    openPath: vi.fn().mockResolvedValue(undefined),
    hasVscode: vi.fn().mockResolvedValue(false),
    openInVscode: vi.fn().mockResolvedValue(undefined),
  },
};

// Set on the jsdom window object directly
(window as unknown as Record<string, unknown>).orca = mockOrca;

// Point the GraphQL client at our test server
vi.stubEnv('VITE_BACKEND_URL', `http://127.0.0.1:${TEST_PORT}`);

describe('App smoke test', () => {
  beforeAll(async () => {
    const backendDir = resolve(__dirname, '../../../backend');
    const bunPath = execFileSync('/bin/sh', ['-c', 'which bun']).toString().trim();
    const serverEnv = { ...process.env, PORT: String(TEST_PORT), JWT_SECRET: TEST_JWT_SECRET };

    // Seed a test user
    const seedProcess = spawn(
      bunPath,
      [
        'run',
        'src/scripts/seed.ts',
        '--email',
        'smoke@orca.local',
        '--name',
        'Smoke',
        '--password',
        'smoke-password',
      ],
      {
        cwd: backendDir,
        env: serverEnv,
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

    // Start the backend
    await new Promise<void>((resolve, reject) => {
      serverProcess = spawn(bunPath, ['run', 'src/index.ts'], {
        cwd: backendDir,
        env: serverEnv,
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
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) { token }
        }`,
        operationName: 'Login',
        variables: { email: 'smoke@orca.local', password: 'smoke-password' },
      }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if ((json as { errors?: unknown[] }).errors) {
      throw new Error(`Login failed: ${JSON.stringify(json)}`);
    }
    const loginData = json as { data: { login: { token: string } } };
    authToken = loginData.data.login.token;
    mockOrca.auth.readToken.mockResolvedValue(authToken);
  }, 30000);

  afterAll(() => {
    cleanup();
    serverProcess?.kill();
  });

  it('renders the app with Projects view against a real backend', async () => {
    // Dynamic import after env/mocks are set up
    const { default: App } = await import('./App.js');

    render(<App />);

    // Should eventually render the onboarding flow (fresh backend has no projects)
    await waitFor(
      () => {
        expect(screen.getByTestId('onboarding-flow')).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    // Should show the welcome step of onboarding
    expect(screen.getByText('Welcome to Orca')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-get-started')).toBeInTheDocument();
  }, 20000);
});
