import type { CampaignFunnelStage } from '../../models/Campaign';
import type { TrustOracle } from './needsAttentionQueue';

/**
 * campaignRanking — which number a campaign should be judged by, given what it is FOR.
 *
 * THE DEFECT THIS REPLACES. The performance table sorted every campaign by visitor count, and
 * before that by whatever column the operator last clicked. An awareness campaign and an
 * acquisition campaign sat in one list ordered by one number, so the campaign that was best at
 * its own job could sit at the bottom because it was worst at someone else's. "Ranked on likes"
 * is the short version of that mistake.
 *
 * THE COLLISION THIS HAS TO SURVIVE. The obvious metric for an acquisition campaign is cost per
 * lead or ROAS - and both are registered `unavailable`, because there is no spend source. So
 * "rank acquisition campaigns on CPL" cannot be done today, and pretending to (by sorting on a
 * column that is always null) would rank them on nothing while looking deliberate.
 *
 * So each objective carries a LADDER: the metrics that would judge it, best first. The first
 * one the registry trusts wins. If the winner was not the first rung, that is a FALLBACK and it
 * is reported - the operator sees "ranked by leads, because CPL has no data source" rather than
 * a sort order that quietly means something other than what the column header implies.
 *
 * The oracle is injected, as in needsAttentionQueue, so the tests prove the ladder mechanism
 * rather than the registry's opinion on one particular day.
 */

/** A rung: a registry key and how to read the campaign row for it. */
export interface RankingRung {
  metricKey: string;
  /** Column on the campaign metric row that carries this value. */
  column: string;
  /** Whether a LOWER value is better (cost metrics) or a higher one is. */
  direction: 'asc' | 'desc';
  label: string;
}

export interface ResolvedRanking {
  objective: CampaignFunnelStage | 'unset';
  /** Null when NO rung on the ladder is trusted - the objective cannot be ranked honestly. */
  rung: RankingRung | null;
  /** True when the resolved rung was not the ladder's first choice. */
  fallback: boolean;
  /** Plain-language account of the decision. Always present, so the UI can show it. */
  reason: string;
}

const LEADS: RankingRung = { metricKey: 'marketing.campaign_leads', column: 'leads_count', direction: 'desc', label: 'Leads' };
const ENGAGEMENT: RankingRung = { metricKey: 'marketing.campaign_engagement', column: 'engagement_count', direction: 'desc', label: 'Engagement' };
const CPL: RankingRung = { metricKey: 'marketing.cost_per_lead', column: 'cost_per_lead', direction: 'asc', label: 'Cost per lead' };
const ROAS: RankingRung = { metricKey: 'marketing.roas', column: 'roas', direction: 'desc', label: 'ROAS' };
const IMPRESSIONS: RankingRung = { metricKey: 'marketing.impressions', column: 'impressions', direction: 'desc', label: 'Impressions' };
const VISITORS: RankingRung = { metricKey: 'marketing.campaign_visitors', column: 'visitors_count', direction: 'desc', label: 'Visitors' };

/**
 * The ladders. Order within each is the argument.
 *
 * Awareness deliberately does NOT fall through to leads: ranking a reach campaign on leads is
 * the exact "wrong job" error this module exists to stop. If nothing on its ladder is trusted,
 * the honest answer is that it cannot be ranked yet - and that is what gets said.
 */
export const RANKING_LADDERS: Record<CampaignFunnelStage | 'unset', readonly RankingRung[]> = {
  awareness: [IMPRESSIONS, VISITORS],
  consideration: [ENGAGEMENT],
  conversion: [CPL, ROAS, LEADS],
  retention: [ENGAGEMENT],
  advocacy: [ENGAGEMENT],
  // No stage set: leads is the least-wrong universal default, and the reason says it is one.
  unset: [LEADS],
};

export function resolveRanking(
  objective: CampaignFunnelStage | null | undefined,
  oracle: TrustOracle,
): ResolvedRanking {
  const key = objective ?? 'unset';
  const ladder = RANKING_LADDERS[key];

  for (let i = 0; i < ladder.length; i += 1) {
    const rung = ladder[i];
    if (!oracle.mayCompute(rung.metricKey)) continue;

    if (i === 0) {
      return {
        objective: key,
        rung,
        fallback: false,
        reason: key === 'unset'
          ? `No funnel stage is set, so campaigns are ranked by ${rung.label.toLowerCase()} as a general default.`
          : `Ranked by ${rung.label.toLowerCase()}, the primary measure for a ${key} campaign.`,
      };
    }

    // A later rung won. Say which earlier ones were skipped and why, in the registry's words.
    const skipped = ladder.slice(0, i).map((r) => `${r.label.toLowerCase()} (${oracle.reasonFor(r.metricKey)})`);
    return {
      objective: key,
      rung,
      fallback: true,
      reason: `Ranked by ${rung.label.toLowerCase()} instead of ${skipped.join(' or ')}.`,
    };
  }

  return {
    objective: key,
    rung: null,
    fallback: true,
    reason:
      `A ${key} campaign cannot be ranked honestly yet: ` +
      ladder.map((r) => `${r.label.toLowerCase()} is ${oracle.reasonFor(r.metricKey)}`).join('; ') +
      '. Shown in arrival order.',
  };
}

/**
 * Resolve every objective at once, for the API to hand to the table.
 *
 * One call per objective rather than one per campaign: the answer depends only on the
 * objective and the registry, never on the row, so computing it per row would repeat the same
 * decision N times and invite it to drift between rows.
 */
export function resolveAllRankings(oracle: TrustOracle): Record<string, ResolvedRanking> {
  const out: Record<string, ResolvedRanking> = {};
  for (const key of Object.keys(RANKING_LADDERS) as (CampaignFunnelStage | 'unset')[]) {
    out[key] = resolveRanking(key === 'unset' ? null : key, oracle);
  }
  return out;
}
