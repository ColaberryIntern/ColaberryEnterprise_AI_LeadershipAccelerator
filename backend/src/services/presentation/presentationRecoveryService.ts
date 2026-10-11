import { isHttpUrl, isPrivateLink } from '../projects/evidenceLinks';

/**
 * What a student can do when the recording did not arrive, and which take counts.
 *
 * TWO THINGS THAT LOOK UNRELATED AND ARE NOT. Both answer "the system holds takes,
 * and the student needs a say in them": one supplies a take the pipeline failed to
 * deliver, the other chooses which take is the one being handed in. Keeping them in
 * one module keeps the rule they share in one place — NEITHER EVER DESTROYS A TAKE.
 *
 * RECOVERY IS NOT AN INGEST, AND IS LABELLED SO. Zoom cloud recording fails: a host
 * on a Basic licence cannot record at all, a meeting can end before processing
 * starts, and a file can simply never appear. The student still did the work. They
 * can point us at their own copy — but nobody fetched it, nobody checked what is on
 * the other end, and the row says exactly that: `ingest_provenance =
 * 'student_recovery'`, with the link in `recovery_url`, the only URL this table
 * holds. A reviewer can always tell a recovered take from one we captured.
 *
 * IT CANNOT OVERWRITE A REAL RECORDING. Recovery is refused while any part of the
 * attempt actually arrived. Otherwise a student could paste a link over the
 * recording of what they really did, which is the one thing this evidence path
 * exists to prevent.
 *
 * THE LINK MUST BE ONE SOMEBODY ELSE CAN OPEN. Same rule, same function, as the
 * evidence form: `isPrivateLink` refuses localhost, loopback, private ranges and
 * single-label hosts. A learner's demo narrative went in as
 * `http://localhost:8420/...` on 2026-09-17 and nobody but him could ever open it.
 *
 * SELECTING A FINAL TAKE DELETES NOTHING. It moves a flag. Every earlier take stays
 * listed, stays selectable, and keeps its recording — a student who marks the wrong
 * one must be able to change their mind, and a reviewer must still be able to see
 * that there were four attempts.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_URL_CHARS = 2000;

/** Recording parts that genuinely arrived. The same rule the evidence picker uses. */
const ARRIVED = "ingest_status NOT IN ('missing', 'failed')";

export type RecoveryFailure =
  | 'not_found'
  | 'already_recorded'
  | 'bad_link'
  | 'private_link';

export interface RecoveredTake {
  attemptId: string;
  recordingId: string;
  recoveryUrl: string;
  /** ALWAYS 'student_recovery' — nobody fetched or inspected this file. */
  provenance: 'student_recovery';
}

export type RecoveryResult =
  | { ok: true; recovered: RecoveredTake }
  | { ok: false; reason: RecoveryFailure };

/**
 * Is this attempt on this task, and did anything actually arrive for it?
 * One query, so the ownership check and the state check cannot disagree.
 */
async function attemptState(
  projectId: string,
  storyId: string,
  attemptId: string,
): Promise<{ found: boolean; arrivedParts: number; recoveredParts: number }> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT COUNT(r.id) FILTER (WHERE r.${ARRIVED}) AS arrived_parts,
            COUNT(r.id) FILTER (WHERE r.ingest_provenance = 'student_recovery') AS recovered_parts
       FROM presentation_attempts a
       JOIN presentation_assignments s ON s.id = a.assignment_id
       LEFT JOIN presentation_recordings r ON r.attempt_id = a.id
      WHERE a.id = :attemptId
        AND s.project_id = :projectId
        AND s.story_id = :storyId
      GROUP BY a.id
      LIMIT 1`,
    { replacements: { projectId, storyId, attemptId } },
  ) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  if (!row) return { found: false, arrivedParts: 0, recoveredParts: 0 };
  return {
    found: true,
    arrivedParts: Number(row.arrived_parts ?? 0),
    recoveredParts: Number(row.recovered_parts ?? 0),
  };
}

/**
 * Record where the student's own copy of a missing recording lives.
 *
 * Ownership is proved by the caller holding the project; the join pins the attempt
 * to this project's own assignment, so another student's attempt id resolves to
 * `not_found` and says nothing more.
 */
export async function recoverMissingRecording(
  projectId: string,
  storyId: string,
  attemptId: string,
  url: string,
): Promise<RecoveryResult> {
  if (!UUID_RE.test((attemptId ?? '').trim())) return { ok: false, reason: 'not_found' };

  const link = (url ?? '').trim();
  if (!link || link.length > MAX_URL_CHARS || !isHttpUrl(link)) return { ok: false, reason: 'bad_link' };
  if (isPrivateLink(link)) return { ok: false, reason: 'private_link' };

  const state = await attemptState(projectId, storyId, attemptId);
  if (!state.found) return { ok: false, reason: 'not_found' };
  // A take we actually captured outranks anything pasted over it. Note this counts
  // an EARLIER recovery too, so recovering twice is refused rather than silently
  // stacking a second row — the student edits by recovering a different attempt.
  if (state.arrivedParts > 0) return { ok: false, reason: 'already_recorded' };

  const sequelize = await db();
  // `provider_file_id` is synthesised from the attempt so the table's unique key
  // (occurrence_uuid, provider_file_id) still does its job: recovering the same
  // attempt twice conflicts instead of inserting a duplicate part.
  const [rows] = await sequelize.query(
    `INSERT INTO presentation_recordings
       (attempt_id, occurrence_uuid, provider_file_id, part_no, recording_type,
        ingest_status, ingest_provenance, recovery_url)
     SELECT a.id,
            COALESCE(a.occurrence_uuid, 'recovery:' || a.id::text),
            'recovery:' || a.id::text,
            1,
            'student_recovery',
            'ingested',
            'student_recovery',
            :url
       FROM presentation_attempts a
      WHERE a.id = :attemptId
     ON CONFLICT (occurrence_uuid, provider_file_id) DO NOTHING
     RETURNING id`,
    { replacements: { attemptId, url: link } },
  ) as [Array<Record<string, any>>, unknown];

  const id = rows?.[0]?.id;
  // DO NOTHING returned nothing: a recovery row for this attempt already exists.
  // Idempotent by constraint rather than by read-then-write, so two clicks race
  // safely.
  if (!id) return { ok: false, reason: 'already_recorded' };

  return {
    ok: true,
    recovered: {
      attemptId,
      recordingId: String(id),
      recoveryUrl: link,
      provenance: 'student_recovery',
    },
  };
}

export type FinalTakeResult =
  | { ok: true; attemptId: string; previousFinalAttemptId: string | null; takesKept: number }
  | { ok: false; reason: 'not_found' };

/**
 * Mark one attempt as the final take for this task.
 *
 * DESTROYS NOTHING. The flag moves off whichever attempt held it and onto this one;
 * every take, and every recording under it, stays exactly where it was. The result
 * reports how many takes still exist precisely so a caller can assert that.
 */
export async function selectFinalTake(
  projectId: string,
  storyId: string,
  attemptId: string,
): Promise<FinalTakeResult> {
  if (!UUID_RE.test((attemptId ?? '').trim())) return { ok: false, reason: 'not_found' };

  const sequelize = await db();
  const [owned] = await sequelize.query(
    `SELECT a.id,
            (SELECT x.id FROM presentation_attempts x
              WHERE x.assignment_id = a.assignment_id AND x.is_final_take
              LIMIT 1) AS previous_final_id,
            (SELECT COUNT(*) FROM presentation_attempts y
              WHERE y.assignment_id = a.assignment_id) AS takes_total
       FROM presentation_attempts a
       JOIN presentation_assignments s ON s.id = a.assignment_id
      WHERE a.id = :attemptId
        AND s.project_id = :projectId
        AND s.story_id = :storyId
      LIMIT 1`,
    { replacements: { projectId, storyId, attemptId } },
  ) as [Array<Record<string, any>>, unknown];

  const row = owned?.[0];
  if (!row) return { ok: false, reason: 'not_found' };

  // Two UPDATEs, both scoped to this task's own assignment. The clear runs first so
  // the "exactly one final take" rule never momentarily holds two — and because the
  // flag is the only thing written, no recording or attempt is touched.
  await sequelize.query(
    `UPDATE presentation_attempts a
        SET is_final_take = FALSE, updated_at = NOW()
       FROM presentation_assignments s
      WHERE s.id = a.assignment_id
        AND s.project_id = :projectId
        AND s.story_id = :storyId
        AND a.is_final_take`,
    { replacements: { projectId, storyId } },
  );
  await sequelize.query(
    `UPDATE presentation_attempts
        SET is_final_take = TRUE, updated_at = NOW()
      WHERE id = :attemptId`,
    { replacements: { attemptId } },
  );

  const previous = row.previous_final_id ? String(row.previous_final_id) : null;
  return {
    ok: true,
    attemptId,
    previousFinalAttemptId: previous === attemptId ? null : previous,
    takesKept: Number(row.takes_total ?? 1),
  };
}

/**
 * Prove the project is the caller's, then act. These are the entry points a route
 * uses; the functions above take a project that has already been proved and are
 * kept separate so the SQL can be tested without the ownership read.
 *
 * A project that is not yours is `not_found`, never `forbidden` — the same rule the
 * rest of this surface follows, so probing cannot tell the two apart.
 */
async function ownsProject(enrollmentId: string, projectId: string): Promise<boolean> {
  const { getOwnedProjectTree } = await import('../projects/projectReadService');
  return Boolean(await getOwnedProjectTree(enrollmentId, projectId));
}

export async function recoverMissingRecordingForOwner(
  enrollmentId: string,
  projectId: string,
  storyId: string,
  attemptId: string,
  url: string,
): Promise<RecoveryResult> {
  if (!(await ownsProject(enrollmentId, projectId))) return { ok: false, reason: 'not_found' };
  return recoverMissingRecording(projectId, storyId, attemptId, url);
}

export async function selectFinalTakeForOwner(
  enrollmentId: string,
  projectId: string,
  storyId: string,
  attemptId: string,
): Promise<FinalTakeResult> {
  if (!(await ownsProject(enrollmentId, projectId))) return { ok: false, reason: 'not_found' };
  return selectFinalTake(projectId, storyId, attemptId);
}
