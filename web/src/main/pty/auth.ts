import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function readAuthToken(): string | null {
  try {
    const configPath = join(homedir(), '.orca', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return (config.authToken as string) ?? null;
  } catch {
    return null;
  }
}
