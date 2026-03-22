/**
 * Compares before/after states and returns stringified changes.
 * All values are converted to strings for consistent GraphQL serialization.
 */
// eslint-disable-next-line no-restricted-syntax -- generic diff utility needs flexible typing
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];
  for (const field of fields) {
    if (field in after && before[field] !== after[field]) {
      changes.push({
        field: String(field),
        oldValue: before[field] != null ? String(before[field]) : null,
        newValue: after[field] != null ? String(after[field]) : null,
      });
    }
  }
  return changes;
}
