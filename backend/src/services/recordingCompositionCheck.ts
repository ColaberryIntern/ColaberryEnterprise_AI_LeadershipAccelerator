/**
 * Does the class recording we are about to serve actually show the screen?
 *
 * WHY. On 2026-09-10 a 2.5-hour Architecture Day was recorded by Zoom as the
 * active-speaker composition only, at 640x360. Nobody knew until a student
 * emailed four days later that "your screen sharing is not showing", and
 * proving it took pulling 405 MB down and looking at frames. The composition
 * is known the moment Zoom lists the files; this asks the question then.
 *
 * WHAT IS BEING JUDGED. `pickBestMp4` ranks `shared_screen_with_speaker_view`
 * and `shared_screen*` above everything else, so the composition it chose IS
 * the best Zoom produced. If the chosen file is not a screen composition, the
 * meeting has none, and a technical class was recorded as a talking head.
 *
 * PURE, so the rule is testable without Zoom or a database. The caller decides
 * what to do with a finding; the intended action is `emitAlert`, which reaches
 * the wildcard email subscription the same night.
 */

export interface CompositionFinding {
  /** Stable key for dedup and for reading the alerts list. */
  key: 'no_screen_share';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}

export function isScreenComposition(recordingType: string | null | undefined): boolean {
  return /^shared_screen/.test(String(recordingType || ''));
}

/**
 * Null when the recording is fine. A finding when a CLASS session was ingested
 * without any screen composition. Non-class rooms (the always-open room, a
 * 15-minute test) are not judged: sharing nothing there is normal.
 */
export function judgeClassRecording(input: {
  sessionId: string;
  sessionNumber: number | null;
  title: string | null;
  recordingType: string | null | undefined;
  durationMinutes: number | null;
  part: number;
  parts: number;
}): CompositionFinding | null {
  if (isScreenComposition(input.recordingType)) return null;
  const label = `Session ${input.sessionNumber ?? '?'}${input.title ? ` · ${input.title}` : ''}`;
  const part = input.parts > 1 ? ` (part ${input.part} of ${input.parts})` : '';
  return {
    key: 'no_screen_share',
    title: `Class recording has no screen share: ${label}`,
    description:
      `The recording ingested for ${label}${part} is Zoom's "${input.recordingType || 'unknown'}" composition`
      + (input.durationMinutes != null ? ` (${input.durationMinutes} min)` : '')
      + `. Zoom produced no shared-screen file for this meeting, so students will see the camera only. `
      + 'Check "Record active speaker with shared screen" on the host account before the next class, '
      + 'and consider whether this session needs a re-recorded walkthrough.',
    metadata: {
      session_id: input.sessionId,
      session_number: input.sessionNumber,
      recording_type: input.recordingType ?? null,
      duration_minutes: input.durationMinutes,
      part: input.part,
      parts: input.parts,
    },
  };
}
