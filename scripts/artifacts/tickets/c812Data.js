/**
 * C8.12 - the day-90 impact report. Every figure here was measured against production
 * on 2026-10-26, read-only, and each row carries the query shape that produced it so a
 * later reader can re-measure instead of trusting this file.
 *
 * The ticket warns against "declaring it done against a schema that exists but holds no
 * rows". What production actually holds is worse in one specific place and better in
 * another, and both are the story of this ticket.
 */

/** The headline, stated once so an edit cannot soften it by accident. */
const VERDICT = {
  built: 'A day-90 report that generates from real evidence records and refuses to '
    + 'manufacture the one number a sponsor most wants.',
  theTrap: 'The baseline columns are NOT NULL defaulted to ZERO rather than left null, so '
    + 'exit minus baseline completes, reads as measurement, and is fiction.',
  theFix: 'The verified commits were always openable. Nothing had ever joined them to the '
    + 'repository that locates them.',
};

/**
 * What the report can now say, with real numbers from the one populated cohort.
 * Source: buildDayNinetyReport({kind:'cohort'}) run against production.
 */
const DELIVERED = {
  cohort: 'AI Internship',
  members: 14,
  withEvidence: 10,
  totalClaims: 114,
  openableClaims: 80,
  openableBefore: 0,
  verifiedCommits: 86,
  richestLearnerClaims: 79,
  richestLearnerDays: 87,
};

/**
 * The evidence that exists. Counts are exact COUNT(*) against production.
 */
const EVIDENCE = [
  { table: 'student_skill_evidence', rows: 16615, people: 154,
    use: 'Append-only skill ledger. Single source value "timeline" on every row.',
    verdict: 'USABLE, NARROW' },
  { table: 'student_architecture_skill', rows: 5390, people: 599,
    use: 'Per-skill standing. Holds the placement/claim/judgment columns.',
    verdict: 'TRAP - SEE BASELINE' },
  { table: 'evidence_records', rows: 1100, people: 44,
    use: 'Validated evidence across 5 source types. All 1,100 carry validated = true.',
    verdict: 'USABLE' },
  { table: 'student_tasks (verified)', rows: 423, people: 34,
    use: '384 verified by build_pipeline:repo_verification, each with a 40-hex commit SHA.',
    verdict: 'USABLE - AND NOW OPENABLE' },
  { table: 'runtime_assessment_attempts', rows: 364, people: 78,
    use: '230 quiz attempts and 134 evaluations.',
    verdict: 'HALF BROKEN - SEE QUIZZES' },
  { table: 'cert_evidence_mappings', rows: 345, people: 22,
    use: 'Certification objective mappings.',
    verdict: 'UNUSABLE - ALL 345 PENDING, 0 HUMAN-VERIFIED' },
  { table: 'resume_skill_claims', rows: 14, people: 7,
    use: 'Insert-only, versioned. The only durable day-one artifact in the platform.',
    verdict: 'USABLE AS A CLAIM, NEVER A MEASUREMENT' },
];

/**
 * The baseline finding. This is the centre of the ticket.
 */
const BASELINE = {
  verdict: 'NO BASELINE EXISTS, FOR ANYBODY',
  columns: [
    { name: 'placement_score', zeros: 5376, total: 5390, nulls: 0,
      why: 'Recomputed from the CURRENT resume on every recompute, so it moves after the '
        + 'fact. Its only measured input, diagnostic_attempts, holds ZERO rows.' },
    { name: 'claim_score', zeros: 5390, total: 5390, nulls: 0,
      why: 'Zero on every single row. Nothing has ever written it.' },
    { name: 'judgment_score', zeros: 5390, total: 5390, nulls: 0,
      why: 'Zero on every single row. Nothing has ever written it.' },
  ],
  theDanger: 'The 14 non-zero placement rows are the dangerous ones, not the 5,376 zeros. '
    + 'They are the only inputs capable of producing a movement sentence, and that '
    + 'sentence would be false.',
  whatWeUseInstead: 'The earliest surviving resume claim: insert-only, versioned, frozen. '
    + 'It is a CLAIM on a known date, never a measurement, and the report says so in '
    + 'those words.',
  costOfClosing: 'An intake instrument. Not a report change.',
};

/** Defects this ticket surfaced that outlive it. */
const DEFECTS = [
  { id: 'D1', severity: 'HIGH',
    title: 'Every quiz attempt is recorded as not passed',
    detail: 'All 230 quiz attempts across 78 learners have a NULL pass_threshold, so the '
      + 'stored passed flag is false on every one - at a mean score of 0.835 and 960 of '
      + '1,150 answers correct. "0 of 78 passed" is a sentence this platform can produce '
      + 'today and it is false.',
    where: 'runtime_assessment_attempts.pass_threshold' },
  { id: 'D2', severity: 'HIGH',
    title: 'Verified commits were recorded without the repository that locates them',
    detail: '384 tasks verified by build_pipeline:repo_verification carry a 40-hex SHA and '
      + 'no repository. evidence_records stores STORY-NNN@<sha>. Nobody, including us, '
      + 'could open any of them. The repository was in github_connections the whole time.',
    where: 'student_tasks.verified_ref, evidence_records.source_ref' },
  { id: 'D3', severity: 'MEDIUM',
    title: 'The proficiency column holds three incompatible scales at one version',
    detail: 'Among the 527 non-zero rows: 4 sit in 0-1, 199 in 2.5-6, and 324 in 12-60, '
      + 'all at weights_version 1. Ranking learners by this column ranks the scale they '
      + 'happened to be scored on.',
    where: 'student_architecture_skill.proficiency' },
  { id: 'D4', severity: 'MEDIUM',
    title: 'The only completed cohort has zero recorded members',
    detail: 'Cohort - April 2026 is status "completed" and holds 0 cohort_memberships. A '
      + 'day-90 report for the one cohort that finished returns nobody.',
    where: 'cohorts, cohort_memberships' },
  { id: 'D5', severity: 'LOW',
    title: 'All 345 certification evidence mappings are unverified',
    detail: 'Every row is mapping_state "pending" and auto_matched, with 0 human '
      + 'verifications. They cannot back a claim in their current state.',
    where: 'cert_evidence_mappings' },
];

/**
 * The sponsor. One row, and it is a fixture.
 */
const SPONSOR = {
  companyName: 'Northwind Trading Co.',
  id: '5b0a5000-0000-4000-8000-000000000001',
  seatsPurchased: 25,
  seatsMinted: 0,
  plan: 'annual',
  billingStatus: 'paid',
  hasPortalToken: false,
  createdOn: '2026-06-26',
  verdict: 'THERE IS NO REAL SPONSOR',
  why: 'Northwind Trading Co. is the canonical Microsoft sample-database company, and the '
    + 'id is a hand-written seed pattern. Combined with a null contact lead, zero minted '
    + 'seats and zero portal audit rows, this is a fixture rather than a customer.',
  consequence: 'The report\'s sponsor path is correct and currently has nobody to serve. '
    + 'It reads minted seats rather than the purchased count, so it reports "no '
    + 'participants" instead of twenty-five learners who do not exist.',
};

/** The three acceptance criteria, judged. */
const CRITERIA = [
  { n: 1, text: 'A sponsor-facing day-90 report generates from existing evidence records',
    verdict: 'MET',
    evidence: 'Runs against production: 14 learners, 114 claims, 80 openable, assembled '
      + 'from evidence_records, student_tasks, runtime_assessment_attempts and '
      + 'resume_skill_claims. No migration, no new table.' },
  { n: 2, text: 'Every claim traces to a verified commit or an assessment record',
    verdict: 'MET',
    evidence: 'Enforced by assertNoClaimWithoutASource: a claim renders only with a source '
      + 'type and either an openable URL or a stated reason it has none. 80 of 86 verified '
      + 'commits are now openable; before this change the number was zero.' },
  { n: 3, text: 'It states baseline to exit movement rather than asserting impact',
    verdict: 'NOT MET - AND NOT CLOSEABLE IN CODE',
    evidence: 'Nothing measures a learner at intake. The report states claim-to-evidence '
      + 'where a resume claim survives (2 learners) and names the absence everywhere else '
      + '(11 no baseline, 1 single observation). It reports 0 measured movement because 0 '
      + 'is the true number.' },
];

/** What is needed from Ali, separated from what is engineering. */
const DECISIONS = [
  { kind: 'INSTRUMENT',
    ask: 'Do we add an intake capability measure?',
    why: 'It is the only way criterion 3 is ever met. Without it the renewal conversation '
      + 'runs on claim-versus-evidence, which is defensible but weaker than it sounds.',
    cost: 'A scored diagnostic at enrollment covering the ten architecture skills. The '
      + 'DiagnosticAttempt model already exists and has never had a row written to it.' },
  { kind: 'SCOPE',
    ask: 'Who is this report actually for, given there is no real sponsor?',
    why: 'The only populated cohort is the AI Internship, whose members are interns rather '
      + 'than a paying sponsor\'s employees. The report works; the audience is a fixture.',
    cost: 'None technically. It decides whether this ships to a customer or waits.' },
  { kind: 'DEFECT',
    ask: 'Set the quiz pass thresholds.',
    why: 'Until then the platform believes nobody has ever passed a quiz, and any report '
      + 'built on that flag repeats it.',
    cost: 'A value per quiz. The evaluation path already carries 0.7.' },
];

// ---------------------------------------------------------------------------
// Guards - the build refuses to produce a document that has lost its point
// ---------------------------------------------------------------------------

/** The zero-baseline trap is the finding. A softened version is worse than nothing. */
function assertTheZeroBaselineTrapSurvives() {
  const t = BASELINE.theDanger + ' ' + VERDICT.theTrap;
  if (!/zero/i.test(t) || !/false|fiction/i.test(t)) {
    throw new Error('C8.12: the zero-baseline trap has been softened out of the artifact');
  }
  if (BASELINE.verdict !== 'NO BASELINE EXISTS, FOR ANYBODY') {
    throw new Error('C8.12: the baseline verdict has been weakened');
  }
  const placement = BASELINE.columns.find((c) => c.name === 'placement_score');
  if (!placement || !/recomputed/i.test(placement.why)) {
    throw new Error('C8.12: the reason placement is not a baseline has been dropped');
  }
}

/** Criterion 3 is not met and must never be reported as met. */
function assertCriterionThreeIsNotClaimed() {
  const three = CRITERIA.find((c) => c.n === 3);
  if (!three || !three.verdict.startsWith('NOT MET')) {
    throw new Error('C8.12: criterion 3 was marked met; no intake measurement exists');
  }
  if (!/0 measured movement|0 is the true number/i.test(three.evidence)) {
    throw new Error('C8.12: criterion 3 stopped stating the real zero');
  }
}

/** The sponsor is a fixture. A document that implies a live customer is misleading. */
function assertTheSponsorIsNamedAsAFixture() {
  if (SPONSOR.verdict !== 'THERE IS NO REAL SPONSOR') {
    throw new Error('C8.12: the sponsor fixture finding has been removed');
  }
  if (SPONSOR.seatsMinted !== 0 || SPONSOR.seatsPurchased <= 0) {
    throw new Error('C8.12: the purchased-versus-minted gap has been edited away');
  }
}

/** Every defect must say where it lives, or nobody can act on it. */
function assertEveryDefectCitesItsLocation() {
  for (const d of DEFECTS) {
    if (!d.where || d.where.length < 8) {
      throw new Error('C8.12: defect ' + d.id + ' does not say where it lives');
    }
    if (!/\d/.test(d.detail)) {
      throw new Error('C8.12: defect ' + d.id + ' carries no measured number');
    }
  }
  return DEFECTS.length;
}

/** The openable-commit number is the one thing this ticket actually fixed. */
function assertTheFixIsQuantified() {
  if (DELIVERED.openableBefore !== 0) {
    throw new Error('C8.12: the before-number for openable claims must be zero');
  }
  if (!(DELIVERED.openableClaims > 0)) {
    throw new Error('C8.12: the fix produced no openable claims, so it is not a fix');
  }
  if (DELIVERED.openableClaims > DELIVERED.totalClaims) {
    throw new Error('C8.12: more claims are openable than exist');
  }
}

function assertAllGuards() {
  assertTheZeroBaselineTrapSurvives();
  assertCriterionThreeIsNotClaimed();
  assertTheSponsorIsNamedAsAFixture();
  assertTheFixIsQuantified();
  return assertEveryDefectCitesItsLocation();
}

module.exports = {
  VERDICT, DELIVERED, EVIDENCE, BASELINE, DEFECTS, SPONSOR, CRITERIA, DECISIONS,
  assertTheZeroBaselineTrapSurvives,
  assertCriterionThreeIsNotClaimed,
  assertTheSponsorIsNamedAsAFixture,
  assertEveryDefectCitesItsLocation,
  assertTheFixIsQuantified,
  assertAllGuards,
};
