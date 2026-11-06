import fs from 'fs';
import path from 'path';
import { pickBestEnrollment } from '../enrollmentPick';

/**
 * PHASE 1 of making `enrollment_type` an ORIGIN field.
 *
 * `enrollment_type` is supposed to record where an account came from ('explorer' = signed
 * up free, 'standard' = signed up paid). It does not, because every payment path rewrites
 * it to 'standard'. That rewrite is why free-to-paid conversion cannot be measured (see
 * `checkoutFunnelService.ts`), and it is also, accidentally, the live Week-0 paywall: with
 * CONTENT_PAID_GATE_ENABLED unset in production, `isFreePreviewTier` reduces to exactly
 * `enrollment_type === 'explorer'`.
 *
 * So the writers cannot simply be stopped. Doing that alone would, on the next deploy,
 * strip weeks 1-12 from every paying ex-Explorer, drop them out of MRR while counting them
 * as a free trial, keep them inside the Explorer Growth population that can email them an
 * enroll pitch, and route their magic-link login into an empty shadow account.
 *
 * Phase 1 therefore changes only READERS, and every change has the same property:
 *
 *   **it is a no-op against today's data, and becomes the protection once the writers stop.**
 *
 * The no-op holds because no row can currently be both `payment_status='paid'` and
 * `enrollment_type='explorer'` - the rewrite guarantees it. That is what makes this
 * shippable on its own, ahead of Phase 2, with no flag day and no intermediate state in
 * which the system is wrong.
 *
 * WHAT THIS FILE PROVES, and what it does not. The ranking rule is pure, so it is tested
 * behaviourally - driven with real inputs, including the shape that cannot exist yet. The
 * other twelve sites are SQL strings and query predicates with no seam to drive without a
 * database, so they are pinned as SOURCE-TEXT assertions, declared as such, following the
 * population-and-determination pattern of `writerPairTripwires.test.ts`. Each carries its
 * own expected predicate rather than a generic "mentions paid somewhere" match, so removing
 * a term fails this test by name. Comments are stripped before scanning, because this
 * change added prose that discusses `payment_status` to nearly every one of these files and
 * a guard that reads its own explanation measures nothing.
 */

const SRC = path.resolve(__dirname, '../..');

/** Same stripper as writerPairTripwires: block comments, then line comments. `[^\r\n]*`
 *  rather than `.*` because these files are CRLF here and JS `.` does not match `\r`. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ');

const codeOf = (rel: string): string =>
  stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8'));

/**
 * The population: every reader that branched on `enrollment_type === 'explorer'` in a way
 * that meant "is currently free", with the predicate that now makes it origin-blind.
 *
 * `enrollmentPick.ts` is deliberately absent - it is covered behaviourally below, which is
 * strictly better than pinning its text.
 */
const ORIGIN_BLIND_READERS: Array<{ rel: string; what: string; expect: string }> = [
  {
    rel: 'services/access/contentEntitlement.ts',
    what: 'the live Week-0 paywall; gating a payer here also flips ~70 frontend surfaces',
    expect: 'isExplorer && !paid',
  },
  {
    rel: 'services/subscriptionAnalyticsService.ts',
    what: 'fetchExplorerCounts - "still in their free trial" must not include a payer',
    expect: "e.payment_status IS DISTINCT FROM 'paid'",
  },
  {
    rel: 'services/explorerRosterService.ts',
    what: 'the free-Explorer revenue roster an operator uses for conversion targeting',
    expect: "e.payment_status IS DISTINCT FROM 'paid'",
  },
  {
    rel: 'services/subscriptionRosterService.ts',
    what: 'deposit-holder drill-down; contracted to match fetchExplorerCounts exactly',
    expect: "e.payment_status IS DISTINCT FROM 'paid'",
  },
  {
    rel: 'services/cohortService.ts',
    what: 'getDashboardStats paidEnrollments / totalEnrollments / pendingInvoice',
    expect: 'notFreeExplorer',
  },
  {
    rel: 'services/explorerGrowth/explorerIdentityBridge.ts',
    what: 'defines the whole Explorer Growth population, which the Governor can email',
    expect: "payment_status: { [Op.ne]: 'paid' }",
  },
  {
    rel: 'services/freeSignupService.ts',
    what: 'the anti-conscription guard at registration',
    expect: "enrollment.payment_status !== 'paid'",
  },
  {
    rel: 'services/enrollmentService.ts',
    what: 'retireRedundantExplorerAccounts must never withdraw a paid seat',
    expect: "stray.payment_status === 'paid'",
  },
  {
    rel: 'services/paymentReconciliationService.ts',
    what: 'a real paid seat must not be mistaken for a free-preview duplicate',
    expect: "c.payment_status === 'paid'",
  },
  {
    rel: 'services/subscriptionService.ts',
    what: 'needs_subscription must not be shown to someone who has paid',
    expect: "payment_status !== 'paid'",
  },
  {
    rel: 'services/cape/capeTodayPlanService.ts',
    what: 'isCohortLearner decides the long plan vs the short free one',
    expect: "row.payment_status === 'paid'",
  },
  {
    rel: 'scripts/srsDistributionReport.ts',
    what: 'sales-readiness distribution over free Explorers',
    expect: "payment_status IS DISTINCT FROM 'paid'",
  },
  {
    rel: 'services/timeline/feedControlService.ts',
    what: 'the " · Free" label in the simulator subject picker',
    expect: "e.payment_status !== 'paid'",
  },
];

describe('Phase 1: readers are origin-blind (source-text pins)', () => {
  it('pins 13 readers, so a newcomer or a removal is a failed build', () => {
    expect(ORIGIN_BLIND_READERS).toHaveLength(13);
    const rels = ORIGIN_BLIND_READERS.map((r) => r.rel);
    expect(new Set(rels).size).toBe(rels.length); // no duplicate determinations
  });

  it.each(ORIGIN_BLIND_READERS.map((r) => [r.rel, r.expect, r.what] as const))(
    '%s carries its paid term (%s)',
    (rel, expected) => {
      expect(codeOf(rel)).toContain(expected);
    },
  );

  // The removal, pinned in the other direction. `fetchPayingMembers` asked
  // `payment_status='paid' AND enrollment_type != 'explorer'`, and that second term is what
  // would have dropped every upgrader out of MRR, ARR, ARPU and collectibleMrr. It must not
  // come back, and "we deleted it" is not a claim a presence test can make.
  it('fetchPayingMembers no longer excludes by origin', () => {
    const code = codeOf('services/subscriptionAnalyticsService.ts');
    expect(code).not.toContain("e.enrollment_type != 'explorer'");
    expect(code).toContain("WHERE e.payment_status = 'paid' AND e.status = 'active'");
  });

  // Positive control. Source-text assertions are worth only as much as the proof that they
  // can fail: without this, a typo'd path or a stripper that ate the whole file would make
  // every expectation above pass vacuously.
  it('the matcher and the stripper would both catch a missing term', () => {
    const withTerm = "WHERE e.enrollment_type = 'explorer'\n  AND e.payment_status IS DISTINCT FROM 'paid'";
    const withoutTerm = "WHERE e.enrollment_type = 'explorer'";
    const onlyInAComment = "// AND e.payment_status IS DISTINCT FROM 'paid'\nWHERE e.enrollment_type = 'explorer'";

    expect(stripComments(withTerm)).toContain("e.payment_status IS DISTINCT FROM 'paid'");
    expect(stripComments(withoutTerm)).not.toContain("e.payment_status IS DISTINCT FROM 'paid'");
    // The trap this change is most exposed to: the term present only in the prose that
    // explains it. Stripped source must not satisfy the assertion.
    expect(stripComments(onlyInAComment)).not.toContain("e.payment_status IS DISTINCT FROM 'paid'");
  });

  it('every pinned file exists and is non-trivial', () => {
    for (const { rel } of ORIGIN_BLIND_READERS) {
      const abs = path.join(SRC, rel);
      expect(fs.existsSync(abs)).toBe(true);
      expect(fs.readFileSync(abs, 'utf8').length).toBeGreaterThan(200);
    }
  });
});

describe('pickBestEnrollment: paid outranks origin', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'x',
    enrollment_type: 'standard',
    payment_status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    communityMember: null,
    ...over,
  });

  // THE regression. After Phase 2 this shape is routine: someone who signed up free and
  // then paid. Under the old term order (origin above payment) the unpaid 'standard' row
  // won, which is the documented shadow-account incident with the roles reversed - the
  // student's login lands on a row holding none of their paid access.
  it('a PAID explorer-origin row beats an UNPAID standard row', () => {
    const paidExplorer = row({ id: 'paid-explorer', enrollment_type: 'explorer', payment_status: 'paid' });
    const unpaidStandard = row({ id: 'unpaid-standard' });

    expect(pickBestEnrollment([paidExplorer, unpaidStandard])?.id).toBe('paid-explorer');
    // Order-independent: a sort that only works one way round is not a rule.
    expect(pickBestEnrollment([unpaidStandard, paidExplorer])?.id).toBe('paid-explorer');
  });

  // The no-op proof. These are the only three shapes reachable today, and the swap must not
  // reorder them. If this fails, the change is not the no-op it is sold as.
  it('leaves the three shapes reachable TODAY in their existing order', () => {
    const paidStandard = row({ id: 'paid-standard', payment_status: 'paid' });
    const unpaidStandard = row({ id: 'unpaid-standard' });
    const freeExplorer = row({ id: 'free-explorer', enrollment_type: 'explorer' });

    const perms: Array<Array<ReturnType<typeof row>>> = [
      [paidStandard, unpaidStandard, freeExplorer],
      [freeExplorer, unpaidStandard, paidStandard],
      [unpaidStandard, freeExplorer, paidStandard],
    ];
    for (const p of perms) expect(pickBestEnrollment(p)?.id).toBe('paid-standard');

    // ...and the loser ordering below the winner is unchanged too.
    expect(pickBestEnrollment([freeExplorer, unpaidStandard])?.id).toBe('unpaid-standard');
  });

  it('mgmt_role still outranks everything, including a paid row', () => {
    const staffRow = row({ id: 'staff', communityMember: { mgmt_role: 'admin' } });
    const paidStandard = row({ id: 'paid-standard', payment_status: 'paid' });
    expect(pickBestEnrollment([paidStandard, staffRow])?.id).toBe('staff');
  });

  it('recency is still the last tiebreak, not the first', () => {
    const olderPaid = row({ id: 'older-paid', payment_status: 'paid', created_at: '2025-01-01T00:00:00Z' });
    const newerUnpaid = row({ id: 'newer-unpaid', created_at: '2026-06-01T00:00:00Z' });
    expect(pickBestEnrollment([newerUnpaid, olderPaid])?.id).toBe('older-paid');

    const newerPaid = row({ id: 'newer-paid', payment_status: 'paid', created_at: '2026-06-01T00:00:00Z' });
    expect(pickBestEnrollment([olderPaid, newerPaid])?.id).toBe('newer-paid');
  });

  it('empty input yields null', () => {
    expect(pickBestEnrollment([])).toBeNull();
  });
});
