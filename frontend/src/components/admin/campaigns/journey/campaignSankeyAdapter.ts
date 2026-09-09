/**
 * CampaignGraphData → Sankey view model.
 *
 * PURE. No React, no fetching, no recharts. Everything the diagram, the KPI strip,
 * the table and the insight rail display is derived here from one payload, so those
 * four surfaces cannot disagree with each other — the failure mode of the screen
 * this replaces, where the header counted one population and the graph drew another.
 *
 * WHY AN ADAPTER RATHER THAN A NEW ENDPOINT. The backend already traces real
 * per-lead paths across seven layers and returns them as nodes+edges. That contract
 * is used by the node drill-down, the edge drill-down and the cohort slice, all of
 * which still work. Reshaping in the client keeps one source of truth for volume
 * and leaves those three drill-downs untouched.
 *
 * SEVEN LAYERS, FIVE COLUMNS. The API's node types are source, outreach,
 * engagement, visitor, entry, campaign, outcome. The reader's question has five
 * parts, so `engagement` and `visitor` share the Response column (Never Visited is
 * a response) and `entry` and `campaign` share the Journey column. The stage is a
 * semantic grouping used for colour, headings and the table — it is NOT the layout.
 * Recharts derives x-position from the link graph itself, which is why a
 * source→visitor edge that skips two layers still draws correctly.
 */

import type { CampaignGraphData, CampaignGraphNode } from '../../../../services/intelligenceApi';

export type JourneyStage = 'source' | 'outreach' | 'response' | 'journey' | 'outcome' | 'other';

export interface StageDef {
  key: JourneyStage;
  label: string;
}

export const STAGE_ORDER: StageDef[] = [
  { key: 'source', label: 'Lead source' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'response', label: 'Response' },
  { key: 'journey', label: 'Journey' },
  { key: 'outcome', label: 'Outcome' },
];

const TYPE_TO_STAGE: Record<string, JourneyStage> = {
  source: 'source',
  outreach: 'outreach',
  engagement: 'response',
  visitor: 'response',
  entry: 'journey',
  campaign: 'journey',
  outcome: 'outcome',
};

/**
 * Map a node type to its column.
 *
 * An unknown type is a FUTURE type, not a bug: the backend adds layers over time
 * and a frontend that dropped what it did not recognise would silently delete real
 * leads from the picture. Unknown types get their own neutral stage, keep their
 * label, and stay drillable.
 */
export function stageForNodeType(type: string): JourneyStage {
  return TYPE_TO_STAGE[type] ?? 'other';
}

export function stageLabel(stage: JourneyStage): string {
  return STAGE_ORDER.find((s) => s.key === stage)?.label ?? 'Other';
}

export interface SankeyViewNode {
  /** Original graph node id, or a synthetic id when this node is an aggregate. */
  id: string;
  /** Display label, truncated for the diagram. */
  name: string;
  /** Untruncated label for tooltips, the table and screen readers. */
  fullName: string;
  stage: JourneyStage;
  stageLabel: string;
  value: number;
  nodeType: string;
  brandId?: string;
  brandName?: string;
  /** Graph node ids this node stands for. Length > 1 only for aggregates. */
  memberIds: string[];
  aggregate: boolean;
  /**
   * Aggregates are not drillable: `node-users` takes one node id, and asking it
   * about a bucket of twelve campaigns would return one campaign's people under a
   * label promising twelve. Expand the bucket instead.
   */
  drillable: boolean;
  /**
   * This node's share of its OWN COLUMN, 0-100, or null when the column is empty.
   *
   * Share of the column rather than of total leads, and the reason is Site
   * Visitors. That node counts anonymous visitors who never became leads, so it is
   * routinely larger than the entire lead population — against a total-leads
   * denominator it would read "545%", which is worse than showing nothing. Every
   * column, by contrast, is a set of alternatives that genuinely partition their
   * stage, so a share of it is always between 0 and 100 and always answers the
   * question a reader is actually asking: how much of this stage is this?
   */
  stageShare: number | null;
  /**
   * Visitors counted at this node who never became leads.
   *
   * Only Site Visitors has one. It is the answer to "how can 20 people produce
   * 2,180 site visitors": most of them were never leads at all. The number exists
   * in the payload as `metrics.visits_generated` and was previously invisible, so
   * the node looked like it was inventing people.
   */
  anonymousCount?: number;
}

export interface SankeyViewLink {
  /** Indices into `nodes`, which is what recharts consumes. */
  source: number;
  target: number;
  value: number;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  label: string;
  medianHours: number | null;
  /** True when either end is an aggregate, so edge drill-down is unavailable. */
  aggregate: boolean;
}

export interface SankeyViewModel {
  nodes: SankeyViewNode[];
  links: SankeyViewLink[];
  stages: StageDef[];
  /** Structural zero-volume edges removed so recharts can lay the chart out. */
  droppedZeroLinks: number;
  /** Nodes left with no edges after that removal. */
  droppedOrphanNodes: number;
  /**
   * Nodes invented for ids that edges referenced but the payload never defined.
   * Non-zero means the backend sent a dangling reference — real, and visible.
   */
  synthesizedNodes: number;
  /** Campaign nodes folded into an aggregate, if any. */
  collapsedCampaigns: number;
  /** Sum of all drawn link volumes. Used to assert conservation in tests. */
  totalLinkVolume: number;
}

export type JourneyView = 'campaign' | 'firstTouch';

export interface AdapterOptions {
  /**
   * 'campaign'   — draw individual campaigns (capped, see maxCampaigns).
   * 'firstTouch' — fold every campaign into one node so the first-touch column is
   *                legible. Volumes are summed, never sampled, so the totals are
   *                identical in both views.
   */
  journeyView?: JourneyView;
  /** Campaigns drawn individually before the rest become "Other campaigns". */
  maxCampaigns?: number;
  /**
   * Minimum share of total campaign volume a campaign needs to be drawn alone.
   *
   * A count cap alone is the wrong rule, and live data shows why: production has one
   * campaign with 9,658 leads and a tail of campaigns with 12 to 18. Taking the top
   * eight still draws five nodes whose bands are invisible and whose labels stack on
   * each other. Below this share a campaign cannot be seen even when it is drawn, so
   * grouping it costs the reader nothing and buys back the space.
   */
  minCampaignShare?: number;
  /** Label truncation width for the diagram only. */
  labelChars?: number;
}

export const AGGREGATE_ALL_CAMPAIGNS = 'campaign__all';
export const AGGREGATE_OTHER_CAMPAIGNS = 'campaign__other';

function truncate(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(1, max - 1))}…`;
}

/** Finite, non-negative volume. Anything else is treated as zero rather than drawn. */
function safeVolume(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Build the diagram model.
 *
 * ORDER OF OPERATIONS MATTERS and is the reason this reads as a pipeline:
 *   1. decide the campaign remapping (identity, fold-all, or top-N + Other)
 *   2. rewrite every edge through that remapping and SUM collisions
 *   3. drop zero-volume edges
 *   4. drop nodes that no surviving edge touches
 *   5. index the survivors for recharts
 *
 * Doing (4) before (3) would keep nodes attached only to zero edges, which recharts
 * lays out as floating rectangles with no band — indistinguishable from a rendering
 * bug. Doing (2) without summing would silently keep only the last edge when two
 * campaigns fold into the same bucket, quietly deleting leads.
 */
export function buildSankeyView(
  data: CampaignGraphData | null | undefined,
  options: AdapterOptions = {},
): SankeyViewModel {
  const journeyView: JourneyView = options.journeyView ?? 'campaign';
  const maxCampaigns = Math.max(1, options.maxCampaigns ?? 8);
  const minCampaignShare = Math.max(0, options.minCampaignShare ?? 0.01);
  const labelChars = Math.max(6, options.labelChars ?? 22);

  const empty: SankeyViewModel = {
    nodes: [],
    links: [],
    stages: STAGE_ORDER,
    droppedZeroLinks: 0,
    droppedOrphanNodes: 0,
    synthesizedNodes: 0,
    collapsedCampaigns: 0,
    totalLinkVolume: 0,
  };
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return empty;

  const graphNodes = data.nodes.filter((n): n is CampaignGraphNode => Boolean(n && n.id));
  const byId = new Map(graphNodes.map((n) => [n.id, n]));

  // ── 1. Campaign remapping ────────────────────────────────────────────────
  const campaigns = graphNodes.filter((n) => n.type === 'campaign');
  const remap = new Map<string, string>(); // original id → drawn id
  const aggregateMembers = new Map<string, string[]>();
  let collapsedCampaigns = 0;

  if (campaigns.length > 0 && journeyView === 'firstTouch') {
    for (const c of campaigns) remap.set(c.id, AGGREGATE_ALL_CAMPAIGNS);
    aggregateMembers.set(
      AGGREGATE_ALL_CAMPAIGNS,
      campaigns.map((c) => c.id),
    );
    collapsedCampaigns = campaigns.length;
  } else if (campaigns.length > 0) {
    // Biggest first, ties broken by label so the same data always yields the same
    // chart — an unstable sort here would reshuffle the diagram between refreshes.
    const ranked = [...campaigns].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
    const totalCampaignVolume = ranked.reduce((s, c) => s + safeVolume(c.count), 0);
    const floor = totalCampaignVolume * minCampaignShare;

    // Two reasons to group, either sufficient: past the cap, or too small to see.
    const overflow = ranked.filter(
      (c, i) => i >= maxCampaigns || (totalCampaignVolume > 0 && c.count < floor),
    );

    // Never group EVERY campaign — that would silently turn the Campaigns view into
    // the First touch view and leave the reader with a control that does nothing.
    if (overflow.length > 0 && overflow.length < ranked.length) {
      for (const c of overflow) remap.set(c.id, AGGREGATE_OTHER_CAMPAIGNS);
      aggregateMembers.set(
        AGGREGATE_OTHER_CAMPAIGNS,
        overflow.map((c) => c.id),
      );
      collapsedCampaigns = overflow.length;
    }
  }

  const drawnId = (id: string): string => remap.get(id) ?? id;

  // ── 2. Rewrite edges through the remapping, summing collisions ───────────
  interface PendingLink {
    fromId: string;
    toId: string;
    value: number;
    label: string;
    medianHours: number | null;
    aggregate: boolean;
  }
  const pending = new Map<string, PendingLink>();
  let droppedZeroLinks = 0;

  for (const edge of data.edges) {
    if (!edge || !edge.from || !edge.to) continue;
    const from = drawnId(edge.from);
    const to = drawnId(edge.to);
    // Folding campaigns can turn a campaign→campaign edge into a self-loop. There
    // are none today, but a self-loop makes a Sankey non-terminating, so it is
    // refused here rather than discovered in the layout engine.
    if (from === to) continue;

    const value = safeVolume(edge.volume);
    const key = `${from} ${to}`;
    const existing = pending.get(key);
    const median =
      typeof edge.velocity?.median_hours === 'number' && Number.isFinite(edge.velocity.median_hours)
        ? edge.velocity.median_hours
        : null;

    if (existing) {
      existing.value += value;
      existing.aggregate = true;
      // Velocity across a merged bucket is not a median any more, and presenting a
      // survivor's median as the bucket's would be a fabricated statistic.
      existing.medianHours = null;
    } else {
      pending.set(key, {
        fromId: from,
        toId: to,
        value,
        label: edge.label || '',
        medianHours: median,
        aggregate: remap.has(edge.from) || remap.has(edge.to),
      });
    }
  }

  // ── 3. Drop zero-volume edges ────────────────────────────────────────────
  const surviving: PendingLink[] = [];
  for (const link of pending.values()) {
    if (link.value <= 0) {
      droppedZeroLinks += 1;
      continue;
    }
    surviving.push(link);
  }

  // ── 4. Keep only nodes an edge actually touches ──────────────────────────
  const touched = new Set<string>();
  for (const l of surviving) {
    touched.add(l.fromId);
    touched.add(l.toId);
  }

  const viewNodes: SankeyViewNode[] = [];
  const indexById = new Map<string, number>();

  const pushNode = (node: SankeyViewNode) => {
    indexById.set(node.id, viewNodes.length);
    viewNodes.push(node);
  };

  // Real nodes, in the payload's own order so the column grouping stays stable.
  for (const n of graphNodes) {
    if (remap.has(n.id)) continue; // represented by an aggregate
    if (!touched.has(n.id)) continue;
    const stage = stageForNodeType(n.type);
    pushNode({
      id: n.id,
      name: truncate(n.label ?? n.id, labelChars),
      fullName: n.label ?? n.id,
      stage,
      stageLabel: stageLabel(stage),
      value: safeVolume(n.count),
      nodeType: n.type,
      brandId: n.brand_id,
      brandName: n.brand_name,
      memberIds: [n.id],
      aggregate: false,
      drillable: true,
      stageShare: null,
      ...(n.type === 'visitor' && typeof n.metrics?.visits_generated === 'number'
        ? { anonymousCount: n.metrics.visits_generated }
        : {}),
    });
  }

  // Aggregates, valued by summing their members so the column total is unchanged.
  for (const [aggId, memberIds] of aggregateMembers) {
    if (!touched.has(aggId)) continue;
    const members = memberIds.map((id) => byId.get(id)).filter(Boolean) as CampaignGraphNode[];
    const value = members.reduce((sum, m) => sum + safeVolume(m.count), 0);
    const label =
      aggId === AGGREGATE_ALL_CAMPAIGNS
        ? `All campaigns (${members.length})`
        : `Other campaigns (${members.length})`;
    pushNode({
      id: aggId,
      name: label,
      fullName: `${label}: ${members.map((m) => m.label).join(', ')}`,
      stage: 'journey',
      stageLabel: stageLabel('journey'),
      value,
      nodeType: 'campaign',
      memberIds: [...memberIds],
      aggregate: true,
      drillable: false,
      stageShare: null,
    });
  }

  /**
   * Nodes an edge points at that the payload never defined.
   *
   * Found in live data: a deleted campaign whose edges outlived it. The previous
   * behaviour dropped those links when their endpoint failed to resolve, which
   * silently removed their leads from the total — a diagram quietly disagreeing
   * with its own source. A placeholder is drawn instead, so the volume survives and
   * the gap is visible rather than absorbed.
   */
  let synthesizedNodes = 0;
  for (const id of touched) {
    if (indexById.has(id)) continue;
    if (aggregateMembers.has(id)) continue;
    synthesizedNodes += 1;
    const type = id.split('_')[0] || 'unknown';
    const stage = stageForNodeType(type);
    pushNode({
      id,
      name: 'Unknown node',
      fullName: `Unknown node (${id}) — referenced by a path but missing from the graph`,
      stage,
      stageLabel: stageLabel(stage),
      // No count was supplied; its throughput is whatever flows through it.
      value: 0,
      nodeType: type,
      memberIds: [id],
      aggregate: false,
      drillable: false,
      stageShare: null,
    });
  }

  const droppedOrphanNodes =
    graphNodes.filter((n) => !remap.has(n.id) && !touched.has(n.id)).length;

  // ── 4b. Each node's share of its own column ──────────────────────────────
  // Computed after every node exists, including aggregates and placeholders, so
  // the shares within a column always sum to 100 rather than to whatever survived.
  const stageTotals = new Map<JourneyStage, number>();
  for (const n of viewNodes) {
    stageTotals.set(n.stage, (stageTotals.get(n.stage) ?? 0) + n.value);
  }
  for (const n of viewNodes) {
    const total = stageTotals.get(n.stage) ?? 0;
    n.stageShare = total > 0 ? (n.value / total) * 100 : null;
  }

  // ── 5. Index for recharts ────────────────────────────────────────────────
  const links: SankeyViewLink[] = [];
  let totalLinkVolume = 0;
  for (const l of surviving) {
    const source = indexById.get(l.fromId);
    const target = indexById.get(l.toId);
    if (source === undefined || target === undefined) continue;
    links.push({
      source,
      target,
      value: l.value,
      fromId: l.fromId,
      toId: l.toId,
      fromName: viewNodes[source].fullName,
      toName: viewNodes[target].fullName,
      label: l.label,
      medianHours: l.medianHours,
      aggregate: l.aggregate,
    });
    totalLinkVolume += l.value;
  }

  return {
    nodes: viewNodes,
    links,
    stages: STAGE_ORDER,
    droppedZeroLinks,
    droppedOrphanNodes,
    synthesizedNodes,
    collapsedCampaigns,
    totalLinkVolume,
  };
}

/**
 * Rows for the table view, which is the accessible equal of the diagram rather
 * than a summary of it: same model in, one row per drawn band out.
 *
 * `pctOfSource` is the share of the FROM node's population that took this band, so
 * a reader can see that 70% of contacted leads were ignored without doing the
 * division. It is undefined, not zero, when the from-node has no population —
 * dividing by zero and printing 0% would assert something false.
 */
export interface PathRow {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  fromStage: string;
  toStage: string;
  volume: number;
  pctOfSource: number | null;
  medianHours: number | null;
  drillable: boolean;
}

export function buildPathRows(view: SankeyViewModel): PathRow[] {
  return view.links
    .map((l) => {
      const from = view.nodes[l.source];
      const to = view.nodes[l.target];
      const denom = from?.value ?? 0;
      return {
        fromId: l.fromId,
        toId: l.toId,
        fromName: from?.fullName ?? l.fromId,
        toName: to?.fullName ?? l.toId,
        fromStage: from?.stageLabel ?? '',
        toStage: to?.stageLabel ?? '',
        volume: l.value,
        pctOfSource: denom > 0 ? (l.value / denom) * 100 : null,
        medianHours: l.medianHours,
        drillable: !l.aggregate,
      };
    })
    .sort((a, b) => b.volume - a.volume);
}
