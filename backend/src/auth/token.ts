import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

const CONFIG_DIR = join(homedir(), '.orca');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface OrcaConfig {
  authToken: string;
}

function readConfig(): OrcaConfig | null {
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as OrcaConfig;
  } catch {
    return null;
  }
}

function writeConfig(config: OrcaConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getOrCreateToken(): string {
  const config = readConfig();
  if (config?.authToken) {
    return config.authToken;
  }
  const token = randomBytes(32).toString('hex');
  writeConfig({ authToken: token });
  return token;
}

export function validateToken(token: string, expectedToken: string): boolean {
  return token === expectedToken;
}
