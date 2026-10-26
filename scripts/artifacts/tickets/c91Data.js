/**
 * C9.1 - launch readiness, nine criteria, pass or fail.
 *
 * THE RULE THIS FILE ENFORCES, in the ticket's words: "passing a criterion that is only
 * partly met. This is pass or fail, not partial." There is deliberately no PARTIAL
 * verdict in the type, so a criterion that is nearly met has nowhere to hide: it fails,
 * and the reason says how nearly.
 *
 * EVERY VERDICT RESTS ON EVIDENCE GATHERED TODAY, not on a ticket being closed. A closed
 * DESIGN ticket proves a document was approved; it does not prove the thing the document
 * describes exists and works. Three of the nine verdicts here differ from what the
 * ticket board alone would suggest, in both directions.
 */

const AS_OF = '24 October 2026';

/** PASS or FAIL. There is no third value, on purpose. */
const CRITERIA = [
  {
    n: 1,
    name: 'Claims approved',
    verdict: 'PASS',
    evidence: 'C0.6 is closed and approved by Ali. The Claim Registry exists as the '
      + 'canonical artifact in 00 - Master & Governance, with one row per external '
      + 'figure.',
    nuance: 'Enforcement is by convention. There is no claim table in the database, so '
      + 'nothing stops an unregistered figure reaching a deck except a person checking. '
      + 'That is what C0.6 chose, and it is sound at this volume.',
  },
  {
    n: 2,
    name: 'Sales assets complete',
    verdict: 'PASS',
    evidence: 'C4.1 master sales deck, C4.2 executive one-pager and C4.3 platform '
      + 'capability statement are all closed, each having reached READY FOR ALI REVIEW '
      + 'and then been validated and closed by Ali.',
    nuance: null,
  },
  {
    n: 3,
    name: 'Website live',
    verdict: 'PASS',
    evidence: 'Verified in a real browser today, not by status code. /how-it-works '
      + 'renders its own heading ("Five stages, from a problem you name to software your '
      + 'people built") and /accelerator renders its own; a nonsense path renders a real '
      + '404 page, which is the control that makes the two positives mean something.',
    nuance: 'A curl check CANNOT establish this: the site is a React shell that returns '
      + 'the same 2,897-byte document with HTTP 200 for every path including the '
      + 'nonsense one. Anyone re-checking this criterion with curl will get a false pass.',
  },
  {
    n: 4,
    name: 'Demo ready',
    verdict: 'PASS',
    evidence: 'C5.9, the guided demo mode, is closed at READY FOR ALI REVIEW - PROD '
      + 'VERIFIED, and the demo tenant exists in production. C5.10, the sponsor outcome '
      + 'dashboard, has its pull request merged.',
    nuance: 'C5.10 is still an open to-do, but only because a human closes these; its '
      + 'code shipped. An open ticket awaiting a close is not the same as unfinished '
      + 'work, and this review distinguishes the two.',
  },
  {
    n: 5,
    name: 'Target list verified',
    verdict: 'FAIL',
    evidence: 'C6.2 built and approved a 100-account target universe. But C6.12, "name '
      + 'the first ten target institutions for the seat-block motion", is OPEN WITH ZERO '
      + 'COMMENTS - never started. And production holds zero organizations of type '
      + 'strategic_account, so no target exists in the system that outreach could be '
      + 'recorded against.',
    nuance: 'A universe is not a target list. Outreach needs the first ten named, and '
      + 'nobody has named them.',
  },
  {
    n: 6,
    name: 'Campaign gate passed',
    verdict: 'FAIL',
    evidence: 'C6.10 built the activation gate and is closed, so the gate EXISTS. No '
      + 'campaign has passed it: campaign_governance_configs holds ZERO rows, and a '
      + 'governance config is one of the gate’s own required checks. Nothing can '
      + 'clear it in its current state.',
    nuance: 'Separately worth knowing: six campaigns sit in status "active" while no '
      + 'governance config exists. The gate having been built is not the same as the '
      + 'gate having been passed, and this criterion asks for the second.',
  },
  {
    n: 7,
    name: 'Proposal and SOW ready',
    verdict: 'FAIL',
    evidence: 'C7.2, the pilot proposal template, is closed and approved. C7.3, the SOW, '
      + 'is at BLOCKED - ALI DECISION REQUIRED: three clauses (IP ownership, deployment '
      + 'liability, model neutrality) are deliberately blank because C2.6 reserves them '
      + 'to Ali, and a build assertion fails if any acquires draft language.',
    nuance: 'No clause has been reviewed by counsel, and the Texas analysis behind "a '
      + '$44,500 contract that could be void" came from reading the statute rather than '
      + 'from a lawyer. Half of this criterion is ready; the half that gets signed is not.',
  },
  {
    n: 8,
    name: 'Security one-pager ready',
    verdict: 'FAIL',
    evidence: 'C7.8 is OPEN at BLOCKED - ALI DECISION REQUIRED. Its own traceability '
      + 'pass found that a direct search for Vanta, Drata, Secureframe and Thoropass '
      + 'returns no vendor correspondence at all and no audit firm appears anywhere, '
      + 'while the "decide to start" to-do is ticked and its acceptance criteria named '
      + 'exactly those things.',
    nuance: 'It also surfaced a line in the 10 July kickoff minutes about helping '
      + '"create backdated documentation where necessary", flagged rather than '
      + 'interpreted and still awaiting Ali. This is the document an enterprise buyer '
      + 'asks for first, so going outbound without it means the first interested reply '
      + 'arrives at a gap - and arrives at this question.',
  },
  {
    n: 9,
    name: 'Funnel instrumented',
    verdict: 'FAIL',
    evidence: 'C8.2 and C8.4 shipped and are merged, and the funnel reads real '
      + 'production data rather than manual entry. But two of its ten stages have NO '
      + 'source at all - a delivered demo is recorded nowhere, and nothing marks an '
      + 'engagement as paid, so a running pilot cannot be counted.',
    nuance: 'The closest of the five failures. The instrument works and is honest about '
      + 'what it cannot see; it simply cannot yet see two stages, one of which is the '
      + 'pilot itself. Under this ticket’s own no-partial-credit rule that is a fail.',
  },
];

/** Measured against production on 24 October 2026. */
const MEASURED = {
  asOf: AS_OF,
  strategicAccounts: 0,
  campaignGovernanceConfigs: 0,
  activeCampaigns: 6,
  revenueOpportunities: 0,
  deliveryContracts: 0,
  leadsLinkedToAnAccount: 0,
  websiteControl: 'a nonsense path renders a real 404 page, so the two positive renders mean something',
};

/**
 * Where the critical path actually runs.
 *
 * This is the finding worth leading on. Three of the five failures are not waiting on
 * engineering at all.
 */
const CRITICAL_PATH = {
  blockedOnAli: ['Proposal and SOW ready', 'Security one-pager ready', 'Target list verified'],
  blockedOnConfiguration: ['Campaign gate passed'],
  blockedOnBuild: ['Funnel instrumented'],
};

const RECOMMENDATION = {
  verdict: 'NO-GO',
  because: 'Five of nine criteria fail. Two of them - the SOW and the security one-pager '
    + '- are the documents a serious buyer asks for within a week of the first reply, '
    + 'and both are blocked on decisions only Ali can make. One, the target list, means '
    + 'there is nobody specific to contact: the first ten institutions have never been '
    + 'named and no target account exists in the system.',
  cost: 'C9.1 states the cost of getting this wrong: going outbound unprepared burns the '
    + 'target list, and a burned list cannot be re-approached for months. The asymmetry '
    + 'is severe - waiting costs weeks, burning the list costs the quarter.',
  smallestPathToGo: 'Three decisions and one configuration. Settle the three reserved '
    + 'SOW clauses, unblock the security one-pager, name the first ten targets, and '
    + 'create a campaign governance config. None of those is a build.',
};

/* ------------------------------------------------------------------ *
 * Guards - the acceptance criteria as build gates
 * ------------------------------------------------------------------ */

/** "Binary pass/fail per item." No third value, and no hedged wording. */
function assertEveryVerdictIsBinary() {
  for (const c of CRITERIA) {
    if (c.verdict !== 'PASS' && c.verdict !== 'FAIL') {
      throw new Error(`C9.1: criterion ${c.n} has verdict "${c.verdict}", which is not binary`);
    }
    if (/partial|mostly|largely|nearly ready|good enough/i.test(c.verdict)) {
      throw new Error(`C9.1: criterion ${c.n} hedges its verdict`);
    }
  }
  if (CRITERIA.length !== 9) {
    throw new Error(`C9.1: ${CRITERIA.length} criteria, expected the 9 the ticket lists`);
  }
  return CRITERIA.length;
}

/** Every verdict must rest on evidence, or it is an opinion with a label. */
function assertEveryVerdictCitesEvidence() {
  for (const c of CRITERIA) {
    if (!c.evidence || c.evidence.length < 60) {
      throw new Error(`C9.1: criterion ${c.n} ("${c.name}") has no usable evidence`);
    }
  }
  return CRITERIA.length;
}

/**
 * The recommendation must FOLLOW from the verdicts.
 *
 * A readiness review that failed criteria and then recommended go would be the most
 * expensive kind of document: one that launders a decision through a process.
 */
function assertRecommendationFollowsFromVerdicts() {
  const failed = CRITERIA.filter((c) => c.verdict === 'FAIL');
  if (failed.length > 0 && RECOMMENDATION.verdict !== 'NO-GO') {
    throw new Error(`C9.1: ${failed.length} criteria fail but the recommendation is `
      + `"${RECOMMENDATION.verdict}"`);
  }
  if (failed.length === 0 && RECOMMENDATION.verdict !== 'GO') {
    throw new Error('C9.1: nothing fails but the recommendation is not GO');
  }
  return failed.length;
}

/** Every failing criterion must appear on exactly one critical path. */
function assertEveryFailureIsOnThePath() {
  const onPath = [
    ...CRITICAL_PATH.blockedOnAli,
    ...CRITICAL_PATH.blockedOnConfiguration,
    ...CRITICAL_PATH.blockedOnBuild,
  ];
  const failed = CRITERIA.filter((c) => c.verdict === 'FAIL').map((c) => c.name);
  for (const f of failed) {
    if (onPath.filter((x) => x === f).length !== 1) {
      throw new Error(`C9.1: failing criterion "${f}" is not on exactly one critical path`);
    }
  }
  if (onPath.length !== failed.length) {
    throw new Error('C9.1: the critical path names something that is not a failure');
  }
  return failed.length;
}

module.exports = {
  AS_OF, CRITERIA, MEASURED, CRITICAL_PATH, RECOMMENDATION,
  assertEveryVerdictIsBinary, assertEveryVerdictCitesEvidence,
  assertRecommendationFollowsFromVerdicts, assertEveryFailureIsOnThePath,
};
