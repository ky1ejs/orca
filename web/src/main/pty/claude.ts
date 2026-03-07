import { execSync } from 'node:child_process';
import type { PtyManager } from './manager.js';

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

/**
 * Spawns a Claude Code agent session via the PtyManager.
 * Throws if the claude binary is not found on PATH.
 */
export function spawnClaudeCode(
  manager: PtyManager,
  sessionId: string,
  cwd: string,
  initialContext?: string,
): void {
  const claudePath = findClaudePath();
  if (!claudePath) {
    throw new Error(
      'Claude CLI not found on PATH. Install it from https://docs.anthropic.com/en/docs/claude-code',
    );
  }

  const args: string[] = [];
  if (initialContext) {
    args.push('--print', initialContext);
  }

  manager.spawn(sessionId, claudePath, args, cwd);
}
