import { describe, expect, it } from 'vitest';
import { fuzzyMatch, type SearchableItem } from './fuzzyMatch.js';

const items: SearchableItem[] = [
  { id: '1', type: 'task', label: 'Fix login bug', searchFields: ['ORCA-1', 'Fix login bug'] },
  {
    id: '2',
    type: 'task',
    label: 'Add user auth',
    searchFields: ['ORCA-2', 'Add user auth', 'Backend'],
  },
  { id: '3', type: 'project', label: 'Backend', searchFields: ['Backend'] },
  { id: '4', type: 'initiative', label: 'Q1 Goals', searchFields: ['Q1 Goals'] },
  { id: '5', type: 'action', label: 'Create Task', searchFields: ['Create Task'] },
];

describe('fuzzyMatch', () => {
  it('returns all items with score 0 for empty query', () => {
    const results = fuzzyMatch(items, '');
    expect(results).toHaveLength(items.length);
    expect(results.every((r) => r.score === 0)).toBe(true);
  });

  it('returns all items for whitespace-only query', () => {
    const results = fuzzyMatch(items, '   ');
    expect(results).toHaveLength(items.length);
  });

  it('matches items by substring', () => {
    const results = fuzzyMatch(items, 'login');
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('1');
  });

  it('matches case-insensitively', () => {
    const results = fuzzyMatch(items, 'BACKEND');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.item.id === '3')).toBe(true);
  });

  it('scores prefix matches higher than late substring', () => {
    const results = fuzzyMatch(items, 'fix');
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(3); // prefix match
  });

  it('matches multiple words (all must match)', () => {
    const results = fuzzyMatch(items, 'user auth');
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('2');
  });

  it('returns empty when a word does not match any field', () => {
    const results = fuzzyMatch(items, 'nonexistent');
    expect(results).toHaveLength(0);
  });

  it('matches across different search fields', () => {
    const results = fuzzyMatch(items, 'ORCA-2 backend');
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('2');
  });

  it('sorts results by score descending', () => {
    // 'Backend' appears as prefix in project and as a field in task
    const results = fuzzyMatch(items, 'back');
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Project "Backend" has prefix match (score 3)
    // Task "Add user auth" also has "Backend" field with prefix match
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
