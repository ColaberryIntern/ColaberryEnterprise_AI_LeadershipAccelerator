import { CASE_STUDY_EVENT_TYPES } from '../../constants/caseStudyEventTypes';

/**
 * Ingest validation for `/api/t/event` and `/api/t/batch`.
 *
 * WHY THIS WAS EXTRACTED FROM `trackingController.ts`. The allowlist and the
 * validator used to be file-local constants in the controller, which is why
 * `handleTrackBatch` never called them: reusing them meant reusing a function
 * shaped for a single flat body, and nobody reshaped it. The result was a real
 * backdoor - `/api/t/event` returned 400 for an unknown `event_type` while
 * `/api/t/batch` persisted the identical event without looking at it.
 *
 * That asymmetry is not merely untidy, it is NON-DETERMINISTIC. The SPA tracker
 * picks its endpoint by buffer size (`frontend/src/utils/tracker.ts`): one
 * queued event goes to `/api/t/event`, two or more go to `/api/t/batch`. So
 * whether a given event survived depended on how fast the visitor clicked
 * relative to the 5-second flush timer. The same click, twice, two outcomes.
 *
 * Splitting the check into "the parts of a body that identify the BROWSER" and
 * "the parts that describe ONE EVENT" is what makes a batch able to run the
 * same rules per element. `validateTrackEvent` is preserved as the composition
 * of the two, in the original order, returning the original message strings, so
 * `/api/t/event` keeps its exact response contract.
 */

/**
 * Event types the ingest accepts.
 *
 * Everything before the Case Study block is the pre-existing list, unchanged
 * and in its original order. The ingest rejects unknown types, so an emitter
 * added without a matching entry here is silently dropped - which is why the
 * comment above `payment_attempt` was left behind by the previous team, and why
 * this one is left behind now.
 */
export const VALID_EVENT_TYPES = [
  'pageview',
  'scroll',
  'click',
  'cta_click',
  'form_start',
  'form_submit',
  'time_on_page',
  'heartbeat',
  'media_play',
  'embed_click',
  'booking_modal_opened',
  'booking_date_selected',
  'booking_time_selected',
  'book_strategy_call_click',
  'demo_start',
  'demo_complete',
  'demo_skip',
  'demo_to_input_focus',
  'demo_watch_click',
  'demo_industry_click',
  // Explorer Growth OS section 6.3 friction (EPIC 2). Checkout is a PaySimple
  // hosted redirect, so the app only ever observes the ATTEMPT; "attempted and
  // did not complete" is derived by pairing this with
  // enrollments.payment_status rather than by a client-side failure event the
  // hosted flow cannot produce.
  // The ingest rejects unknown types, so without this entry the signal would be
  // emitted by the client and silently dropped here.
  'payment_attempt',
  // Case Study OS (T019, spec section 27). Names and the 30-character bound are
  // owned by constants/caseStudyEventTypes.ts and asserted by test.
  ...CASE_STUDY_EVENT_TYPES,
] as const;

export type ValidEventType = (typeof VALID_EVENT_TYPES)[number];

/** The shape of one event, whether it arrived alone or inside a batch. */
export interface TrackEventShape {
  event_type?: unknown;
  page_url?: unknown;
  page_path?: unknown;
}

/**
 * Browser-identifying fields. Validated once per request - a batch carries one
 * fingerprint for all of its events.
 */
export function validateFingerprint(fingerprint: unknown): string | null {
  if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length > 64) {
    return 'fingerprint is required (string, max 64 chars)';
  }
  return null;
}

/**
 * One event's own fields. Applied per element in a batch, and to the whole body
 * for a single event, which is what makes the two endpoints agree.
 *
 * The length bounds are the column widths: `page_url` VARCHAR(500),
 * `page_path` VARCHAR(255). Rejecting here returns a 400 the caller can read,
 * instead of a Postgres error inside `recordPageEvent` that surfaces as a 204.
 */
export function validateEventShape(event: TrackEventShape): string | null {
  const { event_type, page_url, page_path } = event;

  if (!event_type || typeof event_type !== 'string' || !VALID_EVENT_TYPES.includes(event_type as ValidEventType)) {
    return `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`;
  }
  if (!page_url || typeof page_url !== 'string' || page_url.length > 500) {
    return 'page_url is required (string, max 500 chars)';
  }
  if (!page_path || typeof page_path !== 'string' || page_path.length > 255) {
    return 'page_path is required (string, max 255 chars)';
  }

  return null;
}

/**
 * The single-event body check used by `/api/t/event`.
 *
 * Order and message strings are unchanged from the original in-controller
 * implementation: fingerprint, then event_type, then page_url, then page_path.
 * Callers assert on these strings.
 */
export function validateTrackEvent(body: Record<string, unknown>): string | null {
  return validateFingerprint(body.fingerprint) ?? validateEventShape(body as TrackEventShape);
}
