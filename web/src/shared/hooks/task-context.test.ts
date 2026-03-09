import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeTaskContext, removeTaskContext } from './task-context.js';
import type { TaskMetadata } from '../daemon-protocol.js';

const metadata: TaskMetadata = {
  displayId: 'ORCA-42',
  title: 'Add user authentication',
  description: 'Implement JWT-based authentication for the API',
  projectName: 'Backend API',
  workspaceSlug: 'acme',
};

describe('writeTaskContext', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'orca-task-ctx-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('creates .claude/ directory and CLAUDE.local.md', () => {
    writeTaskContext(workDir, metadata);

    expect(existsSync(path.join(workDir, '.claude'))).toBe(true);
    expect(existsSync(path.join(workDir, '.claude', 'CLAUDE.local.md'))).toBe(true);
  });

  it('file starts with Orca marker', () => {
    writeTaskContext(workDir, metadata);

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content.startsWith('<!-- Managed by Orca. Do not edit manually. -->')).toBe(true);
  });

  it('contains task ID, title, and project name', () => {
    writeTaskContext(workDir, metadata);

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).toContain('ORCA-42');
    expect(content).toContain('Add user authentication');
    expect(content).toContain('Backend API');
  });

  it('contains description', () => {
    writeTaskContext(workDir, metadata);

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).toContain('Implement JWT-based authentication for the API');
  });

  it('contains naming conventions', () => {
    writeTaskContext(workDir, metadata);

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).toContain('feat/ORCA-42-short-description');
    expect(content).toContain('ORCA-42: Short description');
  });

  it('omits project line when projectName is null', () => {
    writeTaskContext(workDir, { ...metadata, projectName: null });

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).not.toContain('**Project**');
  });

  it('omits description section when description is null', () => {
    writeTaskContext(workDir, { ...metadata, description: null });

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).not.toContain('## Description');
  });

  it('overwrites existing file', () => {
    writeTaskContext(workDir, metadata);
    writeTaskContext(workDir, { ...metadata, title: 'Updated title' });

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).toContain('Updated title');
    expect(content).not.toContain('Add user authentication');
  });

  it('truncates description to 1000 chars', () => {
    const longDesc = 'a'.repeat(2000);
    writeTaskContext(workDir, { ...metadata, description: longDesc });

    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    // Description should be truncated
    const descriptionSection = content.split('## Description')[1];
    expect(descriptionSection).toBeDefined();
    // The truncated description should be 1000 chars long
    expect(descriptionSection).toContain('a'.repeat(1000));
    expect(descriptionSection).not.toContain('a'.repeat(1001));
  });
});

describe('removeTaskContext', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'orca-task-ctx-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('removes file that has Orca marker', () => {
    writeTaskContext(workDir, metadata);
    removeTaskContext(workDir);

    expect(existsSync(path.join(workDir, '.claude', 'CLAUDE.local.md'))).toBe(false);
  });

  it('does not remove file without Orca marker', () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), '# My custom docs\n', 'utf-8');

    removeTaskContext(workDir);

    expect(existsSync(path.join(workDir, '.claude', 'CLAUDE.local.md'))).toBe(true);
    const content = readFileSync(path.join(workDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).toBe('# My custom docs\n');
  });

  it('no-op when file does not exist', () => {
    expect(() => removeTaskContext(workDir)).not.toThrow();
  });

  it('no-op when .claude directory does not exist', () => {
    expect(() => removeTaskContext(path.join(workDir, 'nonexistent'))).not.toThrow();
  });
});
