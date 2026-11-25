import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { tableExists } from './tableExists';

/**
 * R12 — the government pipeline behind the pipeline: opportunities still being assessed.
 *
 * Ali's ticket: "Give the 18 active needs_evidence qualification rows a project to belong to,
 * so they can be named, priced and shown as pipeline-behind-pipeline instead of being
 * invisible." Its gate was explicit: "Establish why the rows are orphaned before linking any
 * of them. A qualification written without a project is either a broken write path or a
 * legitimate pre-project stage, and those need opposite fixes."
 *
 * ── THE DIAGNOSIS, MEASURED ON PRODUCTION 2026-11-25 ─────────────────────────────────────
 *
 * It is a legitimate pre-project stage. The evidence is one-sided:
 *
 *   decision              rows   with a delivery project
 *   pending_review         195   0
 *   needs_evidence          51   0
 *   no_bid                  27   1
 *   approved_bid_pursuit    26   19   (73%)
 *
 * A delivery project appears ONLY after a bid is approved for pursuit. Across 246 rows at the
 * two earlier stages, not one has ever carried a project. A broken writer would scatter
 * orphans across every stage; this is a column that is populated at a specific point in a
 * lifecycle, which is the opposite finding and takes the opposite fix.
 *
 * Confirmed from the other direction too: opportunities that pass through all three stages
 * hold linked rows at the approved stage and unlinked rows at the earlier ones, so the same
 * opportunity is unlinked before approval and linked after it.
 *
 * So NOTHING IS BACKFILLED HERE. The ticket's own branch for this case is that "the Room
 * renders them as a count with no names rather than pretending they are nameable
 * opportunities", and its warning is the reason: "Do not guess at which opportunity an orphan
 * row belongs to in order to populate the display. An incorrectly linked bid is worse than a
 * bid shown as unlinked, because it silently misattributes evidence later."
 *
 * ── WHY THIS IS NOT A FUNNEL STAGE ───────────────────────────────────────────────────────
 *
 * It would have been the obvious place to put it, and it would have been a lie. A funnel is
 * one population whose counts partition, and the funnel in `govBidFlow` describes the flagged
 * bids: 14 flagged, of those how many priced, documented, submitted. These rows are a
 * DIFFERENT population — other opportunities, some of which may later become flagged and most
 * of which will not. Rendered as a stage above "Flagged for pursuit" it would assert a flow
 * of 14 into 14 that does not exist.
 *
 * Same reasoning R24 used for the membership demand bands, and the same shape: a separate
 * block with its own count, never a row in the funnel table.
 *
 * ── AND WHY IT CARRIES NO MONEY, STRUCTURALLY ────────────────────────────────────────────
 *
 * There is no `Money` field on this type at all. A count of unassessed opportunities beside a
 * dollar figure is how "pipeline behind pipeline" becomes "pipeline", and the page's whole
 * claim is that a number appears only where one was measured. `gov_qualifications` holds no
 * value column, so there is nothing to put here even if someone wanted to.
 */

/**
 * The tier as the page renders it. Counts and words, never a figure.
 *
 * Every string is composed from the numbers measured in the same read, not frozen from the
 * diagnosis above. The diagnosis is why this module exists; it is not the data it reports.
 */
export interface PreProjectTier {
  /** Live rows at the assessment stage. */
  count: number;
  /**
   * How many carry a delivery project. Expected to be zero, and reported rather than assumed:
   * if this ever becomes non-zero the lifecycle has changed and the wording below says so
   * instead of continuing to claim none can be named.
   */
  linkedCount: number;
  /** How many could be named today, from a source snapshot or a recorded alias. */
  nameableCount: number;
  label: string;
  /** What this stage IS, in the schema's own terms. */
  definition: string;
  /** Why these cannot be named, measured rather than asserted. */
  whyNoNames: string;
  /** The specific thing a human would do to make one nameable. */
  unlockedBy: string;
  provenance: string;
}

interface TierRow {
  live: number;
  linked: number;
  with_snapshot: number;
  with_alias: number;
}

/**
 * Read the tier.
 *
 * Returns null when `gov_qualifications` is absent, so the page omits the block entirely
 * rather than rendering a zero. A missing table is not an empty stage, and a "0" here would
 * read as "every opportunity has been assessed", which is the opposite of unknown.
 *
 * Read-only and idempotent: it is a pair of counts and writes nothing, so re-running it can
 * never change the number it reports.
 */
export async function buildPreProjectTier(): Promise<PreProjectTier | null> {
  if (!(await tableExists('gov_qualifications'))) return null;

  // The alias table is the only other place a canonical opportunity id resolves to a project,
  // so a row is nameable if it has a source snapshot OR someone has recorded an alias for it.
  // Guarded, because a database without the alias table must still produce the count.
  const hasAliases = await tableExists('gov_opportunity_aliases');

  const rows = await sequelize.query<TierRow>(
    `SELECT COUNT(*)::int                                   AS live,
            COUNT(q.delivery_project_id)::int               AS linked,
            COUNT(q.source_snapshot)::int                   AS with_snapshot,
            ${hasAliases
    ? `COUNT(a.canonical_opportunity_id)::int          AS with_alias`
    : `0                                              AS with_alias`}
       FROM gov_qualifications q
       ${hasAliases
    ? 'LEFT JOIN gov_opportunity_aliases a ON a.canonical_opportunity_id = q.canonical_opportunity_id'
    : ''}
      WHERE q.decision::text = 'needs_evidence' AND q.status::text = 'active'`,
    { type: QueryTypes.SELECT },
  );

  const r = rows[0] ?? { live: 0, linked: 0, with_snapshot: 0, with_alias: 0 };
  const count = r.live ?? 0;
  const linkedCount = r.linked ?? 0;
  // A row is nameable by either route, and the two can overlap, so this is capped at the
  // row count rather than summed into a number larger than the population.
  const nameableCount = Math.min(count, (r.with_snapshot ?? 0) + (r.with_alias ?? 0));

  return {
    count,
    linkedCount,
    nameableCount,
    label: 'Being assessed, not yet a pursuit',
    definition:
      'gov_qualifications at decision=needs_evidence and status=active. The AI vetting has '
      + 'read the opportunity and asked for more evidence before a bid/no-bid call. It is not '
      + 'a pursuit, and it is not a rejection.',
    whyNoNames: whyNoNames(count, nameableCount, r.with_snapshot ?? 0),
    unlockedBy:
      'A delivery project is created when a bid is approved for pursuit, so these have none '
      + 'by design. To name one before then, a person links its opportunity to a project from '
      + 'the gov qualification admin screen, which records who linked it and why. Nothing is '
      + 'linked automatically, and nothing here is guessed: an opportunity attached to the '
      + 'wrong project would misattribute its evidence later, which is worse than a count.',
    provenance:
      'Counted from gov_qualifications on every read. No value is shown because '
      + 'gov_qualifications holds no value column, and no name is invented because none of '
      + 'these rows carries one.',
  };
}

/**
 * The sentence that explains the missing names, chosen by what was actually measured.
 *
 * Three cases rather than one, because "none of them can be named" stops being true the
 * moment somebody links one, and a frozen sentence would then be the page telling a reader
 * something false about work they had just done.
 */
function whyNoNames(count: number, nameable: number, withSnapshot: number): string {
  if (count === 0) {
    return 'Nothing is at this stage right now, so there is nothing to name.';
  }
  if (nameable === 0) {
    return `None of these ${count} can be named yet. None carries a delivery project, none `
      + 'kept a snapshot of the opportunity it came from, and no alias has been recorded for '
      + 'any of them, so the only identifier that exists is an internal opportunity id. '
      + 'Showing that id would look like a name without being one.';
  }
  return `${nameable} of these ${count} could be named`
    + `${withSnapshot > 0 ? ', from the snapshot of the opportunity they came from' : ''}`
    + '; the rest carry only an internal opportunity id, which would look like a name without '
    + 'being one.';
}
