import { execSync } from 'node:child_process';

/**
 * Finds the path to the Claude CLI binary.
 *
 * When running inside the Electron/daemon process, the inherited PATH is
 * typically minimal (e.g. /usr/bin:/bin). Running `which` through a login
 * shell ensures the user's full PATH (from ~/.zshrc, ~/.bashrc, etc.) is
 * available so we can locate binaries installed via npm, bun, or Homebrew.
 *
 * Returns the absolute path if found, or null if not on PATH.
 */
export function findClaudePath(): string | null {
  try {
    if (process.platform === 'win32') {
      const result = execSync('where claude', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim().split('\n')[0] ?? null;
    }

    const shell = process.env.SHELL || '/bin/sh';
    const result = execSync(`${shell} -lc 'which claude'`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().split('\n')[0] ?? null;
  } catch {
    return null;
  }
}
