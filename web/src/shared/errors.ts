export class AgentError extends Error {
  suggestion: string;

  constructor(message: string, suggestion: string) {
    super(message);
    this.name = 'AgentError';
    this.suggestion = suggestion;
  }
}

export class ClaudeNotFoundError extends AgentError {
  constructor() {
    super(
      'Claude CLI not found on PATH',
      'Install Claude Code from https://docs.anthropic.com/en/docs/claude-code',
    );
    this.name = 'ClaudeNotFoundError';
  }
}

export class InvalidWorkingDirectoryError extends AgentError {
  constructor(dir: string) {
    super(`Working directory does not exist: ${dir}`, 'Check that the path is correct and exists');
    this.name = 'InvalidWorkingDirectoryError';
  }
}

export class PtySpawnError extends AgentError {
  constructor(cause: unknown) {
    super(
      `Failed to spawn agent process: ${cause instanceof Error ? cause.message : String(cause)}`,
      'Check system resources and try again',
    );
    this.name = 'PtySpawnError';
  }
}

export class ProcessCrashError extends AgentError {
  constructor(exitCode: number) {
    super(
      `Agent process crashed with exit code ${exitCode}`,
      'Check the terminal output for error details',
    );
    this.name = 'ProcessCrashError';
  }
}

export class WorktreeError extends AgentError {
  constructor(message: string) {
    super(message, 'Check git status and try again. You may need to commit or stash changes.');
    this.name = 'WorktreeError';
  }
}

export class BootstrapError extends AgentError {
  constructor(exitCode: number | null, output: string, timedOut: boolean) {
    let reason: string;
    if (timedOut) {
      reason = 'Worktree bootstrap timed out';
    } else if (exitCode !== null) {
      reason = `Worktree bootstrap failed (exit code ${exitCode})`;
    } else {
      reason = 'Worktree bootstrap failed to start';
    }
    const lastLines = output.split('\n').filter(Boolean).slice(-10).join('\n');
    const suggestion = lastLines
      ? `Fix .orca/bootstrap, remove the worktree, and relaunch.\n\nLast output:\n${lastLines}`
      : 'Fix .orca/bootstrap, remove the worktree, and relaunch.';
    super(reason, suggestion);
    this.name = 'BootstrapError';
  }
}

export class AuthNotConfiguredError extends AgentError {
  constructor() {
    super('Auth token not configured', 'Run the Orca setup to configure your authentication token');
    this.name = 'AuthNotConfiguredError';
  }
}

export interface SerializedAgentError {
  name: string;
  message: string;
  suggestion: string;
}

export function serializeError(error: unknown): SerializedAgentError {
  if (error instanceof AgentError) {
    return {
      name: error.name,
      message: error.message,
      suggestion: error.suggestion,
    };
  }
  return {
    name: 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
    suggestion: 'An unexpected error occurred. Check the logs for details.',
  };
}
