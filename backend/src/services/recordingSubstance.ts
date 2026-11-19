/**
 * Is this recording a session, or is it the sound of an empty room?
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────────
 * Zoom opens a NEW cloud recording every time someone joins a meeting and leaves
 * again. A person who clicks a link, sees nobody, and closes the tab four seconds
 * later leaves behind a complete, valid, 44 KB MP4 at 640x360. Nothing here ever
 * looked at how long a recording was, so that clip was ingested, attached, pinned
 * to `LiveSession.recording_url`, and served to learners as the session.
 *
 * Measured on production 2026-11-18: of 179 recordings, 60 were under 100 KB and
 * 89 under 1 MB. Two scheduled sessions — the 29 Oct and 19 Nov Open Houses — had
 * a clip of this kind as their one and only recording, so "Watch recording" played
 * nine seconds of an empty room.
 *
 * ── WHY DURATION, AND NOT FILE SIZE ───────────────────────────────────────────
 * Size is the tempting signal because it is already on the row. It is also wrong.
 * Probing the whole 98 KB - 3 MB band on production found the two uncorrelated:
 * 474,525 bytes carried 15.8 s while 1,213,625 bytes carried 44.9 s, and a 622 KB
 * file at 1280x720 held 173 s. Any byte threshold therefore both keeps clips and
 * discards real sessions. Duration is the question actually being asked, so it is
 * the field this module reads; `recordingProbe` supplies it for files on disk and
 * Zoom's own file timings supply it before a download is started.
 *
 * ── ONE FLOOR, DELIBERATELY ───────────────────────────────────────────────────
 * The same probe found no natural gap to snap to: durations run 4, 7, 9, 13, 15,
 * 28, 30, 38, 45, 50, 60, 70, 95, 166, 192 seconds and upward in a continuum. So
 * the floor is a judgment, not a discovery, and it is written here once rather than
 * guessed at three call sites. Two minutes is comfortably above every join-and-leave
 * artefact observed (the longest was 95 s) and comfortably below the shortest thing
 * anyone would call a session.
 *
 * ── UNKNOWN IS NOT SHORT ──────────────────────────────────────────────────────
 * A null duration means nobody could measure it — `ffprobe` is absent, or Zoom
 * listed no per-file timings. That is never grounds to withhold a recording from
 * the person who attended the session it belongs to. Absent evidence, every
 * function here answers "substantive".
 *
 * PURE, so the rule is testable without Zoom, a database, or a file on disk.
 */

/**
 * Below this, a cloud recording is an artefact of someone opening a link, not a
 * recording of a session. See the module header for how the number was chosen.
 */
export const MIN_SUBSTANTIVE_RECORDING_SECONDS = 120;

export type InsubstantialReason = 'too_short';

export interface RecordingSubstanceInput {
  /** Seconds of content, or null/undefined when it could not be measured. */
  durationSeconds?: number | null;
}

export interface RecordingSubstanceVerdict {
  substantive: boolean;
  /** Null whenever `substantive` is true, so a caller can log the reason directly. */
  reason: InsubstantialReason | null;
  /** The duration the verdict was reached on, normalized; null when unmeasured. */
  durationSeconds: number | null;
}

/**
 * Finite, non-negative seconds, or null.
 *
 * The empty-string case is the one worth naming: `Number('')` is 0, not NaN, so a
 * naive coercion reads Zoom's "no value" as "zero seconds long" and hides a real
 * recording on the strength of a missing field. An empty or whitespace-only string
 * is unmeasured, and unmeasured is never short.
 */
function normalizeSeconds(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * The one rule. A recording is substantive unless it is measurably shorter than
 * the floor.
 */
export function judgeRecordingSubstance(input: RecordingSubstanceInput): RecordingSubstanceVerdict {
  const durationSeconds = normalizeSeconds(input.durationSeconds);
  if (durationSeconds === null) return { substantive: true, reason: null, durationSeconds: null };
  if (durationSeconds < MIN_SUBSTANTIVE_RECORDING_SECONDS) {
    return { substantive: false, reason: 'too_short', durationSeconds };
  }
  return { substantive: true, reason: null, durationSeconds };
}

/** Convenience for call sites that only need the boolean. */
export function isSubstantiveRecording(input: RecordingSubstanceInput): boolean {
  return judgeRecordingSubstance(input).substantive;
}

/**
 * Seconds between two instants, or null if either is missing.
 *
 * Zoom reports an instance's extent as a start and an end rather than a length,
 * and both the polling path (`instanceTiming`) and the webhook path
 * (`recordingFacts.timingFromFileList`) already produce that pair — so this is
 * the adapter between what they have and what the rule above asks for.
 */
export function durationSecondsBetween(
  startedAt: Date | null | undefined,
  endedAt: Date | null | undefined,
): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = endedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 1000;
}

/**
 * Duration carried on a `room_resources` row, written by `attachRecording` from
 * `recordingProbe`. Reads defensively: `metadata` is free-form jsonb and rows
 * created before the probe existed have no geometry at all.
 */
export function durationFromResourceMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  return normalizeSeconds((metadata as Record<string, unknown>).duration_seconds);
}

/**
 * Should this `room_resources` row appear in a room's list?
 *
 * ONLY RECORDINGS ARE JUDGED, and that restriction is the point rather than an
 * optimization. Every other row in that table is something a person deliberately
 * uploaded — a one-page PDF, a short clip, a link — and how long it is, is none of
 * our business. A length rule that leaked onto uploads would start quietly hiding
 * files their owner had just added, which is a far worse failure than the clutter
 * it was written to remove.
 *
 * Lives here, beside the floor itself, so the listing and the ingest cannot drift
 * into disagreeing about what counts as a recording.
 */
export function shouldListResource(row: {
  resource_type?: string | null;
  metadata?: unknown;
}): boolean {
  if (row.resource_type !== 'recording') return true;
  return isSubstantiveRecording({ durationSeconds: durationFromResourceMetadata(row.metadata) });
}
