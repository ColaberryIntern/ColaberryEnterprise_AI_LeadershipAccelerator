/**
 * l46PlanData — L4.6 criterion 5: the query plan for the audience read.
 *
 * WHAT THE OCTOBER RUN COULD AND COULD NOT ESTABLISH. `scripts/explainBroadcastTelemetry.js`
 * ran against production on 2026-10-16 and reported `Index Scan using idx_bvs_active`. The
 * script is deliberately honest about its own limits: on a small table a sequential scan is the
 * CORRECT choice, so it reports that case rather than failing on it, and it asks in writing for
 * a re-run "after a real broadcast with a populated table". That re-run never happened — the
 * 2026-10-20 airing recorded zero telemetry rows, which is what L4.9 then fixed.
 *
 * SO THIS MEASURES THE DEFERRED QUESTION INSTEAD, in a throwaway Postgres: the same query,
 * against the same DDL, at three table sizes. That is strictly more than the criterion asks
 * for, and it is the only form in which the answer means anything — a plan is a function of
 * table statistics, so a plan without the row counts beside it cannot be interpreted.
 *
 * NEITHER THE QUERY NOR THE SCHEMA IS A COPY. The DDL is `BROADCAST_TELEMETRY_STATEMENTS`,
 * imported. The query is extracted from `broadcastTelemetryService.ts` at run time. A
 * hand-copied query would be a plan for a statement nobody runs, and would keep reporting
 * success after the real one drifted.
 *
 * THE SHAPE MATTERS AS MUCH AS THE SIZE. Rows are spread across many occurrences, because the
 * index leads with `occurrence_id`: a table holding one occurrence's rows would make a
 * sequential scan the right choice, and a benchmark that cannot fail is not a benchmark.
 */

const META = {
  criterion: 5,
  criterionText: 'the query plan for the active-selection read, recorded',
  script: 'scripts/explainBroadcastTelemetry.js',
  index: 'idx_bvs_active',
  indexDef: 'broadcast_viewer_sessions (occurrence_id, last_beat_at DESC, state, enrollment_id)',
  measuredOn: '2026-11-07',
  engine: 'postgres:16-alpine, throwaway container, ANALYZE run before each plan',
};

/** The three sizes, transcribed from the run. `rows` is after ANALYZE. */
const STAGES = [
  {
    label: 'EMPTY — what the production run on 2026-10-16 could see',
    sessions: 0,
    people: 0,
    usesIndex: false,
    seqScan: true,
    reading: 'Sequential scan on both tables. **This is the correct plan**, not a failure: with '
      + 'no rows there is nothing for an index to narrow. It is also exactly what the script '
      + 'warns about — which makes the empty-table plan evidence that the query is plannable '
      + 'and the index exists, and evidence of nothing else.',
  },
  {
    label: 'SMALL — one week of a modest program',
    sessions: 1600,
    people: 800,
    usesIndex: true,
    seqScan: false,
    reading: 'The planner switches to `idx_bvs_active`, with `(occurrence_id, last_beat_at)` as '
      + 'an **Index Cond** rather than a filter. This is the plan the index was built for, and '
      + '1,600 rows is where it starts being chosen.',
  },
  {
    label: 'REAL — a year of classes at scale',
    sessions: 60000,
    people: 30000,
    usesIndex: true,
    seqScan: false,
    reading: 'Unchanged at 37x the rows: same index, same index condition, same nested loop. '
      + 'The cost estimate barely moves, because the index condition is doing the work the '
      + 'freshness window was designed to let it do.',
  },
];

/**
 * The plan at the largest size.
 *
 * The parameter values are shown as `$1`-`$3`. The run itself printed the uuid and the two
 * timestamps folded in, because Postgres chose a CUSTOM plan — which matters beyond
 * readability: the October production output printed `$1` and `$2` unfolded, i.e. a GENERIC
 * plan, and a generic plan cannot use the selectivity of the actual values. That is a second
 * candidate explanation for why its people-side choice differs from every size measured here.
 */
const PLAN = `GroupAggregate  (cost=17.04..17.06 rows=1 width=44)
  Group Key: p.intent, p.access_mode
  ->  Sort  (cost=17.04..17.04 rows=1 width=28)
        Sort Key: p.intent, p.access_mode, s.enrollment_id
        ->  Nested Loop  (cost=0.70..17.03 rows=1 width=28)
              ->  Index Scan using idx_bvs_active on broadcast_viewer_sessions s
                    Index Cond: ((occurrence_id = $1) AND (last_beat_at >= $2))
                    Filter: ((state = 'playing') OR ((state = 'buffering')
                              AND (last_playing_at IS NOT NULL) AND (last_playing_at >= $3)))
              ->  Index Scan using broadcast_viewer_people_pkey on broadcast_viewer_people p
                    Index Cond: ((occurrence_id = $1) AND (enrollment_id = s.enrollment_id))
                    Filter: ((NOT is_staff) AND (NOT is_test))`;

/**
 * Three things the plan says that the index comments do not, each verified rather than
 * reasoned about. None of them is a defect; all three are things a reader of this ticket would
 * otherwise have to guess.
 */
const OBSERVATIONS = [
  {
    heading: 'idx_bvp_reportable is not used by this query — and it is not dead either',
    body: 'Its DDL comment reads *"Reporting reads filter the excluded out, so the exclusion is '
      + 'part of the index."* The audience read does not use it at any of the three sizes: the '
      + 'nested loop already has both of the people table\'s primary-key columns, so the PK is '
      + 'cheaper and `is_staff`/`is_test` become a Filter on the fetched row.\n\nThe index does '
      + 'earn its place, on a different read. The rollup in `broadcastPopulationService.ts` '
      + 'selects from `broadcast_viewer_people` with no join to supply a key, and there the '
      + 'planner uses `idx_bvp_reportable` with all three columns as an Index Cond (Bitmap Index '
      + 'Scan, cost 5.00). Measured, not assumed — because "this index is unused" would have '
      + 'been the wrong conclusion from the audience plan alone.',
  },
  {
    heading: 'The state predicate is a Filter, not an index condition',
    body: '`state` is the index\'s third column, but the predicate is an OR across `state` and '
      + '`last_playing_at`, and an OR of that shape cannot become an index condition. So the '
      + 'index narrows on `(occurrence_id, last_beat_at)` and the buffering-grace rule is '
      + 'applied to the rows that come back. That is the right division of labor — the window '
      + 'is what makes the set small — but it means the trailing index columns are not doing '
      + 'predicate work.',
  },
  {
    heading: 'It is an Index Scan, not an Index Only Scan, so the heap is still read',
    body: 'The index comment says `enrollment_id` is included *"so the DISTINCT can be answered '
      + 'from the index without touching the heap"*. That benefit is not realized for this '
      + 'query: `last_playing_at` appears in the predicate and is not in the index, so every '
      + 'candidate row must be fetched from the heap anyway. Adding `last_playing_at` to the '
      + 'index would make an index-only scan possible — and is **not** proposed here, because '
      + 'at this cost there is nothing to fix and a wider index is a write cost on the hottest '
      + 'table in the system.',
  },
];

/**
 * The production run, and why it is cited rather than repeated. Recorded because the honest
 * answer to "what does production do" is not the same as the answer to "does the index work".
 */
const PRODUCTION = {
  ranOn: '2026-10-16',
  reported: 'Index Scan using idx_bvs_active, plus Index Scan using idx_bvp_reportable',
  problem: 'The row counts that run printed were not carried into the session log entry, and a '
    + 'plan cannot be read without them. Its people-side choice also differs from all three '
    + 'sizes measured here, where the primary key is chosen instead.\n\nThere are two candidate '
    + 'explanations and this record does not pick between them. The row counts are one. The '
    + 'other is visible in the output itself: production printed `$1` and `$2` **unfolded**, '
    + 'which is a generic plan, where every run here produced a custom plan with the values '
    + 'folded in — and a generic plan cannot use the selectivity of the actual parameters. '
    + 'Either would account for it; only a re-run that prints the row counts can say which.',
  notRepeated: 'A re-run would need `scripts/explainBroadcastTelemetry.js` copied onto the host: '
    + 'the repo-root `scripts/` directory is not copied into the backend image (checked in '
    + '`backend/Dockerfile`), which is why the script\'s own usage line says to put it in /tmp. '
    + 'That is a write to production infrastructure, so it is not taken unilaterally here.',
  owed: 'One command, for whoever next has production access: copy the script into the backend '
    + 'container and run it. It answers two things at once — the current plan, and the row '
    + 'counts, which say whether telemetry has collected anything at all since L4.9 wired the '
    + 'caller on 2026-10-20.',
};

module.exports = { META, STAGES, PLAN, OBSERVATIONS, PRODUCTION };
