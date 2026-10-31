/**
 * /admin/revenue must say what it does not know.
 *
 * ── THE TWO DEFECTS THESE TESTS PIN ──────────────────────────────────────────
 *
 * 1. MRR COUNTED MEMBERS WHO HAD STOPPED PAYING, SILENTLY.
 *
 *    Renewal here is a manual checkout, not an auto-charge, so a member whose
 *    period has ended simply stays in the paying set until someone notices.
 *    `subscriptionAnalyticsService` adds every annual/monthly member to `mrr`
 *    and detects the lapse twenty lines later, pushing it only into an
 *    "attention" list — it never decrements the KPI.
 *
 *    On 2026-10-31 that was 9 lapsed members inside a $6,765 MRR: roughly
 *    $1,791/mo, and about $21,500 of the $81,180 ARR beside it. The tile
 *    carried no caveat, and ARR is the figure that gets quoted.
 *
 *    The VALUES are deliberately unchanged — redefining MRR is a pricing
 *    decision, not a frontend one. What these tests require is that the page
 *    cannot show the figure without also showing the overstatement.
 *
 * 2. "213% CARRY OVER FROM THE BUCKET ABOVE."
 *
 *    The tenure panel's caption described retention. Retention cannot exceed
 *    100%, and the panel was rendering 114% and 213%. The number was never
 *    wrong — it compares two tenure buckets AS THEY STAND TODAY, and those hold
 *    different cohorts — but the caption promised something it could not be.
 *
 * ── WHAT EACH TEST WOULD CATCH IF IT REGRESSED ───────────────────────────────
 *
 *   1  MRR names the collectible figure and the lapsed one. Losing this puts
 *      the uncaveated number back on the page.
 *   2  ARR carries it too. ARR is derived from the same inflated set and is the
 *      likelier number to be quoted externally, so covering only MRR would miss
 *      the one that actually travels.
 *   3  a clean book says nothing about lapses — the caveat must not become
 *      permanent furniture that everyone learns to read past.
 *   4  the caption makes no retention or carry-over claim.
 *   5  a ratio over 100% still renders, and explains itself rather than being
 *      hidden. Suppressing it would trade a misleading number for a missing one.
 *
 * Uses the `createRoot` + `act` pattern already proven in this package — there
 * is no @testing-library in this workspace and adding one for a test would be a
 * drive-by install.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import SubscriptionKpiRow from '../SubscriptionKpiRow';
import TenureRetentionFunnel from '../TenureRetentionFunnel';
import type { SubscriptionKpis, TenureBucket, SubscriptionPlanKey } from '../../../../services/subscriptionAnalyticsApi';

// The funnel's drill-downs fetch; nothing here opens one, but the import would
// still pull the axios client into the test environment.
jest.mock('../../../../services/subscriptionAnalyticsApi', () => ({
  __esModule: true,
  getTenureBucketRoster: () => Promise.resolve([]),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactElement): void {
  act(() => {
    root.render(node);
  });
}

const kpis = (over: Partial<SubscriptionKpis> = {}): SubscriptionKpis => ({
  mrr: 6765,
  arr: 81180,
  activeSubscribers: 35,
  compedSeats: 10,
  otherPaidCount: 2,
  staffCount: 67,
  arpu: 193.29,
  lapsedMrr: 1791,
  lapsedSubscribers: 9,
  collectibleMrr: 4974,
  ...over,
});

const emptyByPlan = (): Record<SubscriptionPlanKey, number> => ({
  annual: 0, monthly: 0, comp: 0, deposit_holder: 0, other: 0, staff: 0,
});

const bucket = (over: Partial<TenureBucket>): TenureBucket => ({
  label: 'Month 1',
  count: 0,
  byPlan: emptyByPlan(),
  snapshotRatioPct: null,
  ...over,
});

describe('the MRR tiles cannot hide a lapsed member', () => {
  it('states the collectible figure and what the lapsed members are worth', () => {
    render(<SubscriptionKpiRow kpis={kpis()} />);
    const text = container.textContent ?? '';

    // The headline is unchanged — nothing moves under someone reading the page.
    expect(text).toContain('$6,765');
    // ...but it can no longer be read as money still arriving.
    expect(text).toContain('$4,974');
    expect(text).toContain('$1,791');
    expect(text).toContain('9 lapsed');
  });

  it('carries the caveat onto ARR, the number most likely to leave the building', () => {
    render(<SubscriptionKpiRow kpis={kpis()} />);
    const text = container.textContent ?? '';

    expect(text).toContain('$81,180');
    // 1791 x 12. Stated in annual terms beside an annual figure, because asking
    // someone to multiply in their head is how the caveat gets skipped.
    expect(text).toContain('$21,492');
  });

  it('says nothing about lapses when there are none', () => {
    render(<SubscriptionKpiRow kpis={kpis({ lapsedMrr: 0, lapsedSubscribers: 0, collectibleMrr: 6765 })} />);
    const text = container.textContent ?? '';

    // A warning that is always on is furniture, and furniture is not read.
    expect(text).not.toContain('lapsed');
    expect(text).toContain('Monthly recurring revenue');
  });
});

describe('the tenure panel does not claim to measure retention', () => {
  const buckets: TenureBucket[] = [
    bucket({ label: 'Explorer', count: 740 }),
    bucket({ label: 'Month 1', count: 7, snapshotRatioPct: 1 }),
    bucket({ label: 'Month 2', count: 8, snapshotRatioPct: 114 }),
    bucket({ label: 'Month 3', count: 17, snapshotRatioPct: 213 }),
  ];

  it('makes no carry-over or retention promise in its caption', () => {
    render(<TenureRetentionFunnel buckets={buckets} />);
    const text = (container.textContent ?? '').toLowerCase();

    // The exact words that made 213% read as impossible rather than merely odd.
    expect(text).not.toContain('carry over');

    // "retention" may still appear — but ONLY inside the clause that denies it.
    // Counting the mentions rather than banning the word is the difference
    // between pinning the claim and pinning the vocabulary: a future caption
    // saying "retention by month" would pass a naive absence check on "not
    // retention" alone, and fails this.
    const mentions = text.split('retention').length - 1;
    const negated = text.split('not retention').length - 1;
    expect(mentions).toBeGreaterThan(0);
    expect(negated).toBe(mentions);

    expect(text).toContain('exceed 100%');
  });

  it('still shows a ratio above 100% and explains it rather than hiding it', () => {
    render(<TenureRetentionFunnel buckets={buckets} />);
    const text = container.textContent ?? '';

    expect(text).toContain('(213%)');

    // The explanation names the bucket being compared against, so the figure
    // reads as the comparison it is instead of floating free.
    const explained = Array.from(container.querySelectorAll('[title]')).map((el) => el.getAttribute('title') ?? '');
    const ratioTitle = explained.find((t) => t.startsWith('213%'));
    expect(ratioTitle).toBeDefined();
    expect(ratioTitle).toContain('Month 2');
    expect(ratioTitle).toContain('not retention');
  });
});
