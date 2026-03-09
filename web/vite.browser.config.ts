/**
 * Minimal Vite config for browser-only UI preview (no Electron).
 * Usage: npx vite --config vite.browser.config.ts
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json';
import { execSync } from 'node:child_process';

// loadEnv reads .env files relative to the envDir (project root)
const env = loadEnv('development', '.', 'VITE_');
const backendPort = env.VITE_BACKEND_PORT || '4000';

export default defineConfig({
  root: 'src/renderer',
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(execSync('git rev-parse --short HEAD').toString().trim()),
    __BACKEND_URL__: JSON.stringify(`http://localhost:${backendPort}`),
  },
});
