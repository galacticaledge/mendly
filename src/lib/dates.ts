/**
 * Date helpers.
 *
 * These live outside the components that use them because they read the clock,
 * and a component's render should be a pure function of its props.
 */

const DAY_MS = 864e5;

/** Whole weeks between a date and now. Used for "n weeks since diagnosis". */
export function weeksSince(date: Date | string): number {
  return Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / (7 * DAY_MS)));
}

/** "2 days ago". Precision finer than a day is not useful on a caseload. */
export function relativeDay(date: Date | string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}
