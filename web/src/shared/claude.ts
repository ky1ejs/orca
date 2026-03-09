import { execSync } from 'node:child_process';

/**
 * Finds the path to the Claude CLI binary.
 * Returns the absolute path if found, or null if not on PATH.
 */
export function findClaudePath(): string | null {
  try {
    const command = process.platform === 'win32' ? 'where claude' : 'which claude';
    const result = execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim().split('\n')[0] ?? null;
  } catch {
    return null;
  }
}
