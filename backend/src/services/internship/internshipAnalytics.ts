import StudentNavigationEvent from '../../models/StudentNavigationEvent';

/**
 * Real emitters for the internship funnel events.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `explorerGrowth/explorerSignalDefinitions.ts` carries a list named
 * STILL_UNINSTRUMENTED, and two of its four entries are ours:
 *
 *   internship_page_view          "no internship route or table exists yet"
 *   internship_application_started "No application flow exists in the codebase yet"
 *
 * Its header warns that adding a signal to the scoring table without building
 * its source "is how a dimension silently reads zero forever." The flow now
 * exists, so these events have a real source for the first time.
 *
 * ── WHY NOT recordLearnerSignal() ──────────────────────────────────────────
 *
 * `explorerSignalWriter.recordLearnerSignal` is the Explorer Growth SCORING
 * pipeline. It enforces a closed alphabet against EXPLORER_SIGNAL_DEFINITIONS,
 * where every entry carries a weight, a half-life and a cap. Emitting through it
 * would mean assigning those numbers to the internship funnel, which changes how
 * every learner is scored — a product decision, not a plumbing one.
 *
 * So this module writes the same underlying table (`student_navigation_events`)
 * directly, recording the facts truthfully now. Wiring them into the score is a
 * separate, deliberate step once the weights are agreed; until then the events
 * accumulate and nothing is silently scored.
 *
 * ── EMIT ONLY AFTER THE AUTHORITATIVE ACTION SUCCEEDS ──────────────────────
 *
 * "Emit only after the authoritative action succeeds. Do not treat a page view
 * as completion." Every call site here is placed after its write commits. The
 * one exception is `card_impression`, which IS the view — and is named as such.
 */

/** The funnel's event vocabulary. A closed union so a typo cannot invent one. */
export type InternshipAnalyticsEvent =
  | 'internship_card_impression'
  | 'internship_card_opened'
  | 'internship_application_started'
  | 'internship_administrative_intake_completed'
  | 'internship_interview_channel_selected'
  | 'internship_interview_scheduled'
  | 'internship_interview_started'
  | 'internship_interview_completed'
  | 'internship_application_submitted'
  | 'internship_information_requested'
  | 'internship_approved'
  | 'internship_rejected'
  | 'internship_offer_letter_generated'
  | 'internship_signed_document_uploaded'
  | 'internship_documents_verified'
  | 'internship_activated'
  | 'internship_existing_student_converted';

/**
 * Metadata we are willing to store on an analytics row.
 *
 * Deliberately narrow. An open `Record<string, any>` on an event emitted from a
 * request handler is how a phone number or a resume URL ends up in an analytics
 * table nobody thinks of as holding PII. Anything not on this list does not get
 * recorded — see `sanitizeMeta`.
 */
export interface InternshipEventMeta {
  application_id?: string;
  state?: string;
  channel?: 'form' | 'phone';
  card_state?: string;
  correlation_id?: string;
}

const ALLOWED_META_KEYS: ReadonlyArray<keyof InternshipEventMeta> = [
  'application_id', 'state', 'channel', 'card_state', 'correlation_id',
];

/**
 * Keep only the allowlisted keys, and only when they are short strings.
 *
 * The length cap matters as much as the allowlist: a caller passing a whole
 * transcript as `state` would otherwise write it here verbatim.
 */
export function sanitizeMeta(meta: InternshipEventMeta | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!meta) return out;
  for (const key of ALLOWED_META_KEYS) {
    const value = meta[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 120) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Record one internship funnel event.
 *
 * NEVER THROWS. Analytics is not allowed to fail an application submission — a
 * student who filled in a form and pressed submit must not see an error because
 * a metrics row could not be written. Failures are logged and swallowed, which
 * is the same contract `recordLearnerSignal` gives its callers.
 */
export async function emitInternshipEvent(params: {
  enrollmentId: string;
  event: InternshipAnalyticsEvent;
  page?: string;
  meta?: InternshipEventMeta;
}): Promise<{ written: boolean }> {
  if (!params?.enrollmentId || !params?.event) return { written: false };

  try {
    await StudentNavigationEvent.create({
      enrollment_id: params.enrollmentId,
      event_type: params.event,
      page: params.page ?? '/portal/today',
      metadata: sanitizeMeta(params.meta),
    } as any);
    return { written: true };
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'internship_analytics_write_failed',
      outcome: 'failure',
      error_class: err?.constructor?.name ?? 'Error',
      context: { internship_event: params.event },
    }));
    return { written: false };
  }
}
