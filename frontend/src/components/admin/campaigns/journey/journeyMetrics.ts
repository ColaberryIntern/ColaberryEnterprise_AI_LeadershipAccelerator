/**
 * KPI and insight derivation for the Outreach Journey Flow.
 *
 * PURE, and derived from the SAME payload the diagram draws. The rule this file
 * exists to enforce: no number on this screen may come from a second query. A KPI
 * strip fed independently of its chart is how a dashboard ends up stating two
 * different truths on one page, and the reader has no way to tell which is wrong.
 *
 * NOTHING HERE IS HARD-CODED. Every insight names the values it used, and says so
 * when it does not have enough data instead of producing a confident sentence about
 * nine leads.
 */

import type { CampaignGraphData } from '../../../../services/intelligenceApi';
import type { SankeyViewModel } from './campaignSankeyAdapter';

/**
 * Below this, a conversion rate is noise. Twenty-five is not a statistical
 * threshold so much as a floor with a reason: at n=20 a single extra enrolment
 * moves the rate by five points, which is larger than the differences the panel
 * would be claiming to detect.
 */
export const MIN_SAMPLE_FOR_RATE = 25;

export interface Kpi {
  key: string;
  label: string;
  /** null when the payload does not carry this figure at all. */
  value: number | null;
  rate: number | null;
  rateLabel: string;
  /** Colour token key, shared with the diagram so tiles match their nodes. */
  tone: 'source' | 'outreach' | 'response' | 'journey' | 'outcome';
}

/** Percentage, or null when the denominator is zero or missing. Never 0-for-unknown. */
export function safeRate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function num(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

/**
 * The five headline figures.
 *
 * Sourced from `validation`, which is the backend's own count of the traced
 * population, rather than re-summed from the drawn nodes. The two agree by
 * construction; using validation means the strip stays correct even when the
 * diagram collapses campaigns into a bucket.
 */
export function buildKpis(data: CampaignGraphData | null | undefined): Kpi[] {
  const v = data?.validation;
  const totalLeads = num(v?.total_leads);
  const reached = num(v?.leads_contacted);
  const engaged = num(v?.leads_engaged);
  const enrolled = num(v?.leads_enrolled);
  const paid = num(v?.leads_paid);

  return [
    {
      key: 'total',
      label: 'Total leads',
      value: totalLeads,
      rate: null,
      rateLabel: 'the population this view describes',
      tone: 'source',
    },
    {
      key: 'reached',
      label: 'Reached',
      value: reached,
      rate: safeRate(reached, totalLeads),
      rateLabel: 'of total leads',
      tone: 'outreach',
    },
    {
      key: 'engaged',
      label: 'Engaged',
      value: engaged,
      rate: safeRate(engaged, reached),
      rateLabel: 'of leads reached',
      tone: 'response',
    },
    {
      key: 'enrolled',
      label: 'Enrolled',
      value: enrolled,
      rate: safeRate(enrolled, totalLeads),
      rateLabel: 'of total leads',
      tone: 'journey',
    },
    {
      key: 'paid',
      label: 'Paid',
      value: paid,
      rate: safeRate(paid, enrolled),
      rateLabel: 'of those enrolled',
      tone: 'outcome',
    },
  ];
}

export type InsightKind = 'leak' | 'opportunity' | 'quality';

export interface Insight {
  kind: InsightKind;
  title: string;
  detail: string;
  /** The arithmetic, shown so the claim can be checked rather than trusted. */
  evidence: string;
  /** false when the honest answer is "not enough data to say". */
  sufficient: boolean;
  /** Node the "show me" action should select, when one applies. */
  focusNodeId?: string;
}

const OUTCOME_TYPES = new Set(['outcome']);

/**
 * Largest measurable drop-off.
 *
 * Defined as arrivals minus departures per node: a node that received 7,700 leads
 * and passed 200 onward leaked 7,500. Computed from the drawn bands rather than
 * from a list of known dead-end node ids, so a layer added to the backend next
 * quarter is measured the same way without a frontend change.
 *
 * Outcome nodes are excluded because they are the destination — leads "stopping"
 * at Paid is the goal, not a leak.
 */
export function findLargestLeak(view: SankeyViewModel): Insight | null {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const l of view.links) {
    outgoing.set(l.fromId, (outgoing.get(l.fromId) ?? 0) + l.value);
    incoming.set(l.toId, (incoming.get(l.toId) ?? 0) + l.value);
  }

  let best: { node: SankeyViewModel['nodes'][number]; leaked: number; arrived: number } | null = null;
  for (const node of view.nodes) {
    if (OUTCOME_TYPES.has(node.nodeType)) continue;
    const arrived = incoming.get(node.id) ?? node.value;
    const departed = outgoing.get(node.id) ?? 0;
    const leaked = arrived - departed;
    if (leaked <= 0) continue;
    if (!best || leaked > best.leaked) best = { node, leaked, arrived };
  }

  if (!best) return null;
  const pct = safeRate(best.leaked, best.arrived);
  /**
   * "journeys", not "leads".
   *
   * Band volumes count PATHS TAKEN and node counts count DISTINCT LEADS, and in
   * live data the two do not reconcile: one lead contacted by both email and SMS
   * appears in two source→outreach bands. Never Visited reports 3,775 leads while
   * 24,610 journeys arrive at it. Calling the arrivals "leads" overstated the
   * largest leak by more than six times, so the sentence now names the unit the
   * number is actually in.
   */
  return {
    kind: 'leak',
    title: `${best.leaked.toLocaleString()} journeys stop at ${best.node.fullName}`,
    detail:
      pct === null
        ? `${best.node.fullName} is where the most journeys stop moving forward.`
        : `${pct.toFixed(1)}% of everything arriving at ${best.node.fullName} goes no further — ` +
          'the largest single drop-off in the view. Counted in journeys along a path, ' +
          'not distinct people.',
    evidence: `${best.arrived.toLocaleString()} arrived − ${(best.arrived - best.leaked).toLocaleString()} continued = ${best.leaked.toLocaleString()} stopped`,
    sufficient: true,
    focusNodeId: best.node.id,
  };
}

/**
 * Nodes whose bands carry more than the node says it holds.
 *
 * A Sankey assumes flow conservation. This graph does not have it, for a defensible
 * reason: `count` is distinct leads and `volume` is journeys, so any lead on two
 * paths inflates the bands relative to the node. Twelve of thirty-five nodes were
 * affected in the 2026-09-08 production payload.
 *
 * It is reported rather than corrected because it is not the frontend's number to
 * correct — and because a reader comparing a node's printed figure against its band
 * thickness deserves to be told why they differ instead of concluding the chart is
 * broken.
 */
export function findFlowMismatch(view: SankeyViewModel): Insight | null {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const l of view.links) {
    outgoing.set(l.fromId, (outgoing.get(l.fromId) ?? 0) + l.value);
    incoming.set(l.toId, (incoming.get(l.toId) ?? 0) + l.value);
  }

  let affected = 0;
  let worst: { name: string; count: number; flow: number } | null = null;
  for (const node of view.nodes) {
    if (node.value <= 0 || node.aggregate) continue;
    const flow = Math.max(incoming.get(node.id) ?? 0, outgoing.get(node.id) ?? 0);
    if (flow <= node.value) continue;
    affected += 1;
    if (!worst || flow - node.value > worst.flow - worst.count) {
      worst = { name: node.fullName, count: node.value, flow };
    }
  }

  if (!worst) return null;
  return {
    kind: 'quality',
    title:
      affected === 1
        ? '1 node carries more journeys than distinct leads'
        : `${affected} nodes carry more journeys than distinct leads`,
    detail:
      'Band thickness counts journeys along a path; the figure under each node counts ' +
      'distinct people. A lead reached on two channels appears in two bands, so the two ' +
      'will not add up. The bands are the flow, the node figures are the population.',
    evidence: `largest gap: ${worst.name} holds ${worst.count.toLocaleString()} leads across ${worst.flow.toLocaleString()} journeys`,
    sufficient: true,
  };
}

/**
 * Best-performing path into an outcome, with minimum-sample protection.
 *
 * The protection is the whole point. Ranking by rate alone crowns whichever tiny
 * campaign happens to have converted two of its three leads, which is a fact about
 * three people and reads as a strategy recommendation.
 */
export function findBestOpportunity(view: SankeyViewModel): Insight | null {
  const outcomeIds = new Set(view.nodes.filter((n) => OUTCOME_TYPES.has(n.nodeType)).map((n) => n.id));
  if (outcomeIds.size === 0) return null;

  const toOutcome = new Map<string, number>();
  const departed = new Map<string, number>();
  for (const l of view.links) {
    departed.set(l.fromId, (departed.get(l.fromId) ?? 0) + l.value);
    if (outcomeIds.has(l.toId)) {
      toOutcome.set(l.fromId, (toOutcome.get(l.fromId) ?? 0) + l.value);
    }
  }

  /**
   * The denominator is the node's POPULATION, not the volume leaving it.
   *
   * Dividing conversions by departures is the mistake this comment exists to
   * prevent: a campaign holding 200 leads whose only outgoing band is 40 enrolments
   * would score 40/40 = 100%, and every terminal campaign in the graph would tie at
   * a perfect rate. The honest rate is 40 of the 200 who were in it.
   *
   * Falls back to departures only when the node reports no population of its own,
   * which is the aggregate-with-no-count case rather than a real campaign.
   */
  const populationOf = (nodeId: string, nodeValue: number): number =>
    nodeValue > 0 ? nodeValue : (departed.get(nodeId) ?? 0);

  let best: { node: SankeyViewModel['nodes'][number]; rate: number; converted: number; pop: number } | null = null;
  let bestBelowFloor: { node: SankeyViewModel['nodes'][number]; pop: number } | null = null;

  let inconsistent = 0;
  for (const node of view.nodes) {
    const converted = toOutcome.get(node.id);
    if (!converted) continue;
    const pop = populationOf(node.id, node.value);
    if (pop <= 0) continue;

    /**
     * Refuse to rank a node that reports more conversions than it holds.
     *
     * Live data does this: "Alumni Re-Engagement" reports 4 leads and 64 journeys
     * into outcomes, because counts are distinct people and volumes are paths. The
     * previous version divided one by the other and crowned a grouped bucket at
     * "364.1%". Clamping to 100% would have been worse than useless — it would
     * present a contradiction as a perfect result. A rate that cannot be computed
     * honestly is not computed; the mismatch is reported by findFlowMismatch.
     */
    if (converted > pop) {
      inconsistent += 1;
      continue;
    }

    if (pop < MIN_SAMPLE_FOR_RATE) {
      if (!bestBelowFloor || pop > bestBelowFloor.pop) bestBelowFloor = { node, pop };
      continue;
    }
    const rate = (converted / pop) * 100;
    if (!best || rate > best.rate) best = { node, rate, converted, pop };
  }

  if (!best && !bestBelowFloor && inconsistent > 0) {
    return {
      kind: 'opportunity',
      title: 'No path can be ranked on conversion',
      detail:
        `${inconsistent} path${inconsistent === 1 ? '' : 's'} into an outcome carry more ` +
        'journeys than the node reports leads, so a conversion rate would be a ratio of two ' +
        'different things. Nothing is ranked rather than something being invented.',
      evidence: `${inconsistent} node${inconsistent === 1 ? '' : 's'} excluded for reporting conversions above their own population`,
      sufficient: false,
    };
  }

  if (!best) {
    if (!bestBelowFloor) return null;
    return {
      kind: 'opportunity',
      title: 'Not enough volume to name a best path',
      detail:
        `The largest path reaching an outcome carries ${bestBelowFloor.pop.toLocaleString()} leads, ` +
        `below the ${MIN_SAMPLE_FOR_RATE}-lead floor this panel needs before it will call anything a winner.`,
      evidence: `largest candidate: ${bestBelowFloor.node.fullName} (${bestBelowFloor.pop.toLocaleString()} leads)`,
      sufficient: false,
      focusNodeId: bestBelowFloor.node.id,
    };
  }

  return {
    kind: 'opportunity',
    title: `${best.node.fullName} converts at ${best.rate.toFixed(1)}%`,
    detail:
      `Of the ${best.pop.toLocaleString()} leads in ${best.node.fullName}, ` +
      `${best.converted.toLocaleString()} reach an outcome — the strongest rate above the ` +
      `${MIN_SAMPLE_FOR_RATE}-lead floor.`,
    evidence: `${best.converted.toLocaleString()} ÷ ${best.pop.toLocaleString()} = ${best.rate.toFixed(1)}%`,
    sufficient: true,
    focusNodeId: best.node.id,
  };
}

/**
 * Data-quality note taken from the backend's own validation payload.
 *
 * Deliberately NOT written here: this panel reports what the engine already knows
 * is wrong with its numbers. Inventing a warning in the frontend would be inventing
 * a fact about the data.
 */
export function findDataWarning(
  data: CampaignGraphData | null | undefined,
  view: SankeyViewModel,
): Insight | null {
  const warnings = data?.validation?.warnings ?? [];
  if (warnings.length > 0) {
    return {
      kind: 'quality',
      title: warnings.length === 1 ? 'Data quality note' : `${warnings.length} data quality notes`,
      detail: warnings[0],
      evidence:
        warnings.length > 1
          ? `${warnings.length - 1} further note${warnings.length > 2 ? 's' : ''} reported by the graph engine`
          : 'reported by the graph engine',
      sufficient: true,
    };
  }

  if (view.droppedZeroLinks > 0 || view.collapsedCampaigns > 0) {
    const parts: string[] = [];
    if (view.collapsedCampaigns > 0) {
      parts.push(`${view.collapsedCampaigns} smaller campaigns are grouped to keep labels readable`);
    }
    if (view.droppedZeroLinks > 0) {
      parts.push(`${view.droppedZeroLinks} paths carry no leads and are not drawn`);
    }
    return {
      kind: 'quality',
      title: 'What this view is not showing',
      detail: `${parts.join('; ')}.`,
      evidence: 'grouped volumes are summed, never sampled — column totals are unchanged',
      sufficient: true,
    };
  }

  return null;
}

/**
 * Anonymous traffic that never became a lead.
 *
 * This number used to be INSIDE the Site Visitors node, which is what made the
 * chart claim 382 site visitors against 12 leads. It is a real and useful figure —
 * it just is not funnel volume, because those people never entered the funnel.
 *
 * Reported here instead, where it reads as what it is: the size of the audience
 * arriving that outreach never converts.
 */
export function findAnonymousTraffic(view: SankeyViewModel): Insight | null {
  const node = view.nodes.find((n) => (n.anonymousCount ?? 0) > 0);
  if (!node) return null;

  const anon = node.anonymousCount!;
  const leads = node.value;
  const total = anon + leads;
  const pct = safeRate(leads, total);

  return {
    kind: 'quality',
    title: `${anon.toLocaleString()} people browsed without becoming leads`,
    detail:
      pct === null
        ? `${anon.toLocaleString()} anonymous visitors arrived in this window and never became leads. They are counted here rather than in ${node.fullName}, because they never entered the funnel.`
        : `Of ${total.toLocaleString()} people who reached the site, ${pct.toFixed(1)}% became leads. ` +
          `The other ${anon.toLocaleString()} are not drawn in the flow, because a lead journey cannot ` +
          'contain people who were never leads.',
    evidence: `${leads.toLocaleString()} leads ÷ ${total.toLocaleString()} visitors = ${pct === null ? '—' : `${pct.toFixed(1)}%`}`,
    sufficient: true,
    focusNodeId: node.id,
  };
}

export function deriveInsights(
  data: CampaignGraphData | null | undefined,
  view: SankeyViewModel,
): Insight[] {
  return [
    findLargestLeak(view),
    findBestOpportunity(view),
    findAnonymousTraffic(view),
    findFlowMismatch(view),
    findDataWarning(data, view),
  ].filter((i): i is Insight => i !== null);
}
