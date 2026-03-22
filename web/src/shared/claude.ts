import { execSync } from 'node:child_process';

function orcaSystemPromptLines(taskId: string, title: string): string[] {
  return [
    'You were launched by Orca to work on a task.',
    `Task: ${taskId} — ${title}`,
    'Environment variables ORCA_TASK_ID, ORCA_TASK_TITLE, ORCA_TASK_DESCRIPTION, and ORCA_PROJECT_NAME contain task context.',
    'Use the get_current_task MCP tool to fetch full task details including description, status, priority, and labels.',
    `If you create a branch, include the task ID in the name: feat/${taskId}-short-description.`,
  ];
}

/** System prompt for plan-mode sessions with concrete task metadata. */
export function buildOrcaSystemPrompt(taskId: string, title: string): string {
  return orcaSystemPromptLines(taskId, title).join(' ');
}

/** System prompt for the CLI wrapper script, using shell variable references. */
export function buildShellOrcaSystemPrompt(): string {
  return orcaSystemPromptLines('$ORCA_TASK_ID', '$ORCA_TASK_TITLE').join(' ');
}

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
