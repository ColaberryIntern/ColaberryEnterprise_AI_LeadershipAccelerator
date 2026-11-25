/**
 * The one query that fetches every pending request's ladder.
 *
 * Separated from `capabilityLadder.ts` so the RULES stay pure and testable without a database:
 * which rungs exist, which a grant frees, what counts as credited. This file is the I/O, and it is
 * deliberately thin.
 *
 * ## One query for the page, not one per row
 *
 * The same discipline `withDetails` already follows. An approval queue holds at most a couple of
 * dozen rows, but a per-row query turns one screen into twenty-five round trips on a pool shared
 * with every other admin surface, and the cost shows up as somebody else's timeout.
 *
 * ## `LIKE ANY($1::text[])` carries an explicit cast on purpose
 *
 * A bare `ANY(:name)` through Sequelize's named replacements interpolates the array as a string
 * and the query fails at runtime. Positional binds with an explicit `::text[]` are the form that
 * works here, which is the same shape `sweepInternMail.js` uses for its address predicate.
 */
import { QueryTypes, Sequelize } from 'sequelize';
import { StoryRow, storyPrefixForCapability } from './capabilityLadder';

/**
 * Stories for every given capability, grouped by capability id.
 *
 * A capability whose id does not resolve to a prefix is skipped rather than queried for, so a
 * malformed id costs nothing and cannot widen the predicate. An empty input returns an empty map
 * without touching the database.
 */
export async function loadCapabilityStories(
  sequelize: Sequelize,
  capabilityIds: ReadonlyArray<string>,
): Promise<Map<string, StoryRow[]>> {
  const out = new Map<string, StoryRow[]>();

  const prefixes = new Map<string, string>();
  for (const id of new Set(capabilityIds.filter(Boolean))) {
    const prefix = storyPrefixForCapability(id);
    if (prefix) prefixes.set(id, prefix);
  }
  if (!prefixes.size) return out;

  const patterns = [...prefixes.values()].map((p) => `${p}.%`);
  const rows = await sequelize.query<{ story_id: string; verified_at: string | null }>(
    `SELECT story_id, verified_at::text AS verified_at
       FROM student_tasks
      WHERE story_id LIKE ANY($1::text[])`,
    { bind: [patterns], type: QueryTypes.SELECT },
  );

  for (const [capabilityId, prefix] of prefixes) {
    const mine = rows.filter((r) => String(r.story_id || '').startsWith(`${prefix}.`));
    if (mine.length) out.set(capabilityId, mine);
  }
  return out;
}
