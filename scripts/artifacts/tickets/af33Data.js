/**
 * AF3.3's facts: the legacy-to-domain consolidation map, the count reconciliation, and the
 * correction that matters most -- thirteen of the undomained agents are live, not five.
 *
 * Data only, no rendering. Everything here is either read straight out of the tracked
 * `capabilities/_unresolved.json` (which carries its own `measured_on`) or taken from the merged
 * PR #3468 that produced it. Nothing is estimated.
 *
 * This ticket does NOT end in a close. Its own fifth acceptance criterion is "REVIEW STATE set to
 * BLOCKED - ALI DECISION REQUIRED", and the decision it is blocked on is AF6.1. The artifact's
 * job is to make that decision a one-sitting job rather than a research project.
 */
const TICKET = 'AF3.3';
const MEASURED_ON = '2026-10-28';
const PR = 3468;

/** 225 of the 246 classified legacy rows land on a domain. The spread is the finding. */
const DOMAIN_MAP = [
  ['Executive Intelligence & Governance', 75],
  ['Marketing Intelligence & Brand', 40],
  ['Platform Automation & Reliability', 38],
  ['Admissions & Applicant Experience', 28],
  ['Sales, Enrollment & Subscriptions', 16],
  ['Learner Success (Reese)', 11],
  ['Curriculum, Learning & Certification', 8],
  ['Website Portfolio & Conversion', 8],
  ['Internship & Career Readiness', 1],
];
const DOMAINED = 225;
const UNDOMAINED = 21;
const CLASSIFIED = 246;

/**
 * The count reconciliation the ticket asked for in writing, checked in BOTH directions.
 *
 * Four counts were circulating and the gap had never been named. Checking one direction only
 * would have been a coincidence rather than a reconciliation: all 246 CSV names are present in
 * the registry, AND 23 registry rows are absent from the CSV. Neither set has a stray.
 */
const RECONCILIATION = {
  classified: CLASSIFIED,
  createdAfterCut: 23,
  liveRegistry: 269,
  bothDirections: 'all 246 CSV names are present in the registry (zero missing), and 23 registry '
    + 'rows are absent from the CSV. Neither set has a stray.',
  theTwentyThree: [
    'Nine *DomainAgent rows, all created 2026-10-18, plus Dara: the ten domain employees. '
      + 'Curriculum has no *DomainAgent row because agent_domain_projects.curriculum.agent_id '
      + 'already pointed at the existing Dara row. The ten are nine plus Dara.',
    'Thirteen agents created after the CSV was cut, including Maya, created 2026-10-27 -- a day '
      + 'before the admissions builder chose that name.',
  ],
  retired: '217 and 257 should stop being quoted. AF3.2 already found 217 not reproducible and '
    + 'put the figure at 152. The classified population is 246; the live one is 269.',
};

/**
 * THE CORRECTION. `_unresolved.json`'s own comment used to say "Five of these are live production
 * rows". Five is the count of rows whose PROPOSED KIND is `unresolved`; it was being read as the
 * count of LIVE rows. Measured against production on 2026-10-28, thirteen are enabled.
 */
const KINDS = [
  { kind: 'retire', rows: 8, enabled: 0, runs: 0 },
  { kind: 'behavior', rows: 8, enabled: 8, runs: 178937 },
  { kind: 'unresolved', rows: 5, enabled: 5, runs: 1312192 },
];
const TOTAL_ROWS = 21;
const TOTAL_ENABLED = 13;
const TOTAL_RUNS = 1491129;

/** The live rows, by name, with what production says each has actually done. */
const LIVE_ROWS = [
  ['visitor_tracker', 1300725, 'unresolved'],
  ['SessionLifecycle', 65323, 'behavior'],
  ['BehavioralSignalDetector', 32623, 'behavior'],
  ['BehavioralTriggerEvaluator', 32516, 'behavior'],
  ['IntentScoreRecomputer', 21399, 'behavior'],
  ['OpportunityScoreRecomputer', 15837, 'behavior'],
  ['SessionReminders', 10886, 'behavior'],
  ['forecast_engine', 9351, 'unresolved'],
  ['intent_scorer', 1954, 'unresolved'],
  ['ICPInsightComputer', 228, 'behavior'],
  ['revenue_aggregator', 150, 'unresolved'],
  ['PortfolioGitHubSyncAgent', 125, 'behavior'],
  ['calendar_intent_booster', 12, 'unresolved'],
];

/** The eight proposed for retirement: all disabled, all zero runs. */
const RETIRE_ROWS = [
  'Alumni_Outreach_Agent', 'Alumni_Reengagement_Agent', 'Alumni_Referral_Agent',
  'Corporate_Training_Agent', 'Employer_Relationship_Agent', 'Enterprise_Partnership_Agent',
  'Opportunity_Detection_Agent', 'Trend_Detection_Agent',
];

const DECISION = {
  owner: 'AF6.1',
  cheapestThird: 'All eight rows proposed for retirement are disabled with ZERO runs. Retiring '
    + 'them risks nothing, and it is the cheapest third of the decision. A test fails if one ever '
    + 'comes back enabled.',
  hardestPart: 'The eight proposed as behaviors are ALL live, so none can be dropped quietly.',
  whyTheyResist: 'Each row carries a measured reason with a file and line, and the recurring '
    + 'pattern is genuine DUAL OWNERSHIP rather than missing information. BehavioralSignalDetector '
    + 'is representative: visitor intent scoring serves both marketing and sales, so a single '
    + 'owner is not obviously correct. That is why this is an owner decision and not a cleanup.',
};

/** The five acceptance criteria. The fifth is the review state, and it is BLOCKED by design. */
const CRITERIA = [
  {
    n: 1,
    text: 'Every legacy agent name in the registry is accounted for: mapped, retired-pending-'
      + 'approval, or unresolved with a reason. Zero silently missing, asserted by a test.',
    met: true,
    evidence: '225 domained plus 21 bucketed equals 246, enforced by capabilityRecord.test.ts '
      + 'with a POSITIVE CONTROL asserting the CSV really holds 246 unique data rows -- so the '
      + 'reconciliation cannot pass over a set that was never complete.',
  },
  {
    n: 2,
    text: 'The 246-vs-registry-count difference is explained in writing.',
    met: true,
    evidence: '246 classified plus 23 created after the classification was cut equals the 269 '
      + 'ai_agents rows measured in production. Checked in both directions, with no strays.',
  },
  {
    n: 3,
    text: 'The live production rows are called out individually, by name, with what currently '
      + 'depends on them.',
    met: true,
    evidence: 'Done, and the ticket\'s own premise corrected: there are THIRTEEN live rows, not '
      + 'five. All thirteen are named with their measured run counts and their cron wiring.',
  },
  {
    n: 4,
    text: 'No agent row is modified.',
    met: true,
    evidence: 'Nothing is retired, disabled or reassigned. Every disposition stays unresolved and '
      + 'needs_owner_decision stays true, both pinned by capabilityRecord.test.ts.',
  },
  {
    n: 5,
    text: 'REVIEW STATE set to BLOCKED - ALI DECISION REQUIRED for the live rows.',
    met: false,
    evidence: 'This is the correct end state, not a gap. The decision belongs to AF6.1 and to '
      + 'Ali. THIS TICKET SHOULD NOT BE CLOSED until that decision is made.',
  },
];

const VERIFICATION = [
  ['New tests', '9 passing (unresolvedBucketMeasured.test.ts)'],
  ['Regression', 'capabilityRecord.test.ts still passes -- 53 tests across both suites'],
  ['Production figures', `read-only SELECT against ai_agents, pool closed, ${MEASURED_ON}`],
];

module.exports = {
  TICKET, MEASURED_ON, PR,
  DOMAIN_MAP, DOMAINED, UNDOMAINED, CLASSIFIED,
  RECONCILIATION, KINDS, TOTAL_ROWS, TOTAL_ENABLED, TOTAL_RUNS,
  LIVE_ROWS, RETIRE_ROWS, DECISION, CRITERIA, VERIFICATION,
};
