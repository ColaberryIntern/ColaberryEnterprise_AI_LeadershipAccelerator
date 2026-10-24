import { award } from '../pointsService';
import { getTypeXp } from '../progression/pointsConfigService';
import { env } from '../../config/env';

/** Structured to stdout, matching the sibling services in this folder. */
function log(event: string, ctx: Record<string, unknown>, outcome: 'success' | 'failure' = 'success'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'presentation-recording-points', event, outcome, context: ctx,
  }));
}

/**
 * POINTS FOR RECORDING A PRESENTATION TYPE.
 *
 * Ali, 2026-10-23: "The point system here should be reconfigured to give them
 * points for every one of these videos they do."
 *
 * Before this, the whole Demo Prep week paid on HAND-IN only: PREP-1..5 pay the
 * `demo` rate once each when the learner submits evidence. Recording seven
 * different kinds of presentation — which is the actual work the portfolio asks
 * for — paid nothing at all. A learner could record all seven and see the same
 * number as a learner who recorded one.
 *
 * PAID ONCE PER TYPE, NOT PER RECORDING, AND THAT IS THE WHOLE DESIGN.
 *
 * This repo has already been burned by the other shape. `joinBooking` paid for
 * attendance until someone noticed that a learner can mint their own practice
 * room, so "book, join, repeat" was a points faucet; the award now fires only for
 * rooms an instructor scheduled. Paying per recording here would be the same
 * mistake with a record button: hit record, stop, repeat.
 *
 * The idempotency key is the TYPE, so the seven types are seven payouts and a
 * third take of the same type is worth nothing extra. Re-recording to get it
 * right is encouraged and free — which is the behaviour we want anyway.
 *
 * THIS DEPENDS ON THE TYPE BEING FROZEN. A take's `presentation_type` is stamped
 * at ingest and backfilled for older rows precisely because a type that follows
 * the task's current template could be moved seven times to collect seven
 * payouts from one video. The faucet guard is only as good as that column.
 *
 * FAILS CLOSED AND FAIL-SOFT, matching `prepPoints` and `payPrepTask`:
 *   - no `points_config` row, or a zero rate, pays nothing and says nothing;
 *   - a failure to write the points row never fails the ingest. The recording is
 *     the truth; a missing HUD row is logged with its error class and moved on.
 */

/** The `points_config` row this reads. Absent row => rate 0 => nothing paid. */
export const PRESENTATION_RECORDING_XP_KEY = 'presentation_recording';

export interface RecordingAward {
  awarded: boolean;
  builder: number;
  community: number;
}

const NOTHING: RecordingAward = { awarded: false, builder: 0, community: 0 };

function classifyError(err: unknown): string {
  const e = err as { name?: string; error_class?: string };
  return e?.error_class || e?.name || 'Error';
}

/**
 * Pay a learner for having recorded `typeId`, at most once ever.
 *
 * `enrollmentId` and `typeId` are the caller's job to resolve — this does no
 * lookups, so it stays testable without a database and cannot accidentally pay
 * the wrong person by resolving an owner differently from its caller.
 */
export async function payForRecordedType(
  enrollmentId: string | null | undefined,
  typeId: string | null | undefined,
  context: { recordingId?: string; storyId?: string | null } = {},
): Promise<RecordingAward> {
  if (!enrollmentId || !typeId) return NOTHING;
  if (!env.portalPointsAwardEnabled) return NOTHING;

  let rate: { builder: number; community: number };
  try {
    const xp = await getTypeXp(PRESENTATION_RECORDING_XP_KEY);
    rate = { builder: xp.builder, community: xp.community };
  } catch (err) {
    log('presentation_recording_points_rate_failed', {
      typeId, error_class: classifyError(err),
    }, 'failure');
    return NOTHING;
  }

  if (rate.builder <= 0 && rate.community <= 0) return NOTHING;

  try {
    const r = await award(enrollmentId, {
      eventType: PRESENTATION_RECORDING_XP_KEY,
      // THE KEY IS THE TYPE. Seven types, seven payouts, however many takes.
      eventKey: `presentation_type:${typeId}`,
      points: rate.builder,
      metadata: {
        presentation_type: typeId,
        recording_id: context.recordingId ?? null,
        story_id: context.storyId ?? null,
      },
    });
    if (!r.awarded) return NOTHING;

    log('presentation_recording_points_awarded', {
      typeId, recordingId: context.recordingId ?? null, points: r.points,
    });
    return { awarded: true, builder: r.points, community: rate.community };
  } catch (err) {
    // The take is ingested and real. A missing points row is a reporting gap,
    // not a reason to lose the recording.
    log('presentation_recording_points_failed', {
      typeId,
      recordingId: context.recordingId ?? null,
      error_class: classifyError(err),
      note: 'recording is ingested; the HUD points row is missing',
    }, 'failure');
    return NOTHING;
  }
}

/** What one recorded type is worth right now, for the UI to advertise. */
export async function recordedTypeRate(): Promise<{ builder: number; community: number }> {
  if (!env.portalPointsAwardEnabled) return { builder: 0, community: 0 };
  try {
    const xp = await getTypeXp(PRESENTATION_RECORDING_XP_KEY);
    return { builder: xp.builder, community: xp.community };
  } catch {
    // An unpriced slot shows no badge rather than "0 pts" — same rule prepPoints
    // states: fail closed and advertise nothing.
    return { builder: 0, community: 0 };
  }
}
