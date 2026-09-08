import {
  AGGREGATE_ALL_CAMPAIGNS,
  AGGREGATE_OTHER_CAMPAIGNS,
  buildPathRows,
  buildSankeyView,
  stageForNodeType,
} from '../campaignSankeyAdapter';
import type { CampaignGraphData } from '../../../../../services/intelligenceApi';

/** Minimal node/edge builders so each test states only what it is about. */
const node = (id: string, type: string, label: string, count: number, extra: object = {}) =>
  ({ id, type, label, count, metrics: {}, ...extra }) as any;

const edge = (from: string, to: string, volume: number, label = 'moves', velocity?: object) =>
  ({ from, to, label, volume, ...(velocity ? { velocity } : {}) }) as any;

function graph(partial: Partial<CampaignGraphData> = {}): CampaignGraphData {
  return {
    nodes: [],
    edges: [],
    ...partial,
  } as CampaignGraphData;
}

/**
 * The shape the real backend returns: four sources, three channels, three
 * engagement states, two visitor states, entries, campaigns, two outcomes.
 */
function realisticGraph(campaignCount = 2): CampaignGraphData {
  const campaigns = Array.from({ length: campaignCount }, (_, i) =>
    node(`campaign_c${i}`, 'campaign', `Campaign ${i}`, 100 - i * 10, {
      brand_id: i % 2 === 0 ? 'brand-a' : 'brand-b',
      brand_name: i % 2 === 0 ? 'Brand A' : 'Brand B',
    }),
  );
  const campaignEdges = campaigns.flatMap((c, i) => [
    edge('entry_cory_chat', c.id, 100 - i * 10),
    edge(c.id, 'outcome_enrolled', 10 - i),
  ]);

  return graph({
    nodes: [
      node('src_marketing', 'source', 'Marketing', 300),
      node('src_cold_outbound', 'source', 'Cold Outbound', 200),
      node('outreach_email', 'outreach', 'Email Outreach', 400),
      node('engagement_engaged', 'engagement', 'Engaged', 120),
      node('engagement_ignored', 'engagement', 'Ignored', 280),
      node('visitor_site', 'visitor', 'Site Visitors', 120),
      node('visitor_never', 'visitor', 'Never Visited', 100),
      node('entry_cory_chat', 'entry', 'Cory Chat', 120),
      ...campaigns,
      node('outcome_enrolled', 'outcome', 'Enrolled', 19),
      node('outcome_paid', 'outcome', 'Paid', 5),
    ],
    edges: [
      edge('src_marketing', 'outreach_email', 300),
      edge('src_cold_outbound', 'outreach_email', 100),
      edge('outreach_email', 'engagement_engaged', 120),
      edge('outreach_email', 'engagement_ignored', 280),
      edge('engagement_engaged', 'visitor_site', 120),
      edge('engagement_ignored', 'visitor_never', 100),
      edge('visitor_site', 'entry_cory_chat', 120),
      ...campaignEdges,
      edge('outcome_enrolled', 'outcome_paid', 5),
    ],
  });
}

describe('stageForNodeType', () => {
  it('maps every node type the backend emits to its column', () => {
    expect(stageForNodeType('source')).toBe('source');
    expect(stageForNodeType('outreach')).toBe('outreach');
    expect(stageForNodeType('engagement')).toBe('response');
    expect(stageForNodeType('visitor')).toBe('response');
    expect(stageForNodeType('entry')).toBe('journey');
    expect(stageForNodeType('campaign')).toBe('journey');
    expect(stageForNodeType('outcome')).toBe('outcome');
  });

  it('falls back safely for a type that does not exist yet', () => {
    // A layer added to the backend must degrade to a neutral column, never vanish.
    expect(stageForNodeType('quantum_touchpoint')).toBe('other');
    expect(stageForNodeType('')).toBe('other');
  });
});

describe('buildSankeyView — empty and invalid input', () => {
  it('returns an empty model for null, undefined and a malformed payload', () => {
    for (const input of [null, undefined, {} as any, { nodes: null, edges: null } as any]) {
      const view = buildSankeyView(input);
      expect(view.nodes).toHaveLength(0);
      expect(view.links).toHaveLength(0);
      expect(view.totalLinkVolume).toBe(0);
    }
  });

  it('does not throw on a dataset with nodes but no edges', () => {
    const view = buildSankeyView(graph({ nodes: [node('src_a', 'source', 'A', 5)] }));
    expect(view.nodes).toHaveLength(0); // orphan, nothing to draw
    expect(view.droppedOrphanNodes).toBe(1);
  });
});

describe('buildSankeyView — volume conservation', () => {
  it('draws exactly the volume the payload contains', () => {
    const data = realisticGraph(2);
    const view = buildSankeyView(data);
    const expected = data.edges.reduce((s, e) => s + (e.volume ?? 0), 0);
    expect(view.totalLinkVolume).toBe(expected);
  });

  it('conserves total volume when campaigns are folded into one node', () => {
    const data = realisticGraph(6);
    const expanded = buildSankeyView(data, { journeyView: 'campaign', maxCampaigns: 99 });
    const folded = buildSankeyView(data, { journeyView: 'firstTouch' });
    expect(folded.totalLinkVolume).toBe(expanded.totalLinkVolume);
    expect(folded.collapsedCampaigns).toBe(6);
  });

  it('conserves total volume when overflow campaigns become "Other"', () => {
    const data = realisticGraph(10);
    const uncapped = buildSankeyView(data, { maxCampaigns: 99 });
    const capped = buildSankeyView(data, { maxCampaigns: 3 });
    expect(capped.totalLinkVolume).toBe(uncapped.totalLinkVolume);
    expect(capped.collapsedCampaigns).toBe(7);
  });

  it('sums rather than overwrites when two campaigns fold onto the same band', () => {
    // Both campaigns receive from the same entry; folded, that must become ONE
    // band of 30 rather than the last one written.
    const data = graph({
      nodes: [
        node('entry_x', 'entry', 'Entry', 30),
        node('campaign_a', 'campaign', 'A', 10),
        node('campaign_b', 'campaign', 'B', 20),
        node('outcome_enrolled', 'outcome', 'Enrolled', 3),
      ],
      edges: [
        edge('entry_x', 'campaign_a', 10),
        edge('entry_x', 'campaign_b', 20),
        edge('campaign_a', 'outcome_enrolled', 1),
        edge('campaign_b', 'outcome_enrolled', 2),
      ],
    });
    const view = buildSankeyView(data, { journeyView: 'firstTouch' });
    const entryToCampaigns = view.links.filter((l) => l.toId === AGGREGATE_ALL_CAMPAIGNS);
    expect(entryToCampaigns).toHaveLength(1);
    expect(entryToCampaigns[0].value).toBe(30);
    const toOutcome = view.links.filter((l) => l.fromId === AGGREGATE_ALL_CAMPAIGNS);
    expect(toOutcome).toHaveLength(1);
    expect(toOutcome[0].value).toBe(3);
  });

  it('values the aggregate node at the sum of its members', () => {
    const data = graph({
      nodes: [
        node('entry_x', 'entry', 'Entry', 30),
        node('campaign_a', 'campaign', 'A', 10),
        node('campaign_b', 'campaign', 'B', 20),
      ],
      edges: [edge('entry_x', 'campaign_a', 10), edge('entry_x', 'campaign_b', 20)],
    });
    const view = buildSankeyView(data, { journeyView: 'firstTouch' });
    const agg = view.nodes.find((n) => n.id === AGGREGATE_ALL_CAMPAIGNS);
    expect(agg).toBeDefined();
    expect(agg!.value).toBe(30);
    expect(agg!.memberIds).toEqual(['campaign_a', 'campaign_b']);
    expect(agg!.drillable).toBe(false);
  });
});

describe('buildSankeyView — hostile and edge-case input', () => {
  it('drops zero-volume structural edges but counts them', () => {
    // The backend emits visitor_site -> entry_* at volume 0 to show the shape.
    const data = graph({
      nodes: [
        node('visitor_site', 'visitor', 'Site Visitors', 10),
        node('entry_a', 'entry', 'A', 10),
        node('entry_b', 'entry', 'B', 0),
      ],
      edges: [edge('visitor_site', 'entry_a', 10), edge('visitor_site', 'entry_b', 0)],
    });
    const view = buildSankeyView(data);
    expect(view.droppedZeroLinks).toBe(1);
    expect(view.links).toHaveLength(1);
    expect(view.nodes.map((n) => n.id)).not.toContain('entry_b');
  });

  it('treats negative, NaN and non-numeric volumes as zero rather than drawing them', () => {
    const data = graph({
      nodes: [
        node('src_a', 'source', 'A', 10),
        node('outreach_email', 'outreach', 'Email', 10),
        node('engagement_engaged', 'engagement', 'Engaged', 5),
      ],
      edges: [
        edge('src_a', 'outreach_email', -50),
        edge('outreach_email', 'engagement_engaged', Number.NaN),
      ],
    });
    const view = buildSankeyView(data);
    expect(view.totalLinkVolume).toBe(0);
    expect(view.links).toHaveLength(0);
    expect(view.droppedZeroLinks).toBe(2);
  });

  it('removes nodes no surviving edge touches', () => {
    const data = graph({
      nodes: [
        node('src_a', 'source', 'A', 10),
        node('outreach_email', 'outreach', 'Email', 10),
        node('src_orphan', 'source', 'Orphan', 99),
      ],
      edges: [edge('src_a', 'outreach_email', 10)],
    });
    const view = buildSankeyView(data);
    expect(view.nodes.map((n) => n.id)).toEqual(['src_a', 'outreach_email']);
    expect(view.droppedOrphanNodes).toBe(1);
  });

  it('truncates a long campaign label for the diagram but keeps the full one', () => {
    const long = 'Enterprise AI Leadership Accelerator Q4 Executive Re-Engagement Wave Three';
    const data = graph({
      nodes: [
        node('entry_x', 'entry', 'Entry', 5),
        node('campaign_long', 'campaign', long, 5),
      ],
      edges: [edge('entry_x', 'campaign_long', 5)],
    });
    const view = buildSankeyView(data, { labelChars: 20 });
    const drawn = view.nodes.find((n) => n.id === 'campaign_long')!;
    expect(drawn.name.length).toBeLessThanOrEqual(20);
    expect(drawn.name.endsWith('…')).toBe(true);
    expect(drawn.fullName).toBe(long);
  });

  it('keeps duplicate labels as separate nodes', () => {
    // Two campaigns can genuinely share a name; merging them would merge their leads.
    const data = graph({
      nodes: [
        node('entry_x', 'entry', 'Entry', 20),
        node('campaign_a', 'campaign', 'Spring Push', 10),
        node('campaign_b', 'campaign', 'Spring Push', 10),
      ],
      edges: [edge('entry_x', 'campaign_a', 10), edge('entry_x', 'campaign_b', 10)],
    });
    const view = buildSankeyView(data, { maxCampaigns: 99 });
    expect(view.nodes.filter((n) => n.nodeType === 'campaign')).toHaveLength(2);
  });

  it('refuses a self-loop created by folding', () => {
    const data = graph({
      nodes: [
        node('campaign_a', 'campaign', 'A', 10),
        node('campaign_b', 'campaign', 'B', 10),
      ],
      edges: [edge('campaign_a', 'campaign_b', 10)],
    });
    const view = buildSankeyView(data, { journeyView: 'firstTouch' });
    expect(view.links).toHaveLength(0);
  });

  it('renders an unknown future node type instead of dropping its leads', () => {
    const data = graph({
      nodes: [
        node('src_a', 'source', 'A', 10),
        node('warp_core', 'warp', 'Warp Core', 10),
      ],
      edges: [edge('src_a', 'warp_core', 10)],
    });
    const view = buildSankeyView(data);
    const unknown = view.nodes.find((n) => n.id === 'warp_core')!;
    expect(unknown).toBeDefined();
    expect(unknown.stage).toBe('other');
    expect(unknown.drillable).toBe(true);
    expect(view.totalLinkVolume).toBe(10);
  });

  it('produces a stable chart for identical input', () => {
    const data = realisticGraph(12);
    const a = buildSankeyView(data, { maxCampaigns: 4 });
    const b = buildSankeyView(data, { maxCampaigns: 4 });
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.links.map((l) => `${l.fromId}->${l.toId}:${l.value}`)).toEqual(
      b.links.map((l) => `${l.fromId}->${l.toId}:${l.value}`),
    );
  });

  it('keeps the biggest campaigns and buckets the rest', () => {
    const data = realisticGraph(10);
    const view = buildSankeyView(data, { maxCampaigns: 3 });
    const drawn = view.nodes.filter((n) => n.nodeType === 'campaign' && !n.aggregate);
    expect(drawn).toHaveLength(3);
    // realisticGraph counts descend, so the top three are campaigns 0, 1, 2.
    expect(drawn.map((n) => n.fullName)).toEqual(['Campaign 0', 'Campaign 1', 'Campaign 2']);
    expect(view.nodes.some((n) => n.id === AGGREGATE_OTHER_CAMPAIGNS)).toBe(true);
  });

  it('carries brand identity onto drawn campaign nodes', () => {
    const view = buildSankeyView(realisticGraph(2), { maxCampaigns: 99 });
    const campaigns = view.nodes.filter((n) => n.nodeType === 'campaign');
    expect(campaigns.map((c) => c.brandName)).toEqual(['Brand A', 'Brand B']);
  });

  it('drops velocity when bands merge rather than presenting a survivor as the median', () => {
    const data = graph({
      nodes: [
        node('entry_x', 'entry', 'Entry', 30),
        node('campaign_a', 'campaign', 'A', 10),
        node('campaign_b', 'campaign', 'B', 20),
      ],
      edges: [
        edge('entry_x', 'campaign_a', 10, 'enrolls', { median_hours: 4 }),
        edge('entry_x', 'campaign_b', 20, 'enrolls', { median_hours: 400 }),
      ],
    });
    const view = buildSankeyView(data, { journeyView: 'firstTouch' });
    expect(view.links).toHaveLength(1);
    expect(view.links[0].medianHours).toBeNull();
  });

  it('keeps velocity on an unmerged band', () => {
    const data = graph({
      nodes: [node('entry_x', 'entry', 'Entry', 10), node('campaign_a', 'campaign', 'A', 10)],
      edges: [edge('entry_x', 'campaign_a', 10, 'enrolls', { median_hours: 7.5 })],
    });
    const view = buildSankeyView(data, { maxCampaigns: 99 });
    expect(view.links[0].medianHours).toBe(7.5);
  });
});

describe('buildPathRows — the table is the diagram', () => {
  it('emits one row per drawn band with the same totals', () => {
    const view = buildSankeyView(realisticGraph(3));
    const rows = buildPathRows(view);
    expect(rows).toHaveLength(view.links.length);
    expect(rows.reduce((s, r) => s + r.volume, 0)).toBe(view.totalLinkVolume);
  });

  it('sorts by volume so the biggest path reads first', () => {
    const rows = buildPathRows(buildSankeyView(realisticGraph(3)));
    const volumes = rows.map((r) => r.volume);
    expect([...volumes].sort((a, b) => b - a)).toEqual(volumes);
  });

  it('computes share of the source node', () => {
    const data = graph({
      nodes: [
        node('outreach_email', 'outreach', 'Email', 400),
        node('engagement_ignored', 'engagement', 'Ignored', 280),
      ],
      edges: [edge('outreach_email', 'engagement_ignored', 280)],
    });
    const rows = buildPathRows(buildSankeyView(data));
    expect(rows[0].pctOfSource).toBeCloseTo(70, 5);
  });

  it('reports share as null, never 0%, when the source node has no population', () => {
    const data = graph({
      nodes: [
        node('outreach_email', 'outreach', 'Email', 0),
        node('engagement_ignored', 'engagement', 'Ignored', 5),
      ],
      edges: [edge('outreach_email', 'engagement_ignored', 5)],
    });
    const rows = buildPathRows(buildSankeyView(data));
    expect(rows[0].pctOfSource).toBeNull();
  });

  it('marks grouped rows as not drillable', () => {
    const rows = buildPathRows(buildSankeyView(realisticGraph(10), { maxCampaigns: 2 }));
    const grouped = rows.filter((r) => r.toId === AGGREGATE_OTHER_CAMPAIGNS);
    expect(grouped.length).toBeGreaterThan(0);
    expect(grouped.every((r) => r.drillable === false)).toBe(true);
  });
});
