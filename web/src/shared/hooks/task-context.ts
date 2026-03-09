import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TaskMetadata } from '../daemon-protocol.js';

const ORCA_MARKER = '<!-- Managed by Orca. Do not edit manually. -->';

export function writeTaskContext(workingDirectory: string, metadata: TaskMetadata): void {
  const dirPath = path.join(workingDirectory, '.claude');
  const filePath = path.join(dirPath, 'CLAUDE.md');

  mkdirSync(dirPath, { recursive: true });

  const lines = [
    ORCA_MARKER,
    '',
    '# Current Task',
    '',
    `- **Task ID**: ${metadata.displayId}`,
    `- **Title**: ${metadata.title}`,
  ];

  if (metadata.projectName) {
    lines.push(`- **Project**: ${metadata.projectName}`);
  }

  if (metadata.description) {
    lines.push('', '## Description', '', metadata.description.slice(0, 1000));
  }

  lines.push(
    '',
    '## Conventions',
    '',
    `- **Branch name**: \`feat/${metadata.displayId}-short-description\``,
    `- **PR title**: \`${metadata.displayId}: Short description\``,
    `- **Commit messages**: Reference \`${metadata.displayId}\` where relevant`,
    '',
  );

  writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

export function removeTaskContext(workingDirectory: string): void {
  const filePath = path.join(workingDirectory, '.claude', 'CLAUDE.md');

  try {
    const content = readFileSync(filePath, 'utf-8');
    if (content.startsWith(ORCA_MARKER)) {
      unlinkSync(filePath);
    }
  } catch {
    // Silently skip if file doesn't exist or can't be read
  }
}
