import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import type { Plugin } from 'vite';
import pkg from './package.json';

const appVersion = pkg.version;
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
const backendUrl = process.env.VITE_BACKEND_URL || 'https://orca-api.fly.dev';

const buildDefines = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __GIT_HASH__: JSON.stringify(gitHash),
  __BACKEND_URL__: JSON.stringify(backendUrl),
};

function buildCsp(backend: string): string {
  const wsBackend = backend.replace(/^http/, 'ws');
  const connectSrc = ["'self'", 'http://localhost:*', 'ws://localhost:*', backend, wsBackend].join(
    ' ',
  );
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
  ].join('; ');
}

// Inject CSP into renderer index.html using the build-time backend URL so
// connect-src tracks whatever VITE_BACKEND_URL the renderer was built against.
function cspInjectPlugin(): Plugin {
  const csp = buildCsp(backendUrl);
  return {
    name: 'orca:csp-inject',
    transformIndexHtml(html) {
      return html.replace('__CSP_CONTENT__', csp);
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: buildDefines,
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), cspInjectPlugin()],
    define: buildDefines,
  },
});
