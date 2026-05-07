/**
 * Auto-bootstrap the browser dev environment.
 *
 * Seeds the dev user, mints (or refreshes) a JWT for it, and writes
 * VITE_BACKEND_URL + VITE_AUTH_TOKEN to web/.env so `bun run dev` in web
 * starts already authenticated.
 *
 * Run by:
 *   - scripts/bootstrap (once per worktree, after backend bootstrap)
 *   - web's `predev` script (every `bun run dev`, to auto-heal stale tokens)
 *
 * Reads PORT, JWT_SECRET, DATABASE_URL from backend/.env (Bun auto-loads
 * the .env adjacent to the cwd, which is backend/ when invoked via
 * `bun run dev-bootstrap`).
 */

import { PrismaClient } from '@prisma/client';
import { decodeJwt } from 'jose';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signJwt, verifyJwt } from '../auth/jwt.js';
import { DEV_USER_EMAIL, seedDevUser } from './seed-dev.js';

const MIN_VALIDITY_SECONDS = 7 * 24 * 60 * 60; // 7 days

const WEB_ENV_PATH = resolve(process.cwd(), '..', 'web', '.env');

type TokenDecision =
  | { action: 'mint'; reason: string }
  | { action: 'keep'; reason: string; expiresAt: Date }
  | { action: 'preserve-foreign'; email: string };

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function checkEnv() {
  const missing: string[] = [];
  if (!process.env.PORT) missing.push('PORT');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length > 0) {
    fail(
      `Missing required env vars: ${missing.join(', ')}.\n` +
        `  This script reads backend/.env. Run scripts/bootstrap first.`,
    );
  }
}

function parseEnvFile(content: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    result.set(key, value);
  }
  return result;
}

function serializeEnv(entries: Map<string, string>): string {
  return (
    Array.from(entries.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  );
}

function readWebEnv(): Map<string, string> {
  if (!existsSync(WEB_ENV_PATH)) return new Map();
  return parseEnvFile(readFileSync(WEB_ENV_PATH, 'utf8'));
}

function writeWebEnvAtomic(entries: Map<string, string>) {
  const tmp = `${WEB_ENV_PATH}.tmp`;
  writeFileSync(tmp, serializeEnv(entries), 'utf8');
  renameSync(tmp, WEB_ENV_PATH);
}

async function decideToken(existing: string | undefined): Promise<TokenDecision> {
  if (!existing) return { action: 'mint', reason: 'no token in web/.env' };

  let decoded: { email?: unknown; exp?: unknown };
  try {
    decoded = decodeJwt(existing);
  } catch {
    return { action: 'mint', reason: 'token is malformed' };
  }

  if (typeof decoded.email === 'string' && decoded.email !== DEV_USER_EMAIL) {
    return { action: 'preserve-foreign', email: decoded.email };
  }

  try {
    await verifyJwt(existing);
  } catch {
    return { action: 'mint', reason: 'token failed verification (expired or secret rotated)' };
  }

  if (typeof decoded.exp !== 'number') {
    return { action: 'mint', reason: 'token has no expiry' };
  }

  const now = Math.floor(Date.now() / 1000);
  const remaining = decoded.exp - now;
  if (remaining < MIN_VALIDITY_SECONDS) {
    return { action: 'mint', reason: `token expires in ${Math.round(remaining / 86400)}d` };
  }

  return { action: 'keep', reason: 'token still valid', expiresAt: new Date(decoded.exp * 1000) };
}

async function main() {
  checkEnv();
  const port = process.env.PORT!;
  const backendUrl = `http://localhost:${port}`;

  const prisma = new PrismaClient();
  let user: { id: string; email: string };
  try {
    try {
      await prisma.$connect();
    } catch (err) {
      fail(
        `Could not connect to Postgres at ${process.env.DATABASE_URL}.\n` +
          `  Is Postgres running? Try \`docker compose up -d\` from the repo root.\n` +
          `  Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    user = await seedDevUser(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const env = readWebEnv();
  const decision = await decideToken(env.get('VITE_AUTH_TOKEN'));

  // Always refresh VITE_BACKEND_URL — port can change across worktrees,
  // even when we keep an existing valid or foreign token.
  const urlChanged = env.get('VITE_BACKEND_URL') !== backendUrl;
  env.set('VITE_BACKEND_URL', backendUrl);

  let tokenLabel: string;
  let expiresLabel: string;
  let tokenChanged = false;
  switch (decision.action) {
    case 'mint': {
      const token = await signJwt({ sub: user.id, email: user.email });
      env.set('VITE_AUTH_TOKEN', token);
      const exp = decodeJwt(token).exp;
      tokenLabel = `minted (${decision.reason})`;
      expiresLabel = exp ? new Date(exp * 1000).toISOString() : 'unknown';
      tokenChanged = true;
      break;
    }
    case 'keep': {
      tokenLabel = 'kept (still valid)';
      expiresLabel = decision.expiresAt.toISOString();
      break;
    }
    case 'preserve-foreign': {
      tokenLabel = `preserved (foreign token for ${decision.email})`;
      expiresLabel = '—';
      console.log(
        `\n⚠ web/.env contains a token for ${decision.email}, not ${DEV_USER_EMAIL}.\n` +
          `  Leaving it untouched. Delete VITE_AUTH_TOKEN from web/.env to get a fresh dev token.`,
      );
      break;
    }
  }

  const dirty = urlChanged || tokenChanged;
  if (dirty) writeWebEnvAtomic(env);

  console.log(`\nDev bootstrap:`);
  console.log(`  Backend:  ${backendUrl}`);
  console.log(`  User:     ${user.email}`);
  console.log(`  Token:    ${tokenLabel}`);
  console.log(`  Expires:  ${expiresLabel}`);
  console.log(`  Wrote:    ${dirty ? WEB_ENV_PATH : '(no changes)'}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
