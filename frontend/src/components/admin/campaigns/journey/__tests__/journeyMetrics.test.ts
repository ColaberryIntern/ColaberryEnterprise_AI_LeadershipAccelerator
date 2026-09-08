import { buildSankeyView } from '../campaignSankeyAdapter';
import {
  buildKpis,
  deriveInsights,
  findBestOpportunity,
  findDataWarning,
  findLargestLeak,
  MIN_SAMPLE_FOR_RATE,
  safeRate,
} from '../journeyMetrics';
import type { CampaignGraphData } from '../../../../../services/intelligenceApi';

const node = (id: string, type: string, label: string, count: number) =>
  ({ id, type, label, count, metrics: {} }) as any;
const edge = (from: string, to: string, volume: number) =>
  ({ from, to, label: 'moves', volume }) as any;

const validation = (over: Record<string, unknown> = {}) =>
  ({
    total_leads: 1000,
    leads_with_first_touch: 200,
    leads_unengaged: 500,
    leads_in_campaigns: 180,
    leads_enrolled: 60,
    leads_paid: 15,
    leads_with_visitor: 220,
    leads_contacted: 400,
    leads_contacted_no_visit: 300,
    leads_engaged: 120,
    leads_opened: 80,
    leads_ignored: 200,
    warnings: [],
    ...over,
  }) as any;

describe('safeRate', () => {
  it('computes a percentage', () => {
    expect(safeRate(25, 100)).toBe(25);
  });

  it('returns null rather than Infinity or 0 when the denominator is zero', () => {
    expect(safeRate(5, 0)).toBeNull();
    expect(safeRate(0, 0)).toBeNull();
  });

  it('returns null for missing or non-finite inputs', () => {
    expect(safeRate(null, 100)).toBeNull();
    expect(safeRate(5, null)).toBeNull();
    expect(safeRate(Number.NaN, 100)).toBeNull();
    expect(safeRate(5, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('buildKpis', () => {
  it('reads the five headline figures from validation', () => {
    const kpis = buildKpis({ nodes: [], edges: [], validation: validation() } as CampaignGraphData);
    const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
    expect(by.total.value).toBe(1000);
    expect(by.reached.value).toBe(400);
    expect(by.engaged.value).toBe(120);
    expect(by.enrolled.value).toBe(60);
    expect(by.paid.value).toBe(15);
  });

  it('derives each rate from its own denominator', () => {
    const kpis = buildKpis({ nodes: [], edges: [], validation: validation() } as CampaignGraphData);
    const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
    expect(by.reached.rate).toBeCloseTo(40, 5); // 400/1000
    expect(by.engaged.rate).toBeCloseTo(30, 5); // 120/400 — of REACHED, not of total
    expect(by.enrolled.rate).toBeCloseTo(6, 5); // 60/1000
    expect(by.paid.rate).toBeCloseTo(25, 5); // 15/60 — of ENROLLED
  });

  it('reports rates as null when the denominator is zero', () => {
    const kpis = buildKpis({
      nodes: [],
      edges: [],
      validation: validation({ total_leads: 0, leads_contacted: 0, leads_enrolled: 0 }),
    } as CampaignGraphData);
    const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
    expect(by.reached.rate).toBeNull();
    expect(by.engaged.rate).toBeNull();
    expect(by.paid.rate).toBeNull();
  });

  it('distinguishes "not reported" from zero', () => {
    // No validation at all: values must be null, so the UI shows an em dash
    // rather than claiming the funnel contains zero leads.
    const kpis = buildKpis({ nodes: [], edges: [] } as CampaignGraphData);
    expect(kpis.every((k) => k.value === null)).toBe(true);

    const zeroed = buildKpis({
      nodes: [],
      edges: [],
      validation: validation({ leads_paid: 0 }),
    } as CampaignGraphData);
    expect(zeroed.find((k) => k.key === 'paid')!.value).toBe(0);
  });

  it('survives a null payload', () => {
    expect(buildKpis(null)).toHaveLength(5);
    expect(buildKpis(undefined).every((k) => k.value === null)).toBe(true);
  });
});

describe('findLargestLeak', () => {
  it('finds the node where the most leads stop, by arrivals minus departures', () => {
    const view = buildSankeyView({
      nodes: [
        node('outreach_email', 'outreach', 'Email Outreach', 400),
        node('engagement_ignored', 'engagement', 'Ignored', 280),
        node('engagement_engaged', 'engagement', 'Engaged', 120),
        node('visitor_site', 'visitor', 'Site Visitors', 120),
      ],
      edges: [
        edge('outreach_email', 'engagement_ignored', 280),
        edge('outreach_email', 'engagement_engaged', 120),
        edge('engagement_engaged', 'visitor_site', 120),
      ],
    } as CampaignGraphData);

    const leak = findLargestLeak(view)!;
    expect(leak.kind).toBe('leak');
    expect(leak.focusNodeId).toBe('engagement_ignored');
    expect(leak.title).toContain('280');
    expect(leak.evidence).toContain('280');
    expect(leak.sufficient).toBe(true);
  });

  it('never calls an outcome node a leak', () => {
    const view = buildSankeyView({
      nodes: [
        node('campaign_a', 'campaign', 'A', 100),
        node('outcome_paid', 'outcome', 'Paid', 100),
      ],
      edges: [edge('campaign_a', 'outcome_paid', 100)],
    } as CampaignGraphData);
    // Paid absorbs 100 and passes none on, but arriving at Paid is the goal.
    expect(findLargestLeak(view)).toBeNull();
  });

  it('returns null when nothing leaks', () => {
    const view = buildSankeyView({
      nodes: [
        node('src_a', 'source', 'A', 10),
        node('outreach_email', 'outreach', 'Email', 10),
        node('outcome_enrolled', 'outcome', 'Enrolled', 10),
      ],
      edges: [edge('src_a', 'outreach_email', 10), edge('outreach_email', 'outcome_enrolled', 10)],
    } as CampaignGraphData);
    expect(findLargestLeak(view)).toBeNull();
  });

  it('returns null for an empty view', () => {
    expect(findLargestLeak(buildSankeyView(null))).toBeNull();
  });
});

describe('findBestOpportunity — minimum-sample protection', () => {
  const build = (bigPop: number, bigConv: number, tinyPop: number, tinyConv: number) =>
    buildSankeyView({
      nodes: [
        node('campaign_big', 'campaign', 'Big Campaign', bigPop),
        node('campaign_tiny', 'campaign', 'Tiny Campaign', tinyPop),
        node('outcome_enrolled', 'outcome', 'Enrolled', bigConv + tinyConv),
        node('entry_x', 'entry', 'Entry', bigPop + tinyPop),
      ],
      edges: [
        edge('campaign_big', 'outcome_enrolled', bigConv),
        edge('campaign_tiny', 'outcome_enrolled', tinyConv),
      ],
    } as CampaignGraphData);

  it('does not crown a tiny sample with a flattering rate', () => {
    // Tiny converts at 100% on 3 leads; Big at 20% on 200. Big must win.
    const view = build(200, 40, 3, 3);
    const best = findBestOpportunity(view)!;
    expect(best.title).toContain('Big Campaign');
    expect(best.sufficient).toBe(true);
  });

  it('says so plainly when every candidate is below the floor', () => {
    const view = build(5, 5, 3, 3);
    const best = findBestOpportunity(view)!;
    expect(best.sufficient).toBe(false);
    expect(best.title).toMatch(/not enough volume/i);
    expect(best.detail).toContain(String(MIN_SAMPLE_FOR_RATE));
  });

  it('admits exactly the floor value', () => {
    const view = build(MIN_SAMPLE_FOR_RATE, 5, 2, 2);
    expect(findBestOpportunity(view)!.sufficient).toBe(true);
  });

  it('returns null when no path reaches an outcome', () => {
    const view = buildSankeyView({
      nodes: [node('src_a', 'source', 'A', 10), node('outreach_email', 'outreach', 'Email', 10)],
      edges: [edge('src_a', 'outreach_email', 10)],
    } as CampaignGraphData);
    expect(findBestOpportunity(view)).toBeNull();
  });

  it('shows the arithmetic behind its claim', () => {
    const best = findBestOpportunity(build(200, 40, 3, 3))!;
    expect(best.evidence).toMatch(/40.*200.*20\.0%/);
  });
});

describe('findDataWarning', () => {
  it('reports the graph engine’s own warning rather than inventing one', () => {
    const view = buildSankeyView(null);
    const warn = findDataWarning(
      {
        nodes: [],
        edges: [],
        validation: validation({ warnings: ['All 25 campaigns belong to Colaberry Enterprise.'] }),
      } as CampaignGraphData,
      view,
    )!;
    expect(warn.detail).toContain('Colaberry Enterprise');
  });

  it('counts multiple warnings', () => {
    const warn = findDataWarning(
      { nodes: [], edges: [], validation: validation({ warnings: ['a', 'b', 'c'] }) } as CampaignGraphData,
      buildSankeyView(null),
    )!;
    expect(warn.title).toContain('3');
    expect(warn.evidence).toContain('2 further');
  });

  it('discloses grouping and undrawn paths when the engine reported nothing', () => {
    const data = {
      nodes: [
        node('entry_x', 'entry', 'Entry', 30),
        node('campaign_a', 'campaign', 'A', 10),
        node('campaign_b', 'campaign', 'B', 20),
        node('entry_z', 'entry', 'Z', 0),
      ],
      edges: [
        edge('entry_x', 'campaign_a', 10),
        edge('entry_x', 'campaign_b', 20),
        edge('entry_x', 'entry_z', 0),
      ],
      validation: validation({ warnings: [] }),
    } as CampaignGraphData;
    const view = buildSankeyView(data, { journeyView: 'firstTouch' });
    const warn = findDataWarning(data, view)!;
    expect(warn.detail).toMatch(/grouped/i);
    expect(warn.detail).toMatch(/no leads/i);
  });

  it('returns null when there is genuinely nothing to disclose', () => {
    const data = {
      nodes: [node('src_a', 'source', 'A', 10), node('outreach_email', 'outreach', 'Email', 10)],
      edges: [edge('src_a', 'outreach_email', 10)],
      validation: validation({ warnings: [] }),
    } as CampaignGraphData;
    expect(findDataWarning(data, buildSankeyView(data))).toBeNull();
  });
});

describe('deriveInsights', () => {
  it('drops nothing and fabricates nothing', () => {
    const data = {
      nodes: [
        node('outreach_email', 'outreach', 'Email', 400),
        node('engagement_ignored', 'engagement', 'Ignored', 280),
        node('engagement_engaged', 'engagement', 'Engaged', 120),
        node('outcome_enrolled', 'outcome', 'Enrolled', 30),
      ],
      edges: [
        edge('outreach_email', 'engagement_ignored', 280),
        edge('outreach_email', 'engagement_engaged', 120),
        edge('engagement_engaged', 'outcome_enrolled', 30),
      ],
      validation: validation({ warnings: ['attribution incomplete'] }),
    } as CampaignGraphData;
    const insights = deriveInsights(data, buildSankeyView(data));
    expect(insights.map((i) => i.kind)).toEqual(['leak', 'opportunity', 'quality']);
    expect(insights.every((i) => i.evidence.length > 0)).toBe(true);
  });

  it('returns an empty list rather than filler for an empty dataset', () => {
    expect(deriveInsights(null, buildSankeyView(null))).toEqual([]);
  });
});
