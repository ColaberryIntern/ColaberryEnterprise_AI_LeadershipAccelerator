import fs from 'fs';
import path from 'path';

/**
 * Phase 2 T206 — THE TWO TRIPWIRES.
 *
 * WHAT THESE ARE, stated before anything else, because the honest description is narrower
 * than the obvious one. **These are POPULATION guards, not invariant guards.** They do not
 * prove that every writer keeps `enrollment_type` and `tier` coherent — that is proved
 * behaviourally, per writer, in `writerPairCoherence.test.ts`, by driving the real function
 * and feeding its real output to the real consumer. What these do is narrower and still
 * worth having: **they fail the build when a file starts touching one of these columns and
 * nobody has written down what it does.**
 *
 * WHY POPULATION AND NOT INVARIANT. The alternative is a scanner that classifies each write
 * site by shape and decides whether it is coherent. T203 tried that and failed verification
 * three times running: a scanner keyed on `.create`/`.update` missed a returned object
 * literal, then mis-read a balanced one-liner, then reverted on any line containing `where:`.
 * Each time the prose claimed more than the regex established. The lesson taken was to stop
 * classifying and start pinning: enumerate the population, give every member a determination,
 * and let a newcomer be a failed build. That is the T202a pattern, which passed.
 *
 * SOURCE-TEXT ASSERTIONS, declared as such per this phase's standing decision. No seam
 * exists: "no file outside this list touches the column" is a claim about files that do not
 * exist yet, which no behavioural test can make. Both tripwires therefore carry a positive
 * control, state the count they matched, and are proved to fail by a planted violation in
 * **ALL THREE write syntaxes**: an object literal, a raw SQL string, and a PROPERTY
 * ASSIGNMENT followed by `.save()`.
 *
 * It said TWO syntaxes until verification, and that undercount cost this task its first
 * attempt. `markEnrollmentPaid` writes `enrollment.payment_status = 'paid'` and then saves -
 * the plan named it as one of three paid-marking paths, and it was neither fixed nor named
 * because the write did not look like the two shapes being thought about. The patterns did
 * match the file; the DETERMINATION written for it described only the create beside it. A
 * population guard is only as good as the determinations attached to it.
 *
 * COMMENTS ARE STRIPPED before scanning. A guard that reads prose measures the wrong text:
 * in T205 a truthful docblock broke a token scan, and in T203 an explanatory comment made a
 * structural assertion pass. The line-comment pattern is `[^\r\n]*` rather than `.*` because
 * JS `.` does not match a carriage return and these files are CRLF here — `.*` would strip
 * nothing and leave the guard reading green over commented-out code.
 */

const SRC = path.join(__dirname, '..', '..');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ');

/** Every non-test `.ts` under `backend/src`, as a repo-relative path. */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') sourceFiles(p, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(path.relative(SRC, p).replace(/\\/g, '/'));
    }
  }
  return out;
}

const matching = (re: RegExp): string[] =>
  sourceFiles()
    .filter((rel) => re.test(stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8'))))
    .sort();

/**
 * Both syntaxes in one pattern, deliberately. An object property (`payment_status: 'paid'`)
 * and a SQL assignment or binding (`payment_status = 'paid'`, `payment_status = :status`).
 */
const PAID_LITERAL = /payment_status\s*:\s*'paid'|payment_status\s*=\s*[:']/;
const OFF_EXPLORER = /enrollment_type\s*:\s*'(standard|member)'|enrollment_type\s*=\s*[:'C]/;

/**
 * TRIPWIRE 1's population: every non-test file whose code mentions a paid-status literal.
 *
 * Reads are listed alongside writes ON PURPOSE. Telling them apart needs the classifier this
 * guard exists to avoid, and a read that starts filtering on the wrong thing is worth a
 * human look too. The determination is where the distinction lives.
 */
const PAID_FILES: Record<string, string> = {
  // ---- WRITERS ----
  'services/subscriptionService.ts':
    'WRITER, THE REFERENCE. grantMembership writes enrollment_type + tier + payment_status together.',
  'services/paymentReconciliationService.ts':
    'WRITER (model update). Coherent as of T206: grants the pair with the paid flag.',
  'services/paymentSyncService.ts':
    'WRITER (raw SQL update). Coherent as of T206, each column gated on :status = paid.',
  'services/appPaymentReconcileService.ts':
    'WRITER (raw SQL update). The FIFTH writer, found by deriving this set rather than from the plan, which named three. Coherent as of T206.',
  'controllers/sponsorController.ts':
    'WRITER (create). Coherent only by COLUMN DEFAULT - tier defaults member, enrollment_type standard. Nothing at the call site states the pair.',
  'services/enrollmentService.ts':
    'TWO WRITERS. (a) markEnrollmentPaid - a LIVE UPDATE on the plan\'s "legacy webhook" path, called from webhookController; writes by PROPERTY ASSIGNMENT then .save(), which is why the first pass of T206 missed it. Coherent as of T206 attempt 2. (b) the legacy invoice CREATE, coherent by column default only.',

  // ---- Added by T207/T210. These are the files this phase itself introduced;
  // the tripwire caught that I had not classified my own work. ----


  'services/adminOs/conversionState.ts':
    'READ (T210). The one conversion definition: SQL aggregates plus a TS predicate over payment_status, amount_paid and subscription state. No write of any kind - it is a derivation consumed by the roster, the profile and subjectResolver.',
  // ---- READS: filters, counts and reports. No write. ----
  'services/cohortService.ts': 'READ. Dashboard filter on paid enrolments.',
  'services/ops/schoolSignals.ts': 'READ. Count of paid actives.',
  'services/reporting/intelligenceMapsService.ts': 'READ. Count for the intelligence map.',
  'services/revenuePaymentsService.ts': 'READ. SQL WHERE over paid rows with an amount.',
  'services/schedulerService.ts': 'READ. Looks up a paid enrolment by email.',
  'services/subscriptionAnalyticsService.ts': 'READ. SQL WHERE in an analytics query.',

  // ---- NEITHER: a declaration, seeds, and agent identities that are not people. ----
  'models/Enrollment.ts': 'DECLARATION. The payment_status union and the column defaults.',
  'scripts/createTestUsers.ts': 'SEED/DEV script. Creates test people; never runs in production.',
  'scripts/internshipJourneyE2E.ts': 'E2E script. Creates a fixture journey.',
  'scripts/seedTimelineDemo.ts':
    'SEED. Creates demo timeline data with a paid enrolment; never runs against production.',
  'seeds/seedAcceleratorCurriculum.ts': 'SEED. Curriculum fixture.',
  'seeds/seedLocalDev.ts': 'SEED. Local development data.',
  'services/agentBlueprint/agentIdentitySeed.ts': 'AGENT IDENTITY, not a person. Seeds an agent enrolment.',
  'services/agentBlueprint/ticketCreatorIdentitySeed.ts': 'AGENT IDENTITY, not a person.',
  'services/curriculum/daraIdentitySeed.ts': 'AGENT IDENTITY, not a person.',
  'services/agentDomain/domainAgentIdentitySeed.ts':
    'TEN AGENT IDENTITIES, not people (AF3.1). Seeds the ten Agent Factory domain '
    + 'agents as paid + standard, the same posture as Dara and Reese below. Their addresses '
    + 'are DERIVED from the domain key rather than written as literals, so the pinned '
    + 'AGENT_IDENTITY_EMAILS list cannot name them; the staff_email and staff_role exclusion '
    + 'terms are what keep them out of the T207 backfill.',
  'services/reese/reeseIdentitySeed.ts': 'AGENT IDENTITY, not a person. The row reeseWelcomeService refuses to greet.',
};

/**
 * TRIPWIRE 2's population: files whose code moves `enrollment_type` to a non-explorer value,
 * or filters on one.
 *
 * ABOUT TRANSITIONS, NOT THE RESTING STATE — with one honest qualification about how far the
 * pattern itself can enforce that.
 *
 * `standard` + `guest` is a perfectly legitimate place to be: an org teammate invited by
 * their employer has a non-learner programme, free access, and has paid nothing. A guard
 * that condemned that state would fire on the population this phase exists to protect.
 *
 * **The regex cannot distinguish a transition off `'explorer'` from a create that simply
 * starts a row at `'standard'`.** A future org-teammate writer using the literal would match
 * and be pinned. What saves the protected population is not the pattern but the SHAPE of the
 * guard: matching only ever means "write a determination for this file", never "this is a
 * bug". Nothing here can condemn a legitimate resting state, because nothing here judges —
 * which is the difference between a population guard and the invariant guard T203 failed to
 * build. The legitimacy of that state is asserted as behaviour in `writerPairCoherence.test.ts`.
 */
const OFF_EXPLORER_FILES: Record<string, string> = {
  // ---- WRITERS of the transition ----
  'services/subscriptionService.ts':
    'WRITER, THE REFERENCE. grantMembership moves off explorer AND grants member, in one place.',
  'services/enrollmentService.ts':
    'WRITER. convertExplorerToStandard - the latent standard+guest bug T206 fixes. Now writes both.',
  'services/paymentReconciliationService.ts': 'WRITER (model update). Coherent as of T206.',
  'services/paymentSyncService.ts': 'WRITER (raw SQL). Coherent as of T206.',
  'services/appPaymentReconcileService.ts': 'WRITER (raw SQL). Coherent as of T206.',

  // ---- Added by T207/T209/T210, the files this phase introduced. ----

  'scripts/backfillFreeAccountCoherence.ts':
    'WRITER, OPT-IN ONLY (T207). Moves rows ONTO explorer (never off it) and only with --confirm-production; the inverse is ledger-driven so it cannot touch rows the sweep never wrote.',
  'services/adminOs/conversionState.ts':
    'READ (T210). The shared lifecycle-stage CASE reads enrollment_type to tell an Explorer from a student. No write.',

  // ---- READS ----
  'services/explorerRosterService.ts': 'READ. SQL WHERE for the Explorer revenue roster.',
  'services/subscriptionRosterService.ts': 'READ. SQL WHERE for the complement roster.',
  'services/subscriptionAnalyticsService.ts': 'READ. SQL WHERE in analytics.',

  // ---- NEITHER ----
  'models/Enrollment.ts': 'DECLARATION. The enrollment_type union and its default.',
  'scripts/internshipJourneyE2E.ts':
    'E2E SCRIPT. Builds a fixture journey; also writes tier: standard, which is not in the column union - noted in the T202a enumeration.',
  'services/agentBlueprint/agentIdentitySeed.ts': 'AGENT IDENTITY, not a person.',
  'services/agentBlueprint/ticketCreatorIdentitySeed.ts': 'AGENT IDENTITY, not a person.',
  'services/curriculum/daraIdentitySeed.ts': 'AGENT IDENTITY, not a person.',
  'services/reese/reeseIdentitySeed.ts': 'AGENT IDENTITY, not a person.',
  'services/agentDomain/domainAgentIdentitySeed.ts':
    'TEN AGENT IDENTITIES, not people (AF3.1). Writes enrollment_type standard at CREATE, '
    + 'which is a resting state and not a transition: these rows do not exist before this '
    + 'file makes them, so there is no explorer for anybody to be moved off. portal_enabled '
    + 'is false on every one, so none of them is a learner either.',
  'scripts/backfillExplorerEnteredAt.ts':
    'SHAPE MATCH, NOT A TRANSITION (M21). It matches because its WHERE clause reads '
    + "enrollment_type = 'explorer' to SELECT the population. It writes one column, "
    + 'explorer_entered_at, and never assigns enrollment_type at all, so it cannot move '
    + 'anybody off explorer. Pinned here so the newcomer is accounted for rather than ignored.',
  'scripts/srsDistributionReport.ts':
    'SHAPE MATCH, NOT A WRITE AT ALL (M25). It matches because it SELECTs its population with '
    + "enrollment_type = 'explorer'. It is a read-only report: it reads through the normal "
    + 'Person 360 reader, computes the Sales Readiness Score in memory, prints a distribution '
    + 'and persists nothing. No INSERT, UPDATE or DELETE appears in it, and it assigns '
    + 'enrollment_type nowhere, so it cannot move anybody off explorer.',
};

describe('the scanners themselves can fail', () => {
  // Without these, a typo in a pattern or a path makes both tripwires pass while checking
  // nothing - which is how a guard reads green over an empty file list.
  it('finds a meaningful number of source files at all', () => {
    expect(sourceFiles().length).toBeGreaterThan(200);
  });

  it('both patterns match BOTH syntaxes, object and SQL', () => {
    expect(PAID_LITERAL.test("payment_status: 'paid',")).toBe(true);
    expect(PAID_LITERAL.test("SET payment_status = 'paid',")).toBe(true);
    expect(PAID_LITERAL.test('SET payment_status = :status,')).toBe(true);
    // THE THIRD SYNTAX, the one missed on the first attempt: property assignment.
    expect(PAID_LITERAL.test("enrollment.payment_status = 'paid';")).toBe(true);
    expect(OFF_EXPLORER.test("enrollment.enrollment_type = 'standard';")).toBe(true);
    expect(OFF_EXPLORER.test("enrollment_type: 'standard',")).toBe(true);
    expect(OFF_EXPLORER.test("SET enrollment_type = 'standard'")).toBe(true);
    expect(OFF_EXPLORER.test("enrollment_type = CASE WHEN :status = 'paid'")).toBe(true);
    // The OBJECT-LITERAL form of an explorer write is excluded, which is the form asserted
    // below. The SQL alternative (`enrollment_type\s*=\s*[:'C]`) does still match
    // `enrollment_type = 'explorer'`; the earlier wording here claimed neither form matched,
    // which was wider than the test. Harmless for a population guard - over-matching only ever
    // means "write a determination" - but the sentence should not say more than the pattern.
    expect(OFF_EXPLORER.test("enrollment_type: 'explorer',")).toBe(false);
  });

  it('stripping removes a commented-out write, so prose cannot satisfy either guard', () => {
    const sample = "const a = 1; // payment_status: 'paid'\n/* enrollment_type: 'standard' */\nconst b = 2;";
    const out = stripComments(sample);
    expect(PAID_LITERAL.test(out)).toBe(false);
    expect(OFF_EXPLORER.test(out)).toBe(false);
    expect(out).toContain('const b = 2;');
  });
});

describe('TRIPWIRE 1 — every file touching a paid-status literal is accounted for', () => {
  const found = matching(PAID_LITERAL);

  it(`matched ${Object.keys(PAID_FILES).length} files, and that is the count it checked`, () => {
    // Stating the count is what stops a scan that matched nothing from passing.
    expect(found.length).toBe(Object.keys(PAID_FILES).length);
    expect(found.length).toBeGreaterThan(10);
  });

  it('the matched set is EXACTLY the pinned set — a newcomer is a failed build', () => {
    expect(found).toEqual(Object.keys(PAID_FILES).sort());
  });

  it('every pinned file carries a determination long enough to be one', () => {
    const thin = Object.entries(PAID_FILES).filter(([, d]) => d.length < 25).map(([f]) => f);
    expect(thin).toEqual([]);
  });

  it('POSITIVE CONTROL: the reference and both raw-SQL writers are in the matched set', () => {
    expect(found).toContain('services/subscriptionService.ts');
    expect(found).toContain('services/paymentSyncService.ts');
    expect(found).toContain('services/appPaymentReconcileService.ts');
  });
});

describe('TRIPWIRE 2 — every file moving enrollment_type off explorer is accounted for', () => {
  const found = matching(OFF_EXPLORER);

  it(`matched ${Object.keys(OFF_EXPLORER_FILES).length} files, and that is the count it checked`, () => {
    expect(found.length).toBe(Object.keys(OFF_EXPLORER_FILES).length);
    expect(found.length).toBeGreaterThan(5);
  });

  it('the matched set is EXACTLY the pinned set — a newcomer is a failed build', () => {
    expect(found).toEqual(Object.keys(OFF_EXPLORER_FILES).sort());
  });

  it('every pinned file carries a determination long enough to be one', () => {
    const thin = Object.entries(OFF_EXPLORER_FILES).filter(([, d]) => d.length < 25).map(([f]) => f);
    expect(thin).toEqual([]);
  });

  it('POSITIVE CONTROL: the reference and the previously-broken converter are in the matched set', () => {
    expect(found).toContain('services/subscriptionService.ts');
    expect(found).toContain('services/enrollmentService.ts');
  });
});
