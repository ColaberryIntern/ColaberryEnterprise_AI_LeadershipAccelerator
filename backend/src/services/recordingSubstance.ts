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
 * Measured on production 2026-11-18 by probing all 179 recordings we hold: 82 run
 * under two minutes, and 79 of those are 640x360 with no screen share. Two
 * scheduled sessions — the 29 Oct and 19 Nov Open Houses — had a clip of this kind
 * as their one and only recording, so "Watch recording" played nine seconds of an
 * empty room.
 *
 * ── WHY DURATION ALONE IS THE WRONG RULE ──────────────────────────────────────
 * A duration floor was the obvious answer and it is not safe on its own. The same
 * probe found three 1920x1080 `shared_screen_with_speaker_view` recordings running
 * 63, 71 and 79 seconds: students rehearsing a presentation in a practice room.
 * Those are real recordings their owner wants, and a flat floor would have hidden
 * every one of them. A rule that cannot tell a 70-second rehearsal from a
 * 70-second empty room is not finished.
 *
 * So shortness condemns a recording only when nothing else in it suggests content:
 *
 *   - A SCREEN COMPOSITION means somebody was presenting. Zoom only produces
 *     `shared_screen*` when a screen was actually shared, so it is positive
 *     evidence of a real session however brief.
 *   - A FRAME TALLER THAN 360 means the same thing from the other side. 640x360 is
 *     what Zoom emits for active-speaker-only with nobody sharing anything — the
 *     signature of every look-in on production, and of none of the real ones.
 *
 * Either is enough to keep a recording. Both absent, and a sub-floor duration is
 * what it looks like.
 *
 * ── WHY NOT FILE SIZE ─────────────────────────────────────────────────────────
 * Size is the tempting signal because it is already on the row, and it is wrong.
 * Probing the 98 KB - 3 MB band found size and length uncorrelated: 474,525 bytes
 * carried 15.8 s while 1,213,625 bytes carried 44.9 s, and a 622 KB file at
 * 1280x720 held 173 s. Any byte threshold therefore both keeps clips and discards
 * sessions. The fields below are the ones that answer the question.
 *
 * ── THE FLOOR IS CHOSEN, NOT DISCOVERED ───────────────────────────────────────
 * The probe found no natural gap to snap to: durations run 4, 7, 9, 13, 15, 28,
 * 30, 38, 45, 50, 60, 70, 95, 166, 192 seconds and upward in a continuum. So the
 * number is a judgment, written here once rather than guessed at three call sites.
 * Two minutes sits above every look-in observed (the longest was 29.9 s at 640x360,
 * 95.2 s counting the handful that ran longer) and below the shortest thing anyone
 * would call a session.
 *
 * ── UNKNOWN IS NOT SHORT ──────────────────────────────────────────────────────
 * A null duration means nobody could measure it — `ffprobe` is absent, or Zoom
 * listed no per-file timings. That is never grounds to withhold a recording from
 * the people who attended the session it belongs to. Absent evidence, every
 * function here answers "substantive".
 *
 * ── TWO VANTAGE POINTS, ONE RULE ──────────────────────────────────────────────
 * The inputs are all optional because the callers see different things. Zoom's
 * recordings list carries timings and a composition but no resolution, so
 * selection judges on those. A downloaded file carries resolution and duration but
 * the row may predate composition being recorded, so the ingest and the listing
 * judge on those. Each passes what it has; the rule is the same.
 *
 * PURE, so it is testable without Zoom, a database, or a file on disk.
 */

/**
 * Below this, a recording with no other sign of content is an artefact of someone
 * opening a link. See the module header for how the number was chosen.
 */
export const MIN_SUBSTANTIVE_RECORDING_SECONDS = 120;

/**
 * Zoom's active-speaker-only output, which is what you get when nobody shared
 * anything. Every look-in on production is exactly this; no real recording is.
 */
export const ACTIVE_SPEAKER_MAX_HEIGHT = 360;

export type InsubstantialReason = 'short_and_empty';

export interface RecordingSubstanceInput {
  /** Seconds of content, or null/undefined when it could not be measured. */
  durationSeconds?: number | null;
  /** Frame height in pixels, from `recordingProbe`. Unknown for a Zoom listing. */
  videoHeight?: number | null;
  /** Zoom's composition name, e.g. `shared_screen_with_speaker_view`. */
  recordingType?: string | null;
}

export interface RecordingSubstanceVerdict {
  substantive: boolean;
  /** Null whenever `substantive` is true, so a caller can log the reason directly. */
  reason: InsubstantialReason | null;
  /** The duration the verdict was reached on, normalized; null when unmeasured. */
  durationSeconds: number | null;
}

/**
 * Finite, non-negative number, or null.
 *
 * The empty-string case is the one worth naming: `Number('')` is 0, not NaN, so a
 * naive coercion reads Zoom's "no value" as "zero seconds long" and hides a real
 * recording on the strength of a missing field. An empty or whitespace-only string
 * is unmeasured, and unmeasured is never short.
 */
function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Did somebody share a screen? Zoom only emits a `shared_screen*` composition when
 * one was actually shared, so this is positive evidence of a real session.
 *
 * Deliberately a copy of the same predicate in `recordingCompositionCheck`, which
 * answers a different question (was a CLASS recorded without the screen) and must
 * stay pure and dependency-free for its own reasons.
 */
export function isScreenComposition(recordingType: string | null | undefined): boolean {
  return /^shared_screen/.test(String(recordingType || ''));
}

/**
 * Anything suggesting a person was actually doing something, rather than looking
 * into an empty room. Either signal alone is enough.
 */
function hasContentEvidence(input: RecordingSubstanceInput): boolean {
  if (isScreenComposition(input.recordingType)) return true;
  const height = normalizeNumber(input.videoHeight);
  return height !== null && height > ACTIVE_SPEAKER_MAX_HEIGHT;
}

/**
 * The one rule. A recording is substantive unless it is measurably shorter than
 * the floor AND carries no sign that anybody was presenting.
 */
export function judgeRecordingSubstance(input: RecordingSubstanceInput): RecordingSubstanceVerdict {
  const durationSeconds = normalizeNumber(input.durationSeconds);
  if (durationSeconds === null) return { substantive: true, reason: null, durationSeconds: null };
  if (durationSeconds >= MIN_SUBSTANTIVE_RECORDING_SECONDS) {
    return { substantive: true, reason: null, durationSeconds };
  }
  if (hasContentEvidence(input)) return { substantive: true, reason: null, durationSeconds };
  return { substantive: false, reason: 'short_and_empty', durationSeconds };
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
 * The substance inputs carried on a `room_resources` row. `video_height` and
 * `duration_seconds` are written by `attachRecording` from `recordingProbe`;
 * `recording_type` by the class and booking ingest paths. Reads defensively:
 * `metadata` is free-form jsonb and rows created before the probe existed have no
 * geometry at all.
 */
export function substanceFromResourceMetadata(metadata: unknown): RecordingSubstanceInput {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const m = metadata as Record<string, unknown>;
  return {
    durationSeconds: normalizeNumber(m.duration_seconds),
    videoHeight: normalizeNumber(m.video_height),
    recordingType: typeof m.recording_type === 'string' ? m.recording_type : null,
  };
}

/** Just the duration, for callers that report on it. */
export function durationFromResourceMetadata(metadata: unknown): number | null {
  return substanceFromResourceMetadata(metadata).durationSeconds ?? null;
}

/**
 * Should this `room_resources` row appear in a room's list?
 *
 * ONLY RECORDINGS ARE JUDGED, and that restriction is the point rather than an
 * optimization. Every other row in that table is something a person deliberately
 * uploaded, and how long it is, is none of our business. A length rule that leaked
 * onto uploads would start quietly hiding files their owner had just added, which
 * is a far worse failure than the clutter it was written to remove.
 *
 * Lives here, beside the floor itself, so the listing and the ingest cannot drift
 * into disagreeing about what counts as a recording.
 */
export function shouldListResource(row: {
  resource_type?: string | null;
  metadata?: unknown;
}): boolean {
  if (row.resource_type !== 'recording') return true;
  return isSubstantiveRecording(substanceFromResourceMetadata(row.metadata));
}
