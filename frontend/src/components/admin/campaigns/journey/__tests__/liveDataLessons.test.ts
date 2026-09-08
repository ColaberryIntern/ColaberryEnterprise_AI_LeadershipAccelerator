/**
 * Regressions for the four defects that ONLY the live production payload exposed.
 *
 * Each case below is a real shape observed in the 2026-09-08 capture of
 * `GET /api/admin/campaign-intelligence/graph`, reduced to the smallest graph that
 * reproduces it. The production data itself is deliberately not committed; what is
 * committed is the lesson it taught.
 */

import {
  AGGREGATE_OTHER_CAMPAIGNS,
  buildSankeyView,
} from '../campaignSankeyAdapter';
import { findBestOpportunity, findFlowMismatch, findLargestLeak } from '../journeyMetrics';
import type { CampaignGraphData } from '../../../../../services/intelligenceApi';

const node = (id: string, type: string, label: string, count: number) =>
  ({ id, type, label, count, metrics: {} }) as any;
const edge = (from: string, to: string, volume: number) =>
  ({ from, to, label: 'moves', volume }) as any;

describe('lesson 1 — an edge may reference a node the payload never defines', () => {
  /**
   * Live: `campaign_4ca4c35d-…` appeared in two edges carrying 1 lead each, but was
   * absent from `nodes` — a campaign deleted while its edges outlived it. The old
   * behaviour dropped those links when the endpoint failed to resolve, so the
   * diagram silently drew 58,753 of the payload's 58,755.
   */
  const data = {
    nodes: [
      node('entry_x', 'entry', 'Entry', 10),
      node('outcome_enrolled', 'outcome', 'Enrolled', 10),
    ],
    edges: [
      edge('entry_x', 'outcome_enrolled', 10),
      edge('campaign_deleted', 'outcome_enrolled', 1),
      edge('campaign_deleted', 'outcome_paid', 1),
    ],
  } as CampaignGraphData;

  it('loses no volume to a dangling reference', () => {
    const view = buildSankeyView(data);
    expect(view.totalLinkVolume).toBe(12);
  });

  it('draws a placeholder rather than swallowing the node', () => {
    const view = buildSankeyView(data);
    expect(view.synthesizedNodes).toBeGreaterThan(0);
    const ghost = view.nodes.find((n) => n.id === 'campaign_deleted')!;
    expect(ghost).toBeDefined();
    expect(ghost.name).toBe('Unknown node');
    // Nothing to drill into — there is no such campaign any more.
    expect(ghost.drillable).toBe(false);
  });

  it('still points every link at a node it drew', () => {
    const view = buildSankeyView(data);
    for (const l of view.links) {
      expect(view.nodes[l.source]).toBeDefined();
      expect(view.nodes[l.target]).toBeDefined();
    }
  });
});

describe('lesson 2 — counts are people, volumes are journeys, and they disagree', () => {
  /**
   * Live: "Alumni Re-Engagement" reported 4 leads and 64 journeys into outcomes;
   * "Never Visited" reported 3,775 leads against 24,610 arriving journeys. Dividing
   * one by the other produced a "364.1%" conversion rate on the insight panel.
   */
  const data = {
    nodes: [
      node('entry_x', 'entry', 'Entry', 100),
      node('campaign_small', 'campaign', 'Alumni Re-Engagement', 4),
      node('outcome_enrolled', 'outcome', 'Enrolled', 64),
    ],
    edges: [
      edge('entry_x', 'campaign_small', 100),
      edge('campaign_small', 'outcome_enrolled', 64),
    ],
  } as CampaignGraphData;

  it('never reports a conversion rate above 100%', () => {
    const view = buildSankeyView(data, { maxCampaigns: 99, minCampaignShare: 0 });
    const best = findBestOpportunity(view);
    if (best && best.sufficient) {
      const pct = Number(/(\d+\.\d+)%/.exec(best.title)?.[1] ?? '0');
      expect(pct).toBeLessThanOrEqual(100);
    }
    // The specific regression: it must not say 364.1%.
    expect(best?.title ?? '').not.toMatch(/364/);
  });

  it('declines to rank rather than clamping a contradiction to a perfect score', () => {
    const view = buildSankeyView(data, { maxCampaigns: 99, minCampaignShare: 0 });
    const best = findBestOpportunity(view)!;
    expect(best.sufficient).toBe(false);
    expect(best.title).toMatch(/No path can be ranked|not enough volume/i);
  });

  it('reports the mismatch instead of hiding it', () => {
    const view = buildSankeyView(data, { maxCampaigns: 99, minCampaignShare: 0 });
    const mismatch = findFlowMismatch(view)!;
    expect(mismatch).toBeDefined();
    expect(mismatch.kind).toBe('quality');
    // 100 journeys arrive and 64 leave; the gap is measured against the larger of
    // the two, because a node cannot hold fewer people than either side of its flow.
    expect(mismatch.evidence).toMatch(/4 leads across 100 journeys/);
  });

  it('says nothing when flow and population do agree', () => {
    const clean = {
      nodes: [
        node('entry_x', 'entry', 'Entry', 10),
        node('outcome_enrolled', 'outcome', 'Enrolled', 10),
      ],
      edges: [edge('entry_x', 'outcome_enrolled', 10)],
    } as CampaignGraphData;
    expect(findFlowMismatch(buildSankeyView(clean))).toBeNull();
  });

  it('describes the leak in journeys, not people', () => {
    const view = buildSankeyView(data, { maxCampaigns: 99, minCampaignShare: 0 });
    const leak = findLargestLeak(view);
    if (leak) {
      expect(leak.title).toMatch(/journeys/);
      expect(leak.title).not.toMatch(/\bleads stop\b/);
    }
  });
});

describe('lesson 3 — a count cap alone does not make a chart readable', () => {
  /**
   * Live: one campaign held 9,658 leads and the tail held 12 to 18 each. Taking the
   * top eight still drew five nodes whose bands were invisible and whose labels
   * stacked on one another.
   */
  const many = {
    nodes: [
      node('entry_x', 'entry', 'Entry', 10000),
      node('campaign_big', 'campaign', 'Alumni AI Champion', 9658),
      ...Array.from({ length: 12 }, (_, i) =>
        node(`campaign_t${i}`, 'campaign', `Tiny ${i}`, 12 + i),
      ),
    ],
    edges: [
      edge('entry_x', 'campaign_big', 9658),
      ...Array.from({ length: 12 }, (_, i) => edge('entry_x', `campaign_t${i}`, 12 + i)),
    ],
  } as CampaignGraphData;

  it('groups campaigns too small to see even when under the count cap', () => {
    const view = buildSankeyView(many, { maxCampaigns: 8, minCampaignShare: 0.01 });
    const drawn = view.nodes.filter((n) => n.nodeType === 'campaign' && !n.aggregate);
    expect(drawn.map((n) => n.fullName)).toEqual(['Alumni AI Champion']);
    expect(view.collapsedCampaigns).toBe(12);
  });

  it('conserves volume through share-based grouping', () => {
    const all = buildSankeyView(many, { maxCampaigns: 99, minCampaignShare: 0 });
    const grouped = buildSankeyView(many, { maxCampaigns: 8, minCampaignShare: 0.01 });
    expect(grouped.totalLinkVolume).toBe(all.totalLinkVolume);
    const other = grouped.nodes.find((n) => n.id === AGGREGATE_OTHER_CAMPAIGNS)!;
    expect(other.value).toBe(
      Array.from({ length: 12 }, (_, i) => 12 + i).reduce((a, b) => a + b, 0),
    );
  });

  it('never groups every campaign, which would silently disable the view control', () => {
    // All equal, so all sit below a 1% share of nothing in particular — the guard
    // is what stops "Campaigns" collapsing into a single node and looking broken.
    const even = {
      nodes: [
        node('entry_x', 'entry', 'Entry', 300),
        ...Array.from({ length: 200 }, (_, i) => node(`campaign_e${i}`, 'campaign', `E${i}`, 1)),
      ],
      edges: Array.from({ length: 200 }, (_, i) => edge('entry_x', `campaign_e${i}`, 1)),
    } as CampaignGraphData;
    const view = buildSankeyView(even, { maxCampaigns: 8, minCampaignShare: 0.01 });
    const drawn = view.nodes.filter((n) => n.nodeType === 'campaign' && !n.aggregate);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('leaves a small set alone when everything is visible', () => {
    const few = {
      nodes: [
        node('entry_x', 'entry', 'Entry', 300),
        node('campaign_a', 'campaign', 'A', 100),
        node('campaign_b', 'campaign', 'B', 100),
        node('campaign_c', 'campaign', 'C', 100),
      ],
      edges: [
        edge('entry_x', 'campaign_a', 100),
        edge('entry_x', 'campaign_b', 100),
        edge('entry_x', 'campaign_c', 100),
      ],
    } as CampaignGraphData;
    const view = buildSankeyView(few, { maxCampaigns: 8, minCampaignShare: 0.01 });
    expect(view.collapsedCampaigns).toBe(0);
  });
});

describe('lesson 4 — a whole channel can have no outgoing edges at all', () => {
  /**
   * Live: `outreach_sms` reported 1,501 contacted leads and NOT ONE outgoing edge —
   * no engagement state is recorded for SMS at all. A sink mid-funnel must still
   * render, and must be counted as the drop-off it is.
   */
  const data = {
    nodes: [
      node('src_a', 'source', 'Cold Outbound', 2000),
      node('outreach_sms', 'outreach', 'SMS Outreach', 1501),
      node('outreach_email', 'outreach', 'Email Outreach', 499),
      node('engagement_engaged', 'engagement', 'Engaged', 499),
    ],
    edges: [
      edge('src_a', 'outreach_sms', 1501),
      edge('src_a', 'outreach_email', 499),
      edge('outreach_email', 'engagement_engaged', 499),
    ],
  } as CampaignGraphData;

  it('still draws the channel that goes nowhere', () => {
    const view = buildSankeyView(data);
    expect(view.nodes.find((n) => n.id === 'outreach_sms')).toBeDefined();
    expect(view.totalLinkVolume).toBe(2499);
  });

  it('counts it as the largest leak', () => {
    const leak = findLargestLeak(buildSankeyView(data))!;
    expect(leak.focusNodeId).toBe('outreach_sms');
    expect(leak.title).toContain('1,501');
  });
});
