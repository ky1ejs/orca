import { describe, expect, it } from 'vitest';

import { diffFields } from './diff.js';

describe('diffFields', () => {
  it('detects changed fields', () => {
    const before = { status: 'TODO', title: 'Old title' };
    const after = { status: 'IN_PROGRESS', title: 'Old title' };
    const result = diffFields(before, after, ['status', 'title']);
    expect(result).toEqual([{ field: 'status', oldValue: 'TODO', newValue: 'IN_PROGRESS' }]);
  });

  it('returns empty array when nothing changed', () => {
    const before = { status: 'TODO', title: 'Title' };
    const after = { status: 'TODO', title: 'Title' };
    const result = diffFields(before, after, ['status', 'title']);
    expect(result).toEqual([]);
  });

  it('handles null to value transitions', () => {
    const before = { assigneeId: null as string | null };
    const after = { assigneeId: 'user-1' };
    const result = diffFields(before, after, ['assigneeId']);
    expect(result).toEqual([{ field: 'assigneeId', oldValue: null, newValue: 'user-1' }]);
  });

  it('handles value to null transitions', () => {
    const before = { assigneeId: 'user-1' as string | null };
    const after = { assigneeId: null };
    const result = diffFields(before, after, ['assigneeId']);
    expect(result).toEqual([{ field: 'assigneeId', oldValue: 'user-1', newValue: null }]);
  });

  it('only diffs fields present in the after object', () => {
    const before = { status: 'TODO', title: 'Title', priority: 'NONE' };
    const after = { status: 'DONE' };
    const result = diffFields(before, after, ['status', 'title', 'priority']);
    expect(result).toEqual([{ field: 'status', oldValue: 'TODO', newValue: 'DONE' }]);
  });

  it('stringifies non-string values', () => {
    const before = { count: 0 };
    const after = { count: 5 };
    const result = diffFields(before, after, ['count']);
    expect(result).toEqual([{ field: 'count', oldValue: '0', newValue: '5' }]);
  });

  it('stringifies boolean values', () => {
    const before = { archived: false };
    const after = { archived: true };
    const result = diffFields(before, after, ['archived']);
    expect(result).toEqual([{ field: 'archived', oldValue: 'false', newValue: 'true' }]);
  });

  it('detects multiple changes', () => {
    const before = { status: 'TODO', priority: 'NONE', title: 'Old' };
    const after = { status: 'DONE', priority: 'HIGH', title: 'New' };
    const result = diffFields(before, after, ['status', 'priority', 'title']);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ field: 'status', oldValue: 'TODO', newValue: 'DONE' });
    expect(result[1]).toEqual({ field: 'priority', oldValue: 'NONE', newValue: 'HIGH' });
    expect(result[2]).toEqual({ field: 'title', oldValue: 'Old', newValue: 'New' });
  });
});
