/**
 * Deciding which student's attempt a Zoom recording belongs to.
 *
 * THE PROBLEM IS NOT THE HAPPY PATH. A numeric Zoom meeting id is reused for every
 * occurrence of that meeting, a single demo-day booking carries the whole cohort,
 * one occurrence yields several files, the webhook subscription is account-wide so
 * unrelated meetings arrive too, and deliveries duplicate and arrive late. Matching
 * on the meeting id alone therefore answers "which booking", never "whose demo".
 *
 * WHAT THIS REFUSES TO DO. It never guesses from a meeting title. A title is
 * operator-controlled free text that drifts, repeats and gets copy-pasted between
 * cohorts; a recording attached to the wrong student on the strength of a title is
 * both wrong and extremely hard to notice. When the evidence does not identify one
 * attempt, the recording is written with `ingest_status = 'review'` and a reason a
 * human can act on. Unmatched is a state, not silence — today an unmatched
 * recording leaves no trace at all.
 *
 * IDEMPOTENT BY CONSTRAINT, NOT BY LOOKUP. Rows are inserted
 * `ON CONFLICT DO NOTHING` against the unique key
 * `(occurrence_uuid, provider_file_id)`. A duplicate webhook, a late retry and the
 * cron sweep all converge on one row. The existing pipeline dedupes with a
 * read-then-write JSONB containment check that the webhook and the 30-minute cron
 * can both lose.
 *
 * NOTHING HERE COMPLETES A TASK. A correlated recording is evidence that something
 * was recorded, never that a student presented. That boundary is enforced
 * elsewhere and asserted by `joinIsNotAttendance.test.ts`.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export type IngestProvenance = 'webhook' | 'cron_sweep' | 'manual_upload' | 'staff_rematch';

export interface IncomingRecording {
  /** Numeric Zoom meeting id. Identifies the MEETING, never the occurrence. */
  meetingId: string;
  /** Unique per start/stop. The only id that separates two occurrences. */
  occurrenceUuid: string;
  /** Zoom's per-file id. Absent is a reason to review, never a reason to guess. */
  providerFileId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  recordingType?: string | null;
  provenance: IngestProvenance;
}

export type CorrelationOutcome =
  /** Exactly one attempt owns this recording. */
  | { kind: 'matched'; attemptId: string; recorded: boolean }
  /**
   * One recording of the whole cohort. Nobody owns it — each presenter's part is a
   * time range inside it, resolved by `presentationSegmentService`.
   */
  | { kind: 'session'; presenterCount: number; attemptIds: string[]; recorded: boolean }
  /** A human has to choose. The row is persisted with a reason. */
  | { kind: 'review'; reason: string; candidateAttemptIds: string[]; recorded: boolean }
  /** Not a presentation at all — a class, a 1:1, somebody's personal meeting. */
  | { kind: 'unrelated' };

/**
 * A review row still needs a value for the NOT NULL half of the natural key.
 *
 * Derived from the occurrence so it stays deterministic: the same delivery arriving
 * twice collides with itself and produces one row, which is the whole point of the
 * key. A random value here would turn every retry into another review item.
 */
const syntheticFileId = (occurrenceUuid: string): string => `nofile:${occurrenceUuid}`;

interface CandidateAttempt {
  id: string;
  assignment_id: string;
  mode: string;
  slot_starts_at: Date | null;
  slot_duration_seconds: number | null;
}

/**
 * Attempts that could own a recording of this meeting.
 *
 * The join is meeting id -> booking -> attempts, widened with each attempt's
 * presenter slot where one exists. A demo-day booking legitimately returns the
 * whole cohort here; narrowing is the next step's job, not this one's.
 */
async function candidatesForMeeting(meetingId: string): Promise<CandidateAttempt[]> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT a.id,
            a.assignment_id,
            a.mode,
            s.starts_at          AS slot_starts_at,
            s.duration_seconds   AS slot_duration_seconds
       FROM room_bookings b
       JOIN presentation_attempts a ON a.booking_id = b.id
       LEFT JOIN presentation_presenter_slots s
              ON s.booking_id = b.id
             AND s.assignment_id = a.assignment_id
             AND s.state <> 'cancelled'
      WHERE b.google_event_id = :mid
      ORDER BY s.position ASC NULLS LAST, a.attempt_no ASC`,
    { replacements: { mid: meetingId } },
  ) as [CandidateAttempt[], unknown];
  return rows || [];
}

/** Does the recording sit inside this presenter's slot, allowing for overrun? */
function overlapsSlot(rec: IncomingRecording, c: CandidateAttempt): boolean {
  if (!c.slot_starts_at || !rec.startedAt) return false;
  const slotStart = new Date(c.slot_starts_at).getTime();
  // A slot with no stated length is treated as the default demo length rather than
  // as unbounded: an unbounded slot would swallow every later presenter.
  const lengthMs = (c.slot_duration_seconds ?? 600) * 1000;
  // Generous either side, because presenters start late and run over, but NOT so
  // generous that neighbouring slots overlap each other.
  const GRACE_MS = 3 * 60 * 1000;
  const slotFrom = slotStart - GRACE_MS;
  const slotTo = slotStart + lengthMs + GRACE_MS;
  const recFrom = rec.startedAt.getTime();
  const recTo = (rec.endedAt ?? rec.startedAt).getTime();
  return recFrom < slotTo && slotFrom < recTo;
}

/**
 * Writes the part row. Returns true when THIS call created it.
 *
 * `ON CONFLICT DO NOTHING` on the natural key is what makes duplicate and
 * out-of-order delivery safe without a read-then-write anyone can race.
 */
async function recordPart(
  rec: IncomingRecording,
  attemptId: string | null,
  status: 'ingested' | 'review',
  reviewReason: string | null,
): Promise<boolean> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `INSERT INTO presentation_recordings
       (attempt_id, occurrence_uuid, provider_file_id, recording_type,
        starts_at, ends_at, ingest_status, ingest_provenance, review_reason)
     VALUES (:aid, :uuid, :fid, :rtype, :s, :e, :status, :prov, :reason)
     ON CONFLICT (occurrence_uuid, provider_file_id) DO NOTHING
     RETURNING id`,
    {
      replacements: {
        // A review row has no owning attempt yet; the column is NOT NULL, so an
        // unmatched recording is parked on the zero uuid rather than on somebody.
        aid: attemptId ?? '00000000-0000-0000-0000-000000000000',
        uuid: rec.occurrenceUuid,
        fid: rec.providerFileId || syntheticFileId(rec.occurrenceUuid),
        rtype: rec.recordingType ?? null,
        s: rec.startedAt,
        e: rec.endedAt,
        status,
        prov: rec.provenance,
        reason: reviewReason,
      },
    },
  ) as [Array<{ id: string }>, unknown];
  return (rows?.length || 0) > 0;
}

/**
 * Does this recording run the length of the session?
 *
 * Compared against the extent of the scheduled slots — first start to last end —
 * with a margin for a session that began recording a little late or stopped a
 * little early. A recording that only covers part of that extent is not the
 * session recording however many slots it happens to brush against.
 */
function spansWholeSession(rec: IncomingRecording, slotted: CandidateAttempt[]): boolean {
  if (!rec.startedAt || !rec.endedAt) return false;

  const starts = slotted.map((c) => new Date(c.slot_starts_at as Date).getTime());
  const ends = slotted.map((c, i) => starts[i] + (c.slot_duration_seconds ?? 600) * 1000);
  const sessionFrom = Math.min(...starts);
  const sessionTo = Math.max(...ends);

  // Generous, because nobody presses record exactly on the hour — but not so
  // generous that a single presenter's slot could qualify.
  const EDGE_MS = 5 * 60 * 1000;
  return rec.startedAt.getTime() <= sessionFrom + EDGE_MS
    && rec.endedAt.getTime() >= sessionTo - EDGE_MS;
}

/**
 * The decision.
 *
 * Deliberately does not download anything, and does not touch `room_resources`.
 * Correlation answers "whose is this"; fetching the bytes is a separate concern
 * that must not be able to change the answer.
 */
export async function correlateRecording(rec: IncomingRecording): Promise<CorrelationOutcome> {
  const candidates = await candidatesForMeeting(rec.meetingId);

  // No presentation attempt references this meeting. Account-wide subscription:
  // class sessions, 1:1s and personal meetings all land here, and they are not
  // this subsystem's business.
  if (candidates.length === 0) return { kind: 'unrelated' };

  if (!rec.providerFileId) {
    const recorded = await recordPart(rec, null, 'review',
      'Zoom sent no per-file id, so this file cannot be identified across deliveries.');
    return {
      kind: 'review',
      reason: 'missing_provider_file_id',
      candidateAttemptIds: candidates.map((c) => c.id),
      recorded,
    };
  }

  if (candidates.length === 1) {
    const only = candidates[0];
    const recorded = await recordPart(rec, only.id, 'ingested', null);
    await claimOccurrence(only.id, rec.occurrenceUuid);
    return { kind: 'matched', attemptId: only.id, recorded };
  }

  // Several attempts share this meeting — the normal shape of demo day. Narrow by
  // the presenter slot, which is the only evidence that says WHO was on at WHEN.
  const inWindow = candidates.filter((c) => overlapsSlot(rec, c));

  if (inWindow.length === 1) {
    const only = inWindow[0];
    const recorded = await recordPart(rec, only.id, 'ingested', null);
    await claimOccurrence(only.id, rec.occurrenceUuid);
    return { kind: 'matched', attemptId: only.id, recorded };
  }

  // A RECORDING THAT COVERS EVERY SLOT IS NOT AMBIGUOUS — IT IS THE SESSION.
  //
  // Demo day is one unbroken recording of the whole cohort. Treating that as "could
  // be any of these eleven students" sends every demo day to review, and worse, any
  // attempt to resolve it would end up labelling a cohort-wide video as one
  // student's demo. It belongs to nobody: it is the session's recording, and each
  // presenter's place in it is a time range, not a file.
  //
  // THE DISCRIMINATOR IS SPAN, NOT COUNT. "Overlaps every slot" looks like the
  // right test and is not: where two presenters' slots overlap each other, a short
  // five-minute recording also touches both, and that is real ambiguity. A session
  // recording is one that runs from the first slot to the last. Counting slots
  // would quietly relabel an ambiguous recording as the whole session and attach a
  // range to someone who may not be in it.
  const slotted = candidates.filter((c) => c.slot_starts_at);
  const isWholeSession = slotted.length > 1 && spansWholeSession(rec, slotted);

  if (isWholeSession) {
    const recorded = await recordPart(rec, null, 'ingested',
      `Session recording covering ${slotted.length} presenters. Each presenter's part is a time range within it, not a separate file.`);
    return {
      kind: 'session',
      presenterCount: slotted.length,
      attemptIds: slotted.map((c) => c.id),
      recorded,
    };
  }

  const reason = inWindow.length === 0
    ? (rec.startedAt
      ? 'The recording does not fall inside any presenter slot for this session.'
      : 'Zoom sent no recording start time, so it cannot be placed against a presenter slot.')
    : `The recording overlaps ${inWindow.length} of ${slotted.length} presenter slots, so it cannot be attributed to one student.`;

  const recorded = await recordPart(rec, null, 'review', reason);
  return {
    kind: 'review',
    reason: inWindow.length === 0 ? 'no_slot_match' : 'ambiguous_slot_match',
    candidateAttemptIds: (inWindow.length ? inWindow : candidates).map((c) => c.id),
    recorded,
  };
}

/**
 * Stamps the occurrence onto the attempt — the first writer this column has ever
 * had.
 *
 * Guarded with `IS NULL` so a second occurrence cannot overwrite the first. An
 * attempt that somehow sees two occurrences is itself a review case, and silently
 * repointing it would destroy the evidence of that.
 */
async function claimOccurrence(attemptId: string, occurrenceUuid: string): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE presentation_attempts
        SET occurrence_uuid = :uuid, recording_state = 'processing', updated_at = NOW()
      WHERE id = :aid AND occurrence_uuid IS NULL`,
    { replacements: { aid: attemptId, uuid: occurrenceUuid } },
  );
}

/** The operations queue: everything a human still has to decide. */
export async function listRecordingsNeedingReview(limit = 50): Promise<Array<Record<string, unknown>>> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT id, attempt_id, occurrence_uuid, provider_file_id, ingest_status,
            ingest_provenance, review_reason, starts_at, ends_at, created_at
       FROM presentation_recordings
      WHERE ingest_status IN ('missing', 'failed', 'review')
      ORDER BY created_at DESC
      LIMIT :lim`,
    { replacements: { lim: limit } },
  ) as [Array<Record<string, unknown>>, unknown];
  return rows || [];
}
