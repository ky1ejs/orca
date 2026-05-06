import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css';

// Browser dev shim: provide no-op stubs for window.orca so renderer hooks that
// call into Electron preload (worktree, projectDir, shell, agent) don't crash
// when running in a plain browser via VITE_AUTH_TOKEN.
if (import.meta.env.DEV && typeof window !== 'undefined' && !window.orca) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).orca = {
    platform: 'browser',
    auth: {
      readToken: () => Promise.resolve(import.meta.env.VITE_AUTH_TOKEN ?? null),
      storeToken: () => Promise.resolve(),
      clearToken: () => Promise.resolve(),
    },
    worktree: {
      get: () => Promise.resolve(null),
      safety: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
      list: () => Promise.resolve([]),
    },
    projectDir: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    shell: {
      openPath: () => Promise.resolve(),
      openInVscode: () => Promise.resolve(),
      hasVscode: () => Promise.resolve(false),
    },
    agent: { stop: () => Promise.resolve() },
  };
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
