import { Op } from 'sequelize';
import { CampaignLead, Visitor, VisitorSession } from '../../models';
import { getMetric } from '../adminOs/metricRegistry';
import {
  aggregateCredits,
  attributeLead,
  ATTRIBUTION_MODELS,
  type AttributionAggregate,
  type AttributionModel,
  type Touchpoint,
} from './attributionModels';

/**
 * campaignAttributionService — gathers touchpoints for a campaign's leads and runs the models.
 *
 * I/O only. Every judgement - which touch gets credit, whether the sum is right - lives in
 * `attributionModels.ts` and is tested there without a database.
 *
 * IDENTITY COVERAGE IS REPORTED, NOT ASSUMED. A lead can only be attributed if some visitor row
 * links to them, and the registry records that this link was only wired on 2026-09-04
 * (`growth.visitor_to_lead` is `partial`). So a campaign whose leads mostly predate that has
 * low coverage, and its attribution describes the covered minority. The coverage figure and
 * the registry's reason travel with every response so the page can say so - an attribution
 * chart over 12% of leads that does not say "12%" is a chart about the wrong population.
 */

export interface CampaignAttributionResult {
  campaignId: string;
  windowDays: number;
  /** Leads enrolled in the campaign. */
  leads: number;
  /** Leads with at least one linked visitor - the only ones attribution can say anything about. */
  identifiedLeads: number;
  /** identifiedLeads / leads. The population every chart below actually describes. */
  identityCoverage: number;
  /** Why coverage is what it is, from the registry. */
  coverageNote: string;
  models: Record<AttributionModel, AttributionAggregate>;
}

function sourceOf(s: { utm_source: string | null; referrer_domain: string | null }): { source: string; isDirect: boolean } {
  if (s.utm_source) return { source: s.utm_source.toLowerCase(), isDirect: false };
  if (s.referrer_domain) return { source: s.referrer_domain.toLowerCase(), isDirect: false };
  return { source: 'direct', isDirect: true };
}

export async function getCampaignAttribution(
  campaignId: string,
  windowDays = 30,
): Promise<CampaignAttributionResult> {
  const enrolments = await CampaignLead.findAll({
    where: { campaign_id: campaignId },
    attributes: ['lead_id', 'enrolled_at'],
  });

  const coverageNote =
    getMetric('growth.visitor_to_lead')?.statusReason ??
    'Identity resolution between visitors and leads is partial.';

  const empty = (): Record<AttributionModel, AttributionAggregate> =>
    Object.fromEntries(ATTRIBUTION_MODELS.map((m) => [m, aggregateCredits([])])) as Record<AttributionModel, AttributionAggregate>;

  if (enrolments.length === 0) {
    return { campaignId, windowDays, leads: 0, identifiedLeads: 0, identityCoverage: 0, coverageNote, models: empty() };
  }

  const leadIds = enrolments.map((e) => e.lead_id);
  const visitors = await Visitor.findAll({
    where: { lead_id: { [Op.in]: leadIds } },
    attributes: ['id', 'lead_id'],
  });

  const visitorToLead = new Map<string, number>();
  const leadToVisitors = new Map<number, string[]>();
  for (const v of visitors) {
    if (v.lead_id === null) continue;
    visitorToLead.set(v.id, v.lead_id);
    if (!leadToVisitors.has(v.lead_id)) leadToVisitors.set(v.lead_id, []);
    leadToVisitors.get(v.lead_id)!.push(v.id);
  }

  const sessions = visitors.length === 0
    ? []
    : await VisitorSession.findAll({
        where: { visitor_id: { [Op.in]: visitors.map((v) => v.id) } },
        attributes: ['visitor_id', 'utm_source', 'referrer_domain', 'created_at'],
        order: [['created_at', 'ASC']],
      });

  const touchpointsByLead = new Map<number, Touchpoint[]>();
  for (const s of sessions) {
    const leadId = visitorToLead.get(s.visitor_id);
    if (leadId === undefined) continue;
    const { source, isDirect } = sourceOf(s);
    if (!touchpointsByLead.has(leadId)) touchpointsByLead.set(leadId, []);
    touchpointsByLead.get(leadId)!.push({
      occurredAt: new Date(s.created_at).toISOString(),
      source,
      isDirect,
    });
  }

  const identifiedLeads = leadToVisitors.size;

  const models = {} as Record<AttributionModel, AttributionAggregate>;
  for (const model of ATTRIBUTION_MODELS) {
    const credits = enrolments
      // Only leads with an identity link are attributed. Unlinked leads are not "unknown source"
      // - they are unknown IDENTITY, which is a different fact and is reported as coverage.
      .filter((e) => leadToVisitors.has(e.lead_id))
      .map((e) =>
        attributeLead(
          String(e.lead_id),
          touchpointsByLead.get(e.lead_id) ?? [],
          model,
          windowDays,
          new Date(e.enrolled_at).toISOString(),
        ),
      );
    models[model] = aggregateCredits(credits);
  }

  return {
    campaignId,
    windowDays,
    leads: enrolments.length,
    identifiedLeads,
    identityCoverage: enrolments.length === 0 ? 0 : identifiedLeads / enrolments.length,
    coverageNote,
    models,
  };
}
