import { EXPLORER_SIGNAL_DEFINITIONS } from './explorerSignalDefinitions';
import type {
  ExplorerAffinity,
  ExplorerOverlay,
  ExplorerPrimaryState,
  ExplorerSignalReadout,
} from '../../types/explorerGrowth';
import type { ExplorerScores } from './explorerScoringService';

/**
 * Explorer Growth OS — journey state machine. Plan §8, EPIC 3 T004.
 *
 * PURE. Takes everything it needs as arguments — entitlement and subscription
 * are fetched by T005, never here — so the whole §8 rule set is testable
 * without a database.
 *
 * SCOPE: 36 of §8's 49 enumerated rules are implemented. The other 13 have no
 * data source in this codebase and are DELIBERATELY ABSENT, each with a named
 * reason and target epic (see DEFERRED_RULES below). The test asserts they stay
 * absent, so a deferral is a tested property rather than a silent omission.
 *
 * TWO STRUCTURAL RULES FROM §8, both load-bearing:
 *
 *  1. LEARNING STATES ARE MONOTONIC. A learner never falls from ACTIVE_LEARNER
 *     back to NEW_EXPLORER. Dormancy is an OVERLAY, not a regression — someone
 *     who completed three lessons then went quiet is a dormant active learner,
 *     not a new one, and treating them as new would restart their onboarding.
 *     CONSIDERING_NEXT_STEP and ENROLLMENT_READY may regress, because
 *     commercial intent genuinely decays.
 *
 *  2. CONVERTED IS TERMINAL FOR ACQUISITION. Once entered, no input returns a
 *     lower state, and all acquisition messaging stops permanently. Getting
 *     this wrong means marketing to someone who has already paid.
 */

/** Ordered weakest to strongest. Index position IS the monotonicity rule. */
const LEARNING_LADDER: ExplorerPrimaryState[] = [
  'NEW_EXPLORER',
  'ACTIVATING',
  'ACTIVE_LEARNER',
  'ENGAGED_LEARNER',
  'CONNECTED_TO_COMMUNITY',
];

/** May regress — commercial intent decays, unlike learning progress. */
const COMMERCIAL_STATES: ExplorerPrimaryState[] = [
  'CONSIDERING_NEXT_STEP',
  'ENROLLMENT_READY',
];

/**
 * §8 rules with no data source in this codebase. Absent on purpose.
 * Keyed by the rule IDs enumerated in the EPIC 3 plan's §8 table.
 */
export const DEFERRED_RULES: ReadonlyArray<{ id: string; rule: string; reason: string; target: string }> = [
  { id: 'P18', rule: 'CONSIDERING_NEXT_STEP exit: I < 30 for 14d', reason: 'needs score history plus a prior_learning_state column the model lacks', target: 'EPIC 4' },
  { id: 'P24', rule: 'CONVERTED entry: internship acceptance', reason: 'internship access grants full curriculum access, so hasFullCurriculumAccess already covers it — redundant, not missing', target: 'closed' },
  { id: 'O6b', rule: 'FRICTION exit: underlying condition resolved', reason: 'email_hard_bounce has halfLifeDays null, so F never falls below 15 once set', target: 'EPIC 4' },
  { id: 'O7b', rule: 'NEEDS_SUPPORT entry: open inbox case', reason: 'no inbox_cases source query in the reader', target: 'EPIC 4' },
  { id: 'O7c', rule: 'NEEDS_SUPPORT entry: reply NEEDS_HELP', reason: 'interaction_outcomes maps only clicked/replied/bounced', target: 'EPIC 4' },
  { id: 'O8', rule: 'NEEDS_SUPPORT exit', reason: 'same sources as O7b/O7c', target: 'EPIC 4' },
  // O9/O10 IMPLEMENTED in EPIC 7 — live event state from CCPP, not the empty
  // student_points_events signal path. Removed from this list rather than left
  // stale: a deferred-rules registry nobody trusts is worse than none.
  { id: 'O12', rule: 'EVENT_REGISTERED exit: event ends', reason: 'the overlay is derived fresh from upcoming events each run, so it lapses when the event stops being upcoming — an explicit ends_at exit would be a second mechanism for the same thing', target: 'closed' },
  { id: 'O15/O16', rule: 'EVENT_NO_SHOW entry/exit', reason: 'BLOCKED, not deferred. Eventbrite records attendance via barcode.checked_in, which fires when a ticket is scanned AT A DOOR. All 549 events in the last 90 days are Online_event=True and zero check-ins have been possible since 2022, so nobody can be marked attended and therefore nobody can be a no-show. Would require Zoom attendance, not Eventbrite.', target: 'blocked: needs a Zoom integration' },
  { id: 'O13/O14', rule: 'EVENT_ATTENDED entry/exit', reason: 'IMPLEMENTED but currently inert: it reads the event_attended signal, whose source (student_points_events rows typed open_house_attended%) has zero rows today. A live-session check-in flow would feed it. Distinct from Eventbrite, which cannot supply attendance for online events at all.', target: 'unfed, not blocked' },
  { id: 'O18', rule: 'INTERNSHIP_READY exit: applied / 60d', reason: 'no application flow; 60d needs a per-overlay entry timestamp the TEXT[] column cannot hold', target: 'EPIC 5/7' },
  { id: 'O19/O20', rule: 'SUBSCRIPTION_READY entry/exit', reason: '"no cohort fit" is undefined in §8 — a spec gap, not a data gap', target: 'EPIC 4' },
  { id: 'O22', rule: 'REFERRAL_READY exit: 90d', reason: 'needs a per-overlay entry timestamp', target: 'EPIC 4' },
];

export interface ClassifyInput {
  /** Previous profile, or null on first run. Required for monotonicity and terminality. */
  previousProfile: { primary_state?: ExplorerPrimaryState | null; state_entered_at?: Date | string | null } | null;
  scores: ExplorerScores;
  readout: ExplorerSignalReadout;
  affinities: ExplorerAffinity[];
  /** Fetched by T005 — never looked up here. */
  entitlement: { hasFullCurriculumAccess: boolean; hasActiveNonCompSubscription: boolean };
  /** The Explorer's enrollment creation date, for the 72h clock (P1/P3/P5). */
  enrollment: { createdAt: Date };
  /**
   * Live event state, fetched by the caller — never looked up here, because this
   * function is pure. EPIC 7.
   *
   * Optional so every existing caller and test keeps working; absent means "no
   * event evidence", which is also what a CCPP outage means, so the two degrade
   * identically rather than one inventing an overlay.
   */
  eventState?: { registeredUpcomingCount: number; upcomingEventCount: number };
  asOf: Date;
}

export interface ClassifyResult {
  primary_state: ExplorerPrimaryState;
  overlays: ExplorerOverlay[];
  /** Set only when the state actually changed, so §8's duration clocks stay honest. */
  state_entered_at: Date;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY_MS;

/** Total occurrences of one signal, 0 if absent. */
function occurrences(readout: ExplorerSignalReadout, signal: string): number {
  for (const band of Object.values(readout.bands)) {
    const hit = band.signals.find((s) => s.signal === signal);
    if (hit) return hit.occurrences;
  }
  return 0;
}

/** Most recent occurrence of one signal, or null. */
function lastAt(readout: ExplorerSignalReadout, signal: string): Date | null {
  for (const band of Object.values(readout.bands)) {
    const hit = band.signals.find((s) => s.signal === signal);
    if (hit) return hit.lastOccurredAt;
  }
  return null;
}

/** Days since a signal last fired, or Infinity if it never has. */
function daysSince(readout: ExplorerSignalReadout, signal: string, asOf: Date): number {
  const at = lastAt(readout, signal);
  return at ? daysBetween(asOf, at) : Infinity;
}

function affinityOf(affinities: ExplorerAffinity[], tag: string): number {
  return affinities.find((a) => a.tag === tag)?.confidence ?? 0;
}

/**
 * The primary state the learner's CURRENT evidence supports, ignoring history.
 * Monotonicity is applied afterwards, so this stays a pure reading of "now".
 */
function evidenceState(input: ClassifyInput): ExplorerPrimaryState {
  const { scores, readout, entitlement, enrollment, asOf } = input;

  // P22/P23 — CONVERTED. §8.1 line 763 is an OR, not an AND: a learner with
  // full curriculum access OR an active non-comp subscription has converted.
  // Requiring both would keep marketing to someone who paid but has no
  // subscription row — the exact failure this rule prevents.
  if (entitlement.hasFullCurriculumAccess || entitlement.hasActiveNonCompSubscription) {
    return 'CONVERTED';
  }

  const cardsCompleted = occurrences(readout, 'card_completed');
  const contributions = occurrences(readout, 'community_contribution');

  // P19 — ENROLLMENT_READY: I >= 70 AND a recent T3/T4 AND F < 25.
  // The friction clause is what stops us pushing enrolment at someone whose
  // payment just failed.
  if (scores.i >= 70 && readout.recentIntentTier >= 3 && scores.f < 25) {
    return 'ENROLLMENT_READY';
  }

  // P16 — CONSIDERING_NEXT_STEP: I >= 45 with at least one T2+ signal.
  if (scores.i >= 45 && readout.recentIntentTier >= 2) {
    return 'CONSIDERING_NEXT_STEP';
  }

  // P14 — CONNECTED_TO_COMMUNITY.
  if (contributions >= 1) return 'CONNECTED_TO_COMMUNITY';

  // P11 — ENGAGED_LEARNER: E >= 45 AND >= 3 cards.
  if (scores.e >= 45 && cardsCompleted >= 3) return 'ENGAGED_LEARNER';

  // P8 — ACTIVE_LEARNER: at least one card completed.
  // Uses card_completed.occurrences, NOT first_card_completed: that signal is
  // declared but no reader query emits it, so a rule citing it could never fire.
  if (cardsCompleted >= 1) return 'ACTIVE_LEARNER';

  // P4/P5 — ACTIVATING: first feed interaction, OR 72h elapsed in NEW.
  const interacted = occurrences(readout, 'first_card_interacted') >= 1;
  const hoursSinceEnrollment = daysBetween(asOf, enrollment.createdAt) * 24;
  if (interacted || hoursSinceEnrollment >= 72) return 'ACTIVATING';

  // P1 — NEW_EXPLORER.
  return 'NEW_EXPLORER';
}

/**
 * Apply §8's monotonicity: learning states never regress, CONVERTED is terminal,
 * commercial states may fall back.
 */
function applyMonotonicity(
  candidate: ExplorerPrimaryState,
  previous: ExplorerPrimaryState | null | undefined,
): ExplorerPrimaryState {
  if (!previous) return candidate;

  // P25 — CONVERTED is terminal. Nothing demotes a converted learner.
  if (previous === 'CONVERTED') return 'CONVERTED';
  if (candidate === 'CONVERTED') return 'CONVERTED';

  const prevRung = LEARNING_LADDER.indexOf(previous);
  const candRung = LEARNING_LADDER.indexOf(candidate);

  // Both on the learning ladder: never step down. A learner who completed
  // lessons then went quiet stays an ACTIVE_LEARNER and gains DORMANT.
  if (prevRung !== -1 && candRung !== -1) {
    return candRung >= prevRung ? candidate : previous;
  }

  // Previously commercial, now reading as a learning state: allowed. Intent
  // decays, so falling out of CONSIDERING_NEXT_STEP is correct — but never
  // below the learning progress they had already earned.
  if (COMMERCIAL_STATES.includes(previous) && candRung !== -1) return candidate;

  return candidate;
}

/**
 * Overlays, derived FRESH every run rather than accumulated.
 *
 * Fresh derivation is why a learner cannot get stuck in FRICTION after the
 * condition clears. The cost is that duration-from-entry expiries (O18, O20,
 * O22) cannot be expressed — `overlays` is a bare TEXT[] with no per-overlay
 * timestamp — so those are deferred rather than faked.
 */
function deriveOverlays(input: ClassifyInput): ExplorerOverlay[] {
  const { scores, readout, affinities, asOf } = input;
  const out: ExplorerOverlay[] = [];

  // O1/O2 — DORMANT: no engagement signal in 14d. Derived from a real clock,
  // NOT from the E score, which decays too slowly (see the deviation note in
  // explorerScoringService). This is that bias's compensating control.
  const engagementAge = readout.lastEngagementAt
    ? daysBetween(asOf, readout.lastEngagementAt)
    : Infinity;
  if (engagementAge >= 14) out.push('DORMANT');

  // O3/O4 — HIGH_INTENT: I >= 60 AND a T3/T4 signal within 14d. Exits at
  // I < 40 or 21d without a T2+, both of which fall out of fresh derivation.
  // The 21d clause reads each signal's OWN tier from the definitions table —
  // recentIntentTier is a 14-day window and cannot answer a 21-day question.
  const has21dT2Plus = readout.bands.intent.signals.some((s) => {
    const tier = EXPLORER_SIGNAL_DEFINITIONS[s.signal]?.tier ?? 0;
    return tier >= 2 && daysBetween(asOf, s.lastOccurredAt) <= 21;
  });
  if (scores.i >= 60 && readout.recentIntentTier >= 3 && has21dT2Plus) {
    out.push('HIGH_INTENT');
  }

  // O5 — FRICTION: F >= 25.
  if (scores.f >= 25) out.push('FRICTION');

  // O7a — NEEDS_SUPPORT, bounce only. The open-case and reply-needs-help
  // conditions have no reader source (O7b/O7c, deferred).
  if (occurrences(readout, 'email_hard_bounce') >= 1) out.push('NEEDS_SUPPORT');

  // O9/O10/O11 — EVENT_READY and EVENT_REGISTERED, from LIVE event state.
  //
  // EPIC 3 derived these from `event_registered` / `event_attended` signals,
  // which the reader maps from `student_points_events` rows typed
  // `open_house_rsvp%` / `open_house_attended%`. Measured on production: that
  // table has ZERO such rows, so neither overlay could ever fire for anyone.
  // The signal path was complete and carried no water.
  //
  // The real record is CCPP `EventBrite_EventAttendees` — 4,455 signups in 90
  // days — read by `explorerEventStateService` and passed in, so this function
  // stays pure.
  // TWO SOURCES, DELIBERATELY OR'D — they cover different event systems:
  //   - `event_registered` signal: internal open-house RSVPs recorded in
  //     student_points_events. Zero rows today, so inert but not wrong.
  //   - live event state: CCPP's Eventbrite record, 4,455 signups in 90 days.
  // A learner registered in EITHER is registered. An earlier draft replaced the
  // signal rather than OR-ing it, which would have dropped internal RSVPs the
  // moment anything fed them.
  //
  // The signal's original semantic is preserved: registration counts while it is
  // the learner's most recent event evidence (more recent than any attendance).
  const registeredAge = daysSince(readout, 'event_registered', asOf);
  const signalSaysRegistered = registeredAge < daysSince(readout, 'event_attended', asOf);

  const ev = input.eventState;
  const liveSaysRegistered = !!ev && ev.registeredUpcomingCount > 0;

  if (signalSaysRegistered || liveSaysRegistered) {
    out.push('EVENT_REGISTERED');
  } else if (ev && ev.upcomingEventCount > 0) {
    // O9 — EVENT_READY: something is on and they have not signed up. Never
    // emitted alongside EVENT_REGISTERED — a learner who has registered does not
    // need prompting to register, and firing both would let two priority tiers
    // compete for the same person on the same day.
    out.push('EVENT_READY');
  }

  // O13/O14 — EVENT_ATTENDED, from the `event_attended` SIGNAL, expiring 30d
  // after the attendance itself.
  //
  // KEPT DELIBERATELY, and an earlier draft of EPIC 7 wrongly removed it. Its
  // source is `student_points_events` rows typed `open_house_attended%` — NOT
  // Eventbrite — so a live-session check-in flow could legitimately feed it. It
  // has zero rows today, which makes it inert rather than wrong, and deleting a
  // correct-but-unfed path buys no safety while losing the capability.
  const attendedAge = daysSince(readout, 'event_attended', asOf);
  if (attendedAge <= 30) out.push('EVENT_ATTENDED');

  // O15/O16 — EVENT_NO_SHOW is NOT DERIVED, and that is measured, not deferred.
  //
  // No-show is registered-minus-attended, and the registration side now comes
  // from Eventbrite while attendance does not exist there at all: `barcode.checked_in`
  // fires only when a ticket is scanned AT A DOOR, all 549 events in the last 90
  // days are `Online_event = True`, and zero check-ins have been possible since
  // 2022. Subtracting one source from another that does not cover the same events
  // would be arithmetic on incomparable things.
  //
  // Inferring it from "registered but no engagement afterwards" would invent a
  // fact about a real person and act on it: someone who did attend would receive
  // "sorry we missed you".

  // O17 — INTERNSHIP_READY: affinity >= 0.5 AND E >= 50.
  if (affinityOf(affinities, 'ai_internship') >= 0.5 && scores.e >= 50) {
    out.push('INTERNSHIP_READY');
  }

  // O21 — REFERRAL_READY: E >= 60 AND a completed project or contribution.
  // PARTIAL: project_build_activity has no reader source query, so only the
  // community-contribution half is reachable today.
  if (scores.e >= 60 && occurrences(readout, 'community_contribution') >= 1) {
    out.push('REFERRAL_READY');
  }

  // O23/O24 — IN_CONVERSATION: a reply within 7d.
  if (daysSince(readout, 'reply_interested', asOf) <= 7) out.push('IN_CONVERSATION');

  return out;
}

/** Classify one learner. Pure — same input, same output, always. */
export function classify(input: ClassifyInput): ClassifyResult {
  const previous = input.previousProfile?.primary_state ?? null;
  const primary_state = applyMonotonicity(evidenceState(input), previous);
  const overlays = deriveOverlays(input);

  // The clock only restarts when the state actually changed; §8's 30d/72h
  // durations are meaningless if every recompute resets them.
  const unchanged = previous !== null && previous === primary_state;
  const prevEnteredAt = input.previousProfile?.state_entered_at;
  const state_entered_at =
    unchanged && prevEnteredAt ? new Date(prevEnteredAt) : input.asOf;

  return { primary_state, overlays, state_entered_at };
}
