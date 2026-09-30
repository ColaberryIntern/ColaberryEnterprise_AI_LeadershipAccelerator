import type { ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { Campaign, GrowthJourneyEnrollment } from '../../../models';
import { classifyError } from '../../../utils/errorClassifier';
import { decideForSubjectAndRecord, type DecideAndRecordResult } from '../decisionService';

/**
 * The re-decision on a reply (Phase 5 T515): once the reply's classification
 * has resolved, decide for the subject again with `trigger: 'reply'`, under
 * each brand the reply belongs to.
 *
 * ─── WHICH BRAND ────────────────────────────────────────────────────────────
 *
 * The replied-to campaign's brand when the webhook resolved a campaign that
 * carries one - a reply to a brand's sequence is that brand's to re-decide.
 * Otherwise every brand where the lead has an ACTIVE journey enrolment, at
 * most MAX_BRANDS. Neither → no re-decision, logged. The brand is never
 * inferred from the address or the message.
 *
 * ─── FIRE-AND-FORGET, NEVER THROWS ──────────────────────────────────────────
 *
 * The hook calls this after `classifySubject` resolves and does not await it
 * for the webhook's sake; a throw here is one line with its class. With
 * `journeyDecisions` off - production today - it returns `disabled` before
 * any read, and `decideForSubjectAndRecord` is not called at all.
 */

export const MAX_BRANDS = 4;

export interface RedecideOnReplyArgs {
  leadId: number;
  campaignId: string | null;
  flags: GrowthJourneyFlags;
  explorerFlags?: ExplorerGrowthFlags;
  asOf?: Date;
}

export type RedecideOnReplyResult =
  | { status: 'disabled' }
  | { status: 'no_brand' }
  | { status: 'decided'; brands: Array<{ brand_id: string; source: 'campaign' | 'enrollment'; result: DecideAndRecordResult['status'] | 'failed' }> };

/** The brands a reply re-decides under: the campaign's, else the lead's active enrolments' (deduplicated, bounded). */
export async function brandsForReply(leadId: number, campaignId: string | null): Promise<Array<{ brand_id: string; source: 'campaign' | 'enrollment' }>> {
  if (campaignId) {
    const campaign = await Campaign.findByPk(campaignId, { attributes: ['id', 'brand_id'] });
    const brandId = (campaign?.get('brand_id') as string | null | undefined) ?? null;
    if (brandId) return [{ brand_id: brandId, source: 'campaign' }];
  }
  const enrolments = await GrowthJourneyEnrollment.findAll({ where: { lead_id: leadId, status: 'active' }, attributes: ['brand_id'], order: [['created_at', 'ASC']] });
  const seen = new Set<string>();
  const out: Array<{ brand_id: string; source: 'campaign' | 'enrollment' }> = [];
  for (const row of enrolments) {
    const brandId = String(row.get('brand_id'));
    if (seen.has(brandId)) continue;
    seen.add(brandId);
    out.push({ brand_id: brandId, source: 'enrollment' });
    if (out.length === MAX_BRANDS) break;
  }
  return out;
}

export async function redecideOnReply(args: RedecideOnReplyArgs): Promise<RedecideOnReplyResult> {
  if (!isGrowthJourneyCapabilityEnabled('journeyDecisions', args.flags)) return { status: 'disabled' };
  const brands = await brandsForReply(args.leadId, args.campaignId);
  if (brands.length === 0) {
    console.log(JSON.stringify({ level: 'info', service: 'growth-journey', event: 'growth_journey.reply.no_brand', outcome: 'success', context: { lead_id: args.leadId, campaign_id: args.campaignId } }));
    return { status: 'no_brand' };
  }
  const decided: Array<{ brand_id: string; source: 'campaign' | 'enrollment'; result: DecideAndRecordResult['status'] | 'failed' }> = [];
  for (const brand of brands) {
    try {
      const r = await decideForSubjectAndRecord({ anchor: { leadId: args.leadId }, brandId: brand.brand_id, trigger: 'reply', flags: args.flags, explorerFlags: args.explorerFlags, asOf: args.asOf });
      decided.push({ ...brand, result: r.status });
    } catch (err: unknown) {
      // One brand's failure is one line; the next brand still decides.
      console.error(JSON.stringify({ level: 'error', service: 'growth-journey', event: 'growth_journey.reply.redecide_failed', outcome: 'failure', error_class: classifyError(err), context: { lead_id: args.leadId, brand_id: brand.brand_id } }));
      decided.push({ ...brand, result: 'failed' });
    }
  }
  return { status: 'decided', brands: decided };
}
