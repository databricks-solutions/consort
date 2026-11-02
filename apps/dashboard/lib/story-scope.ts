// Pure scoping helpers for the per-test table reader (`/api/story-tables`). Extracted from the route
// so they are unit-testable without its Next/fs/`@` imports.

/**
 * Scope a capture line (snapshot or interaction) to the viewed feature+story. Test ids repeat across
 * features (F1 and F2 may both have a `T40`), so:
 *  - A FULLY-UNSTAMPED line (an older corpus, before the capture stamped feature/story) is kept, scoped
 *    by test id alone — back-compat.
 *  - A STAMPED line must match the viewed feature; it matches the story ONLY when it carries one. A
 *    whole-feature capture (e.g. a deploy run) stamps the feature but no story, so it belongs to ANY
 *    story of that feature — requiring story equality there wrongly dropped those lines.
 */
export function inScope(e: { featureId?: string; storyId?: string }, feature: string, story: string): boolean {
  if (!e.featureId && !e.storyId) return true;
  if (e.featureId && e.featureId !== feature) return false;
  if (e.storyId && e.storyId !== story) return false;
  return true;
}

/**
 * Columns for a touched table the CURRENT feature's db-design does not declare (a prior feature's
 * table this story reads/writes — e.g. F2's adjust story touching F1's `stock_records`). Derive them
 * from the union of keys across the captured rows (snapshot + retrieved + stored), first-seen order,
 * so the table still renders its rows instead of being dropped.
 */
export function deriveColumns(...rowSets: Record<string, unknown>[][]): { name: string }[] {
  const seen: string[] = [];
  for (const rows of rowSets) for (const r of rows) for (const k of Object.keys(r)) if (!seen.includes(k)) seen.push(k);
  return seen.map((name) => ({ name }));
}
