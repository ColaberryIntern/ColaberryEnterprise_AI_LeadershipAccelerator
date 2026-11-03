/**
 * ADS-1's facts, in one place, so the one-page visual and the spec document cannot disagree.
 *
 * Every number here was measured in session CC-20261102-k9r4 and is reproducible from the
 * session log at docs/sessions/SESSION_CC-20261102-k9r4.md. Nothing is estimated: where a
 * thing was not verified it is listed under NOT_ESTABLISHED rather than softened.
 */

const TICKET = 'ADS-1';
const TICKET_ID = 10467338755;
const TICKET_URL = `https://app.basecamp.com/3945211/buckets/7463955/todos/${TICKET_ID}`;
const LIST_URL = 'https://app.basecamp.com/3945211/buckets/7463955/todolists/10467338643';

const PR = 3590;
const PR_URL = `https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/${PR}`;
const MERGED_ON = '2026-11-02';
const MERGE_COMMIT = 'f9f862f2';
const DEPLOY_COMMIT = 'a994b01f';
const SESSION = 'CC-20261102-k9r4';

const DIFF = { files: 35, added: 3114, removed: 2 };

/** Where the code came from, and why that mattered. */
const PATCH = {
  file: '0003-Add-ad-spend-ledger-and-ad-profitability-report.patch',
  series: '3 of 3',
  fromSession: 'CC-20261031-rh7k',
  // Searched before concluding it was lost: Downloads, every local ref and branch, open PRs,
  // merged PRs, and the local git object store by the commit sha in the patch header.
  siblingsFound: false,
};

/** The four hunks dropped because they modify files patches 1-2 created and main does not have. */
const DROPPED = [
  { file: 'backend/src/services/marketing/landingRevenue.ts', lines: 19 },
  { file: 'backend/src/services/revenueHealth/blockedMetrics.ts', lines: 17 },
  { file: 'frontend/src/pages/admin/revenue/health/BlockedMetricsCard.tsx', lines: 12 },
  { file: 'docs/sessions/CC-20261031-rh7k.md', lines: 18 },
];

/** The five rungs of the shipping ladder, kept separate on purpose. */
const LADDER = [
  { rung: 'Built', state: 'done', note: `${DIFF.files} files, +${DIFF.added}` },
  { rung: 'Tested', state: 'done', note: '6 of 6 required gates' },
  { rung: 'Merged', state: 'done', note: `PR #${PR}, ${MERGE_COMMIT}` },
  { rung: 'Deployed', state: 'done', note: `registry mode, ${DEPLOY_COMMIT}` },
  { rung: 'Production verified', state: 'done', note: 'tables, index, page, chunk' },
];

/** The six required checks, with the evidence that settles each one. */
const GATES = [
  { name: 'Backend typecheck', evidence: 'tsc --noEmit clean, tsc 5.9.3; re-run clean after merging main' },
  { name: 'Frontend typecheck', evidence: 'clean; re-run clean after merging main' },
  { name: 'Frontend build', evidence: 'Compiled successfully; main.6b95fbb1.js' },
  { name: 'Secret scan + route-auth lint', evidence: '7,741 files no secrets; 145/145 admin routes guarded' },
  { name: 'Test-file typecheck', evidence: '400 errors / 141 files, matched the frozen baseline both ways' },
  { name: 'Backend unit tests', evidence: '2,309 of 2,368 suites pass; residual proven pre-existing' },
];

const TESTS = {
  adSpend: 39,
  tripwires: 11,
  suitesPassed: 2309,
  suitesTotal: 2368,
  suitesSkipped: 34,
};

/**
 * The A/B that separated a real defect from timeout noise. The first full run reported 25
 * failing suites while two tsc processes and the 8GB-heap ratchet saturated the same machine,
 * and these suites carry a 5-second per-test timeout.
 */
const AB = {
  suites: 25,
  mainFailing: 17,
  branchFailing: 11,
  flippedToPass: 7,
  genuine: 1,
  maskedOnMainSeconds: 237,
  realOnBranchSeconds: 35,
};

/** Read inside the running container, against the database the backend itself reads. */
const PROD = {
  db: 'accelerator_prod',
  schema: 'public',
  checks: [
    ['marketing_spend_facts exists', 'resolved via to_regclass, not information_schema'],
    ['marketing_spend_syncs exists', 'resolved via to_regclass'],
    ['ledger is empty', '0 rows in both tables'],
    ['identity unique index present', 'platform, campaign_ref, placement, period_start, period_end, source'],
    ['placement is NOT NULL', "default '' - NULLs never compare equal, so they would defeat the index"],
  ],
  page: { route: '/admin/marketing/ad-spend', http: 200 },
  chunk: { file: '2998.42c79106.chunk.js', http: 200, bytes: 46814 },
  bundleBefore: 'main.01056ead.js',
  bundleAfter: 'main.6b95fbb1.js',
};

/** Stated plainly, because a closed ticket with no limits section is a claim, not evidence. */
const NOT_ESTABLISHED = [
  'That the ads are profitable. This ships the instrument, not a reading - the ledger is empty until spend is entered.',
  'That the Meta sync works against the live API. It ships dormant: no META_ADS_ACCESS_TOKEN, agent row enabled:false. Minting that token is ADS-4.',
  'That a real ad click becomes an attributed lead. That chain is ADS-2, ADS-5 and ADS-3; the report cannot credit a campaign that attribution never tags.',
  'That the four dropped hunks are unnecessary in general. They are unnecessary HERE: nothing in the ad spend code imports them. The revenue-health feature they enhance is still unlanded.',
  'The whole backend suite as a gate. 59 suites fail locally without a Postgres; CI runs those in a separate Integration tier, which passed.',
];

module.exports = {
  TICKET, TICKET_ID, TICKET_URL, LIST_URL,
  PR, PR_URL, MERGED_ON, MERGE_COMMIT, DEPLOY_COMMIT, SESSION,
  DIFF, PATCH, DROPPED, LADDER, GATES, TESTS, AB, PROD, NOT_ESTABLISHED,
};
