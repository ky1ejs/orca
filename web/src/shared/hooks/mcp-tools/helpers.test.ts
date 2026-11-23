import { describe, expect, it } from 'vitest';
import { UNTRUSTED_TASK_NOTICE, flagExternalTasks } from './helpers.js';

describe('flagExternalTasks', () => {
  it('flags external tasks at any depth and leaves the rest alone', () => {
    const input = {
      id: 't1',
      isExternal: true,
      relationships: [
        { relatedTask: { id: 't2', isExternal: true } },
        { relatedTask: { id: 't3', isExternal: false } },
      ],
      project: null,
    };

    const output = flagExternalTasks(input);

    expect(output).toEqual({
      id: 't1',
      isExternal: true,
      untrustedNotice: UNTRUSTED_TASK_NOTICE,
      relationships: [
        { relatedTask: { id: 't2', isExternal: true, untrustedNotice: UNTRUSTED_TASK_NOTICE } },
        { relatedTask: { id: 't3', isExternal: false } },
      ],
      project: null,
    });
    expect(input).not.toHaveProperty('untrustedNotice');
  });

  it('handles arrays, primitives and null', () => {
    expect(flagExternalTasks([{ isExternal: true }])).toEqual([
      { isExternal: true, untrustedNotice: UNTRUSTED_TASK_NOTICE },
    ]);
    expect(flagExternalTasks(null)).toBeNull();
    expect(flagExternalTasks('text')).toBe('text');
  });
});
