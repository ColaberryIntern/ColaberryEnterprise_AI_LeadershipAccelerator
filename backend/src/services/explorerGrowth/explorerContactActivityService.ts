import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { ContactActivityRowInput } from '../../schemas/explorerContactActivitySchema';

/**
 * The writer `explorer_journey_profiles.last_contacted_at` never had.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `reachOutCandidate` (explorerOutreachRanking.ts) drops anyone contacted in the last seven
 * days. It reads `GREATEST(p.last_contacted_at, staff activity, Ali's personal outreach)`.
 * Measured on production 2026-11-17: `last_contacted_at` was set on 0 of 1080 profiles, staff
 * call/meeting/note rows in 30 days numbered 0, and 2 of the 192 in that night's pool carried
 * any contact timestamp at all. So the suppression had no working input.
 *
 * That was harmless while nothing acted on the queue. It stopped being harmless the moment Cora
 * began tagging contacts in GoHighLevel from the feed: Rose calls someone, logs it in GHL, our
 * side never learns, they stay in the pool, and the next night they are tagged again. The list
 * would never drain and the same ~119 people would be re-tagged forever.
 *
 * Kes Delele owns the GHL side and agreed (2026-11-17) to push the outcomes back. This is the
 * half that receives them.
 *
 * ── THE TWO COLUMNS NAMED `last_contacted_at` ───────────────────────────────
 *
 * This is the trap, and it is worth the paragraph.
 *
 *   explorer_journey_profiles.last_contacted_at   learner-side. THE SUPPRESSION READS THIS ONE.
 *   leads.last_contacted_at                       CRM-side. The queue does not read it at all.
 *
 * The model comment on the first one has said "Distinct from leads.last_contacted_at" since it
 * was created, and the incoming key is `ghl_contact_id`, which lives on `leads`. So the obvious
 * place to put the data is the column that does nothing. On production the CRM-side column is
 * set on 99 of 25,568 leads, most recently 22 June 2026, and on zero rows of the current pool -
 * writing there would have succeeded, reported success, and changed not one row of the queue.
 *
 * This service writes the learner-side column and only ever that one.
 *
 * ── FORWARD-ONLY, WHICH IS WHAT MAKES IT IDEMPOTENT ─────────────────────────
 *
 * A timestamp is written only when it is strictly newer than what is stored. There is no
 * sequence number, no dedupe table and no request id, and none is needed: replaying yesterday's
 * push writes nothing, pushing the same file twice writes nothing the second time, and a file
 * that arrives out of order cannot drag somebody's `last_contacted_at` backwards and return
 * them to the pool early. Monotonicity is the idempotency key.
 *
 * It also means a caller cannot UNDO a suppression through this route, deliberately or by
 * accident. Clearing a timestamp is not something an external system should be able to do, and
 * here it is not expressible rather than merely disallowed.
 */

/**
 * The outcome of one push, in the shape the route returns to the caller.
 *
 * ── EVERY NUMBER DECLARES ITS UNIT, BECAUSE TWO UNITS ARE IN PLAY ───────────
 *
 * A `ghl_contact_id` and an Explorer profile are not the same thing and the mapping is not
 * one to one: production carries one contact id attached to two different leads, so a single
 * row the caller sent can legitimately move two profiles. An earlier draft of this interface
 * computed `unchanged` as `matched - written` across those two units, which would have gone
 * negative on exactly that row and been clamped to a plausible-looking zero.
 *
 * So the caller's side of the boundary is counted in CONTACT IDS, which is what it sent and
 * what it can act on, and our side is counted in PROFILES, which is what actually moved.
 */
export interface ContactActivityResult {
  /** Rows in the request after schema validation. */
  received: number;
  /** CONTACT IDS that reached at least one Explorer profile. */
  matched: number;
  /** CONTACT IDS that reached no Explorer profile. Expected, and not an error. */
  unmatched: number;
  /** PROFILES whose `last_contacted_at` actually moved forward. */
  written: number;
  /** PROFILES reached, but already holding a same-or-newer timestamp. A replay is all of these. */
  unchanged: number;
  /** Rows refused because the timestamp was in the future. Never written. */
  rejected_future: number;
  /**
   * The ids that matched nothing, so the caller can see its own misses without another query.
   *
   * Capped, because the whole batch can legitimately miss and a 2000-element array in a response
   * body helps nobody. `unmatched` is always the true count; this list is a sample when it is
   * shorter than that.
   */
  unmatched_ghl_contact_ids: string[];
}

/** How many unmatched ids come back in the response. A sample, not the count - see above. */
export const UNMATCHED_SAMPLE_LIMIT = 100;

/**
 * How far ahead of `now` a timestamp may be before it is refused.
 *
 * Not zero. Two machines' clocks disagree by seconds, and a call logged at the moment the push
 * is built would be rejected by a strict comparison for no real reason. Five minutes absorbs
 * ordinary skew while still refusing a timestamp that is wrong by hours or by a year, which is
 * the failure that matters: a far-future value would suppress that person permanently, because
 * `last_contacted_at < NOW() - 7 days` can never become true again.
 */
export const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

interface UnmatchedRow {
  ghl_contact_id: string;
}

interface MatchedRow {
  ghl_contact_id: string;
}

interface ReachedRow {
  enrollment_id: string;
}

interface WrittenRow {
  enrollment_id: string;
}

/**
 * Both statements read their input from ONE json parameter rather than a bound array.
 *
 * Sequelize's array replacement expands to a Postgres array literal, and that has already taken
 * production down once in this repo when combined with `= ANY(:ids)`: the literal came out
 * malformed and the backend crash-looped. `jsonb_to_recordset` over a single string parameter
 * side-steps the whole mechanism, does the timestamp parsing in Postgres where the type is
 * `timestamptz`, and keeps the statement a fixed shape no matter how many rows arrive.
 */
const INCOMING_CTE = `
  WITH incoming AS (
    SELECT x.ghl_contact_id, x.ts
      FROM jsonb_to_recordset(CAST(:payload AS jsonb))
        AS x(ghl_contact_id text, ts timestamptz)
  )
`;

/**
 * Load a batch of connected-call timestamps.
 *
 * `now` is injected so the future-timestamp rule is testable without freezing the clock.
 */
export async function recordContactActivity(
  rows: ContactActivityRowInput[],
  now: Date = new Date(),
): Promise<ContactActivityResult> {
  const received = rows.length;
  const horizon = now.getTime() + FUTURE_SKEW_TOLERANCE_MS;

  // Future rows are dropped BEFORE the database sees them, so a bad clock upstream cannot write
  // a value that would suppress somebody forever. They are counted and reported, never silently
  // discarded: a caller whose timestamps are all being refused needs to be told, loudly.
  const usable = rows.filter((r) => new Date(r.last_connected_call_at).getTime() <= horizon);
  const rejected_future = received - usable.length;

  if (usable.length === 0) {
    return {
      received,
      matched: 0,
      unmatched: 0,
      written: 0,
      unchanged: 0,
      rejected_future,
      unmatched_ghl_contact_ids: [],
    };
  }

  const payload = JSON.stringify(usable.map((r) => ({ ghl_contact_id: r.ghl_contact_id, ts: r.last_connected_call_at })));

  // Which ids reach a profile at all. Distinct, because a caller may legitimately send the same
  // contact twice in one file and that is one id either way.
  const matchedRows = await sequelize.query<MatchedRow>(
    `${INCOMING_CTE}
     SELECT DISTINCT i.ghl_contact_id
       FROM incoming i
       JOIN leads l ON l.ghl_contact_id = i.ghl_contact_id
       JOIN explorer_journey_profiles p ON p.lead_id = l.id`,
    { type: QueryTypes.SELECT, replacements: { payload } },
  );

  const unmatchedRows = await sequelize.query<UnmatchedRow>(
    `${INCOMING_CTE}
     SELECT DISTINCT i.ghl_contact_id
       FROM incoming i
      WHERE NOT EXISTS (
        SELECT 1 FROM leads l
          JOIN explorer_journey_profiles p ON p.lead_id = l.id
         WHERE l.ghl_contact_id = i.ghl_contact_id)`,
    { type: QueryTypes.SELECT, replacements: { payload } },
  );

  /**
   * The same join as the UPDATE, counted in PROFILES rather than contact ids.
   *
   * Taken before the write, though it would give the same answer after: which profiles the batch
   * reaches is decided by the join, not by the stored timestamp. It exists so `written` and
   * `unchanged` can be two parts of one whole. Deriving `unchanged` from the contact-id count
   * instead would mix units and go negative on the one production contact id that is attached
   * to two leads.
   */
  const reached = await sequelize.query<ReachedRow>(
    `${INCOMING_CTE}
     SELECT DISTINCT p.enrollment_id
       FROM incoming i
       JOIN leads l ON l.ghl_contact_id = i.ghl_contact_id
       JOIN explorer_journey_profiles p ON p.lead_id = l.id`,
    { type: QueryTypes.SELECT, replacements: { payload } },
  );

  /**
   * `MAX(i.ts) GROUP BY p.enrollment_id` collapses three real collisions into one write each:
   *
   *  - the same contact appearing twice in one file, which takes the later call;
   *  - one `ghl_contact_id` attached to two different leads, which exists on production today
   *    (8254 ids, 8253 distinct, so exactly one is shared) and would otherwise be two conflicting
   *    updates to the same row inside one statement;
   *  - two leads pointing at one profile, which the data does not currently contain but which
   *    nothing in the schema forbids.
   *
   * Taking the maximum is the only choice consistent with forward-only: whichever row wins, the
   * stored value ends up at the newest contact time in the batch.
   */
  const written = await sequelize.query<WrittenRow>(
    `${INCOMING_CTE},
     targets AS (
       SELECT p.enrollment_id, MAX(i.ts) AS ts
         FROM incoming i
         JOIN leads l ON l.ghl_contact_id = i.ghl_contact_id
         JOIN explorer_journey_profiles p ON p.lead_id = l.id
        GROUP BY p.enrollment_id
     )
     UPDATE explorer_journey_profiles p
        SET last_contacted_at = t.ts, updated_at = NOW()
       FROM targets t
      WHERE p.enrollment_id = t.enrollment_id
        AND (p.last_contacted_at IS NULL OR p.last_contacted_at < t.ts)
     RETURNING p.enrollment_id`,
    { type: QueryTypes.SELECT, replacements: { payload } },
  );

  return {
    received,
    matched: matchedRows.length,
    unmatched: unmatchedRows.length,
    written: written.length,
    /**
     * Profiles the batch reached that did not move, counted in the SAME unit as `written` so the
     * two always sum to the profiles reached. On a replay this is every reached profile and
     * `written` is 0, which is precisely how a duplicate push is told apart from a quiet day:
     * a quiet day has nothing to replay and shows `received: 0` upstream, while a replay shows
     * a full `received` with `written: 0`.
     */
    unchanged: reached.length - written.length,
    rejected_future,
    unmatched_ghl_contact_ids: unmatchedRows.slice(0, UNMATCHED_SAMPLE_LIMIT).map((r) => r.ghl_contact_id),
  };
}
