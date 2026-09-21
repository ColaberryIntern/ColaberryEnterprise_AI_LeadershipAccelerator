import { Op } from 'sequelize';
import { isExplorerFeatureEnabled, type ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import { CampaignLead, CommunicationLog, ExplorerJourneyProfile } from '../../../models';
import { ALI_DAILY_CAP, type AliOutreachContext, type AliOutreachVerdict } from '../../explorerGrowth/explorerAliOutreachService';
import { startOfUtcDay } from './controlsRepo';

/**
 * The Ali-outreach eligibility context, built from stored rows (Phase 5
 * T516). `evaluateAliOutreachEligibility` is a pure function over a context
 * nothing in production built until now; the adapter's `ali_outreach` branch
 * builds it here before Ali's own campaign enrols anyone, and the executor
 * reads one of its facts before the claim.
 *
 * ─── WHERE EACH FACT COMES FROM ─────────────────────────────────────────────
 *
 *   overlays, E, F, tier, converted   the Explorer journey profile (by enrolment,
 *                                     else by lead): `overlays`, `e_score`,
 *                                     `f_score`, `signal_summary.highestIntentTier`,
 *                                     `primary_state === 'CONVERTED'`. No profile
 *                                     → no context: Ali's outreach is the
 *                                     Explorer programme's, and a subject without
 *                                     a profile has no intent record to judge.
 *   emailEligible                     the adapter's own contact-evidence check,
 *                                     already made before this is called.
 *   daysSinceLastAliOutreach          the newest `communication_logs` row carrying
 *                                     `metadata.trigger = ali_personal_outreach`
 *                                     for the lead - the cron's own marker.
 *   aliSendsToday                     Ali's campaign enrolments TODAY (UTC), the
 *                                     count the cron itself caps on - CRM leads
 *                                     and Explorers together, one campaign.
 *   flagEnabled                       EXPLORER_ALI_OUTREACH_ENABLED, via the
 *                                     sanctioned reader.
 *
 * READ-ONLY. Ids and numbers only; the reason codes below are what a receipt
 * and a ledger row carry, never the evaluator's prose.
 */

const DAY = 86_400_000;
const TRIGGER = 'ali_personal_outreach';

/** Ali's campaign enrolments so far today (UTC) - the cron's cap counts the same rows. */
export async function aliSendsToday(campaignId: string, asOf: Date): Promise<number> {
  return CampaignLead.count({ where: { campaign_id: campaignId, enrolled_at: { [Op.gte]: startOfUtcDay(asOf) } } });
}

/** Days since Ali last wrote to the lead, by the outreach marker the cron stamps; null when never. */
export async function daysSinceLastAliOutreach(leadId: number, asOf: Date): Promise<number | null> {
  const last = await CommunicationLog.findOne({
    where: { lead_id: leadId, metadata: { trigger: TRIGGER } } as never,
    attributes: ['created_at'],
    order: [['created_at', 'DESC']],
  });
  const at = last ? (last.get('created_at') as Date | string | null) : null;
  return at ? Math.floor((asOf.getTime() - new Date(at).getTime()) / DAY) : null;
}

export interface BuildAliContextArgs {
  enrollmentId: string | null;
  leadId: number;
  campaignId: string;
  emailEligible: boolean;
  explorerFlags: ExplorerGrowthFlags;
  asOf: Date;
}

export type BuildAliContextResult = { ok: true; context: AliOutreachContext } | { ok: false; reason: 'ali_no_profile' };

export async function buildAliOutreachContext(args: BuildAliContextArgs): Promise<BuildAliContextResult> {
  const profile = await ExplorerJourneyProfile.findOne({ where: args.enrollmentId ? { enrollment_id: args.enrollmentId } : { lead_id: args.leadId } });
  if (!profile) return { ok: false, reason: 'ali_no_profile' };
  const summary = (profile.get('signal_summary') as Record<string, unknown> | null) ?? {};
  const tier = Number(summary.highestIntentTier ?? 0);
  const [days, sends] = await Promise.all([daysSinceLastAliOutreach(args.leadId, args.asOf), aliSendsToday(args.campaignId, args.asOf)]);
  return {
    ok: true,
    context: {
      overlays: ((profile.get('overlays') as string[] | null) ?? []),
      highestSignalTier: Number.isFinite(tier) ? tier : 0,
      eScore: Number(profile.get('e_score')),
      fScore: Number(profile.get('f_score')),
      isConverted: profile.get('primary_state') === 'CONVERTED',
      emailEligible: args.emailEligible,
      daysSinceLastAliOutreach: days,
      aliSendsToday: sends,
      flagEnabled: isExplorerFeatureEnabled('aliOutreach', args.explorerFlags),
    },
  };
}

/** The evaluator speaks prose; a receipt carries a code. The day's cap is the one transient reason - the rest are the subject's. */
export function aliRefusalCode(verdict: AliOutreachVerdict, context: AliOutreachContext): { code: string; transient: boolean } {
  const other = verdict.reasons.filter((r) => !r.includes(`cap ${ALI_DAILY_CAP}`));
  if (other.length === 0 && context.aliSendsToday >= ALI_DAILY_CAP) return { code: 'ali_cap', transient: true };
  const first = other[0] ?? '';
  const code = first.includes('is off') ? 'ali_flag_off'
    : first.includes('HIGH_INTENT') ? 'ali_no_high_intent'
    : first.includes('signal tier') ? 'ali_signal_tier'
    : first.includes('E score') || first.includes('F score') || first.includes('finite') ? 'ali_scores'
    : first.includes('converted') ? 'ali_converted'
    : first.includes('email eligible') ? 'ali_not_email_eligible'
    : first.includes('cooldown') ? 'ali_cooldown'
    : 'ali_ineligible';
  return { code, transient: false };
}
