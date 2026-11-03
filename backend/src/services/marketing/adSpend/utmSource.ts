/**
 * ONE SHAPE FOR utm_source, APPLIED WHERE THE REPORT READS IT.
 *
 * Two writers populate `leads.utm_source` and they disagree about what belongs in it. The identify
 * backfill copies the visitor session's value as it stands, which is whatever Meta's URL
 * substitution put there: `fb` or `ig`. The signup form writes the `source|medium` convention
 * instead, so the same Facebook click arrives as `fb|paid`. Neither writer is wrong where it sits,
 * and the rows already stored cannot be rewritten, so the report settles it on read.
 *
 * WHAT SKIPPING THIS COSTS, exactly. `PLACEMENT_FOR_SOURCE` below is keyed on the bare source, so
 * `fb|paid` misses the map, its placement spend resolves to null, and its cost-per-signup renders
 * blank. And because the two shapes are different group keys, one campaign's Facebook signups
 * split across two lines. The card draws its per-source breakdown only when a row has more than
 * one source, so the day the piped shape starts arriving, campaigns that showed no breakdown at
 * all grow a two-line one listing Facebook twice — once labeled `fb|paid`, with no cost beside
 * it, because `sourceLabel` falls back to printing the raw code. It reads as missing data rather
 * than as a bug, which is the expensive part.
 *
 * ON READ, NOT ON WRITE, for three reasons: it fixes the rows that are already in the table, it
 * does not have to ship in step with the frontend that starts writing the piped shape, and it is
 * undone by deleting two call sites.
 *
 * Pure: rows in, rows out. No database, no clock.
 */
import { normaliseRef } from './spendAllocation';

/**
 * The source alone, trimmed and lower-cased: `fb|paid`, ` FB ` and `Fb` all become `fb`.
 *
 * Takes the segment BEFORE the pipe, because the convention is `source|medium`. A value that is
 * only a medium (`|paid`) therefore comes back empty — read as "no source", which is what it is,
 * rather than filed under a placement named after the medium.
 *
 * Returns '' for null, undefined and blank, which is how the report has always treated a missing
 * source, so an absent value and an unreadable one land in the same bucket instead of two.
 */
export function canonicalUtmSource(raw: string | null | undefined): string {
  return String(raw ?? '').split('|')[0].trim().toLowerCase();
}

/**
 * Which placement a source's spend was broken down under. Keys must already be canonical — the
 * test asserts it, so a new alias has to be added in canonical form rather than as another shape
 * the canonicalizer does not know about.
 */
export const PLACEMENT_FOR_SOURCE: Record<string, string> = {
  fb: 'facebook', facebook: 'facebook', ig: 'instagram', instagram: 'instagram',
};

/** A group of signups under one source and one campaign, with when the last of them arrived. */
export interface SourceCampaignGroup {
  utmSource: string | null;
  utmCampaign: string;
  signups: number;
  /** ISO-8601 UTC. */
  lastSignup: string;
}

/**
 * Collapse the groups that differ only in the shape of `utm_source`.
 *
 * `fb` and `fb|paid` on the same campaign are one group that the column's two writers split in
 * two. Left split, `AdSpendForm`'s datalist gets two options carrying the SAME campaign id as
 * their value, labeled `Facebook - 200 signups` and `fb|paid - 100 signups`: the campaign appears
 * twice, neither count is its real total, and the second label prints the raw code because
 * `sourceLabel` falls through for a shape it does not know. That is the form spend is typed into,
 * so it is the worst place for a campaign to look like two.
 *
 * Signups add, the last signup is the later of the two, and the surviving row carries the canonical
 * source — which `sourceLabel` already renders as "Facebook", so no frontend change is needed.
 *
 * The campaign half of the key uses `normaliseRef`, the same rule the report matches spend by, so a
 * campaign that is one row in the report cannot be two suggestions in the form.
 */
export function mergeSourceShapes<T extends SourceCampaignGroup>(rows: readonly T[], limit: number): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const source = canonicalUtmSource(row.utmSource);
    const key = `${source}\u0000${normaliseRef(row.utmCampaign)}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, utmSource: source || null });
      continue;
    }
    current.signups += row.signups;
    if (row.lastSignup > current.lastSignup) current.lastSignup = row.lastSignup;
  }
  // Every lastSignup is an ISO-8601 UTC string of the same length, so comparing them as strings
  // orders them as instants.
  return Array.from(merged.values())
    .sort((a, b) => (a.lastSignup === b.lastSignup ? 0 : a.lastSignup > b.lastSignup ? -1 : 1))
    .slice(0, limit);
}
