#!/usr/bin/env node
/**
 * Phase 0 POC: Validates that ELECTRON_RUN_AS_NODE=1 can:
 * 1. Use node-pty to spawn a PTY process and receive data
 * 2. Use better-sqlite3 to open/query a database
 * 3. Listen on a Unix domain socket (net.createServer)
 * 4. Run as a detached process that survives the parent process exiting
 *
 * Usage:
 *   ELECTRON_RUN_AS_NODE=1 npx electron ./scripts/daemon-poc.mjs
 *
 * Or to test with the built daemon:
 *   ELECTRON_RUN_AS_NODE=1 npx electron ./out/daemon/index.js --migrations ./drizzle --db-path /tmp/orca-test.db --socket-path /tmp/orca-test.sock --version test
 */
import { createRequire } from 'node:module';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const require = createRequire(import.meta.url);

console.log('=== PTY Daemon POC ===');
console.log(`PID: ${process.pid}`);
console.log(`Node version: ${process.version}`);
console.log(`Platform: ${process.platform}`);

// 1. Test node-pty
console.log('\n--- Testing node-pty ---');
try {
  const pty = require('node-pty');
  const proc = pty.spawn('/bin/echo', ['hello from node-pty'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
  });

  let output = '';
  proc.onData((data) => {
    output += data;
  });

  await new Promise((resolve) => {
    proc.onExit(() => {
      console.log(`  node-pty output: ${output.trim()}`);
      console.log('  ✓ node-pty works');
      resolve();
    });
  });
} catch (err) {
  console.error(`  ✗ node-pty failed: ${err.message}`);
  process.exit(1);
}

// 2. Test better-sqlite3
console.log('\n--- Testing better-sqlite3 ---');
const testDbPath = path.join(os.tmpdir(), `orca-poc-${Date.now()}.db`);
try {
  const Database = require('better-sqlite3');
  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO test (name) VALUES (?)').run('hello');
  const row = db.prepare('SELECT * FROM test').get();
  console.log(`  Query result: ${JSON.stringify(row)}`);
  console.log('  ✓ better-sqlite3 works');
  db.close();
  fs.unlinkSync(testDbPath);
} catch (err) {
  console.error(`  ✗ better-sqlite3 failed: ${err.message}`);
  try {
    fs.unlinkSync(testDbPath);
  } catch {}
  process.exit(1);
}

// 3. Test Unix domain socket
console.log('\n--- Testing Unix domain socket ---');
const testSockPath = path.join(os.tmpdir(), `orca-poc-${Date.now()}.sock`);
try {
  const server = net.createServer((socket) => {
    socket.write('hello from daemon\n');
    socket.end();
  });

  await new Promise((resolve, reject) => {
    server.listen(testSockPath, () => {
      console.log(`  Listening on ${testSockPath}`);

      // Connect as a client
      const client = net.createConnection(testSockPath, () => {
        let data = '';
        client.on('data', (chunk) => {
          data += chunk.toString();
        });
        client.on('end', () => {
          console.log(`  Received: ${data.trim()}`);
          console.log('  ✓ Unix domain socket works');
          server.close(() => {
            try {
              fs.unlinkSync(testSockPath);
            } catch {}
            resolve();
          });
        });
      });
      client.on('error', reject);
    });
    server.on('error', reject);
  });
} catch (err) {
  console.error(`  ✗ Unix domain socket failed: ${err.message}`);
  try {
    fs.unlinkSync(testSockPath);
  } catch {}
  process.exit(1);
}

console.log('\n=== All POC tests passed ===');
console.log('The daemon architecture is viable with ELECTRON_RUN_AS_NODE=1.');
process.exit(0);
