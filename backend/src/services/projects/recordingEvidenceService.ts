/**
 * recordingEvidenceService — a recording this platform already holds, used as
 * evidence, instead of making the student republish it somewhere public.
 *
 * THE GAP THIS CLOSES. `demoEvidenceService` accepts a link or text, and PREP-2
 * and PREP-5 accept ONLY a link, because their evidence is a recording. That was
 * right when the platform held no recordings. It now does: a student rehearses in
 * a practice room, Zoom records it, and the parts land in `presentation_recordings`
 * against their attempt. Before this module the only way to hand that in was to
 * download the file, upload it to YouTube or Drive, make it publicly viewable, and
 * paste the link — a worse artifact (now public, now duplicated, now outside the
 * platform's retention) produced purely to satisfy the shape of the form.
 *
 * WHY THE REF IS NAMESPACED AND NOT A URL. `student_tasks.verified_ref` is read by
 * several surfaces that treat a bare string as a commit sha
 * (`awardedEvidenceRef`, `latchedFromNothing`). A raw uuid there would be
 * indistinguishable from one. Every ref this module produces is prefixed
 * `recording:` so it can never be mistaken for a sha, a URL, or anything else, and
 * `parseRecordingRef` is the one reader.
 *
 * NO PLAYBACK URL IS RETURNED OR STORED. The recording is internal and is opened
 * through the platform's own surfaces, which apply their own access checks. A URL
 * frozen into `verified_ref` would outlive those checks.
 *
 * FAILURE PATH. Two misses, deliberately different. An attempt that is not
 * reachable from this task is `not_found` and says nothing about whether it exists
 * elsewhere — the same rule the rest of this surface follows. An attempt that IS
 * this student's but whose recording has not arrived is `not_ready`, which is a
 * real, actionable state and must not be flattened into "wrong id".
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

/** Marks a ref as pointing at a recording this platform holds. */
export const RECORDING_REF_PREFIX = 'recording:';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape only — says nothing about whether it exists or is the caller's. Pure. */
export function isUuid(value: string): boolean {
  return UUID_RE.test((value ?? '').trim());
}

/** The value stored in `student_tasks.verified_ref` for an internal recording. Pure. */
export function recordingRef(attemptId: string): string {
  return `${RECORDING_REF_PREFIX}${attemptId}`;
}

/**
 * The attempt id inside a ref this module wrote, or null for anything else —
 * a URL, a commit sha, a reviewer's name. Pure, and the ONLY reader, so a
 * surface can tell internal evidence from an external link without guessing.
 */
export function parseRecordingRef(ref: string | null | undefined): string | null {
  const v = (ref ?? '').trim();
  if (!v.startsWith(RECORDING_REF_PREFIX)) return null;
  const id = v.slice(RECORDING_REF_PREFIX.length);
  return isUuid(id) ? id : null;
}

/** One of the student's own takes, with enough to tell them apart. Never a URL. */
export interface RecordedAttempt {
  attemptId: string;
  attemptNo: number;
  mode: string;
  isFinalTake: boolean;
  startedAt: string | null;
  endedAt: string | null;
  /** Parts that actually arrived. Zoom splits a recording when a host restarts. */
  parts: number;
  /** Summed across parts; null when no part reported one. */
  durationSeconds: number | null;
  /**
   * What the file contains, where the provider told us. NULL IS NOT FALSE — Zoom
   * does not always say, and "we do not know" must never be shown as "no audio",
   * which would send someone to re-record a good take.
   */
  hasAudio: boolean | null;
  hasSharedScreen: boolean | null;
  /** Student-readable warnings; empty when there is nothing to warn about. */
  warnings: string[];
  /** True when the student supplied this link because nothing was ever captured. */
  recoveredFromLink: boolean;
}

export type RecordingEvidenceResolution =
  | { ok: true; attempt: RecordedAttempt; ref: string; detail: Record<string, unknown> }
  | { ok: false; reason: 'not_found' | 'not_ready' };

/**
 * Attempts on THIS task, joined through the assignment so an attempt id belonging
 * to another project can never resolve. `usable_parts` counts only parts that
 * arrived: `missing` and `failed` are known non-deliveries, and counting them
 * would offer the student a take with nothing behind it.
 */
const ATTEMPT_SQL = `
  SELECT a.id                AS attempt_id,
         a.attempt_no,
         a.mode,
         a.is_final_take,
         a.started_at,
         a.ended_at,
         COUNT(r.id) FILTER (WHERE r.ingest_status NOT IN ('missing', 'failed')) AS usable_parts,
         SUM(r.duration_seconds) FILTER (WHERE r.ingest_status NOT IN ('missing', 'failed')) AS duration_seconds,
         -- bool_or is exactly the rule we want across parts: true if ANY part had
         -- it, false only when every part said no, and NULL when nobody told us.
         bool_or(r.has_audio) FILTER (WHERE r.ingest_status NOT IN ('missing', 'failed')) AS has_audio,
         bool_or(r.has_shared_screen) FILTER (WHERE r.ingest_status NOT IN ('missing', 'failed')) AS has_shared_screen,
         bool_or(r.ingest_provenance = 'student_recovery') FILTER (WHERE r.ingest_status NOT IN ('missing', 'failed')) AS recovered
    FROM presentation_attempts a
    JOIN presentation_assignments s ON s.id = a.assignment_id
    LEFT JOIN presentation_recordings r ON r.attempt_id = a.id
   WHERE s.project_id = :projectId
     AND s.story_id = :storyId`;

function toAttempt(row: Record<string, any>): RecordedAttempt {
  const duration = row.duration_seconds === null || row.duration_seconds === undefined
    ? null
    : Number(row.duration_seconds);
  // A take with no audio, or no shared screen, is still offered — it is the
  // student's recording and hiding it helps nobody — but it is offered WITH the
  // warning attached, so handing in a silent video is a choice and not an accident.
  const contents = describeTakeContents(row.has_audio, row.has_shared_screen);
  return {
    attemptId: String(row.attempt_id),
    attemptNo: Number(row.attempt_no ?? 1),
    mode: String(row.mode ?? 'practice_solo'),
    isFinalTake: Boolean(row.is_final_take),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    parts: Number(row.usable_parts ?? 0),
    durationSeconds: Number.isFinite(duration as number) ? (duration as number) : null,
    ...contents,
    recoveredFromLink: row.recovered === true,
  };
}

/**
 * The takes a student can hand in for this task, newest first. Only attempts with
 * a recording that actually arrived — an empty list is the honest answer when
 * nothing has been recorded, and the caller must say so rather than showing a
 * picker with nothing in it.
 *
 * Ownership is the caller's job: this is reached only after the project tree has
 * been proved to belong to the enrollment, and the join pins every row to that
 * project's own assignment.
 */
export async function listRecordedAttempts(projectId: string, storyId: string): Promise<RecordedAttempt[]> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `${ATTEMPT_SQL}
     GROUP BY a.id
     HAVING COUNT(r.id) FILTER (WHERE r.ingest_status NOT IN ('missing', 'failed')) > 0
     ORDER BY a.attempt_no DESC
     LIMIT 50`,
    { replacements: { projectId, storyId } },
  ) as [Array<Record<string, any>>, unknown];
  return (rows ?? []).map(toAttempt);
}

/**
 * The same list, with ownership proved the way every other read on this surface
 * proves it. A project that is not yours is indistinguishable from one that does
 * not exist, so the miss is `not_found` and never `forbidden`.
 *
 * This is the entry point a route uses; `listRecordedAttempts` is the inner query
 * and assumes the caller already holds the project.
 */
export async function listRecordedAttemptsForOwner(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<{ ok: true; attempts: RecordedAttempt[] } | { ok: false; reason: 'not_found' }> {
  const { getOwnedProjectTree } = await import('./projectReadService');
  const tree = await getOwnedProjectTree(enrollmentId, projectId);
  if (!tree) return { ok: false, reason: 'not_found' };
  return { ok: true, attempts: await listRecordedAttempts(projectId, storyId) };
}

/**
 * Prove one attempt is a usable recording for this task, and build the ref and
 * detail that will be frozen onto the task row.
 *
 * The detail is what answers "why is this complete" for a reviewer who was not
 * there: which take, how many parts, how long, and that it came from inside the
 * platform rather than a link somebody pasted.
 */
export async function resolveRecordingEvidence(
  projectId: string,
  storyId: string,
  attemptId: string,
): Promise<RecordingEvidenceResolution> {
  if (!isUuid(attemptId)) return { ok: false, reason: 'not_found' };

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `${ATTEMPT_SQL}
       AND a.id = :attemptId
     GROUP BY a.id
     LIMIT 1`,
    { replacements: { projectId, storyId, attemptId } },
  ) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'not_found' };

  const attempt = toAttempt(row);
  // The attempt is theirs, but Zoom has not delivered. That is a wait, not a
  // mistake, and the student is told which it is.
  if (attempt.parts < 1) return { ok: false, reason: 'not_ready' };

  return {
    ok: true,
    attempt,
    ref: recordingRef(attempt.attemptId),
    detail: {
      kind: 'recording',
      source: 'internal',
      attempt_id: attempt.attemptId,
      attempt_no: attempt.attemptNo,
      mode: attempt.mode,
      parts: attempt.parts,
      duration_seconds: attempt.durationSeconds,
      started_at: attempt.startedAt,
      submitted_at: new Date().toISOString(),
    },
  };
}

/** What a recording actually contains, said plainly rather than implied. */
export interface TakeContents {
  hasAudio: boolean | null;
  hasSharedScreen: boolean | null;
  /** Student-readable warnings. Empty when there is nothing to warn about. */
  warnings: string[];
}

/**
 * Turn the two capture flags into something a student can act on.
 *
 * NULL IS NOT FALSE. Zoom does not always tell us what a file contains, and
 * "we do not know" must never be reported as "your recording has no audio" —
 * that would send someone to re-record a perfectly good take. Only an explicit
 * `false` produces a warning. Pure.
 */
export function describeTakeContents(
  hasAudio: boolean | null | undefined,
  hasSharedScreen: boolean | null | undefined,
): TakeContents {
  const audio = hasAudio === undefined ? null : hasAudio;
  const screen = hasSharedScreen === undefined ? null : hasSharedScreen;
  const warnings: string[] = [];
  if (audio === false) warnings.push('This recording has no audio track. Nobody reviewing it will hear you.');
  if (screen === false) warnings.push('This recording has no shared screen — it is camera only, so your demo will not be visible.');
  return { hasAudio: audio, hasSharedScreen: screen, warnings };
}
