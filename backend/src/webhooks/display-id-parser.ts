const DISPLAY_ID_REGEX = /([A-Z][A-Z0-9]+(?:-[A-Z][A-Z0-9]+)*)-(\d+)/gi;

interface DisplayId {
  slug: string;
  number: number;
}

export function extractDisplayIds(text: string): DisplayId[] {
  const seen = new Set<string>();
  const results: DisplayId[] = [];

  for (const match of text.matchAll(DISPLAY_ID_REGEX)) {
    const slug = match[1].toUpperCase();
    const num = parseInt(match[2], 10);
    const key = `${slug}-${num}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ slug, number: num });
    }
  }

  return results;
}
