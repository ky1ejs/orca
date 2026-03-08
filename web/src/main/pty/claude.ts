import { findClaudePath } from '../../shared/claude.js';
import type { PtyManager } from './manager.js';

export { findClaudePath };

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
