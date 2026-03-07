#!/usr/bin/env node
// Rebuilds better-sqlite3 for Electron's Node ABI.
// @electron/rebuild has issues with pnpm symlinks, so we call prebuild-install directly.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');

const electronPkg = JSON.parse(
  readFileSync(resolve(webRoot, 'node_modules/electron/package.json'), 'utf-8'),
);
const electronVersion = electronPkg.version;

const sqliteDir = resolve(webRoot, 'node_modules/better-sqlite3');

console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion} (${process.arch})...`);

execSync(
  `npx prebuild-install --runtime electron --target ${electronVersion} --arch ${process.arch}`,
  { cwd: sqliteDir, stdio: 'inherit' },
);

console.log('Rebuild complete.');
