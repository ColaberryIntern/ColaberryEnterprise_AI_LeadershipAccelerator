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
 *   STRUCTURAL — the consumer is a raw SQL string with no seam, so the test
 *                asserts the filter is present, with a positive control proving
 *                the assertion can fail. A structural assertion is weaker and is
 *                never described as a behaviour test.
 *
 * Consumers with no seam at all are named in the artifact and left to the
 * acceptance scenarios (T213), rather than given a test that only restates the
 * source.
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
   * Reese's first message. `isStudent` is keyed on `tier === 'member'`, which is
   * why this change also belongs to population B and not A. The predicate is
   * private, so this reproduces it over the same inputs and asserts the direction
   * — labelled STRUCTURAL because it does not call the service.
   */
  describe('Reese intro selection (STRUCTURAL — the private predicate reproduced)', () => {
    const isStudent = (tier: string, inRealClass: boolean) => tier === 'member' || inRealClass;

    it('today: a free Explorer defaults to member tier and gets the STUDENT intro', () => {
      expect(isStudent('member', false)).toBe(true);
    });

    it('after T202b: the same Explorer is guest and gets the ACCOUNT intro', () => {
      expect(isStudent('guest', false)).toBe(false);
    });

    it('a guest who IS in a real class still gets the student intro — the other half of the or', () => {
      expect(isStudent('guest', true)).toBe(true);
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
   * The Week-0 gate. `isFreePreviewTier` returns TRUE to mean gated, and with the
   * paid gate dark it keys on `enrollment_type` alone — so population A loses the
   * full twelve weeks. The predicate is reproduced here; the truncation it drives
   * lives in `timelineService`, which this suite cannot reach without mocking the
   * whole curriculum (see the note at the end of the file).
   */
  describe('the legacy Week-0 predicate (STRUCTURAL — reproduced)', () => {
    const legacyGate = (enrollmentType: string, week0Only = true) =>
      enrollmentType === 'explorer' && week0Only;

    it('today: a portal free account is standard, so it is NOT gated — full twelve weeks', () => {
      expect(legacyGate('standard')).toBe(false);
    });

    it('after T202b: the same account is explorer, so it IS gated to Week 0', () => {
      expect(legacyGate('explorer')).toBe(true);
    });

    it('EXPLORER_WEEK0_ONLY=false turns the gate off even for an Explorer', () => {
      expect(legacyGate('explorer', false)).toBe(false);
    });
  });

  /**
   * The admin dashboard. `cohortService.getDashboardStats` builds ONE
   * `notExplorer` filter and reuses it for three counts, so two of them drop by
   * the size of population A. STRUCTURAL: it is a Sequelize operator object
   * inside an un-exported function.
   */
  describe('the dashboard exclusion (STRUCTURAL — the operator object reproduced)', () => {
    const excluded = (enrollmentType: string) => enrollmentType !== 'explorer';

    it('today: a portal free account counts toward totalEnrollments', () => {
      expect(excluded('standard')).toBe(true);
    });

    it('after T202b: it does not — totalEnrollments and pendingInvoice both drop', () => {
      expect(excluded('explorer')).toBe(false);
    });

    it('paidEnrollments does not move, because population A is never payment_status paid', () => {
      expect(freeEnrollmentDefaults({ full_name: 'x', email: 'x@y.z' }, 'learner').payment_status)
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
    const src = read('services/freeAccountRegistration.ts');
    expect(src).toContain("tier: 'guest' as const");
    expect(src).toContain("programme === 'learner' ? ('explorer' as const) : ('standard' as const)");
  });
});

describe('T202b — what does NOT move', () => {
  it('the Growth Journey customer fact needs BOTH a non-guest tier AND paid, so neither population becomes a customer', () => {
    const customerFact = (tier: string, paymentStatus: string) => tier !== 'guest' && paymentStatus === 'paid';

    // Population A: guest, pending.
    expect(customerFact('guest', 'pending')).toBe(false);
    // Population B after the change: guest, pending.
    expect(customerFact('guest', 'pending')).toBe(false);
    // Population B BEFORE the change: member, pending — still not a customer,
    // because the paid term is the one doing the work.
    expect(customerFact('member', 'pending')).toBe(false);
    // A real paid member is.
    expect(customerFact('member', 'paid')).toBe(true);
    // And the incoherent row T206 exists to prevent reads as NOT a customer,
    // which is why that task is separate and necessary.
    expect(customerFact('guest', 'paid')).toBe(false);
  });

  it('the internship exclusion is unaffected: neither population is internship', () => {
    const notInternship = (t: string) => t !== 'internship';
    expect(notInternship('explorer')).toBe(true);
    expect(notInternship('standard')).toBe(true);
    expect(notInternship('internship')).toBe(false);
  });
});

/**
 * NOT COVERED HERE, said plainly rather than left to be discovered:
 *
 * - `timeline/timelineService.ts:231` is where the Week-0 truncation is actually
 *   performed (`cards = isFreeTier ? allCards.filter(c => c.week === 0) : allCards`).
 *   It consumes the derived flag, not the column, and reaching it needs the whole
 *   curriculum graph mocked. T213's acceptance scenarios own it end to end.
 * - The three roster/analytics SQL queries and `explorerIdentityBridge`'s
 *   population loader are raw `sql.query` strings; their filters are quoted with
 *   line numbers in the artifact's citations, and T213 exercises the population
 *   change for real.
 * - `personHistoryService`'s title and `feedControlService`'s label are string
 *   composition inside large un-exported functions; a reproduction test would
 *   only restate the source, so they are disclosed in the checkpoint instead.
 */
