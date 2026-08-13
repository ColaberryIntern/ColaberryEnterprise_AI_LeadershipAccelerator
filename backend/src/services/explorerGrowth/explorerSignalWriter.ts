import { Op } from 'sequelize';
import { StudentNavigationEvent } from '../../models';
import { env } from '../../config/env';
import { isExplorerFeatureEnabled } from '../../config/explorerGrowthFlags';
import { isKnownSignal, writableSignals } from './explorerSignalDefinitions';
import { redactForLogs } from '../../utils/piiRedaction';

/**
 * Explorer Growth OS — learner signal writer. Plan §4.2, EPIC 2 T002.
 *
 * The FIRST writer for `student_navigation_events`. That table has existed and
 * been READ (by studentBehaviorIntelligenceAgent, reeseSignalService,
 * personHistoryService) with zero writers — verified at plan time. Filling it
 * serves this epic and those three existing consumers.
 *
 * Three properties this module exists to guarantee:
 *
 *  1. DARK BY DEFAULT. Nothing is written unless
 *     `isExplorerFeatureEnabled('signalIngest')` is true, which requires BOTH the
 *     master flag and the sub-flag. Read only through that helper — a direct
 *     sub-flag read would let ingest run with the master switch off, and a guard
 *     test scans backend source and fails on any such read.
 *
 *  2. A CLOSED ALPHABET. Only signals the definitions table declares as sourced
 *     from `student_navigation_events` may be written. An unrecognised event
 *     type is rejected, never stored — a row nothing can score is landfill that
 *     still costs write throughput on a shared production database.
 *
 *  3. NEVER BREAKS THE CALLER. Signal capture is instrumentation, not the user's
 *     request. Every failure resolves to a rejection result; nothing throws.
 */

export interface RecordSignalInput {
  enrollmentId: string;
  eventType: string;
  page?: string | null;
  lessonId?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

export type SignalWriteOutcome =
  | 'written'
  | 'duplicate_suppressed'
  | 'rejected_unknown_signal'
  | 'rejected_not_writable'
  | 'rejected_invalid_input'
  | 'skipped_flag_off'
  | 'failed';

export interface SignalWriteResult {
  outcome: SignalWriteOutcome;
  written: boolean;
  reason?: string;
}

/**
 * Window within which an identical (enrollment, event_type, page) is treated as
 * the same occurrence rather than a new one.
 *
 * `student_navigation_events` has no unique constraint and this epic is not
 * scoped to add one, so idempotency is enforced here by lookback. Chosen at 60s
 * because the realistic duplicate source is a double-fired React effect or a
 * retried request, not a learner genuinely navigating twice within a minute.
 * A duplicate that slips through is additionally harmless to a decayed sum: the
 * reader caps every signal's total contribution, so the worst case is a wasted
 * row rather than an inflated score.
 */
const DEDUPE_WINDOW_MS = 60_000;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Record one learner signal. Resolves for every outcome — success, rejection,
 * or failure — and never throws.
 */
export async function recordLearnerSignal(
  input: RecordSignalInput,
): Promise<SignalWriteResult> {
  // 1. Dark by default.
  if (!isExplorerFeatureEnabled('signalIngest', env.explorerGrowth)) {
    return { outcome: 'skipped_flag_off', written: false, reason: 'signal ingest disabled' };
  }

  // 2. Input shape.
  if (!isNonEmptyString(input?.enrollmentId) || !isNonEmptyString(input?.eventType)) {
    return {
      outcome: 'rejected_invalid_input',
      written: false,
      reason: 'enrollmentId and eventType are required',
    };
  }

  // 3. Closed alphabet — known signal AND one this stream owns.
  if (!isKnownSignal(input.eventType)) {
    return {
      outcome: 'rejected_unknown_signal',
      written: false,
      reason: `unknown signal: ${input.eventType}`,
    };
  }
  if (!writableSignals().includes(input.eventType)) {
    // Real signals sourced from other tables (a card completion, an email click)
    // must not be forged through this endpoint — they are read from their own
    // source of truth, and accepting one here would create a second, divergent
    // record of the same fact.
    return {
      outcome: 'rejected_not_writable',
      written: false,
      reason: `signal ${input.eventType} is not sourced from student_navigation_events`,
    };
  }

  try {
    // 4. Idempotency by lookback.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const existing = await StudentNavigationEvent.findOne({
      where: {
        enrollment_id: input.enrollmentId,
        event_type: input.eventType,
        page: input.page ?? null,
        created_at: { [Op.gte]: since },
      },
      attributes: ['id'],
    });
    if (existing) {
      return { outcome: 'duplicate_suppressed', written: false, reason: 'seen within dedupe window' };
    }

    // NOTE for anyone adding a raw-SQL writer to this table later (found during
    // T006's dev-database check): student_navigation_events.id is NOT NULL with
    // NO database default. This create() is safe because the Sequelize model
    // declares defaultValue: DataTypes.UUIDV4 and generates the id client-side —
    // but a plain `INSERT INTO student_navigation_events (enrollment_id, ...)`
    // fails with a not-null violation. Supply gen_random_uuid() explicitly, or
    // go through the model.
    await StudentNavigationEvent.create({
      enrollment_id: input.enrollmentId,
      event_type: input.eventType,
      page: input.page ?? null,
      lesson_id: input.lessonId ?? null,
      duration_ms: typeof input.durationMs === 'number' ? input.durationMs : null,
      metadata: (input.metadata ?? null) as Record<string, any> | null,
      created_at: new Date(),
    } as never);

    return { outcome: 'written', written: true };
  } catch (err: any) {
    // Instrumentation must never break the request that produced it. Logged
    // through redactForLogs because metadata can carry learner-supplied text.
    console.warn(
      redactForLogs(
        JSON.stringify({
          event: 'explorer.signal.write_failed',
          service: 'explorer-growth',
          level: 'warn',
          outcome: 'failure',
          error_class: err?.name || 'SignalWriteError',
          enrollment_id: input.enrollmentId,
          signal: input.eventType,
          detail: err?.message,
        }),
      ),
    );
    return { outcome: 'failed', written: false, reason: err?.message };
  }
}
