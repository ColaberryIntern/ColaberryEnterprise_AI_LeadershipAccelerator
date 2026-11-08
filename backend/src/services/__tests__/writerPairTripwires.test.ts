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
    'WRITER, THE REFERENCE. grantMembership writes tier + payment_status together. As of C10.17 '
    + 'Phase 2 it does NOT write enrollment_type: origin is not a payment outcome. tier is the '
    + 'column isEnrolledMember, subjectResolver and reeseWelcomeService actually read.',
  'services/paymentReconciliationService.ts':
    'WRITER (model update). Grants tier with the paid flag; no longer writes enrollment_type (C10.17 Phase 2).',
  'services/paymentSyncService.ts':
    'WRITER (raw SQL update). tier gated on :status = paid, so a failed payment grants nothing. '
    + 'The enrollment_type CASE arm was deleted in C10.17 Phase 2.',
  'services/appPaymentReconcileService.ts':
    'WRITER (raw SQL update). The FIFTH writer, found by deriving this set rather than from the '
    + 'plan, which named three. Grants tier beside the paid flag; the enrollment_type assignment '
    + 'was deleted in C10.17 Phase 2.',
  'controllers/sponsorController.ts':
    'WRITER (create). Coherent only by COLUMN DEFAULT - tier defaults member, enrollment_type standard. Nothing at the call site states either. A create, so it sets origin at birth, which is legitimate.',
  'services/enrollmentService.ts':
    'TWO WRITERS. (a) markEnrollmentPaid - a LIVE UPDATE on the plan\'s "legacy webhook" path, '
    + 'called from webhookController; writes by PROPERTY ASSIGNMENT then .save(), which is why the '
    + 'first pass of T206 missed it and why these patterns cover three syntaxes. It grants tier and '
    + 'the paid flag; its enrollment_type assignment was deleted in C10.17 Phase 2. (b) the legacy '
    + 'invoice CREATE, coherent by column default only.',

  // ---- Added by T207/T210. These are the files this phase itself introduced;
  // the tripwire caught that I had not classified my own work. ----


  'services/adminOs/conversionState.ts':
    'READ (T210). The one conversion definition: SQL aggregates plus a TS predicate over payment_status, amount_paid and subscription state. No write of any kind - it is a derivation consumed by the roster, the profile and subjectResolver.',

  'scripts/backfillFreeAccountCoherence.ts':
    'READ (C10.17 Phase 2), and A NEWCOMER THIS GUARD CAUGHT. It began matching when Phase 2 '
    + 'split the Shape A witness on payment: SHAPE_COUNT_SQL now counts explorer+non-guest rows '
    + 'that are UNPAID apart from the paying upgraders it must never write, because after Phase 2 '
    + 'both populations share that shape and a single number would report payers as pending work. '
    + 'The terms are inside count(*) FILTER clauses - a read. Every write this script performs is '
    + 'planned by freeAccountCoherenceBackfill.decideRow and gated on --confirm-production.',
  // ---- READS: filters, counts and reports. No write. ----
  'services/cohortService.ts': 'READ. Dashboard filter on paid enrolments.',
  'services/marketing/payingMembersSql.ts':
    'READ. The paid_enrollment fallback inside COLLECTED_CTE, so an enrolment that paid but has no activated term is not counted as zero cash.',
  'services/ops/schoolSignals.ts': 'READ. Count of paid actives.',
  'services/reporting/intelligenceMapsService.ts': 'READ. Count for the intelligence map.',
  'services/revenuePaymentsService.ts': 'READ. SQL WHERE over paid rows with an amount.',
  'services/schedulerService.ts': 'READ. Looks up a paid enrolment by email.',
  'services/subscriptionAnalyticsService.ts': 'READ. SQL WHERE in an analytics query.',

  // ---- NEITHER: a declaration, seeds, and agent identities that are not people. ----
  'models/Enrollment.ts': 'DECLARATION. The payment_status union and the column defaults.',
  'scripts/placeHistoricalPaidMembers.ts':
    'READ of the paid literal, and A NEWCOMER THIS GUARD CAUGHT (C10.13). It selects on '
    + "`payment_status: 'paid'` AND `status: 'active'` to find members who paid before batch "
    + 'placement existed, and the only column it ever writes is `cohort_id` - never tier, '
    + 'payment_status or enrollment_type, so it cannot make a row incoherent in the sense this '
    + 'tripwire guards. Dry-run by default, --execute to write, and deliberately not scheduled: '
    + 'a recurring version would move renewing members out of their own batch every month.',
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
  'services/mayaIdentitySeed.ts':
    'AGENT IDENTITY, not a person (2026-10-27). Same posture and the identical '
    + 'enrollmentDefaults block as Dara and Reese above: paid + invoice + standard are honest '
    + 'placeholders on the required Enrollment columns, and portal_enabled is false, so this is '
    + 'not a learner row. This tripwire is what forced the classification - the file was a '
    + 'newcomer to the matched set and failed the build until it was named here.',
};

/**
 * TRIPWIRE 2's population: files whose code moves `enrollment_type` to a non-explorer value,
 * or filters on one.
 *
 * THIS GUARD CHANGED JOBS IN C10.17 PHASE 2, and the change is worth stating because the
 * tests below read almost the same while meaning something much stronger.
 *
 * Under T206 this was a COHERENCE guard. Five payment paths rewrote `enrollment_type` to
 * 'standard' when somebody paid, that rewrite was legitimate, and the question the guard
 * asked was "does each writer also grant `tier`, so no row ends up standard+guest?".
 *
 * Phase 2 deleted all five rewrites, because `enrollment_type` is ORIGIN - 'explorer' means
 * the account arrived free - and a payment is not a change of origin. Rewriting it is what
 * made free-to-paid conversion unmeasurable: the measured event mutated the field the
 * population was defined by.
 *
 * So the question is now stronger: **does anything move a row off its origin at all?** The
 * answer is meant to be no, and the pinned set below is what that looks like - reads,
 * creates, seeds and declarations, with not one update among them.
 *
 * STILL A POPULATION GUARD, NOT AN INVARIANT ONE, and still for T203's reason. **The regex
 * cannot distinguish a transition off `'explorer'` from a create that simply starts a row at
 * `'standard'`.** Agent identity seeds do exactly that and are legitimate; so is an org
 * teammate resting at `standard` + `guest`, which is a non-learner programme with free
 * access and nothing paid. A guard that condemned the resting state would fire on the
 * population this work exists to protect. What saves them is not the pattern but the SHAPE
 * of the guard: matching only ever means "write a determination for this file", never "this
 * is a bug". The legitimacy of that resting state is asserted as behaviour in
 * `writerPairCoherence.test.ts`, and the departure of the five writers is asserted by name
 * below rather than inferred from the count.
 */
const OFF_EXPLORER_FILES: Record<string, string> = {
  // ---- WRITERS of the transition ----
  //
  // THERE ARE NONE, AND THAT IS NOW THE POINT OF THIS GUARD (C10.17 Phase 2).
  //
  // Five files stood here: subscriptionService (grantMembership, the reference),
  // enrollmentService (markEnrollmentPaid and convertExplorerToStandard),
  // paymentReconciliationService, paymentSyncService and appPaymentReconcileService. Every
  // one has left the matched set, because every one has stopped assigning the column. That
  // departure is asserted by name in its own test below, so the emptiness of this section is
  // a derived fact rather than a gap somebody left.
  //
  // What remains below is reads, creates and declarations. A create sets origin at BIRTH,
  // which is the only legitimate time to set it.

  // ---- Added by T207/T209/T210, the files those phases introduced. ----

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
  'services/mayaIdentitySeed.ts':
    'AGENT IDENTITY, not a person (2026-10-27). Writes enrollment_type standard at CREATE, '
    + 'which is a resting state and not a transition - the row does not exist before this file '
    + 'makes it, so there is no explorer for anyone to be moved off. Same reasoning the ten '
    + 'domain agents below carry.',
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

  /**
   * THE ASSERTION C10.17 PHASE 2 EXISTS TO MAKE, and the one the old positive control has
   * become. It used to assert that `subscriptionService` and `enrollmentService` WERE in the
   * matched set, as proof the scan could see the writers. Both have now left it, so that
   * control had to be replaced rather than deleted - deleting it would have left the shrunken
   * population resting on a count, and a count cannot say WHICH file left.
   *
   * Named individually, because the five sites are the whole of Phase 2 and each is a
   * separate way for the rewrite to come back: two object literals, two raw SQL statements,
   * and one property assignment followed by `.save()`.
   */
  it('NO PAYMENT WRITER remains in the matched set - the five are named, not counted', () => {
    const formerWriters = [
      'services/subscriptionService.ts',
      'services/enrollmentService.ts',
      'services/paymentReconciliationService.ts',
      'services/paymentSyncService.ts',
      'services/appPaymentReconcileService.ts',
    ];
    for (const f of formerWriters) expect(found).not.toContain(f);
  });

  it('POSITIVE CONTROL: the scan still sees the files that legitimately set origin at birth', () => {
    // Without this, the five assertions above would pass just as well over an empty match
    // set, a broken path or a stripper that ate every file - which is how a guard reads green
    // while checking nothing. These three WRITE `enrollment_type` and are supposed to.
    expect(found).toContain('services/mayaIdentitySeed.ts');
    expect(found).toContain('services/agentDomain/domainAgentIdentitySeed.ts');
    expect(found).toContain('models/Enrollment.ts');
  });
});
