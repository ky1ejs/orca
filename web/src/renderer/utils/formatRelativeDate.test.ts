import { describe, expect, it } from 'vitest';
import { formatRelativeDate } from './formatRelativeDate.js';

describe('formatRelativeDate', () => {
  it('formats a date within the current year as "Mon D"', () => {
    const currentYear = new Date().getFullYear();
    const result = formatRelativeDate(`${currentYear}-03-15T12:00:00Z`);
    expect(result).toBe('Mar 15');
  });

  it('formats a date from a previous year as "Mon D, YYYY"', () => {
    const result = formatRelativeDate('2024-01-15T12:00:00Z');
    expect(result).toBe('Jan 15, 2024');
  });

  it('formats a single-digit day without padding', () => {
    const currentYear = new Date().getFullYear();
    const result = formatRelativeDate(`${currentYear}-02-05T12:00:00Z`);
    expect(result).toBe('Feb 5');
  });

  it('handles December dates in previous year', () => {
    const result = formatRelativeDate('2023-12-31T23:59:59Z');
    expect(result).toBe('Dec 31, 2023');
  });
});
