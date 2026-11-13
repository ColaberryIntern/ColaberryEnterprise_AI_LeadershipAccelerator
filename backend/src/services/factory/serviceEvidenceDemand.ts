/**
 * serviceEvidenceDemand - the two "is anyone asking for this?" inputs of the evidence summary (package spec 1F):
 *
 *   1. openOpportunityMatches: the deterministic serviceMatcher over OPEN opportunities (close date >= today),
 *      counting strong + moderate matches per service.
 *   2. openFitGaps: the partial/new capabilities in the latest completed Gov AI vetting of each pursuit whose close
 *      date has not passed.
 *
 * NEVER 0-AS-A-GUESS. If the live Opportunity Pulse feed cannot be read (it threw, or only the curated snapshot
 * fallback came back), the per-service counts are `null` and the page shows a dash. A snapshot is a dated sample,
 * not today's demand, so counting it would present a guess as a measurement. Likewise a failed vetting read gives
 * `count: null`, not zero.
 *
 * An opportunity with no close date is not counted as open: we cannot tell it is still biddable.
 * The pure functions take `today` (YYYY-MM-DD, UTC) so tests control time. Failures log one structured line.
 */
import { matchServicesToOpportunity, MatcherServiceInput } from './serviceMatcher';
import type { GovOpportunity, GovOpportunityFeed } from './opportunities/govOpportunity';
import type { FitGap, OpportunityFeedInfo } from './serviceEvidenceSummaryTypes';

export interface OpportunityDemand { feed: OpportunityFeedInfo; byService: Map<string, number> | null }

function logFail(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name ?? 'Error', context: { message: String((err as Error)?.message ?? err).slice(0, 200) },
  }));
}

const isOpen = (closeDate: string | null | undefined, today: string): boolean =>
  typeof closeDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(closeDate) && closeDate.slice(0, 10) >= today;

/** PURE: strong + moderate matches per service over the open opportunities of a LIVE feed. */
export function countOpenMatches(opps: readonly GovOpportunity[], services: MatcherServiceInput[], today: string): { openCount: number; byService: Map<string, number> } {
  const byService = new Map<string, number>(services.map((s) => [s.id, 0]));
  const open = opps.filter((o) => isOpen(o.closeDate, today));
  for (const o of open) {
    const matches = matchServicesToOpportunity(
      { title: o.title, category: o.category ?? null, summary: o.preliminarySummary ?? null },
      services, { max: Math.max(1, services.length) },
    );
    for (const m of matches) if (m.strength !== 'weak') byService.set(m.id, (byService.get(m.id) ?? 0) + 1);
  }
  return { openCount: open.length, byService };
}

/** Load the feed and count. Any non-live outcome -> byService null (the honest "unknown"). Never throws. */
export async function loadOpportunityDemand(
  services: MatcherServiceInput[], today: string, fetchFeed: () => Promise<GovOpportunityFeed>,
): Promise<OpportunityDemand> {
  let feed: GovOpportunityFeed;
  try {
    feed = await fetchFeed();
  } catch (err) {
    logFail('service_evidence_opportunities_failed', err);
    return { feed: { source: 'unavailable', openCount: null }, byService: null };
  }
  if (!feed || feed.source !== 'live' || !Array.isArray(feed.opportunities)) {
    return { feed: { source: feed?.source === 'snapshot' ? 'snapshot' : 'unavailable', openCount: null }, byService: null };
  }
  const { openCount, byService } = countOpenMatches(feed.opportunities, services, today);
  return { feed: { source: 'live', openCount }, byService };
}

export interface VettingRowLike {
  qualification_key: string;
  completed_at: Date | string | null;
  fit_json: unknown;
  opportunity_json: unknown;
}

/**
 * PURE: the latest completed vetting per qualification (rows newest first or not - this sorts), kept only when its
 * close date is today or later; every partial/new capability becomes one gap. Soonest deadline first.
 */
export function extractOpenFitGaps(rows: readonly VettingRowLike[], today: string): FitGap[] {
  const ts = (v: Date | string | null): number => (v ? new Date(v).getTime() || 0 : 0);
  const latest = new Map<string, VettingRowLike>();
  for (const r of rows) {
    const prev = latest.get(r.qualification_key);
    if (!prev || ts(r.completed_at) > ts(prev.completed_at)) latest.set(r.qualification_key, r);
  }
  const gaps: FitGap[] = [];
  for (const r of latest.values()) {
    const opp = (r.opportunity_json ?? {}) as { title?: unknown; agency?: unknown; closeDate?: unknown };
    const closeDate = typeof opp.closeDate === 'string' ? opp.closeDate.slice(0, 10) : null;
    if (!closeDate || !isOpen(closeDate, today)) continue;
    const caps = (r.fit_json as { capabilities?: unknown } | null)?.capabilities;
    for (const c of Array.isArray(caps) ? caps : []) {
      if (!c || (c.assessment !== 'partial' && c.assessment !== 'new')) continue;
      gaps.push({
        qualificationKey: r.qualification_key, title: typeof opp.title === 'string' ? opp.title : null,
        buyer: typeof opp.agency === 'string' ? opp.agency : null, closeDate,
        capabilityId: String(c.id ?? ''), name: String(c.name ?? ''), assessment: c.assessment,
        matchedServiceId: typeof c.matchedServiceId === 'string' ? c.matchedServiceId : null,
      });
    }
  }
  return gaps.sort((a, b) => a.closeDate.localeCompare(b.closeDate) || a.qualificationKey.localeCompare(b.qualificationKey) || a.capabilityId.localeCompare(b.capabilityId));
}

export const VETTING_READ_LIMIT = 200;

/** Read the tenant's completed vettings (bounded) and extract the open gaps. null when the read fails. */
export async function loadOpenFitGaps(tenantId: string, today: string): Promise<FitGap[] | null> {
  try {
    const { default: GovAiVetting } = await import('../../models/GovAiVetting');
    const rows = await GovAiVetting.findAll({
      where: { tenant_id: tenantId, status: 'completed' },
      attributes: ['qualification_key', 'completed_at', 'fit_json', 'opportunity_json'],
      order: [['completed_at', 'DESC']], limit: VETTING_READ_LIMIT,
    });
    return extractOpenFitGaps(rows.map((r) => ((r as { get?: () => VettingRowLike }).get ? (r as { get: () => VettingRowLike }).get() : (r as unknown as VettingRowLike))), today);
  } catch (err) {
    logFail('service_evidence_fit_gaps_failed', err);
    return null;
  }
}
