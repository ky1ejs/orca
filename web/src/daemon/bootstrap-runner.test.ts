import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findBootstrapScript,
  findPreTerminalScript,
  runBootstrap,
  runPreTerminal,
} from './bootstrap-runner.js';
import type { TaskMetadata } from '../shared/daemon-protocol.js';

const metadata: TaskMetadata = {
  displayId: 'ORCA-42',
  title: 'Test task',
  description: null,
  projectName: 'Test Project',
  workspaceSlug: 'test-ws',
};

describe('findBootstrapScript', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-bootstrap-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when .orca/bootstrap does not exist', async () => {
    expect(await findBootstrapScript(tempDir)).toBeNull();
  });

  it('returns null when .orca/bootstrap is not executable', async () => {
    const orcaDir = join(tempDir, '.orca');
    mkdirSync(orcaDir);
    writeFileSync(join(orcaDir, 'bootstrap'), '#!/bin/bash\necho hi', { mode: 0o644 });
    expect(await findBootstrapScript(tempDir)).toBeNull();
  });

  it('returns the path when .orca/bootstrap exists and is executable', async () => {
    const orcaDir = join(tempDir, '.orca');
    mkdirSync(orcaDir);
    const scriptPath = join(orcaDir, 'bootstrap');
    writeFileSync(scriptPath, '#!/bin/bash\necho hi', { mode: 0o755 });
    expect(await findBootstrapScript(tempDir)).toBe(scriptPath);
  });
});

describe('runBootstrap', () => {
  let worktreeDir: string;
  let repoDir: string;

  beforeEach(() => {
    // realpathSync resolves macOS /var → /private/var symlink
    worktreeDir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-bootstrap-wt-')));
    repoDir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-bootstrap-repo-')));
    mkdirSync(join(worktreeDir, '.orca'));
  });

  afterEach(() => {
    rmSync(worktreeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  function writeScript(content: string): string {
    const scriptPath = join(worktreeDir, '.orca', 'bootstrap');
    writeFileSync(scriptPath, content, { mode: 0o755 });
    return scriptPath;
  }

  it('runs a successful bootstrap script', async () => {
    const scriptPath = writeScript('#!/bin/bash\necho "hello bootstrap"');

    const result = await runBootstrap({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      metadata,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.output).toContain('hello bootstrap');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures stderr output', async () => {
    const scriptPath = writeScript('#!/bin/bash\necho "err msg" >&2');

    const result = await runBootstrap({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      metadata,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('err msg');
  });

  it('returns failure for non-zero exit code', async () => {
    const scriptPath = writeScript('#!/bin/bash\necho "failing"\nexit 1');

    const result = await runBootstrap({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      metadata,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.output).toContain('failing');
  });

  it('injects ORCA environment variables', async () => {
    const scriptPath = writeScript(
      '#!/bin/bash\necho "TASK=$ORCA_TASK_ID"\necho "ROOT=$ORCA_REPO_ROOT"\necho "WT=$ORCA_WORKTREE_PATH"',
    );

    const result = await runBootstrap({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      metadata,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain(`TASK=ORCA-42`);
    expect(result.output).toContain(`ROOT=${repoDir}`);
    expect(result.output).toContain(`WT=${worktreeDir}`);
  });

  it('runs with worktree as cwd', async () => {
    const scriptPath = writeScript('#!/bin/bash\npwd');

    const result = await runBootstrap({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      metadata,
    });

    expect(result.success).toBe(true);
    expect(result.output.trim()).toBe(worktreeDir);
  });

  it('times out long-running scripts', async () => {
    const scriptPath = writeScript('#!/bin/bash\nsleep 60');

    const result = await runBootstrap({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      metadata,
      timeoutMs: 200,
    });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  }, 30000);
});

describe('findPreTerminalScript', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-pre-terminal-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when .orca/pre-terminal does not exist', async () => {
    expect(await findPreTerminalScript(tempDir)).toBeNull();
  });

  it('returns null when .orca/pre-terminal is not executable', async () => {
    const orcaDir = join(tempDir, '.orca');
    mkdirSync(orcaDir);
    writeFileSync(join(orcaDir, 'pre-terminal'), '#!/bin/bash\necho hi', { mode: 0o644 });
    expect(await findPreTerminalScript(tempDir)).toBeNull();
  });

  it('returns the path when .orca/pre-terminal exists and is executable', async () => {
    const orcaDir = join(tempDir, '.orca');
    mkdirSync(orcaDir);
    const scriptPath = join(orcaDir, 'pre-terminal');
    writeFileSync(scriptPath, '#!/bin/bash\necho hi', { mode: 0o755 });
    expect(await findPreTerminalScript(tempDir)).toBe(scriptPath);
  });
});

describe('runPreTerminal', () => {
  let worktreeDir: string;
  let repoDir: string;

  beforeEach(() => {
    worktreeDir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-pre-terminal-wt-')));
    repoDir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-pre-terminal-repo-')));
    mkdirSync(join(worktreeDir, '.orca'));
  });

  afterEach(() => {
    rmSync(worktreeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  function writeScript(content: string): string {
    const scriptPath = join(worktreeDir, '.orca', 'pre-terminal');
    writeFileSync(scriptPath, content, { mode: 0o755 });
    return scriptPath;
  }

  it('runs a successful pre-terminal script', async () => {
    const scriptPath = writeScript('#!/bin/bash\necho "hello pre-terminal"');

    const result = await runPreTerminal({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.output).toContain('hello pre-terminal');
  });

  it('returns failure for non-zero exit code', async () => {
    const scriptPath = writeScript('#!/bin/bash\necho "failing"\nexit 1');

    const result = await runPreTerminal({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.output).toContain('failing');
  });

  it('times out long-running scripts', async () => {
    const scriptPath = writeScript('#!/bin/bash\nsleep 60');

    const result = await runPreTerminal({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      timeoutMs: 200,
    });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  }, 30000);

  it('injects ORCA environment variables', async () => {
    const scriptPath = writeScript(
      '#!/bin/bash\necho "ROOT=$ORCA_REPO_ROOT"\necho "WT=$ORCA_WORKTREE_PATH"',
    );

    const result = await runPreTerminal({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain(`ROOT=${repoDir}`);
    expect(result.output).toContain(`WT=${worktreeDir}`);
  });

  it('passes additional env vars to the script', async () => {
    const scriptPath = writeScript('#!/bin/bash\necho "SID=$ORCA_SESSION_ID"');

    const result = await runPreTerminal({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
      env: { ORCA_SESSION_ID: 'test-session-123' },
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('SID=test-session-123');
  });

  it('runs with worktree as cwd', async () => {
    const scriptPath = writeScript('#!/bin/bash\npwd');

    const result = await runPreTerminal({
      scriptPath,
      worktreePath: worktreeDir,
      repoPath: repoDir,
    });

    expect(result.success).toBe(true);
    expect(result.output.trim()).toBe(worktreeDir);
  });
});
