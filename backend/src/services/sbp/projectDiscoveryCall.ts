import { ANGLE_TO_DIMENSION } from './intakeTruth';
import { buildProjectDiscoveryCallPrompt, callAngles } from './projectDiscoveryCallPrompt';
import type { UnderstandingItem } from '../delivery/projectUnderstanding';

/**
 * projectDiscoveryCall — deciding whether to place the call, and what to say.
 *
 * The decision half is PURE and lives here; dialling belongs to
 * `synthflowService.triggerVoiceCall`. Splitting them is what lets every
 * refusal below be tested without a phone, a network, or a vendor account.
 *
 * ## Five refusals, each the safe outcome rather than a degraded one
 *
 * Four are generalised from `internshipCallService`, which is the proven
 * pattern in this repository and already got these right:
 *
 *   1. no consent to be called      dialling without it is a cold call
 *   2. no phone number              nothing to dial
 *   3. nothing left to ask          a call with no purpose is worse than none
 *   4. no configured agent          NEVER borrow another brand's agent
 *
 * The fifth is this phase's own decision:
 *
 *   5. nothing known yet            the phone is offered to CONTINUE an
 *                                   interview, not to start one cold
 *
 * Cold, the agent has no description and must work all ten angles, which is
 * exactly the long interrogation the description-first work exists to remove.
 * A student who would rather talk than type writes one sentence first, and then
 * the call opens with "you told us X, I have three things to ask".
 *
 * Every refusal returns a NAMED reason rather than throwing, so the surface can
 * say what happened and offer chat. A student staring at a spinner for a call
 * that was never placed is the failure this shape exists to prevent.
 */

export type CallRefusal =
  | 'no_consent'
  | 'no_phone'
  | 'nothing_to_ask'
  | 'no_agent_configured'
  | 'no_intake_yet'
  | 'cooling_down';

export interface CallDecisionInput {
  /** Explicit consent to an AI call AND to recording. Separate from marketing consent. */
  readonly consentToCall: boolean;
  readonly phone?: string | null;
  /** Truth already gathered. Empty means the interview never started. */
  readonly known: readonly UnderstandingItem[];
  /** Angles still unanswered, in priority order. */
  readonly remainingAngles: readonly string[];
  /** '' when the slot is unset. Never substituted with another brand's agent. */
  readonly agentId: string;
  readonly projectName?: string | null;
  /** Milliseconds since the last call to this student, when there was one. */
  readonly msSinceLastCall?: number | null;
}

export type CallDecision =
  | { readonly place: false; readonly reason: CallRefusal }
  | {
    readonly place: true;
    readonly prompt: string;
    /** The angles this call will cover, so the completion path knows what to expect. */
    readonly angles: readonly string[];
  };

/**
 * One call per student per cooldown window.
 *
 * Rate limiting counts requests; this refuses to DIAL A PERSON twice in a few
 * minutes, which is a different promise and the one that matters to whoever
 * answers the phone.
 */
export const CALL_COOLDOWN_MS = 10 * 60 * 1000;

export function decideProjectDiscoveryCall(input: CallDecisionInput): CallDecision {
  // Consent first. Every other check is about whether a call would be useful;
  // this one is about whether it is allowed, and a useful call nobody agreed to
  // is still a cold call.
  if (!input.consentToCall) return { place: false, reason: 'no_consent' };

  const phone = (input.phone ?? '').trim();
  if (!phone) return { place: false, reason: 'no_phone' };

  // Continue-only. See the header: the phone finishes an interview, it does not
  // open one.
  if (input.known.length === 0) return { place: false, reason: 'no_intake_yet' };

  const angles = callAngles(input.remainingAngles);
  if (angles.length === 0) return { place: false, reason: 'nothing_to_ask' };

  // An unconfigured slot is the LAST check, so the student is told the most
  // useful thing: if they had also revoked consent, that is what they hear
  // about, not our configuration.
  if (!input.agentId.trim()) return { place: false, reason: 'no_agent_configured' };

  if (typeof input.msSinceLastCall === 'number' && input.msSinceLastCall < CALL_COOLDOWN_MS) {
    return { place: false, reason: 'cooling_down' };
  }

  return {
    place: true,
    angles,
    prompt: buildProjectDiscoveryCallPrompt({
      projectName: input.projectName ?? null,
      known: input.known,
      remainingAngles: input.remainingAngles,
    }),
  };
}

/**
 * Which angles are still unanswered, from what is already known.
 *
 * Derived from the stored truth rather than a session cursor. The brief asks
 * for exactly this - recalculate remaining questions from truth, not a fragile
 * cursor - and it is what makes cross-channel resume work: a student who
 * answered by chat, then called, then reloaded the web page gets the same
 * remaining list from all three, because all three ask the same question of the
 * same data.
 */
export function remainingAngles(known: readonly UnderstandingItem[]): string[] {
  const answered = new Set(known.map((i) => i.dimension));
  return Object.entries(ANGLE_TO_DIMENSION)
    .filter(([, dimension]) => !answered.has(dimension))
    .map(([angle]) => angle);
}
