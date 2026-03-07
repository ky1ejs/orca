// @vitest-environment jsdom
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 4445;
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
    getAuthToken: vi.fn(),
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
};

// Set on the jsdom window object directly
(window as unknown as Record<string, unknown>).orca = mockOrca;

// Point the GraphQL client at our test server
vi.stubEnv('VITE_BACKEND_PORT', String(TEST_PORT));

describe('App smoke test', () => {
  beforeAll(async () => {
    const backendDir = resolve(__dirname, '../../../backend');

    await new Promise<void>((resolve, reject) => {
      const bunPath = execFileSync('/bin/sh', ['-c', 'which bun']).toString().trim();
      serverProcess = spawn(bunPath, ['run', 'src/index.ts'], {
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
          mockOrca.db.getAuthToken.mockResolvedValue(authToken);
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
    cleanup();
    serverProcess?.kill();
  });

  it('renders the app with Projects view against a real backend', async () => {
    // Dynamic import after env/mocks are set up
    const { default: App } = await import('./App.js');

    render(<App />);

    // Should show connecting state first
    expect(screen.getByText('Connecting...')).toBeInTheDocument();

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
