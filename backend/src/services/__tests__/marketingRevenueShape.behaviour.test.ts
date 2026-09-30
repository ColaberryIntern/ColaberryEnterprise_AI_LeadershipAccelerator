/**
 * BEHAVIOURAL proof that no revenue number is invented — the test the source-grep could not be.
 *
 * The first version of this guard read the service files as text and asserted the string
 * `PRICE_PER_ENROLLMENT` and the literal `4500` were gone. An independent verifier killed it in
 * one move: reintroduce the same fabrication under a different name —
 *
 *     const AVG_DEAL_VALUE = 4499;
 *     total_revenue: enrollments * AVG_DEAL_VALUE,
 *
 * — and the suite stayed green, `tsc` stayed clean, and a fabricated figure flowed straight
 * back into `/api/admin/marketing/campaigns`. A guard keyed on an identifier only ever catches
 * a literal revert; it cannot catch the thing it is actually for.
 *
 * So this suite asserts on the RETURNED OBJECT instead. It pins the exact key set, which means
 * ANY money-shaped field reappearing — under any name, computed from any constant — fails here,
 * because the shape changed. That is a property of the output rather than of the spelling.
 */

const mockQuery = jest.fn();
const mockLogAgent = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

jest.mock('../governanceService', () => ({
  logAgentExecution: (...a: unknown[]) => mockLogAgent(...a),
}));

import { getCampaignMetrics } from '../marketingAnalyticsService';

/** One row shaped like what the real query returns. */
const ROW = {
  campaign_id: 'camp-1',
  campaign_name: 'Open House September',
  campaign_type: 'warm_nurture',
  visitors_count: 120,
  high_intent_count: 30,
  leads_count: 60,
  opens_count: 40,
  clicks_count: 20,
  replies_count: 5,
  strategy_calls: 4,
  total_opens: 55,
  total_clicks: 25,
  enrollments_count: 10,
  funnel_stage: 'consideration',
};

/**
 * Every key `getCampaignMetrics` is allowed to return.
 *
 * Written as an exact set rather than a list of forbidden names. A denylist would have to
 * predict what the next fabricated field gets called; an allowlist does not care.
 */
const ALLOWED_KEYS = [
  'campaign_id', 'campaign_name', 'visitors_count', 'high_intent_count', 'leads_count',
  'opens_count', 'clicks_count', 'replies_count', 'total_opens', 'total_clicks',
  'strategy_calls', 'enrollments_count', 'open_rate', 'click_rate', 'high_intent_pct',
  'conversion_rate', 'visitor_to_lead_pct', 'lead_to_call_pct', 'call_to_enroll_pct',
  'campaign_type', 'unavailable',
  // Added by T016 for objective-aware ranking. Both deliberate: funnel_stage is the objective
  // the ranking ladder is chosen by, and engagement_count is a plain sum of three trusted
  // counts already on the row. This list is exact ON PURPOSE - adding a key here is a
  // conscious act, which is what keeps a renamed fabricated field from sneaking back in.
  'funnel_stage', 'engagement_count',
].sort();

describe('getCampaignMetrics returns no invented money', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([ROW]);
    mockLogAgent.mockResolvedValue(undefined);
  });

  it('returns EXACTLY the permitted keys — any new money field fails here', () => {
    // This is the assertion that kills a renamed constant. It does not know or care what the
    // fabricated field would be called; it only knows the shape it is allowed to have.
    return getCampaignMetrics().then((rows) => {
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(ALLOWED_KEYS);
    });
  });

  it('carries no field whose name looks like money', async () => {
    // A second, independent net. If the allowlist above is ever loosened carelessly, this still
    // catches revenue/spend/roi/cpl-shaped names.
    const [row] = await getCampaignMetrics();
    const moneyish = Object.keys(row).filter((k) =>
      /revenue|spend|cost|roi|roas|budget|price|cpl|cpc|cpm/i.test(k),
    );
    expect(moneyish).toEqual([]);
  });

  it('reports the uncomputable metrics explicitly, with reasons', async () => {
    const [row] = await getCampaignMetrics();
    expect(Array.isArray(row.unavailable)).toBe(true);
    expect(row.unavailable.length).toBeGreaterThan(0);
    for (const u of row.unavailable) {
      expect(typeof u.key).toBe('string');
      expect(u.key.startsWith('marketing.')).toBe(true);
      // A reason that is not a reason is the same defect one level up.
      expect(u.reason.length).toBeGreaterThan(40);
    }
  });

  it('names revenue among what it cannot compute', async () => {
    const [row] = await getCampaignMetrics();
    const keys = row.unavailable.map((u: { key: string }) => u.key);
    expect(keys).toContain('marketing.roas');
    expect(keys).toContain('marketing.ad_spend');
  });

  it('still returns the counts it CAN compute — this is not a blanket refusal', async () => {
    // The failure mode in the opposite direction: refusing to report anything is as useless as
    // inventing everything. Countable things stay countable.
    const [row] = await getCampaignMetrics();
    expect(row.leads_count).toBe(60);
    expect(row.enrollments_count).toBe(10);
    expect(row.open_rate).toBeCloseTo(66.67, 1);
  });

  it('does not select platform or creative from the database', async () => {
    // The query used to `SELECT NULL AS platform, NULL AS creative`, so every row reported a
    // null dimension that looked like missing data rather than an absent capability.
    await getCampaignMetrics();
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).not.toMatch(/NULL\s+AS\s+platform/i);
    expect(sql).not.toMatch(/NULL\s+AS\s+creative/i);
  });

  it('returns an empty list rather than a fabricated row when there is no data', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(getCampaignMetrics()).resolves.toEqual([]);
  });
});
