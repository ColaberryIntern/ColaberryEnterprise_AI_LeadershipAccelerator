/**
 * M25 - map a Person 360 profile onto the score's inputs.
 *
 * This is the ONLY place that knows both shapes, which is deliberate: the engine stays a pure
 * function over a small named record, and the profile's panel structure cannot leak into the
 * scoring rules.
 *
 * THE MAPPING RULE IS ONE LINE: a panel that is absent, withheld, or itself null maps to null,
 * never to 0 or to an empty list's length. `undefined` means the caller was not permitted to
 * see the panel; `null` means it was permitted and there was no evidence. Both are "no evidence"
 * from the score's point of view, and neither is a measurement.
 *
 * The inputs mapped here are exactly the ones the M24 contract marks SAFE. The two it still
 * marks EXCLUDED, prior-outcome detail and recency, are deliberately NOT mapped: `priorOutcome`
 * reads only the panel's availability flag and enrolment count, never `everHired`, and nothing
 * here reads `lastActivity`.
 */
import { PersonProfile } from '../adminOs/personProfileService';
import { SrsInputs } from './srsEngine';

/** A list's length, or null when the list itself is absent rather than empty. */
function countOf(list: readonly unknown[] | null | undefined): number | null {
  return list == null ? null : list.length;
}

/** `undefined` (not permitted) and `null` (no evidence) both become null. */
function orNull<T>(value: T | null | undefined): T | null {
  return value == null ? null : value;
}

export function inputsFromProfile(profile: PersonProfile): SrsInputs {
  const j = profile.journey;
  const history = profile.history;

  return {
    // Journey. These six are the ones M24.2 and M24.3 made honestly nullable.
    daysKnown: orNull(j?.daysKnown),
    intentScore: orNull(j?.intentScore),
    pageEvents: orNull(j?.pageEvents),
    enrolments: orNull(j?.enrollments),

    // Commitment signals from their own panels.
    appointments: countOf(profile.appointments),
    inboundReplies: orNull(profile.communications?.inboundCount),

    // Friction. Reported, never subtracted (DECISION 4).
    paymentFailures: orNull(profile.billingDetail?.failuresSinceLastSuccess),

    // Prior history. ONLY the availability flag and the enrolment count: the per-enrolment
    // booleans are still EXCLUDED by the contract because a NULL column reads as false there.
    priorHistoryAvailable: orNull(history?.available),
    priorEnrolments: history?.available ? countOf(history.enrolments) : null,

    // Explorer bands. The whole panel is null-or-nothing, never 0/0/0.
    explorerEngagement: orNull(profile.explorerScore?.engagement),
    explorerIntent: orNull(profile.explorerScore?.intent),

    // Acquisition and engagement.
    consentContact: orNull(profile.acquisition?.consentContact),
    siteSessions: orNull(profile.engagement?.sessions),

    // M27 - the only input that dates itself today is the Explorer snapshot. Freshness is bounded
    // by this, so recomputing a score over an old snapshot cannot make it look current.
    evidenceAsOf: orNull(profile.explorerScore?.asOfDate),
  };
}
