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
import { ALL_EVENT_DOMAINS } from '../adminOs/personTimelineService';
import { SrsInputs } from './srsEngine';

/**
 * Did this read see the WHOLE timeline?
 *
 * `journey.lastActivity` is the newest event among the domains the caller was permitted, so two
 * callers with different sections read a different "last activity" for the same person. That is
 * why the M24 contract excluded recency: an input that varies by viewer breaks determinism at the
 * input rather than in the arithmetic.
 *
 * The fix is not to widen anybody's permissions. It is to let the DATA say whether the read was
 * complete, and to score recency only when it was. A partial read reports recency ABSENT, which
 * is true and which the engine already knows how to handle.
 */
function hasFullTimelineCoverage(profile: PersonProfile): boolean {
  const seen = new Set(profile.timelineDomains ?? []);
  return ALL_EVENT_DOMAINS.every((d) => seen.has(d));
}

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

    // Recency, scored ONLY when the timeline was read in full. A partial read would give a
    // caller-shaped answer, and a score that changes with the viewer is not a score.
    lastActivityAt: hasFullTimelineCoverage(profile)
      ? orNull(profile.journey?.lastActivity)
      : null,
  };
}
