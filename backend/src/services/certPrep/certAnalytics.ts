import { emitAiEvent } from '../aiEventService';
import type { AiEventOutcome } from '../../models/AiEvent';

/**
 * certAnalytics — Cert Prep's instrumentation, on the existing `ai_events` rail.
 *
 * Nothing new is invented here: every event goes through `emitAiEvent`, which is
 * already fire-and-forget and already swallows its own failures. Telemetry must
 * never be able to break a student's session — a failed analytics write is not a
 * reason a practice answer does not save.
 *
 * WHAT IS DELIBERATELY NOT LOGGED, and this is the whole reason this module
 * exists rather than scattered emit calls:
 *
 *   - NO question stems, options, rationales or answer keys. The bank is the
 *     product; an analytics table is a much weaker boundary than the serving
 *     path, and a stem in a log is a stem that leaves with the log.
 *   - NO selected answers. Which option a named student picked is their business,
 *     not an operational metric, and `cert_responses` already holds it under
 *     proper access control.
 *   - NO free-text student content of any kind.
 *
 * What IS logged is the shape of activity: which question KEY, which domain, how
 * long, and whether it was right — enough to compute exposure and difficulty,
 * and useless to anyone trying to reconstruct the bank or profile a student.
 *
 * `sanitize` enforces that rather than trusting call sites to remember.
 */

/** Keys that must never reach the event log, whatever a caller passes. */
const FORBIDDEN_KEYS = [
  'stem', 'options', 'correct_keys', 'rationale', 'distractor_rationales',
  'selected_keys', 'answer', 'answers', 'text', 'content', 'body',
];

/**
 * Strip anything that could carry question content or student answers.
 *
 * An allow-list would be safer still, but metadata shapes vary per event and a
 * deny-list that is TESTED against the real forbidden names is honest about what
 * it does. The test asserts every name above is removed even when nested.
 */
export function sanitize(meta: Record<string, any> | undefined | null): Record<string, any> {
  if (!meta) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.includes(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitize(v as Record<string, any>);
    } else if (Array.isArray(v)) {
      // Arrays of scalars are fine (domain lists); arrays of objects get sanitized.
      out[k] = v.map((x) => (x && typeof x === 'object' ? sanitize(x) : x));
    } else {
      out[k] = v;
    }
  }
  return out;
}

export type CertEventName =
  | 'cert.viewed'
  | 'cert.locked_viewed'
  | 'cert.diagnostic.started' | 'cert.diagnostic.completed' | 'cert.diagnostic.abandoned'
  | 'cert.practice.started' | 'cert.practice.completed'
  | 'cert.mock.started' | 'cert.mock.resumed' | 'cert.mock.completed' | 'cert.mock.expired'
  | 'cert.question.answered'
  | 'cert.rationale.viewed'
  | 'cert.recommendation.shown' | 'cert.recommendation.accepted'
  | 'cert.domain.viewed'
  | 'cert.evidence.link_followed' | 'cert.evidence.rescanned'
  // operational, not behavioural — these are the ones that should page someone
  | 'cert.scoring.failed'
  | 'cert.form.generation_failed'
  | 'cert.points.duplicate_award_attempt'
  | 'cert.blueprint.stale';

/**
 * Reuses the platform's own outcome vocabulary rather than inventing one.
 *
 * Worth knowing: it is 'success' | 'failure' | 'blocked' | 'escalated' — there is
 * no 'partial'. That turned out to be an improvement rather than a constraint.
 * A duplicate points award is not a partial anything: the idempotency constraint
 * BLOCKED a second write, which is exactly what 'blocked' means. And an
 * unverified blueprint is not a failure, it is something a human needs to look
 * at — 'escalated'. Precise words already existed.
 */
export interface CertEventInput {
  event: CertEventName;
  enrollmentId?: string | null;
  outcome?: AiEventOutcome;
  durationMs?: number | null;
  errorClass?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Emit one Cert Prep event. Never throws — `emitAiEvent` already absorbs its own
 * failures, and this adds a second guard so a telemetry change can never take a
 * session down.
 */
export async function certEvent(input: CertEventInput): Promise<void> {
  try {
    await emitAiEvent({
      event_type: input.event,
      outcome: input.outcome ?? 'success',
      actor_type: 'student',
      user_id: input.enrollmentId ?? null,
      external_system: 'cert_prep',
      duration_ms: input.durationMs ?? null,
      error_class: input.errorClass ?? null,
      metadata: sanitize(input.metadata),
    });
  } catch {
    // Telemetry is never a reason a student's answer fails to save.
  }
}

// ── the operational signals worth alerting on ────────────────────────────────

/** Scoring blew up. A student saw an error where a score should have been. */
export const scoringFailed = (enrollmentId: string, sessionId: string, err: any) =>
  certEvent({
    event: 'cert.scoring.failed',
    enrollmentId,
    outcome: 'failure',
    errorClass: err?.name ?? 'Error',
    metadata: { session_id: sessionId, message: String(err?.message ?? '').slice(0, 200) },
  });

/**
 * A form could not be built. Usually means the bank has no approved items for a
 * domain — the silent cause of short forms, which is why it gets its own signal
 * rather than being folded into a generic failure.
 */
export const formGenerationFailed = (enrollmentId: string, mode: string, reason: string) =>
  certEvent({
    event: 'cert.form.generation_failed',
    enrollmentId,
    outcome: 'failure',
    metadata: { mode, reason },
  });

/**
 * A points award was attempted twice. 'blocked' rather than 'failure': nothing
 * went wrong, the idempotency constraint refused a second write exactly as
 * designed. A RISING RATE is the signal — it means a client is retrying more
 * than expected, which is worth knowing before it becomes a support ticket.
 */
export const duplicateAwardAttempt = (enrollmentId: string, eventKey: string) =>
  certEvent({
    event: 'cert.points.duplicate_award_attempt',
    enrollmentId,
    outcome: 'blocked',
    metadata: { event_key: eventKey },
  });

/**
 * The active blueprint is not officially sourced. Worth surfacing because every
 * readiness number computed against it is a coverage estimate rather than an
 * exam-weighted one, and nothing else would say so out loud.
 */
export const blueprintStale = (trackId: string, blueprintVersion: string, source: string) =>
  certEvent({
    event: 'cert.blueprint.stale',
    outcome: 'escalated',
    metadata: { track_id: trackId, blueprint_version: blueprintVersion, blueprint_source: source },
  });
