import * as fs from 'fs';
import * as path from 'path';
import { pickBestEnrollment } from '../enrollmentPick';
import { isEnrolledMember } from '../../controllers/v1EnrollmentLookupController';
import { freeEnrollmentDefaults } from '../freeAccountRegistration';
// Reused, not reimplemented. T202a's first scan counted comments as code and had
// to grow this; a second copy here would be free to drift from it.
import { stripComments } from '../../scripts/enumerateFreeAccountConsumers';

/**
 * Phase 2 T202b — the behaviour changes, tested where they happen.
 *
 * WHY THIS SUITE EXISTS. T202b makes two populations consistent:
 *
 *   A — portal free accounts (`freeSignupService`) gain `enrollment_type: 'explorer'`
 *   B — `/enroll` Explorers (`createExplorerEnrollment`) gain `tier: 'guest'`
 *
 * They move in OPPOSITE directions, because each previously had one of the two
 * columns and not the other. `docs/growth-os-reset/FREE_ACCOUNT_CONSUMERS.md`
 * enumerates all 29 direct consumers with a determination for each; this suite is
 * the behaviour half for the ones with a testable seam.
 *
 * TWO KINDS OF ASSERTION, labelled so they are not confused:
 *
 *   BEHAVIOUR — the real decision function is called and its answer flips.
 *   STRUCTURAL — the consumer has no callable seam, so the test asserts the
 *                source, with a positive control proving the assertion can fail.
 *                Weaker, and never described as a behaviour test.
 *
 * A THIRD KIND HAS BEEN REMOVED, because it was the worst of the three. The first
 * version of this file re-declared five predicates inside the tests and asserted
 * the copies — `isStudent`, the legacy Week-0 gate, the dashboard exclusion, the
 * customer fact, the internship filter. Every copy was faithful to the real code,
 * so they read as coverage. A verifier inverted the REAL Reese predicate and the
 * REAL `cohortService` filter and this suite stayed green on both. A test that
 * restates the source cannot fail when the source drifts, which is the one thing
 * a test is for.
 *
 * Each of those five is now either pointed at real code, replaced by a suite that
 * drives the real function, or deleted and cited to the pre-existing suite that
 * genuinely covers it. Where the cite is the answer, the suite is named so the
 * claim is checkable:
 *
 *   - the legacy Week-0 predicate → `services/access/__tests__/contentEntitlement.test.ts`
 *     ("flag OFF + explorer → gated (true)", "flag OFF + standard … NOT gated",
 *     "EXPLORER_WEEK0_ONLY=false → explorer NOT gated"). Its EFFECT, the card
 *     truncation, is covered by `services/timeline/__tests__/timelineWeekZeroGate.test.ts`.
 *   - Reese's `isStudent` → the pre-existing `reeseWelcomeService` suite, which
 *     fails 13 tests when that predicate is inverted.
 *   - the dashboard exclusion → `services/__tests__/dashboardExplorerExclusion.test.ts`,
 *     written because inverting the real filter was caught by nothing in the repo.
 */
describe('T202b — population B: /enroll Explorers gain tier: guest', () => {
  /**
   * The partner-app login gate. This is the change with the widest blast radius
   * and the plan originally attributed it to the wrong population: the gate reads
   * `tier`, NOT `enrollment_type`, so portal free accounts (already 'guest') do
   * not move, and `/enroll` Explorers — who defaulted to 'member' — do.
   *
   * Which means: a free Explorer reads as ENROLLED to the partner app today.
   */
  describe('isEnrolledMember (BEHAVIOUR — pure, exported)', () => {
    const row = (over: Record<string, unknown> = {}) =>
      ({ tier: 'member', status: 'active', ...over }) as never;

    it('today: a free Explorer with the default member tier reads as ENROLLED', () => {
      expect(isEnrolledMember([row({ tier: 'member' })])).toBe(true);
    });

    it('after T202b: the same Explorer carries tier guest and reads as NOT enrolled', () => {
      expect(isEnrolledMember([row({ tier: 'guest' })])).toBe(false);
    });

    it('a real paid member is unaffected — active', () => {
      expect(isEnrolledMember([row({ tier: 'member', status: 'active' })])).toBe(true);
    });

    it('a real paid member is unaffected — completed', () => {
      expect(isEnrolledMember([row({ tier: 'member', status: 'completed' })])).toBe(true);
    });

    it('a withdrawn member still does not count, before or after', () => {
      expect(isEnrolledMember([row({ tier: 'member', status: 'withdrawn' })])).toBe(false);
    });

    it('one guest row among member rows does not hide the member', () => {
      expect(isEnrolledMember([row({ tier: 'guest' }), row({ tier: 'member' })])).toBe(true);
    });
  });

  /**
   * Reese's first message also belongs to population B, because `isStudent` is
   * keyed on `tier === 'member'`. The predicate is private to
   * `reeseWelcomeService`, and the first version of this file reproduced it here —
   * which meant inverting the real one left this suite green.
   *
   * STRUCTURAL instead: assert the real source still keys on `tier`, so that if
   * someone re-keys it on `enrollment_type` the attribution in the artifact
   * becomes wrong and this fails. The BEHAVIOUR is covered by the pre-existing
   * `reeseWelcomeService` suite, which fails 13 tests when that line is inverted.
   */
  describe('Reese intro selection (STRUCTURAL — the real source, not a copy)', () => {
    it('isStudent is keyed on tier, which is why this change belongs to population B', () => {
      const src = stripComments(
        fs.readFileSync(path.join(__dirname, '..', 'reese', 'reeseWelcomeService.ts'), 'utf8'),
      );
      expect(src).toContain("enrollment.tier === 'member'");
    });

    it('the positive control: it is NOT keyed on enrollment_type, so the attribution is real', () => {
      const src = stripComments(
        fs.readFileSync(path.join(__dirname, '..', 'reese', 'reeseWelcomeService.ts'), 'utf8'),
      );
      expect(src).not.toContain("enrollment_type === 'explorer'");
    });
  });
});

describe('T202b — population A: portal free accounts gain enrollment_type: explorer', () => {
  /**
   * Canonicalisation. `'explorer'` ranks WORSE than a non-learner row, by design,
   * so that a stray free row cannot capture the login of someone holding a real
   * seat. Population A's rows therefore move DOWN the ranking, which is correct
   * and is also the mechanism behind the org-teammate upgrade in T201.
   */
  describe('pickBestEnrollment (BEHAVIOUR — pure)', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'r', enrollment_type: 'standard', payment_status: 'pending',
      created_at: new Date('2026-01-01'), ...over,
    });

    it('a paid row outranks a free Explorer, so a paying student never lands in the free account', () => {
      const paid = row({ id: 'paid', payment_status: 'paid' });
      const explorer = row({ id: 'explorer', enrollment_type: 'explorer', created_at: new Date('2026-09-01') });
      expect(pickBestEnrollment([explorer, paid])!.id).toBe('paid');
    });

    it('an unpaid NON-learner row also outranks a free Explorer, newer or not', () => {
      const member = row({ id: 'member', created_at: new Date('2026-01-01') });
      const explorer = row({ id: 'explorer', enrollment_type: 'explorer', created_at: new Date('2026-09-01') });
      expect(pickBestEnrollment([explorer, member])!.id).toBe('member');
    });

    it('a staff row outranks everything, which is the 2026-07-30 incident this rule exists for', () => {
      const staff = row({ id: 'staff', communityMember: { mgmt_role: 'director' } });
      const paid = row({ id: 'paid', payment_status: 'paid', created_at: new Date('2026-09-01') });
      expect(pickBestEnrollment([paid, staff])!.id).toBe('staff');
    });

    it('between two Explorers, the newer one wins', () => {
      const older = row({ id: 'older', enrollment_type: 'explorer', created_at: new Date('2026-01-01') });
      const newer = row({ id: 'newer', enrollment_type: 'explorer', created_at: new Date('2026-09-01') });
      expect(pickBestEnrollment([older, newer])!.id).toBe('newer');
    });
  });

  /**
   * The Week-0 gate and the admin dashboard exclusion both used to be reproduced
   * predicates here. Both are now covered by code that runs the real thing, and
   * repeating them would be the same mistake with more words:
   *
   *   - the predicate → `services/access/__tests__/contentEntitlement.test.ts`
   *   - its EFFECT on a learner's cards → `services/timeline/__tests__/timelineWeekZeroGate.test.ts`
   *   - the dashboard exclusion → `services/__tests__/dashboardExplorerExclusion.test.ts`
   *
   * What stays here is the one fact those suites cannot state, because it belongs
   * to the account rather than to any consumer: population A is never paid, which
   * is why `paidEnrollments` does not move while the other two counts drop.
   */
  describe('why paidEnrollments does not move (BEHAVIOUR — real defaults)', () => {
    it('a learner account is created unpaid, so it was never in the paid count', () => {
      expect(freeEnrollmentDefaults({ full_name: 'x', email: 'x@y.z' }, 'learner').payment_status)
        .toBe('pending');
    });

    it('and neither is a standard free account', () => {
      expect(freeEnrollmentDefaults({ full_name: 'x', email: 'x@y.z' }, 'standard').payment_status)
        .toBe('pending');
    });
  });
});

/**
 * The tripwire. `programme` has no default, so TypeScript already refuses a call
 * that omits it — but a future caller could pass a VARIABLE whose value nobody
 * reviewed, and `tsc` would be satisfied. This asserts every call site names one
 * of the two literals, and states the population it matched so that a scan which
 * finds nothing cannot pass silently.
 */
describe('T202b — every caller names its programme explicitly', () => {
  const SRC = path.join(__dirname, '..', '..');

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue;
        walk(p, out);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
    }
    return out;
  };

  // A call site is a `createFreeAccount(` occurrence that is not the definition
  // or an import. The call may span lines, so the following 6 lines are included.
  const callSites: { file: string; snippet: string }[] = [];
  for (const file of walk(SRC)) {
    // Comments stripped first: `assignOrgDepartments20260819.ts` documents this
    // service twice in prose, and counting those as call sites made the scan
    // report 7 where there are 5.
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (!/\bcreateFreeAccount\(/.test(line)) return;
      if (/^\s*(import|export)\b/.test(line)) return;
      if (/export async function createFreeAccount/.test(line)) return;
      callSites.push({
        file: path.relative(SRC, file).split(path.sep).join('/'),
        snippet: lines.slice(i, i + 7).join('\n'),
      });
    });
  }

  it('found the call sites it is supposed to guard, and knows how many', () => {
    // Five: the portal controller, orgService twice, the prospect path, and the
    // org-department provisioning script. A scan returning zero would otherwise
    // pass every assertion below while checking nothing.
    expect(callSites.length).toBe(5);
    const files = callSites.map((c) => c.file).sort();
    expect(files).toEqual([
      'controllers/participantController.ts',
      'scripts/assignOrgDepartments20260819.ts',
      'services/leads/prospectAccount.ts',
      'services/orgService.ts',
      'services/orgService.ts',
    ]);
  });

  it('every call site passes a literal programme', () => {
    const missing = callSites
      .filter((c) => !/programme:\s*'(learner|standard)'/.test(c.snippet))
      .map((c) => c.file);
    expect(missing).toEqual([]);
  });

  it('exactly ONE call site is a learner signup — the public free-AI path', () => {
    const learners = callSites.filter((c) => /programme:\s*'learner'/.test(c.snippet));
    expect(learners.map((c) => c.file)).toEqual(['controllers/participantController.ts']);
  });

  it('every other call site is standard, so org and prospect paths cannot mint learners', () => {
    const standards = callSites.filter((c) => /programme:\s*'standard'/.test(c.snippet));
    expect(standards).toHaveLength(4);
    expect(standards.map((c) => c.file).sort()).toEqual([
      'scripts/assignOrgDepartments20260819.ts',
      'services/leads/prospectAccount.ts',
      'services/orgService.ts',
      'services/orgService.ts',
    ]);
  });
});

/**
 * Both writers write both columns.
 *
 * STRUCTURAL, and here rather than only in the behavioural suite for a specific
 * reason: the behavioural assertion lives in
 * `src/__tests__/services/explorerEnrollmentWelcome.test.ts`, which sits on
 * `jest.ci.config.ts`'s ignore list, so it does not gate CI. That config is
 * outside this phase's declared scope and changing which suites gate the build is
 * a deliberate decision in its own right, not a side effect of this task — so the
 * property gets a gating assertion here as well. Removing that ignore entry, now
 * that the suite passes, is a recommended follow-up.
 */
describe('T202b — both free-account writers write BOTH columns (STRUCTURAL)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  /**
   * Scoped to the creation payload, line by line, so a mention anywhere else in a
   * 400-line service cannot satisfy it. Line-based rather than by string offsets:
   * the first draft sliced to the next `});` and landed on an empty string, which
   * made the assertions fail for the wrong reason.
   */
  const explorerCreatePayload = (): string => {
    const lines = read('services/enrollmentService.ts').split('\n');
    // Anchored on the FUNCTION, then its first create. The file has four
    // `Enrollment.create({` calls and the first draft of this helper grabbed the
    // wrong one — anchoring on the payload's own contents would have been
    // circular, since those contents are what is being asserted.
    const fn = lines.findIndex((l) => /export async function createExplorerEnrollment/.test(l));
    expect(fn).toBeGreaterThan(-1);
    const start = lines.findIndex((l, i) => i > fn && l.includes('await Enrollment.create({'));
    expect(start).toBeGreaterThan(fn);
    const end = lines.findIndex((l, i) => i > start && /^\s*\}\);\s*$/.test(l));
    expect(end).toBeGreaterThan(start);
    // Comments stripped, and this is NOT belt-and-braces. The payload carries a
    // comment explaining why `tier: 'guest'` is there, which quotes the literal.
    // Without stripping, deleting the actual line left the comment behind and
    // this assertion still passed — a test that could not fail, caught only by
    // running the mutation. Third time in this phase that prose has satisfied a
    // check meant for code.
    return stripComments(lines.slice(start, end + 1).join('\n'));
  };

  it('createExplorerEnrollment sets enrollment_type explorer AND tier guest', () => {
    const payload = explorerCreatePayload();
    expect(payload).toContain("enrollment_type: 'explorer'");
    expect(payload).toContain("tier: 'guest'");
  });

  it('the positive control: that slice really is just the creation payload', () => {
    const payload = explorerCreatePayload();
    // Contains a field unique to this payload, and none of the surrounding
    // function, so the assertions above cannot pass on unrelated source.
    expect(payload).toContain('cohort_id: cohort.id');
    expect(payload).not.toContain('export async function');
    expect(payload.split('\n').length).toBeLessThan(40);
  });

  it('the canonical service decides both columns from the programme', () => {
    // `stripComments` here too. This file's docblock quotes `tier: 'guest'` in
    // prose more than once, so without stripping, one more explanatory comment
    // would silently make this assertion unfalsifiable — the exact bug found one
    // file over, caught there only by running the mutation.
    const src = stripComments(read('services/freeAccountRegistration.ts'));
    expect(src).toContain("tier: 'guest' as const");
    expect(src).toContain("programme === 'learner' ? ('explorer' as const) : ('standard' as const)");
  });
});

describe('T202b — what does NOT move (STRUCTURAL — the real source)', () => {
  /**
   * `customerFactFor` is not exported, so it cannot be driven directly. The first
   * version of this test re-declared the predicate and asserted the copy, which
   * could not fail if the real rule changed. Asserting the real line instead: it
   * needs BOTH terms, which is why neither population becomes a customer, and why
   * T206 exists — a `tier: 'guest'` row marked paid would read as NOT a customer.
   */
  it('the customer fact still requires BOTH a non-guest tier and paid', () => {
    const src = stripComments(
      fs.readFileSync(
        path.join(__dirname, '..', 'growthJourney', 'subjectResolver.ts'), 'utf8',
      ),
    );
    expect(src).toContain("enrollment.tier !== 'guest' && enrollment.payment_status === 'paid'");
  });

  it('the positive control: a one-term version of that rule is not what is there', () => {
    const src = stripComments(
      fs.readFileSync(
        path.join(__dirname, '..', 'growthJourney', 'subjectResolver.ts'), 'utf8',
      ),
    );
    // If the tier term were dropped, the line below would be what remained — and
    // a guest row marked paid would start reading as a customer.
    expect(src).not.toContain("if (enrollment && enrollment.payment_status === 'paid') return { paid: true");
  });
});

/**
 * WHERE EVERY CHANGING CONSUMER IS COVERED, so the gaps are visible rather than
 * discovered. The artifact marks 14 rows as changing: 12 for population A and 2
 * for B.
 *
 * Covered by a suite that runs real code:
 *   row 1  v1EnrollmentLookupController   → this file, `isEnrolledMember` (exported, pure)
 *   row 2  contentEntitlement             → `services/access/__tests__/contentEntitlement.test.ts`
 *          its effect on a learner's cards → `services/timeline/__tests__/timelineWeekZeroGate.test.ts`
 *   row 3  capeTodayPlanService           → `services/cape/__tests__/capeTodayPlanService.test.ts`
 *   row 4  enrollmentPick                 → this file, `pickBestEnrollment` (exported, pure)
 *   row 8  subscriptionService            → `services/__tests__/subscriptionService.test.ts`
 *   row 10 paymentReconciliationService   → its own existing suite
 *   row 13 reeseWelcomeService            → the existing `reeseWelcomeService` suite
 *   row 29 cohortService dashboard        → `services/__tests__/dashboardExplorerExclusion.test.ts`
 *
 * NOT covered by a behaviour test, and why:
 *   rows 5, 6, 7, 9  explorerIdentityBridge, the two rosters, subscriptionAnalytics
 *     — raw `sql.query` strings with no callable seam. Their filters are quoted
 *       with line numbers in the artifact's citations. The population change they
 *       produce is what T213's scenarios 1, 2 and 9 exercise.
 *   row 11 personHistoryService, row 12 feedControlService
 *     — string composition inside large un-exported functions. Neither has a
 *       suite in the repository. A reproduced-predicate test would only restate
 *       the source, which is the mistake this file was corrected for, so they are
 *       disclosed in the checkpoint instead and carry no test.
 *
 * That is 8 of 14 with real coverage, 4 deferred to T213 with a named scenario,
 * and 2 disclosed as untested. Stated as a count because "mostly covered" is how
 * a gap survives.
 */
