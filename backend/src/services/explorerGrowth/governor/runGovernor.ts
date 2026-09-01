import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { ExplorerJourneyProfile, ExplorerJourneyDecision, Campaign } from '../../../models';
import { env } from '../../../config/env';
import { isExplorerFeatureEnabled } from '../../../config/explorerGrowthFlags';
import { readLearnerSignals } from '../explorerSignalReader';
import { scoreLearner } from '../explorerScoringService';
import { resolveContactability } from '../explorerContactabilityService';
import { decideForLearner, RULESET_VERSION } from './decideForLearner';
import { safeConsent } from './contactPolicy';
import { redactForLogs } from '../../../utils/piiRedaction';
import { resolveAllForCandidate } from '../content/resolveContentAssets';
import { isFreePreviewTier } from '../../access/contentEntitlement';
import type { Candidate, ContactPolicyInput, GovernorContext } from './types';

/**
 * Explorer Growth OS — Governor batch runner. Plan §9; EPIC 4 T005.
 *
 * Decides for every Explorer and persists one row each. SHADOW ONLY: rows are
 * written with `executed: false` and nothing is enqueued or sent.
 *
 * CONTACTABILITY IS RE-RESOLVED HERE, not read from the profile. EPIC 3 stores
 * a copy for inspection, but a stored eligibility goes stale the moment someone
 * unsubscribes — and this is the code path where that would matter.
 */

export interface GovernorRunResult {
  attempted: number;
  decided: number;
  waited: number;
  failed: number;
  errors: Array<{ enrollment_id: string; error: string }>;
}

/** Contact history for the frequency cap and cooldown. */
async function contactHistory(
  enrollmentId: string,
  asOf: Date,
): Promise<{ recentContactCount: number; hoursSinceLastContact: number | null }> {
  try {
    const rows = await sequelize.query<{ n: string; last: Date | null }>(
      `SELECT COUNT(*)::text AS n, MAX(created_at) AS last
         FROM explorer_journey_decisions
        WHERE enrollment_id = :enrollmentId
          AND executed = true
          AND created_at > :since`,
      {
        replacements: { enrollmentId, since: new Date(asOf.getTime() - 7 * 86_400_000) },
        type: QueryTypes.SELECT,
      },
    );
    const r = rows[0];
    const last = r?.last ? new Date(r.last) : null;
    return {
      recentContactCount: Number(r?.n ?? 0),
      hoursSinceLastContact: last ? (asOf.getTime() - last.getTime()) / 3_600_000 : null,
    };
  } catch (err: any) {
    // Fail CLOSED: if history is unreadable, assume the cap is reached rather
    // than assuming a clean slate. An unknown contact history is not permission.
    console.warn(
      redactForLogs(
        JSON.stringify({
          event: 'governor.contact_history_failed',
          service: 'explorer-growth',
          level: 'warn',
          outcome: 'failure',
          error_class: err?.name || 'ContactHistoryError',
          enrollment_id: enrollmentId,
        }),
      ),
    );
    return { recentContactCount: Number.MAX_SAFE_INTEGER, hoursSinceLastContact: 0 };
  }
}

/** One learner: gather context, decide, persist. */
/**
 * campaign_key -> campaign id, loaded ONCE per batch.
 *
 * EPIC 6 T005. `runGovernor.ts:198` has said since EPIC 4 that
 * `selected_campaign_id` stays null "until EPIC 6 resolves a real campaign";
 * this is that.
 *
 * HOISTED DELIBERATELY. Eight campaigns against 143 learners is one query, not
 * 143 round trips on the nightly run.
 *
 * RESOLVED BY `settings.campaign_key`, NEVER BY NAME. `campaigns` has no key
 * column and names are human-editable labels — someone renaming a campaign in
 * Admin must not orphan it from the Governor, and the symptom would be
 * `selected_campaign_id` going quietly null, which reads as "the Governor
 * declined to pick one" rather than as a broken join.
 */
async function loadCampaignKeyMap(): Promise<Map<string, string>> {
  const rows = await Campaign.findAll({ attributes: ['id', 'settings'] });
  const map = new Map<string, string>();
  for (const r of rows) {
    const key = ((r.get('settings') as Record<string, any>) ?? {}).campaign_key;
    if (typeof key === 'string' && key) map.set(key, r.get('id') as string);
  }
  return map;
}

async function runOne(
  profile: any,
  asOf: Date,
  dryRun: boolean,
  campaignsByKey: Map<string, string>,
): Promise<'decided' | 'waited'> {
  const enrollmentId = profile.enrollment_id as string;

  const readout = await readLearnerSignals(enrollmentId, { asOf });
  const scores = scoreLearner(readout);

  // Re-resolved now, never the stored copy.
  const contactability = await resolveContactability({
    enrollmentId,
    leadId: profile.lead_id ?? null,
    email: profile.email_normalized ?? null,
  });

  const history = await contactHistory(enrollmentId, asOf);

  const ctx: GovernorContext = {
    enrollment_id: enrollmentId,
    primary_state: profile.primary_state,
    overlays: profile.overlays ?? [],
    scores: { e: scores.e, i: scores.i, f: scores.f },
    affinities: profile.affinities ?? [],
    readout,
    days_in_current_state: profile.state_entered_at
      ? Math.floor((asOf.getTime() - new Date(profile.state_entered_at).getTime()) / 86_400_000)
      : 0,
    contactability,
    hardStop: {
      // CONVERTED is the state machine's verdict, already computed by EPIC 3.
      // Re-deriving it here would be a second definition to keep in step.
      converted: profile.primary_state === 'CONVERTED',
      // TIER 0 IS SUPPRESSION, NOT CHANNEL AVAILABILITY. A first version mapped
      // "email ineligible" to unsubscribed and "no sms AND no voice" to dnc,
      // which blocked ALL 153 learners: SMS and voice are correctly ineligible
      // for everyone, because the TCPA gate permits nobody without an express
      // consent record. Having no phone channel is not "do not contact" - it
      // just means no phone channel, and the generators already fall back to
      // in-app on their own.
      //
      // So these read the REASON, not the eligibility flag: only a genuine
      // suppression status stops the whole decision.
      unsubscribed: /unsubscrib|complain/i.test(contactability.email?.reason ?? ''),
      dnc: /dnd|do_not/i.test(
        `${contactability.email?.reason ?? ''} ${contactability.sms?.reason ?? ''}`,
      ),
      consentRevoked: false,
      killSwitch: false,
      campaignInactive: false,
    },
    asOf,
  };

  const policyInputFor = (c: Candidate): ContactPolicyInput => {
    const ch = c.channel === 'none' ? null : (contactability as any)[c.channel];
    return {
      channelEligible: ch?.eligible === true,
      channelReason: ch?.reason,
      // The consent verdict already lives in the contactability object EPIC 3
      // built; `hasRecord` is false unless a real record backed it.
      consent: {
        verdict: ch?.eligible === true ? 'allow' : 'block',
        reason: ch?.reason || 'can_spam_opt_out',
        hasRecord: ch?.reason ? ch.reason !== 'can_spam_opt_out' : false,
      },
      ...history,
    };
  };

  const decision = decideForLearner(ctx, {
    policyInputFor,
    profileTimestamps: {
      created_at: profile.created_at,
      scores_computed_at: profile.scores_computed_at,
    },
  });

  // EPIC 5. Resolve the WINNING candidate's asset queries here rather than
  // inside decideForLearner, which is pure by design and must stay usable
  // without a database. `decision.required_assets` is the winner's OWN list -
  // not a re-derivation from candidate_actions, which holds every candidate's
  // and would attach a suppressed action's content to a decision that never
  // chose it.
  //
  // A gap does NOT drop the decision. It records with the reason named, which
  // is what lets the shadow review say "these N have no asset behind them"
  // rather than quietly showing fewer rows.
  // EPIC 7 — THE LOCKED-LESSON GATE.
  //
  // `isFreePreviewTier` is the SAME function the portal gates on
  // (`timelineService.ts:231`), so what the Governor may recommend and what the
  // learner can actually open cannot drift apart. Asking a second source, or
  // re-deriving the rule here, is how those two ends disagree.
  //
  // Measured before this landed: 12 free-preview learners were being sent a
  // week-9 lesson that would have shown them a paywall. Nothing had sent, but it
  // was one flag away.
  //
  // KNOWN RESIDUAL, stated because the safe-sounding version would be false:
  // `isFreePreviewTier` swallows its own errors and returns `false` — meaning
  // FULL ACCESS — so a lookup failure widens the pool rather than narrowing it.
  // That is the wrong direction here, and this call site cannot tell an error
  // apart from a genuine full-access answer.
  //
  // Not "fixed" by re-deriving the rule locally: a second copy of the gate is
  // exactly the drift this epic exists to remove, and a wrong copy would be
  // worse than a rare permissive failure. The right fix is a variant of
  // isFreePreviewTier that surfaces its error, which belongs with that function
  // rather than here. Recorded rather than papered over.
  const tier = (await isFreePreviewTier(enrollmentId)) ? 'free_preview' : 'full_access';

  const { assets: resolvedAssets, gaps: assetGaps } = await resolveAllForCandidate(
    decision.required_assets,
    ctx.asOf,
    tier,
  );

  // EPIC 6 T005. The winning candidate's campaign_key -> a real campaign id.
  //
  // A MISSING CAMPAIGN LEAVES THE ID NULL AND NAMES THE GAP. It never falls back
  // to another campaign: the eight keys mean eight different messages, and
  // substituting one for another would send a dormant learner an enrollment offer
  // while every count still looked healthy. Same discipline as the content
  // resolver, which refuses by name rather than picking something else.
  const campaignId = decision.campaign_key
    ? (campaignsByKey.get(decision.campaign_key) ?? null)
    : null;
  const campaignGap =
    decision.campaign_key && !campaignId
      ? `no campaign for key: ${decision.campaign_key}`
      : null;

  if (!dryRun) {
    const existing = await ExplorerJourneyDecision.findOne({
      where: { enrollment_id: enrollmentId, decision_date: decision.decision_date },
    });
    // Column names verified against accelerator_dev1, NOT assumed. The first
    // draft wrote `campaign_key` and `rationale`, neither of which exists - the
    // real columns are `selected_campaign_id` and `reason` - and omitted `mode`
    // and `reason`, both NOT NULL with no default. Every one of the 141 unit
    // tests passed because the models barrel is mocked; the insert would have
    // failed on the first real row.
    const payload = {
      mode: 'shadow',
      primary_state: ctx.primary_state,
      overlays: ctx.overlays as any,
      e_score: Math.round(ctx.scores.e),
      i_score: Math.round(ctx.scores.i),
      f_score: Math.round(ctx.scores.f),
      lead_id: profile.lead_id ?? null,
      selected_action: decision.action_type,
      channel: decision.channel,
      candidate_actions: decision.candidate_actions as any,
      suppressed_actions: decision.suppressed_actions as any,
      // Null until EPIC 6; a real id from here on, or null WITH a named gap.
      selected_campaign_id: campaignId,
      // Until EPIC 5 NOTHING anywhere assigned this column, and all 153 rows
      // read `[]` - every decision naming an asset type with no asset behind it.
      selected_content_assets: resolvedAssets as any,
      // `reason` is the NOT NULL text column. The campaign key lives inside
      // candidate_actions (jsonb) rather than being invented as a column, and
      // selected_campaign_id stays null until EPIC 6 resolves a real campaign.
      reason: [
        ...decision.rationale,
        decision.campaign_key ? `campaign=${decision.campaign_key}` : null,
        decision.consent_note ? `consent: ${decision.consent_note}` : null,
        // Named, not counted. "3 gaps" tells a reviewer nothing about WHICH
        // purpose has no content behind it.
        assetGaps.length ? `asset gaps: ${assetGaps.join(', ')}` : null,
        campaignGap,
      ]
        .filter(Boolean)
        .join(' | '),
      ai_involved: false,
      ruleset_version: RULESET_VERSION,
      executed: false,
    };
    if (existing) await existing.update(payload as any);
    else
      await ExplorerJourneyDecision.create({
        enrollment_id: enrollmentId,
        decision_date: decision.decision_date,
        ...payload,
      } as never);
  }

  return decision.action_type === 'WAIT' ? 'waited' : 'decided';
}

/** Decide for every Explorer. One learner's failure never aborts the batch. */
export async function runGovernorBatch(
  options: { asOf?: Date; dryRun?: boolean; limit?: number } = {},
): Promise<GovernorRunResult> {
  const asOf = options.asOf ?? new Date();
  // One query for all eight, before the loop. EPIC 6 T005.
  const campaignsByKey = await loadCampaignKeyMap();
  const profiles = await ExplorerJourneyProfile.findAll({
    ...(options.limit ? { limit: options.limit } : {}),
  });

  const out: GovernorRunResult = {
    attempted: profiles.length,
    decided: 0,
    waited: 0,
    failed: 0,
    errors: [],
  };

  for (const p of profiles) {
    const id = (p as any).enrollment_id as string;
    try {
      const outcome = await runOne(p, asOf, options.dryRun === true, campaignsByKey);
      if (outcome === 'decided') out.decided += 1;
      else out.waited += 1;
    } catch (err: any) {
      out.failed += 1;
      out.errors.push({ enrollment_id: id, error: err?.message ?? 'unknown' });
    }
  }

  return out;
}

/**
 * Flag-gated entry point for the cron.
 *
 * Read through `isExplorerFeatureEnabled` so BOTH the master flag and
 * `journeyGovernor` must be on. The operator script calls `runGovernorBatch`
 * directly instead — a human running it deliberately is its own authorisation.
 */
export async function runScheduledGovernor(
  options: { asOf?: Date } = {},
): Promise<GovernorRunResult | { skipped: true }> {
  if (!isExplorerFeatureEnabled('journeyGovernor', env.explorerGrowth)) {
    return { skipped: true };
  }
  return runGovernorBatch(options);
}

export { safeConsent };
