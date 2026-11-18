/**
 * voiceDialPolicy - OH1m (T7): how a campaign call is placed on our own agent, spaced,
 * and recorded when Synthflow refuses it.
 *
 * Four small decisions, kept pure (or dependency-injected) so they can be tested without a
 * database or a phone:
 *
 *  1. WHICH AGENT. An Open House countdown call goes to the 'open_house' call type, which
 *     resolveAgentId maps to SYNTHFLOW_OPEN_HOUSE_AGENT_ID and nothing else. Every other
 *     sequence call keeps its existing welcome/interest routing.
 *
 *  2. SPACING. Everyone registered for one Open House has the same countdown offset, so
 *     their calls would all be due in the same second. A campaign setting
 *     `voice_dial_spacing_seconds` (countdown: 75) staggers them twice over: at scheduling
 *     time each new voice step is stamped at least that far from every other pending call
 *     of the same campaign, and at dial time the scheduler pauses that long after a real
 *     dial (voice only, so emails and texts are not slowed).
 *
 *  3. FAILED DIAL. Synthflow's error body is the only evidence of why a call was refused.
 *     The HTTP status and the raw body (capped) are kept on the step's metadata.
 *
 *  4. VOICE OFF. A countdown voice step reached while ENABLE_VOICE_CALLS is false is
 *     cancelled with reason voice_disabled (handled in schedulerService), never marked sent:
 *     "sent" would claim a call happened.
 *
 * Nothing here dials. ENABLE_VOICE_CALLS is not read or changed here.
 */

/** The longest spacing honored, so a typo cannot stall the scheduler for an hour. */
export const MAX_VOICE_DIAL_SPACING_SECONDS = 600;
/** The longest single in-loop pause, matching the scheduler's existing pacing cap. */
export const MAX_VOICE_PAUSE_MS = 180_000;
/** Cap on the Synthflow error body kept on a step. */
export const MAX_DIAL_ERROR_BODY_CHARS = 2000;

export type SequenceVoiceCallType = 'open_house' | 'welcome' | 'interest';

/** The call type for a scheduled voice step. A countdown call never borrows another agent. */
export function voiceCallTypeForAction(action: { metadata?: Record<string, any> | null; voice_agent_type?: string | null }): SequenceVoiceCallType {
  if (action.metadata?.event_countdown) return 'open_house';
  return action.voice_agent_type === 'welcome' ? 'welcome' : 'interest';
}

/** The campaign's dial spacing in seconds; 0 when unset, invalid or negative. */
export function voiceDialSpacingSeconds(settings: Record<string, any> | null | undefined): number {
  const raw = Number(settings?.voice_dial_spacing_seconds);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), MAX_VOICE_DIAL_SPACING_SECONDS);
}

/**
 * The earliest time at or after `at` that is at least `spacingSeconds` from every taken
 * dial time. Greedy over the sorted list: the candidate only moves forward.
 */
export function spaceDialTime(at: Date, taken: Date[], spacingSeconds: number): Date {
  if (spacingSeconds <= 0) return at;
  const gap = spacingSeconds * 1000;
  let candidate = at.getTime();
  const sorted = taken.map((d) => d.getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  for (const t of sorted) {
    if (t <= candidate - gap) continue;
    if (t >= candidate + gap) break;
    candidate = t + gap;
  }
  return new Date(candidate);
}

/**
 * How long the scheduler should wait after this voice action, beyond what it already
 * waited. Only after a call that actually went out: a skipped or refused dial needs no gap.
 */
export function voicePauseMs(
  channel: string,
  settings: Record<string, any> | null | undefined,
  actionAfter: { status?: string | null; metadata?: Record<string, any> | null },
  alreadyWaitedMs: number,
): number {
  if (channel !== 'voice') return 0;
  const spacing = voiceDialSpacingSeconds(settings);
  if (!spacing) return 0;
  if (actionAfter.status !== 'sent') return 0;
  const response = actionAfter.metadata?.synthflow_response;
  if (!response || response.skipped) return 0;
  return Math.max(0, Math.min(spacing * 1000, MAX_VOICE_PAUSE_MS) - Math.max(0, alreadyWaitedMs));
}

export interface DialFailure {
  status: number | null;
  body: string | null;
  error: string;
  at: string;
}

/** What a failed dial leaves on the step's metadata (key: last_dial_error). */
export function dialFailureRecord(
  result: { error?: string; status?: number; rawBody?: string },
  now: Date = new Date(),
): DialFailure {
  return {
    status: typeof result.status === 'number' ? result.status : null,
    body: typeof result.rawBody === 'string' ? result.rawBody.slice(0, MAX_DIAL_ERROR_BODY_CHARS) : null,
    error: String(result.error || 'Voice call failed').slice(0, 500),
    at: now.toISOString(),
  };
}

export interface VoiceSpacingDeps {
  /** The campaign's settings record (already merged or raw). */
  getCampaignSettings: (campaignId: string) => Promise<Record<string, any> | null>;
  /** scheduled_for of the campaign's other pending/processing voice steps in [from, to]. */
  findTakenDialTimes: (campaignId: string, from: Date, to: Date) => Promise<Date[]>;
}

/** How far ahead of `at` the spacing looks for taken slots. */
const SPACING_LOOKAHEAD_MS = 12 * 60 * 60 * 1000;

const defaultSpacingDeps: VoiceSpacingDeps = {
  async getCampaignSettings(campaignId) {
    const { Campaign } = await import('../../models');
    const campaign = await Campaign.findByPk(campaignId);
    return campaign ? ((campaign as any).settings || {}) : null;
  },
  async findTakenDialTimes(campaignId, from, to) {
    const { Op } = await import('sequelize');
    const { ScheduledEmail } = await import('../../models');
    const rows = await ScheduledEmail.findAll({
      where: {
        campaign_id: campaignId,
        channel: 'voice',
        status: { [Op.in]: ['pending', 'processing'] },
        scheduled_for: { [Op.between]: [from, to] },
      } as any,
      attributes: ['scheduled_for'],
    });
    return rows.map((r: any) => new Date(r.scheduled_for));
  },
};

/**
 * Stamp a new voice step at least the campaign's spacing away from its other pending calls.
 * Fails OPEN to the original time: the dial-time pause still spaces the calls, and a
 * scheduling hiccup must never drop a step.
 */
export async function applyVoiceDialSpacing(
  campaignId: string | null | undefined,
  at: Date,
  deps: VoiceSpacingDeps = defaultSpacingDeps,
): Promise<Date> {
  if (!campaignId) return at;
  try {
    const spacing = voiceDialSpacingSeconds(await deps.getCampaignSettings(campaignId));
    if (!spacing) return at;
    const from = new Date(at.getTime() - spacing * 1000);
    const to = new Date(at.getTime() + SPACING_LOOKAHEAD_MS);
    const taken = await deps.findTakenDialTimes(campaignId, from, to);
    return spaceDialTime(at, taken, spacing);
  } catch (err: any) {
    console.warn(`[VoiceDialPolicy] spacing lookup failed for campaign ${campaignId}, keeping original time: ${err?.message}`);
    return at;
  }
}
