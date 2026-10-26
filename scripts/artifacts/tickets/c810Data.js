/**
 * C8.10 - Colaberry Live population instrumentation. The measurement, the verdicts, and
 * the two things that are not code problems.
 *
 * THE RULE THIS FILE ENFORCES, in the ticket's words: "Declaring it done against a schema
 * that exists but holds no rows. A table with the right shape and zero records reads as
 * capability and is not. Prove it with real data, not with a migration."
 *
 * That rule is why criterion 1 is NOT MET here despite the mechanism being finished. There
 * has not been one airing with a working instrument, so there is no measurement to show,
 * and a build that shipped the query and called the criterion met would be the exact
 * failure the ticket names. `assertNoCriterionIsMetOnMechanismAlone` makes that structural.
 */

const AS_OF = '26 October 2026';

/* ------------------------------------------------------------------ *
 * What was measured, against production, read-only
 * ------------------------------------------------------------------ */

const MEASURED = {
  asOf: AS_OF,
  // The entire history of Colaberry Live, from the Cloudflare account itself.
  liveInputs: [
    { name: 'colaberry-live-TEST-2026-10-13', created: '13 October 2026', kind: 'test' },
    {
      name: 'Colaberry Live - First Private Technical Airing',
      created: '14 October 2026',
      kind: 'private technical airing',
    },
  ],
  occurrenceRows: 2,
  seriesRows: 0,
  viewerPeopleRows: 0,
  viewerSessionRows: 0,
  rollupRows: 0,
  recordedVideos: 3,
  recordedContentMinutes: 78.6,
};

/**
 * The probe matrix for criterion 2, run against the production account.
 *
 * Recorded as a matrix rather than a sentence because the conclusion depends on the
 * CONTRAST between the rows: Stream works, analytics does not, and the legacy route is
 * gone. Any one row on its own would support the wrong conclusion.
 */
const CLOUDFLARE_PROBE = [
  {
    call: 'GET /accounts/{id}/stream/live_inputs',
    result: 'HTTP 200, 2 inputs',
    means: 'The token is valid and Stream-scoped. The credential is not the problem.',
  },
  {
    call: 'GET /accounts/{id}/stream (video list)',
    result: 'HTTP 200, 3 videos, 78.6 content minutes',
    means: 'Content duration is readable. This is what was RECORDED, not what was '
      + 'DELIVERED, and the criterion asks for the second.',
  },
  {
    call: 'POST /graphql viewer.accounts { __typename }',
    result: 'HTTP 200, account returned',
    means: 'The account is visible to this token through the analytics endpoint.',
  },
  {
    call: 'POST /graphql streamMinutesViewedAdaptiveGroups',
    result: 'HTTP 200 with "not authorized for that account"',
    means: 'THE BLOCK. The token can see the account but not its analytics dataset. '
      + 'An HTTP 200 carrying an authorization error is why a naive reader would have '
      + 'reported zero minutes.',
  },
  {
    call: 'GET /accounts/{id}/stream/analytics/views',
    result: 'HTTP 404',
    means: 'The legacy REST analytics route Cloudflare removed. There is no second path '
      + 'to the figure.',
  },
];

/* ------------------------------------------------------------------ *
 * The criteria
 * ------------------------------------------------------------------ */

/** MET or NOT MET. Mechanism alone never earns a MET; see the guard below. */
const CRITERIA = [
  {
    n: 1,
    name: 'The count of learners sharing Colaberry Live is measured, not estimated',
    verdict: 'NOT MET',
    blockedOn: 'an airing',
    evidence: 'The per-person row already existed: broadcast_viewer_people is keyed '
      + '(occurrence_id, enrollment_id), carries playing_seconds, and flags staff and '
      + 'test accounts for exclusion. What did not exist was any query across '
      + 'occurrences, so the figure could not be asked for. That query now exists. It '
      + 'has nothing to count: the table holds zero rows.',
    why: 'Colaberry Live has aired exactly twice, a test on 13 October and the first '
      + 'private technical airing on 14 October. Every telemetry beat written between '
      + '9 and 18 October failed, which commit 3fac2543 found and fixed on 18 October, '
      + 'four days after the last airing. So the empty table is fully explained and is '
      + 'NOT evidence that nobody watched. Nobody has aired since the fix.',
    toClose: 'One airing with the instrument running. The number appears without any '
      + 'further code.',
  },
  {
    n: 2,
    name: 'Cloudflare Stream delivered minutes are read from the account, not assumed',
    verdict: 'NOT MET',
    blockedOn: 'a token permission',
    evidence: 'The reader is written and tested against the GraphQL Analytics dataset '
      + 'streamMinutesViewedAdaptiveGroups. Probed against production, the token we hold '
      + 'returns HTTP 200 with "not authorized for that account" for that dataset while '
      + 'returning 200 for every Stream endpoint. The legacy REST analytics route answers '
      + '404. There is no other path to the figure.',
    why: 'The Cloudflare token is scoped to Stream but not to Account Analytics. This is '
      + 'a permission, not a code gap, and no amount of further building changes it.',
    toClose: 'Add the "Account Analytics: Read" permission to the existing Cloudflare '
      + 'token, or issue a second read-only token for it. Minting or rotating a '
      + 'production credential is outside what this work may do.',
  },
  {
    n: 3,
    name: 'The figure is reportable monthly, so the C2.3 break-even becomes falsifiable',
    verdict: 'MET',
    blockedOn: null,
    evidence: 'Any calendar month is reportable on demand at '
      + 'GET /api/admin/commercialization/live-population?year=&month=, computed from '
      + 'rows rather than entered by hand, with month boundaries in Central time so an '
      + 'evening class on the last day of a month lands in the month a human would put '
      + 'it in.',
    why: 'The report refuses to publish a number it did not measure. A month with no '
      + 'airing reads "did not air", a month the instrument slept through reads "unknown, '
      + 'not zero", and only a month with airings and a working instrument produces a '
      + 'count. Falsifiability arrives with the first instrumented airing.',
    toClose: null,
  },
];

/* ------------------------------------------------------------------ *
 * The 881 correction
 * ------------------------------------------------------------------ */

/**
 * The ticket's premise contains a provenance error, and it is worth correcting rather
 * than quietly working around.
 */
const EIGHT_EIGHT_ONE = {
  asStated: 'The 881-learner figure is unfalsifiable until this exists.',
  actually: 'Learners a self-paced license needs to cover its cost base',
  source: 'C1.5r, carried into C4.8 tagged CALCULATED',
  soWhat: 'It is a break-even REQUIREMENT, not a claim about how many people share '
    + 'Colaberry Live. Nobody has ever claimed 881 people watch anything. What was '
    + 'genuinely unfalsifiable is the other side of the comparison, the actual '
    + 'population, which could not be counted at all until now.',
};

/* ------------------------------------------------------------------ *
 * What was built
 * ------------------------------------------------------------------ */

const BUILT = [
  {
    what: 'The cross-occurrence population query',
    detail: 'Distinct learners, watch seconds and a deliberate/auto split for one '
      + 'calendar month. The only read the subsystem had was "who is watching this '
      + 'broadcast right now", inside a 45-second freshness window.',
  },
  {
    what: 'The rollup writer the schema has been waiting for',
    detail: 'unique_attendees, watch_seconds, deliberate_viewers, auto_viewers and '
      + 'rolled_up_at have existed on broadcast_occurrence_metrics since the telemetry '
      + 'schema shipped, written by nothing. They are now written when a broadcast ends, '
      + 'idempotently, and re-rolled if a late beat lands after the end.',
  },
  {
    what: 'The Cloudflare delivered-minutes reader',
    detail: 'Complete, tested, and returning a named reason rather than a number while '
      + 'the token lacks the scope. It starts returning real minutes the moment the '
      + 'permission is added.',
  },
  {
    what: 'The refusal to publish an unmeasured number',
    detail: 'An outage register records that the instrument was blind from 9 to '
      + '18 October, with the commit as evidence. A month overlapping it cannot report a '
      + 'count at all, and a failed cost read can never appear as zero cost.',
  },
];

/** No new tables. The duplicate-build risk this ticket warns about, avoided. */
const NOT_BUILT = [
  'A second viewer table. broadcast_viewer_people already is the per-person measurement.',
  'A second rollup table. broadcast_occurrence_metrics already had the exact columns.',
  'A monthly cron. The repo has no monthly schedule anywhere and the longest existing '
    + 'cadence is weekly, so a new cadence class to carry a figure that is currently '
    + 'unmeasurable was not worth the blast radius. The report is callable and a schedule '
    + 'can be hung off it unchanged.',
];

const RECOMMENDATION = {
  verdict: '1 of 3 met',
  because: 'Neither of the two open criteria is waiting on engineering. One needs a '
    + 'broadcast to air with the instrument running, and one needs a permission added to '
    + 'a Cloudflare token.',
  ask: 'Add "Account Analytics: Read" to the Cloudflare token, and air Colaberry Live '
    + 'once. The two numbers this ticket asks for appear on the next report with no '
    + 'further work.',
};

/* ------------------------------------------------------------------ *
 * Guards - the acceptance criteria as build gates
 * ------------------------------------------------------------------ */

/**
 * A criterion may not be MET because the code exists.
 *
 * This is the ticket's own warning turned into a build failure. Any criterion whose
 * verdict is MET must point at something that happened, not at something that was
 * written, so a MET is rejected if its evidence talks only about having built the thing.
 */
function assertNoCriterionIsMetOnMechanismAlone() {
  const mechanismWords = /\b(implemented|written|built|shipped|the code exists)\b/i;
  for (const c of CRITERIA) {
    if (c.verdict !== 'MET') continue;
    if (mechanismWords.test(c.evidence) && !/\bGET \/api\b|rows|computed from/i.test(c.evidence)) {
      throw new Error(`C8.10: criterion ${c.n} is MET on mechanism alone`);
    }
    if (c.blockedOn) {
      throw new Error(`C8.10: criterion ${c.n} is MET but still names a blocker`);
    }
  }
  return CRITERIA.filter((c) => c.verdict === 'MET').length;
}

/** Every verdict is MET or NOT MET, and every NOT MET says what would close it. */
function assertEveryVerdictIsBinaryAndActionable() {
  for (const c of CRITERIA) {
    if (c.verdict !== 'MET' && c.verdict !== 'NOT MET') {
      throw new Error(`C8.10: criterion ${c.n} has verdict "${c.verdict}"`);
    }
    if (c.verdict === 'NOT MET') {
      if (!c.blockedOn) throw new Error(`C8.10: criterion ${c.n} fails but names no blocker`);
      if (!c.toClose || c.toClose.length < 30) {
        throw new Error(`C8.10: criterion ${c.n} fails without saying what would close it`);
      }
    }
    if (!c.evidence || c.evidence.length < 80) {
      throw new Error(`C8.10: criterion ${c.n} has no usable evidence`);
    }
  }
  if (CRITERIA.length !== 3) {
    throw new Error(`C8.10: ${CRITERIA.length} criteria, expected the 3 the ticket lists`);
  }
  return CRITERIA.length;
}

/**
 * The zero must never be presented as an audience finding.
 *
 * The single most consequential sentence in this artifact is the one explaining that the
 * empty table is an instrument fact, not an audience fact. If an edit ever removed it,
 * the document would read as "we measured, and nobody watched", which is false.
 */
function assertTheZeroIsExplained() {
  const c1 = CRITERIA.find((c) => c.n === 1);
  if (!c1 || !/NOT evidence that nobody watched/i.test(c1.why)) {
    throw new Error('C8.10: the empty table is no longer explained as an instrument fact');
  }
  if (!/3fac2543/.test(c1.why)) {
    throw new Error('C8.10: the explanation no longer cites the commit that proves it');
  }
  if (MEASURED.viewerPeopleRows !== 0) {
    throw new Error('C8.10: viewer rows appeared; re-measure before shipping this document');
  }
}

/** The probe matrix must contain the contrast that makes its conclusion valid. */
function assertTheProbeShowsBothSides() {
  const works = CLOUDFLARE_PROBE.some((p) => /200, 2 inputs/.test(p.result));
  const blocked = CLOUDFLARE_PROBE.some((p) => /not authorized/i.test(p.result));
  if (!works || !blocked) {
    throw new Error('C8.10: the Cloudflare probe no longer shows a working call AND the '
      + 'blocked one, so it cannot establish that the block is scope rather than credential');
  }
  return CLOUDFLARE_PROBE.length;
}

module.exports = {
  AS_OF, MEASURED, CLOUDFLARE_PROBE, CRITERIA, EIGHT_EIGHT_ONE, BUILT, NOT_BUILT,
  RECOMMENDATION,
  assertNoCriterionIsMetOnMechanismAlone, assertEveryVerdictIsBinaryAndActionable,
  assertTheZeroIsExplained, assertTheProbeShowsBothSides,
};
