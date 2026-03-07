#!/usr/bin/env node
// Rebuilds native modules (better-sqlite3, node-pty) for Electron's Node ABI.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const prebuildInstall = resolve(webRoot, 'node_modules/.bin/prebuild-install');

const electronPkg = JSON.parse(
  readFileSync(resolve(webRoot, 'node_modules/electron/package.json'), 'utf-8'),
);
const electronVersion = electronPkg.version;

const modules = [
  { name: 'better-sqlite3', dir: resolve(webRoot, 'node_modules/better-sqlite3') },
  { name: 'node-pty', dir: resolve(webRoot, 'node_modules/node-pty') },
];

for (const mod of modules) {
  if (!existsSync(mod.dir)) {
    console.log(`Skipping ${mod.name} (not installed).`);
    continue;
  }

  console.log(`Rebuilding ${mod.name} for Electron ${electronVersion} (${process.arch})...`);
  try {
    execSync(
      `"${prebuildInstall}" --runtime electron --target ${electronVersion} --arch ${process.arch}`,
      { cwd: mod.dir, stdio: 'inherit' },
    );
  } catch {
    console.log(`prebuild-install failed for ${mod.name}, falling back to node-gyp...`);
    execSync(
      `npx node-gyp rebuild --target=${electronVersion} --arch=${process.arch} --dist-url=https://electronjs.org/headers`,
      { cwd: mod.dir, stdio: 'inherit' },
    );
  }
  console.log(`${mod.name} rebuild complete.`);
}
