/**
 * What we can honestly say about a recording, from what the provider already told us.
 *
 * WHY THIS EXISTS. `presentation_recordings.has_audio`, `.has_shared_screen` and
 * `.duration_seconds` were created, read, and surfaced to learners — and nothing in
 * the backend ever wrote them. Grepped twice on 2026-10-11: every mention was a
 * schema line, a model declaration, a read, or a comment. A consumer with no
 * producer. `describeTakeContents` warns only when a value is `false`, so the
 * warnings it exists to raise could never fire: a silent camera-only take handed in
 * exactly like a good one.
 *
 * NO DOWNLOAD. Two of the three facts are already in the payload Zoom sends — the
 * recording type and the per-file start/end timestamps. Fetching and probing a
 * several-hundred-megabyte MP4 to learn something the metadata already states would
 * be a worse answer, not a more rigorous one.
 *
 * NULL IS A REAL ANSWER AND IS NEVER GUESSED AT. `null` means "the provider did not
 * say", which is different from `false`, and the whole modality design in
 * `presentationModalities` rests on that distinction. Returning `false` where we
 * simply do not know would put a scary, wrong warning in front of a learner whose
 * recording is fine — so every function here returns `null` rather than a default.
 *
 * Pure. No database, no network, no imports.
 */

/**
 * Did this recording capture a shared screen?
 *
 * From Zoom's `recording_type`, which is already stored on the row. The composition
 * names are stable API values, not display strings.
 *
 *   shared_screen, shared_screen_with_speaker_view,
 *   shared_screen_with_gallery_view              -> true
 *   active_speaker, gallery_view, speaker_view   -> false
 *   audio_only, chat_file, timeline, transcript  -> null (not a video composition,
 *                                                   so it says nothing either way)
 */
export function sharedScreenFromRecordingType(type: string | null | undefined): boolean | null {
  const t = String(type || '').trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith('shared_screen')) return true;
  if (t === 'active_speaker' || t === 'gallery_view' || t === 'speaker_view') return false;
  // Anything else — audio_only, chat_file, timeline, a type Zoom adds later — is not
  // a claim about the screen. Saying `false` here would warn a learner their demo is
  // invisible on the strength of a transcript file.
  return null;
}

/** One entry of Zoom's `recording_files`, narrowed to what is needed here. */
export interface RecordingFileLike {
  recording_type?: string | null;
  file_type?: string | null;
  recording_start?: string | null;
  recording_end?: string | null;
}

/**
 * Did this occurrence capture audio?
 *
 * Zoom emits a separate `audio_only` (M4A) rendering, and a transcript, whenever the
 * meeting had an audio track. Their presence in the same delivery is the provider
 * stating there was sound — no decode required.
 *
 * Their ABSENCE is not proof of silence: a short meeting may not get a transcript,
 * and the webhook can deliver a subset. So the absent case is `null`, not `false`.
 * A false "nobody will hear you" on a perfectly good take is the expensive error
 * here, not a missing warning.
 */
export function audioFromFileList(files: RecordingFileLike[] | null | undefined): boolean | null {
  if (!Array.isArray(files) || files.length === 0) return null;
  const says = (f: RecordingFileLike) => `${f.recording_type || ''} ${f.file_type || ''}`.toLowerCase();
  const hasAudioRendering = files.some((f) => /audio_only|m4a/.test(says(f)));
  const hasTranscript = files.some((f) => /audio_transcript|transcript|vtt/.test(says(f)));
  if (hasAudioRendering || hasTranscript) return true;
  return null;
}

/**
 * How long the recording runs, in whole seconds.
 *
 * Null unless both ends are known and the span is positive. A zero or negative
 * duration is a clock problem, not a zero-length video, and storing it would make
 * "0 seconds" appear next to a take the learner can watch.
 */
export function durationSecondsFrom(
  startedAt: Date | null | undefined,
  endedAt: Date | null | undefined,
): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = endedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 1000);
}

/**
 * The earliest start and latest end across a delivery's files.
 *
 * The same rule `zoomService.instanceTiming` applies to the polling path. It is
 * restated here, over the narrow `RecordingFileLike` shape, so the WEBHOOK path can
 * use it without importing the Zoom client — which would drag an HTTP layer into a
 * pure derivation and into every test that touches it.
 */
export function timingFromFileList(
  files: RecordingFileLike[] | null | undefined,
  meetingStart?: string | null,
  meetingDurationMinutes?: number | null,
): { startedAt: Date | null; endedAt: Date | null } {
  const list = Array.isArray(files) ? files : [];
  const ms = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);
  const starts = list.map((f) => ms(f.recording_start)).filter((n) => Number.isFinite(n));
  const ends = list.map((f) => ms(f.recording_end)).filter((n) => Number.isFinite(n));

  let startMs = starts.length ? Math.min(...starts) : NaN;
  let endMs = ends.length ? Math.max(...ends) : NaN;

  // Meeting-level fallback, same as the polling path: a delivery whose files carry
  // no timings still has the meeting's own start and duration.
  if (!Number.isFinite(startMs) && meetingStart) startMs = ms(meetingStart);
  if (!Number.isFinite(endMs) && Number.isFinite(startMs) && typeof meetingDurationMinutes === 'number') {
    endMs = startMs + meetingDurationMinutes * 60_000;
  }

  return {
    startedAt: Number.isFinite(startMs) ? new Date(startMs) : null,
    endedAt: Number.isFinite(endMs) ? new Date(endMs) : null,
  };
}
