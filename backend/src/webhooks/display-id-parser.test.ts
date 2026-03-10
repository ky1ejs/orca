import { describe, it, expect } from 'vitest';
import { extractDisplayIds } from './display-id-parser.js';

describe('extractDisplayIds', () => {
  it('extracts a simple display ID', () => {
    expect(extractDisplayIds('ORCA-42')).toEqual([{ slug: 'ORCA', number: 42 }]);
  });

  it('extracts a hyphenated slug', () => {
    expect(extractDisplayIds('MY-TEAM-42')).toEqual([{ slug: 'MY-TEAM', number: 42 }]);
  });

  it('extracts multiple IDs', () => {
    expect(extractDisplayIds('ORCA-1 and ORCA-2')).toEqual([
      { slug: 'ORCA', number: 1 },
      { slug: 'ORCA', number: 2 },
    ]);
  });

  it('extracts from branch format', () => {
    expect(extractDisplayIds('feat/ORCA-42-add-feature')).toEqual([{ slug: 'ORCA', number: 42 }]);
  });

  it('extracts from conventional commit format', () => {
    expect(extractDisplayIds('fix: ORCA-42 fix the thing')).toEqual([{ slug: 'ORCA', number: 42 }]);
  });

  it('extracts from bracket format', () => {
    expect(extractDisplayIds('[ORCA-42] Fix something')).toEqual([{ slug: 'ORCA', number: 42 }]);
  });

  it('is case insensitive and normalizes to uppercase', () => {
    expect(extractDisplayIds('orca-42')).toEqual([{ slug: 'ORCA', number: 42 }]);
  });

  it('deduplicates identical IDs', () => {
    expect(extractDisplayIds('ORCA-42 ORCA-42 orca-42')).toEqual([{ slug: 'ORCA', number: 42 }]);
  });

  it('returns empty for no matches', () => {
    expect(extractDisplayIds('no ids here')).toEqual([]);
  });

  it('does not match single-letter slugs', () => {
    expect(extractDisplayIds('A-42')).toEqual([]);
  });

  it('handles alphanumeric slugs', () => {
    expect(extractDisplayIds('V2-15')).toEqual([{ slug: 'V2', number: 15 }]);
  });
});
