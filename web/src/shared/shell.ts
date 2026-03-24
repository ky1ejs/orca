import { execSync, execFile } from 'node:child_process';

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

/** Merge login shell PATH entries into process.env.PATH. */
function mergeLoginPath(loginPath: string): void {
  if (!loginPath) return;

  const currentPath = process.env.PATH ?? '';
  const existing = new Set(currentPath.split(':'));
  const missing = loginPath.split(':').filter((p) => {
    if (existing.has(p)) return false;
    existing.add(p);
    return true;
  });
  if (missing.length > 0) {
    process.env.PATH = currentPath ? `${currentPath}:${missing.join(':')}` : missing.join(':');
  }
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
    // `printenv PATH` outputs colon-separated PATH in all shells including fish,
    // where `echo $PATH` would output space-separated entries.
    const result = execSync(`${shell} -lc 'printenv PATH'`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    mergeLoginPath(result.trim());
  } catch {
    // Login shell resolution failed — continue with inherited PATH
  }
}

/**
 * Async variant of enrichPathFromLoginShell.
 * Uses execFile with a promise wrapper to avoid blocking the event loop,
 * allowing other startup work (DB init, etc.) to run in parallel.
 */
export function enrichPathFromLoginShellAsync(): Promise<void> {
  if (process.platform === 'win32') return Promise.resolve();

  return new Promise((resolve) => {
    const shell = getDefaultShell();
    execFile(
      shell,
      ['-lc', 'printenv PATH'],
      { encoding: 'utf-8', timeout: 5000 },
      (err, stdout) => {
        if (!err && stdout) {
          mergeLoginPath(stdout.trim());
        }
        // Always resolve — PATH enrichment is best-effort
        resolve();
      },
    );
  });
}
