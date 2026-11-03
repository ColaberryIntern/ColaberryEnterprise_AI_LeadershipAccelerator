/**
 * ADS-3's facts, in one place, so the one-page visual and the verification document cannot
 * disagree.
 *
 * Every number here was read from `accelerator_prod` on 2026-11-03 in session CC-20261102-k9r4,
 * by read-only scripts run inside the running backend container, AFTER the change was deployed.
 * That ordering is the point: the earlier ADS-5 measurement was taken before the deploy and two of
 * its numbers were already stale by the time this ticket shipped. Those two are listed under
 * SUPERSEDES rather than quietly replaced.
 *
 * Where the method cannot answer a question it is listed under NOT_ESTABLISHED. The largest entry
 * there is the honest one: the backfill has never been observed firing in production, because the
 * condition that fires it stopped being common on the morning this shipped.
 */

const TICKET = 'ADS-3';
const TICKET_ID = 10467338843;
const TICKET_URL = `https://app.basecamp.com/3945211/buckets/7463955/todos/${TICKET_ID}`;
const LIST_URL = 'https://app.basecamp.com/3945211/buckets/7463955/todolists/10467338643';

const SESSION = 'CC-20261102-k9r4';
const MEASURED_ON = '2026-11-03';
const DB = 'accelerator_prod';
const WINDOW_DAYS = 30;

/** The two pull requests, and the deploy that carried them. */
const SHIPPED = {
  prOne: 3622,
  prOneUrl: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3622',
  prOneMerged: '2026-11-03T14:15:47Z',
  prOneCommit: '92d103b2',
  prTwo: 3629,
  prTwoUrl: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3629',
  prTwoMerged: '2026-11-03T19:56:43Z',
  prTwoCommit: '2baa9d46',
  deployedTip: 'e8756aa8',
  deployedAt: '2026-11-03T18:35:20Z',
  deployedBy: 'another session, as part of main’s tip',
  checksPassing: 10,
};

const CAMPAIGN_ID = '52708443249234';

/**
 * The read-path fix, measured by calling the DEPLOYED `knownCampaigns(LANDING_SOURCES)` against
 * production beside the raw SQL grouping it replaces. This is the only part of ADS-3 that could be
 * proven by observation rather than by population, and it is the reason the ticket closes.
 *
 * `fb|paid` and `ig|paid` matched no entry in PLACEMENT_FOR_SOURCE, so their spend rendered blank
 * beside visible signups; and both piped rows carried the SAME campaign id as their bare
 * counterpart, which is what split the signups in the box the cost is typed into.
 */
const SOURCE_SPLIT = {
  before: [
    { source: 'fb', signups: 297, placement: 'facebook' },
    { source: 'ig', signups: 114, placement: 'instagram' },
    { source: 'fb|paid', signups: 3, placement: null },
    { source: 'ig|paid', signups: 4, placement: null },
  ],
  after: [
    { source: 'fb', signups: 300, placement: 'facebook' },
    { source: 'ig', signups: 118, placement: 'instagram' },
  ],
  shapesInProduction: ['fb', 'ig', 'fb|paid', 'ig|paid'],
  canonicalIdempotent: true,
};

/** The `leads` table as it actually stands. The fifth column everyone assumes is not there. */
const LEAD_COLUMNS = {
  present: ['utm_source', 'utm_campaign', 'utm_content', 'utm_term'],
  absent: ['utm_medium'],
  sessionsAlsoHave: 'utm_medium',
};

/** Lead-level counts across the whole table, not a window. */
const LEADS = {
  total: 25292,
  withSource: 1166,
  withCampaign: 828,
  withContent: 7,
  withTerm: 7,
  firstWithContent: '2026-11-03T05:50:27Z',
  newestWithContent: '2026-11-03T17:21:17Z',
  pipedRows: 8,
  firstPipedRow: '2026-03-20',
};

/** Sessions, for contrast. Zero piped sources is what proves the piped leads came from the payload. */
const SESSIONS = {
  pipedRows: 0,
  sinceDeploy: 1,
  taggedSinceDeploy: 0,
  newest: '2026-11-03T18:39:30Z',
};

/**
 * What the write-path fix is worth, stated as the population it applies to rather than as an
 * observed firing. Both numbers are measured; neither is a count of the fix running.
 */
const BACKFILL_VALUE = {
  leadsMissingContentTheirSessionHad: 388,
  visitorsWithTaggedClickBehindUntaggedNewest: 17,
  visitorsWithUntaggedNewestAndMultipleSessions: 512,
  lookbackSessions: 20,
  windowDays: 30,
};

/** The four things the ticket named, and where each one actually landed. */
const ITEMS = [
  {
    verdict: 'ok',
    item: 'utm_source arrives in two shapes and splits the spend report',
    short: 'Fixed on read and proven on live rows: four groups became two, signups summing exactly.',
    outcome: 'Fixed on read, deployed, and proven on live production rows: one campaign went from '
      + 'four groups to two, the signups summing exactly, and both groups resolving a placement. '
      + 'This is the half that can be demonstrated rather than argued.',
  },
  {
    verdict: 'watch',
    item: 'the identify backfill copies only some of the UTM columns',
    short: 'Fixed. Two columns to four, not three to five: leads has no utm_medium. Not observed '
      + 'firing.',
    outcome: 'Fixed and deployed. The honest size of the gain is two columns to four, not three to '
      + 'five: leads has no utm_medium, so the old code’s third field had always been landing '
      + 'nowhere. Never observed firing in production - see what this does not establish.',
  },
  {
    verdict: 'watch',
    item: 'the backfill trusts only the NEWEST session, which is routinely untagged',
    short: 'Fixed, bounded to 20 sessions and 30 days so it cannot become first-touch. 17 visitors '
      + 'matched the losing case.',
    outcome: 'Fixed and deployed: it now takes the newest session that carries a campaign, bounded '
      + 'to 20 sessions and a 30-day window, because reaching back without a bound converts '
      + 'last-touch attribution into first-touch. 17 visitors in 30 days match the losing case.',
  },
  {
    verdict: 'ok',
    item: 'the race: the lead row is created with NULL tags and patched milliseconds later',
    short: 'Closed by the signup sending its own tags: piped sources on leads, none on sessions.',
    outcome: 'Closed, but not by this ticket. The signup now sends its own tags, which the data '
      + 'proves independently of the commit graph: leads carry a piped utm_source while sessions '
      + 'carry zero, so that value can only have arrived in the payload.',
  },
];

/** Numbers in ADS-5's filed artifact that this measurement supersedes. Same day, hours apart. */
const SUPERSEDES = [
  {
    was: '0 of 450 leads carry utm_content',
    now: `${7} leads carry utm_content, the earliest at 05:50Z on ${MEASURED_ON}`,
    why: 'ADS-5 was measured before the signup payload started carrying the tag. The leads it '
      + 'counted were real; the claim stopped being true during the same day.',
  },
  {
    was: '0 leads carry a piped utm_source, so the split has not begun',
    now: '8 leads carry a piped shape, one from March 20 and seven from this day',
    why: 'This is the load-bearing correction. The split was already live in production, so '
      + 'normalizing utm_source was repairing a current defect rather than getting ahead of a '
      + 'future one.',
  },
];

/** Verification, each line an artifact someone else can re-run. */
const VERIFICATION = [
  ['Deployed code present in the running container',
    'utm_backfill_failed found in dist/controllers/trackingController.js; both new modules built '
    + '18:31; containers showed a genuine recreate rather than a no-op.'],
  ['Read path proven on live rows',
    'The deployed knownCampaigns(LANDING_SOURCES) called read-only against production beside the '
    + 'raw grouping: four rows became two, 297+3 and 114+4 summing exactly.'],
  ['Unit tests',
    '71 passed, 0 failed across the two suites covering the change (utmBackfill 19, adSpend 52).'],
  ['Types',
    'Targeted tsc --noEmit --strict with no --allowJs over both modules, both test files and '
    + 'trackingController.ts: exit 0 on TypeScript 5.9.3.'],
  ['CI',
    `${SHIPPED.checksPassing} of ${SHIPPED.checksPassing} checks pass on both pull requests, `
    + 'including the test-file typecheck ratchet.'],
  ['Schema',
    'The lead column list read directly from accelerator_prod and from the Lead model, which '
    + 'agree: four utm columns, no utm_medium.'],
];

/** Stated so nobody reads the above as more than it is. */
const NOT_ESTABLISHED = [
  'The backfill has NEVER been observed firing in production. It fires only for a lead whose '
    + 'payload is missing a tag its session has, and the signup now sends the tags itself, so that '
    + 'is no longer the common path. Between the deploy and the check, no leads and no identify '
    + 'traffic arrived at all, and the logs carry zero backfill lines of either kind.',
  'This ticket’s stated acceptance test cannot prove this ticket. "Query one real tagged '
    + 'click’s lead row" now passes WITHOUT the new code running, because the payload carries '
    + 'the tags and the backfill correctly does nothing. A passing row would measure the frontend, '
    + 'not the fix - which is why the two population figures stand in its place.',
  'The 7 leads carrying utm_content were not produced by this change. They arrived in the signup '
    + 'payload hours before the deploy. Creative-level attribution started working on its own.',
  'No history is repaired. The 388 leads missing a tag their session carried stay missing: this '
    + 'writes going forward only, and nothing reads utm_content at the lead yet.',
  'The 17-visitor figure counts VISITORS whose newest session is untagged while an older one is '
    + 'tagged, not leads that lost a tag. It is the population at risk, not a loss count.',
  'utm_medium is not recoverable at the lead at all, because the column does not exist. Anyone '
    + 'wanting a medium per lead has to add it first, via ensureLeadAttributionColumns.',
  'At the time of writing, the utm_medium correction is merged but NOT yet deployed, so the '
    + 'running build still carries the dead field in its list. It is harmless - Sequelize discards '
    + 'a key that is not a model attribute - and it ships with the next deploy of main.',
  'Nothing here is a profitability number. The spend ledger is still empty, so no cost per signup '
    + 'exists; that waits on ADS-4 (the Meta token) and ADS-6 (the daily sync).',
];

/**
 * The same two limits as the first entries of NOT_ESTABLISHED, compressed for the one-page visual.
 * Same facts, fewer words: the one-page limit is part of the deliverable, so the visual gets its
 * own wording rather than a raised page count.
 */
const NOT_ESTABLISHED_SHORT = [
  'The backfill has never been observed firing. No leads and no identify traffic arrived between '
    + 'the deploy and this check, and the logs carry zero backfill lines of either kind.',
  'This ticket’s stated acceptance test would pass whether or not the fix exists, because the '
    + 'payload now carries the tags - so the two measured populations stand in its place.',
];

/** Where the code landed, for whoever reads this next. */
const CODE = [
  ['services/marketing/adSpend/utmSource.ts',
    'One shape for utm_source, the placement map, and the group merge, in one module so they '
    + 'cannot disagree.'],
  ['services/marketing/utmBackfill.ts',
    'Which session to attribute to and which fields travel. Pure: rows in, a field map out.'],
  ['services/marketing/adSpend/profitability.ts',
    'Per-source breakdown grouped on the canonical source.'],
  ['services/marketing/adSpend/spendLedger.ts',
    'knownCampaigns merges the two shapes before the suggestion list is built.'],
  ['controllers/trackingController.ts',
    'The backfill call site, and a classified structured log in place of a silent catch.'],
];

module.exports = {
  TICKET, TICKET_ID, TICKET_URL, LIST_URL, SESSION, MEASURED_ON, DB, WINDOW_DAYS,
  SHIPPED, CAMPAIGN_ID, SOURCE_SPLIT, LEAD_COLUMNS, LEADS, SESSIONS, BACKFILL_VALUE,
  ITEMS, SUPERSEDES, VERIFICATION, NOT_ESTABLISHED, NOT_ESTABLISHED_SHORT, CODE,
};
