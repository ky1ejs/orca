import { describe, expect, it } from 'vitest';
import { TaskStatus } from './types.js';

describe('TaskStatus', () => {
  it('has all expected values', () => {
    expect(TaskStatus.TODO).toBe('TODO');
    expect(TaskStatus.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(TaskStatus.IN_REVIEW).toBe('IN_REVIEW');
    expect(TaskStatus.DONE).toBe('DONE');
  });
});
