#!/usr/bin/env node
// Rebuilds better-sqlite3 for Node.js (reverses the Electron rebuild).
// Needed before running tests since vitest runs on Node.js.

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqliteDir = resolve(__dirname, '../node_modules/better-sqlite3');

console.log(`Rebuilding better-sqlite3 for Node.js (${process.arch})...`);

execSync(`npx prebuild-install || node-gyp rebuild --release`, {
  cwd: sqliteDir,
  stdio: 'inherit',
});

console.log('Rebuild complete.');
