import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import pkg from './package.json';

const appVersion = pkg.version;
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

const buildDefines = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __GIT_HASH__: JSON.stringify(gitHash),
};

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
    plugins: [react(), tailwindcss()],
    define: buildDefines,
  },
});
