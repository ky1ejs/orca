import { defineConfig } from 'vitest/config';

// Provide build-time constants that electron.vite.config.ts normally injects.
// Vitest doesn't read electron-vite configs, so these must be defined here.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __GIT_HASH__: JSON.stringify('test'),
    __BACKEND_URL__: JSON.stringify('http://localhost:4000'),
  },
});
