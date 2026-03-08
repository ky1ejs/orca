/**
 * Build the daemon entry point using esbuild.
 * Output: out/daemon/index.js
 *
 * The daemon runs via ELECTRON_RUN_AS_NODE=1, so native modules
 * (node-pty, better-sqlite3) must be externalized — they're loaded
 * at runtime from node_modules.
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const appVersion = pkg.version;
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
const backendUrl = process.env.VITE_BACKEND_URL || 'https://orca-api.fly.dev';

await build({
  entryPoints: ['src/daemon/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'out/daemon/index.js',
  external: [
    'node-pty',
    'better-sqlite3',
    // Node.js built-ins are handled by platform: 'node'
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_HASH__: JSON.stringify(gitHash),
    __BACKEND_URL__: JSON.stringify(backendUrl),
  },
  banner: {
    // ESM compatibility: provide __dirname and require() for native module loading
    js: [
      'import { createRequire as __createRequire } from "node:module";',
      'import { fileURLToPath as __fileURLToPath } from "node:url";',
      'import { dirname as __pathDirname } from "node:path";',
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
});

console.log('Daemon built: out/daemon/index.js');
