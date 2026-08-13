import type {
  ExplorerSignalBand,
  ExplorerSignalDefinition,
  ExplorerIntentTier,
} from '../../types/explorerGrowth';

/**
 * Explorer Growth OS — the signal catalog. Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §6.
 *
 * ONE table so weights are tunable without touching logic, mirroring
 * `services/behavioralSignalService.ts` SIGNAL_DEFINITIONS. Decay follows the
 * house form from `services/intentScoringService.ts`:
 * `weight * 2^(-ageDays / halfLifeDays)`.
 *
 * WHAT IS DELIBERATELY ABSENT, and why it matters: a definition for a signal
 * nothing emits is a silent lie about coverage — the score would look computed
 * when a whole dimension is dark. §6.5 lists the uninstrumented signals; the
 * three EPIC 2 itself instruments (portal session, enrollment-form start,
 * payment) ARE here because this epic emits them. The ones still dark after
 * this epic are listed in STILL_UNINSTRUMENTED below and are absent on purpose.
 */

export const EXPLORER_SIGNAL_DEFINITIONS: Record<string, ExplorerSignalDefinition> = {
  // --- ENGAGEMENT (§6.1) — do they actually use the learning environment? ---
  account_created: { band: 'engagement', weight: 5, halfLifeDays: null, cap: 5, source: 'enrollments' },
  first_card_served: { band: 'engagement', weight: 5, halfLifeDays: 21, cap: 5, source: 'today_feed_impressions' },
  first_card_interacted: { band: 'engagement', weight: 12, halfLifeDays: 21, cap: 12, source: 'today_feed_impressions' },
  first_card_completed: { band: 'engagement', weight: 15, halfLifeDays: 21, cap: 15, source: 'timeline_card_progress' },
  card_completed: { band: 'engagement', weight: 6, halfLifeDays: 21, cap: 24, source: 'timeline_card_progress' },
  quiz_passed: { band: 'engagement', weight: 5, halfLifeDays: 21, cap: 5, source: 'timeline_card_progress' },
  points_earned: { band: 'engagement', weight: 3, halfLifeDays: 14, cap: 12, source: 'student_points_events' },
  streak_day: { band: 'engagement', weight: 4, halfLifeDays: 7, cap: 16, source: 'student_points_events' },
  assignment_submitted: { band: 'engagement', weight: 10, halfLifeDays: 30, cap: 20, source: 'assignment_submissions' },
  reflection_completed: { band: 'engagement', weight: 6, halfLifeDays: 30, cap: 12, source: 'reflection_entries' },
  architecture_skill_evidence: { band: 'engagement', weight: 8, halfLifeDays: 30, cap: 16, source: 'student_architecture_skill' },
  project_build_activity: { band: 'engagement', weight: 10, halfLifeDays: 14, cap: 20, source: 'projects' },
  community_contribution: { band: 'engagement', weight: 8, halfLifeDays: 21, cap: 16, source: 'community_contributions' },
  community_presence: { band: 'engagement', weight: 3, halfLifeDays: 7, cap: 6, source: 'community_members' },
  live_session_attended: { band: 'engagement', weight: 12, halfLifeDays: 30, cap: 24, source: 'attendance_records' },
  media_watched: { band: 'engagement', weight: 4, halfLifeDays: 14, cap: 8, source: 'network_video_views' },
  // EPIC 2's own output: the first signal ever written to student_navigation_events.
  // T002 is its writer, T003 its ingest. Without this entry the writer would have
  // no legal event type at all (it rejects anything absent from this table).
  portal_session: { band: 'engagement', weight: 2, halfLifeDays: 7, cap: 10, source: 'student_navigation_events' },

  // --- INTENT (§6.2) — tiered, because a page view is not readiness ---
  // T1 · view
  accelerator_page_view: { band: 'intent', weight: 5, halfLifeDays: 14, cap: 10, tier: 1, source: 'page_events' },
  pricing_page_view: { band: 'intent', weight: 6, halfLifeDays: 14, cap: 15, tier: 1, source: 'page_events' },
  cohort_page_view: { band: 'intent', weight: 6, halfLifeDays: 14, cap: 12, tier: 1, source: 'page_events' },
  testimonial_view: { band: 'intent', weight: 4, halfLifeDays: 14, cap: 8, tier: 1, source: 'page_events' },
  subscription_page_view: { band: 'intent', weight: 5, halfLifeDays: 14, cap: 10, tier: 1, source: 'page_events' },
  // T2 · click
  enrollment_cta_click: { band: 'intent', weight: 12, halfLifeDays: 10, cap: 24, tier: 2, source: 'page_events' },
  email_link_click: { band: 'intent', weight: 8, halfLifeDays: 10, cap: 24, tier: 2, source: 'interaction_outcomes' },
  booking_modal_opened: { band: 'intent', weight: 10, halfLifeDays: 10, cap: 20, tier: 2, source: 'page_events' },
  // T3 · start — the tier that unlocks HIGH_INTENT
  booking_date_selected: { band: 'intent', weight: 18, halfLifeDays: 10, cap: 18, tier: 3, source: 'page_events' },
  // EPIC 2's own output (T005 instruments EnrollPage).
  enrollment_form_started: { band: 'intent', weight: 20, halfLifeDays: 10, cap: 20, tier: 3, source: 'page_events' },
  event_registered: { band: 'intent', weight: 20, halfLifeDays: 21, cap: 20, tier: 3, source: 'student_points_events' },
  reply_interested: { band: 'intent', weight: 22, halfLifeDays: 21, cap: 22, tier: 3, source: 'interaction_outcomes' },
  // T4 · commit
  strategy_call_booked: { band: 'intent', weight: 30, halfLifeDays: 21, cap: 30, tier: 4, source: 'strategy_calls' },
  enrollment_form_completed: { band: 'intent', weight: 35, halfLifeDays: 30, cap: 35, tier: 4, source: 'enrollments' },
  event_attended: { band: 'intent', weight: 25, halfLifeDays: 30, cap: 25, tier: 4, source: 'student_points_events' },

  // --- FRICTION (§6.3) — high is BAD; F >= 25 suppresses all commercial action ---
  payment_failed: { band: 'friction', weight: 40, halfLifeDays: 14, cap: 40, source: 'enrollments' },
  // EPIC 2's own output (T005 instruments the checkout redirect).
  payment_attempted_no_completion: { band: 'friction', weight: 30, halfLifeDays: 7, cap: 30, source: 'page_events' },
  booking_selected_no_call: { band: 'friction', weight: 25, halfLifeDays: 7, cap: 25, source: 'derived' },
  enrollment_form_abandoned: { band: 'friction', weight: 25, halfLifeDays: 7, cap: 25, source: 'derived' },
  // A hard bounce does not become untrue with time — hence halfLifeDays null.
  email_hard_bounce: { band: 'friction', weight: 30, halfLifeDays: null, cap: 30, source: 'interaction_outcomes' },
  support_case_open: { band: 'friction', weight: 35, halfLifeDays: null, cap: 35, source: 'inbox_cases' },
  repeated_page_no_progress: { band: 'friction', weight: 15, halfLifeDays: 3, cap: 15, source: 'page_events' },
  reply_needs_help: { band: 'friction', weight: 30, halfLifeDays: 14, cap: 30, source: 'interaction_outcomes' },
};

/**
 * Signals from §6 that remain UNINSTRUMENTED after EPIC 2, and are therefore
 * deliberately absent from the table above rather than defined-but-dead.
 *
 * Exported so the admin surface can show an honest coverage gap instead of a
 * score that looks complete. Adding any of these to the table without also
 * building its source is how a dimension silently reads zero forever.
 */
export const STILL_UNINSTRUMENTED: ReadonlyArray<{ signal: string; reason: string }> = [
  // CORRECTED 2026-08-13: the AI Internship IS a real product (evolved from the Data
  // Analytics class internship) and has never been marketed. What is missing is the
  // SOFTWARE, not the offering — no internships table, route, or application flow — so
  // these signals still have no source to read. Fix by building the data model (plan
  // §22), not by defining signals nothing emits.
  { signal: 'internship_page_view', reason: 'The AI Internship is a real product, but no internship route or table exists yet to emit page views (plan §22).' },
  { signal: 'internship_application_started', reason: 'No application flow exists in the codebase yet — the offering is real, the software is not built (plan §22).' },
  { signal: 'certification_progress', reason: 'No learner-level certification record exists (plan §6, §22).' },
  { signal: 'failed_event_registration', reason: 'Eventbrite integration is read-only here; a failed registration never reaches us (plan §19).' },
];

export type ExplorerSignalType = keyof typeof EXPLORER_SIGNAL_DEFINITIONS;

/** Whether a string is a signal this system knows how to score. */
export function isKnownSignal(signal: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXPLORER_SIGNAL_DEFINITIONS, signal);
}

export function getSignalDefinition(signal: string): ExplorerSignalDefinition | null {
  return isKnownSignal(signal) ? EXPLORER_SIGNAL_DEFINITIONS[signal] : null;
}

/** Every signal in a band. */
export function signalsInBand(band: ExplorerSignalBand): string[] {
  return Object.entries(EXPLORER_SIGNAL_DEFINITIONS)
    .filter(([, def]) => def.band === band)
    .map(([name]) => name);
}

/** Signals the writer may legally accept — those sourced from the event stream it owns. */
export function writableSignals(): string[] {
  return Object.entries(EXPLORER_SIGNAL_DEFINITIONS)
    .filter(([, def]) => def.source === 'student_navigation_events')
    .map(([name]) => name);
}

/**
 * Decayed contribution of one occurrence. `2^(-ageDays / halfLifeDays)`, the
 * same curve as intentScoringService. A null half-life never decays.
 * Negative ages (clock skew, a future-dated row) are clamped to full weight
 * rather than allowed to amplify past 1.
 */
export function decayedWeight(
  signal: string,
  occurredAt: Date,
  asOf: Date = new Date(),
): number {
  const def = getSignalDefinition(signal);
  if (!def) return 0;
  if (def.halfLifeDays === null) return def.weight;
  const ageDays = (asOf.getTime() - occurredAt.getTime()) / 86_400_000;
  if (ageDays <= 0) return def.weight;
  return def.weight * Math.pow(2, -ageDays / def.halfLifeDays);
}

/** Highest intent tier among the given signals; 0 when none are intent signals. */
export function highestTier(signals: string[]): ExplorerIntentTier | 0 {
  let best: ExplorerIntentTier | 0 = 0;
  for (const s of signals) {
    const tier = getSignalDefinition(s)?.tier;
    if (tier && tier > best) best = tier;
  }
  return best;
}
