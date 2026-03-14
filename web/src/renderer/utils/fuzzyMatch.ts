export interface SearchableItem {
  id: string;
  type: 'task' | 'project' | 'initiative' | 'action';
  label: string;
  searchFields: string[];
}

interface ScoredItem<T extends SearchableItem> {
  item: T;
  score: number;
}

/**
 * Fuzzy-match a query against a list of searchable items.
 * Splits query into words and checks each word appears in at least one searchable field.
 * Scores: prefix match (3) > early substring (2) > late substring (1).
 * Empty query returns all items (score 0).
 */
export function fuzzyMatch<T extends SearchableItem>(items: T[], query: string): ScoredItem<T>[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return items.map((item) => ({ item, score: 0 }));
  }

  const words = trimmed.split(/\s+/);
  const results: ScoredItem<T>[] = [];

  for (const item of items) {
    const fields = item.searchFields.map((f) => f.toLowerCase());
    let totalScore = 0;
    let allMatch = true;

    for (const word of words) {
      let bestWordScore = 0;
      for (const field of fields) {
        const index = field.indexOf(word);
        if (index === -1) continue;
        if (index === 0) {
          bestWordScore = Math.max(bestWordScore, 3);
        } else if (index <= 5) {
          bestWordScore = Math.max(bestWordScore, 2);
        } else {
          bestWordScore = Math.max(bestWordScore, 1);
        }
      }
      if (bestWordScore === 0) {
        allMatch = false;
        break;
      }
      totalScore += bestWordScore;
    }

    if (allMatch) {
      results.push({ item, score: totalScore });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
