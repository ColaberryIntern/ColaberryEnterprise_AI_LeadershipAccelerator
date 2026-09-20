import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { isExplorerFeatureEnabled, type ExplorerGrowthFeature, type ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import { isKillSwitchActiveStrict } from '../../launchSafety';
import { countExecutionsToday, findActivePause, findActiveRollout, type ActiveControl } from './controlsRepo';
import { describeScopeKey, pauseScopeKeysFor, rolloutScopeKey } from './scopeKey';

/**
 * What this run may do to one person, in one brand, on one channel, right now
 * (§14 rollout modes; Phase 5 T504).
 *
 * ─── TWO QUESTIONS, NOT ONE ─────────────────────────────────────────────────
 *
 * `resolveExecutionMode` answers "may a NEW execution be planned?" and walks
 * the whole ladder, limits and cohorts included. `resolveExecutionHold` answers
 * the narrower "must work ALREADY IN FLIGHT stop?" and deliberately does not
 * look at rollout rows, cohorts or daily limits: clearing a rollout, removing
 * someone from a cohort or filling the day's quota must stop the NEXT plan, not
 * cancel an email that is already enrolled. Only a flag, the kill switch or a
 * pause reaches into work in flight — and each of those is a deliberate stop.
 *
 * ─── THE ORDER IS THE POINT ─────────────────────────────────────────────────
 *
 *   1  master flag                     off      flag_master_off
 *   2  journeyExecution flag           shadow   flag_execution_off (observe when decisions are off too)
 *   3  the channel's Explorer sub-flag shadow   explorer_flag_off:<flag>
 *   4  sms / voice                     off      channel_not_authorized
 *   5  the global kill switch          off      kill_switch | kill_switch_unreadable
 *   6  the most specific active pause  off      pause:<scope>
 *   7  the rollout row                 review | limited   (none: shadow / no_rollout)
 *   8  cohort and daily limit          shadow / not_in_cohort | review / daily_limit_reached
 *   9  ali_outreach is capped at review
 *
 * Nothing below can raise what something above lowered. The kill switch is read
 * STRICTLY: a switch that cannot be read is treated as ON, because the one flag
 * that can cause a person to be contacted may not fail open.
 */

export type ExecutionMode = 'off' | 'observe' | 'shadow' | 'review' | 'limited';

/** Phase 5's channels. `sms` and `voice` are named so they can be REFUSED by name, never executed. */
export type ExecutionChannel = 'email' | 'in_app' | 'ali_outreach' | 'sms' | 'voice';

const EXPLORER_FLAG_BY_CHANNEL: Partial<Record<ExecutionChannel, ExplorerGrowthFeature>> = {
  in_app: 'inAppNudge',
  ali_outreach: 'aliOutreach',
};

/** Channels this phase may execute at all; everything else is refused before any row is read. */
export const EXECUTABLE_CHANNELS: readonly ExecutionChannel[] = ['email', 'in_app', 'ali_outreach'];

/** Ali outreach is a person's own voice: it may be prepared for review, never sent by a cohort rule. */
export const REVIEW_ONLY_CHANNELS: readonly ExecutionChannel[] = ['ali_outreach'];

export interface ModeTarget {
  tenantId: string;
  brandId: string;
  programId: string;
  channel: ExecutionChannel;
  subjectRef?: string | null;
  leadId?: number | null;
  asOf: Date;
  flags: GrowthJourneyFlags;
  explorerFlags: ExplorerGrowthFlags;
}

export interface ModeResult {
  mode: ExecutionMode;
  reason: string;
  /** The control rows that decided it, for the receipt and the ledger. */
  control_ids: string[];
}

export interface HoldResult {
  held: boolean;
  reason: string | null;
  control_ids: string[];
}

const result = (mode: ExecutionMode, reason: string, control?: ActiveControl | null): ModeResult => ({
  mode,
  reason,
  control_ids: control ? [control.id] : [],
});

/**
 * Steps 1-6: everything that can STOP work, in order. Shared by both readers so
 * the planner and the hold can never disagree about a flag, the kill switch or
 * a pause.
 */
async function resolveStops(target: ModeTarget): Promise<ModeResult | null> {
  const { flags, explorerFlags, channel } = target;

  if (!flags.growthJourneyEnabled) return result('off', 'flag_master_off');

  if (!isGrowthJourneyCapabilityEnabled('journeyExecution', flags)) {
    return isGrowthJourneyCapabilityEnabled('journeyDecisions', flags)
      ? result('shadow', 'flag_execution_off')
      : result('observe', 'flag_decisions_off');
  }

  const explorerFlag = EXPLORER_FLAG_BY_CHANNEL[channel];
  if (explorerFlag && !isExplorerFeatureEnabled(explorerFlag, explorerFlags)) {
    // Both families must agree. Either off means off, so they cannot disagree silently.
    return result('shadow', `explorer_flag_off:${explorerFlag}`);
  }

  if (!EXECUTABLE_CHANNELS.includes(channel)) return result('off', 'channel_not_authorized');

  try {
    if (await isKillSwitchActiveStrict()) return result('off', 'kill_switch');
  } catch {
    // An unreadable switch is treated as ON. This is the one place in the run that fails CLOSED on a read error.
    return result('off', 'kill_switch_unreadable');
  }

  const pause = await findActivePause(target.tenantId, pauseScopeKeysFor({
    brandId: target.brandId,
    programId: target.programId,
    channel,
    subjectRef: target.subjectRef ?? null,
  }));
  if (pause) return result('off', describeScopeKey(pause.scope_key), pause);

  return null;
}

/** May a NEW execution be planned for this target? */
export async function resolveExecutionMode(target: ModeTarget): Promise<ModeResult> {
  const stopped = await resolveStops(target);
  if (stopped) return stopped;

  const rollout = await findActiveRollout(target.tenantId, rolloutScopeKey({
    brandId: target.brandId,
    programId: target.programId,
    channel: target.channel,
  }));
  if (!rollout) return result('shadow', 'no_rollout');

  if (REVIEW_ONLY_CHANNELS.includes(target.channel)) {
    // Whatever the row says: Ali's own outreach is prepared for review, never released by a cohort rule.
    return result('review', rollout.mode === 'limited' ? 'review_only_channel' : 'rollout', rollout);
  }

  if (rollout.mode !== 'limited') return result('review', 'rollout', rollout);

  const cohort = rollout.cohort_lead_ids ?? [];
  if (target.leadId === null || target.leadId === undefined || !cohort.includes(target.leadId)) {
    return result('shadow', 'not_in_cohort', rollout);
  }

  const used = await countExecutionsToday(
    { tenantId: target.tenantId, brandId: target.brandId, programId: target.programId, channel: target.channel },
    target.asOf,
  );
  if (rollout.daily_limit !== null && used >= rollout.daily_limit) {
    // The day's quota is spent: a human may still approve one, but no cohort rule releases it.
    return result('review', 'daily_limit_reached', rollout);
  }

  return result('limited', 'rollout', rollout);
}

/**
 * Must work already in flight stop? Flags, the kill switch and pauses only.
 *
 * A cleared rollout, a cohort change or a spent daily limit deliberately do NOT
 * hold: they govern what may be planned next, not what is already enrolled.
 */
export async function resolveExecutionHold(target: ModeTarget): Promise<HoldResult> {
  const stopped = await resolveStops(target);
  if (!stopped) return { held: false, reason: null, control_ids: [] };
  // `shadow` from a flag still means "do not carry on": only a clean pass is not held.
  return { held: true, reason: stopped.reason, control_ids: stopped.control_ids };
}
