// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../components/shared/TaskIdLink.js', () => ({
  TaskIdLink: ({ displayId }: { displayId: string }) => (
    <button data-testid={`task-link-${displayId}`}>{displayId}</button>
  ),
}));

import { linkifyTaskIds } from './linkifyTaskIds.js';

describe('linkifyTaskIds', () => {
  it('returns original text when no task IDs are present', () => {
    const result = linkifyTaskIds('No task IDs here');
    expect(result).toEqual(['No task IDs here']);
  });

  it('returns original text for empty string', () => {
    const result = linkifyTaskIds('');
    expect(result).toEqual(['']);
  });

  it('linkifies a single task ID', () => {
    const result = linkifyTaskIds('See ORCA-123 for details');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('See ');
    expect(result[2]).toBe(' for details');
  });

  it('linkifies multiple task IDs', () => {
    const result = linkifyTaskIds('ORCA-1 blocks PROJ-42');
    expect(result).toHaveLength(3);
    expect(result[1]).toBe(' blocks ');
  });

  it('handles task ID at start of string', () => {
    const result = linkifyTaskIds('ORCA-1 is important');
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(' is important');
  });

  it('handles task ID at end of string', () => {
    const result = linkifyTaskIds('See ORCA-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('See ');
  });

  it('handles task ID that is the entire string', () => {
    const result = linkifyTaskIds('ORCA-123');
    expect(result).toHaveLength(1);
  });

  it('preserves punctuation around task IDs', () => {
    const result = linkifyTaskIds('(ORCA-123)');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('(');
    expect(result[2]).toBe(')');
  });
});
