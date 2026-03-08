/**
 * Formats a date string for display in task/project tables.
 *
 * - Within current year: "Mar 1", "Feb 27"
 * - Older: "Jan 15, 2024"
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const currentYear = now.getFullYear();
  const dateYear = date.getFullYear();

  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();

  if (dateYear === currentYear) {
    return `${month} ${day}`;
  }

  return `${month} ${day}, ${dateYear}`;
}
