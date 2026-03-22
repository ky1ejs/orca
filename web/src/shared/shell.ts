import { execSync } from 'node:child_process';

export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

/**
 * Returns args to launch the shell as a login shell.
 * On macOS/Linux, login shells source /etc/profile (which runs path_helper)
 * and user profile files, ensuring PATH includes standard directories
 * like /usr/local/bin.
 */
export function getLoginShellArgs(): string[] {
  if (process.platform === 'win32') {
    return [];
  }
  return ['-l'];
}

/**
 * Enriches process.env.PATH with entries from the user's login shell.
 *
 * When the daemon is spawned via ELECTRON_RUN_AS_NODE, it inherits a minimal
 * macOS PATH (/usr/bin:/bin:/usr/sbin:/sbin) that misses Homebrew, bun, etc.
 * This function runs a login shell to resolve the user's full PATH, then
 * appends any missing entries to the current PATH without removing existing ones.
 */
export function enrichPathFromLoginShell(): void {
  if (process.platform === 'win32') return;

  try {
    const shell = getDefaultShell();
    const result = execSync(`${shell} -lc 'echo __PATH__$PATH__PATH__'`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const match = result.match(/__PATH__(.+)__PATH__/);
    const loginPath = match?.[1]?.trim();
    if (!loginPath) return;

    const existing = new Set((process.env.PATH ?? '').split(':'));
    const missing = loginPath.split(':').filter((p) => {
      if (existing.has(p)) return false;
      existing.add(p);
      return true;
    });
    if (missing.length > 0) {
      process.env.PATH = `${process.env.PATH}:${missing.join(':')}`;
    }
  } catch {
    // Login shell resolution failed — continue with inherited PATH
  }
}
