import { describe, expect, it } from 'vitest';
import { validateToken } from './token.js';

describe('auth/token', () => {
  describe('validateToken', () => {
    it('returns true for matching tokens', () => {
      expect(validateToken('abc123', 'abc123')).toBe(true);
    });

    it('returns false for non-matching tokens', () => {
      expect(validateToken('abc123', 'xyz789')).toBe(false);
    });

    it('returns false for empty token', () => {
      expect(validateToken('', 'abc123')).toBe(false);
    });
  });
});
