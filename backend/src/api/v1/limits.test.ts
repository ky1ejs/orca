import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_CONCURRENT_INTAKES,
  MAX_INTAKES_PER_KEY_PER_MINUTE,
  acquireIntakeSlot,
  resetIntakeLimits,
} from './limits.js';

afterEach(resetIntakeLimits);

describe('acquireIntakeSlot', () => {
  it('caps requests in flight across keys, and frees a slot on release', () => {
    const slots = Array.from({ length: MAX_CONCURRENT_INTAKES }, (_, i) =>
      acquireIntakeSlot(`key-${i}`),
    );
    expect(acquireIntakeSlot('another')).toMatchObject({ retryAfterSeconds: 5 });

    const first = slots[0];
    if (!('release' in first)) throw new Error('expected a slot');
    first.release();
    first.release(); // A second release is ignored.
    expect(acquireIntakeSlot('another')).toHaveProperty('release');
  });

  it('limits each key per minute and says when to retry', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_INTAKES_PER_KEY_PER_MINUTE; i++) {
      const slot = acquireIntakeSlot('busy-key', start + i);
      if ('release' in slot) slot.release();
    }
    const refused = acquireIntakeSlot('busy-key', start + 30_000);
    expect(refused).toMatchObject({ retryAfterSeconds: 30 });
    expect(acquireIntakeSlot('other-key', start + 30_000)).toHaveProperty('release');
    expect(acquireIntakeSlot('busy-key', start + 60_000)).toHaveProperty('release');
  });
});
