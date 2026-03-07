import { safeStorage } from 'electron';
import { app } from 'electron';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const AUTH_FILE = () => join(app.getPath('userData'), 'auth');

export function storeToken(token: string): void {
  const encrypted = safeStorage.encryptString(token);
  writeFileSync(AUTH_FILE(), encrypted);
}

export function readToken(): string | null {
  try {
    const encrypted = readFileSync(AUTH_FILE());
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try {
    unlinkSync(AUTH_FILE());
  } catch {
    // File may not exist
  }
}
