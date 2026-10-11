/**
 * What a recorded attempt actually CONTAINS, and therefore what anyone reviewing it is
 * entitled to say about it.
 *
 * THE FAILURE THIS PREVENTS. A student uploads an audio-only rehearsal. The coach
 * returns "your slides were cluttered and you rarely made eye contact." Both are
 * invented — there is no video — and the student cannot tell which parts of the
 * feedback were real. One confident sentence about something the reviewer could not
 * see poisons the whole review.
 *
 * So availability is derived from the recording row, never assumed, and a modality
 * that is MISSING is labelled missing rather than quietly skipped. "We could not see
 * your slides" and "your slides were fine" are opposite statements, and silence reads
 * as the second.
 *
 * NULL IS NOT FALSE, as everywhere else in this subsystem. Zoom does not always report
 * what a file contains. "We do not know whether there is audio" must not become
 * "there is no audio", which would strip a student's feedback for no reason.
 *
 * Pure. The same function decides what the prompt may ask for and what the stored
 * feedback is checked against.
 */

export type Modality = 'audio' | 'video' | 'screen' | 'transcript';

export const ALL_MODALITIES: readonly Modality[] = ['audio', 'video', 'screen', 'transcript'];

export interface RecordingFacts {
  /** From `presentation_recordings.has_audio`. Null means the provider did not say. */
  hasAudio?: boolean | null;
  /** From `presentation_recordings.has_shared_screen`. */
  hasSharedScreen?: boolean | null;
  /** A Zoom recording_type, e.g. 'shared_screen_with_speaker_view', 'audio_only'. */
  recordingType?: string | null;
  /** Whether a transcript was fetched for this attempt. */
  hasTranscript?: boolean | null;
}

export interface ModalityAvailability {
  available: Modality[];
  /** Known to be absent — worth saying out loud to the student. */
  missing: Modality[];
  /** Nobody told us. Not claimed either way. */
  unknown: Modality[];
}

/** Zoom's own words for what is in the file. Only used when it actually said. */
function videoFromType(recordingType: string | null | undefined): boolean | null {
  const t = (recordingType || '').toLowerCase();
  if (!t) return null;
  if (t.includes('audio_only')) return false;
  if (t.includes('speaker') || t.includes('gallery') || t.includes('active_speaker') || t === 'shared_screen') return true;
  return null;
}

function screenFromType(recordingType: string | null | undefined): boolean | null {
  const t = (recordingType || '').toLowerCase();
  if (!t) return null;
  if (t.includes('shared_screen')) return true;
  if (t.includes('audio_only')) return false;
  return null;
}

/** Fold three signals into one verdict per modality, preferring an explicit flag. */
function verdict(flag: boolean | null | undefined, derived: boolean | null): boolean | null {
  if (flag === true || flag === false) return flag;
  return derived;
}

export function modalitiesFor(facts: RecordingFacts): ModalityAvailability {
  const decided: Record<Modality, boolean | null> = {
    audio: verdict(facts.hasAudio, videoFromType(facts.recordingType) === null ? null : true),
    video: verdict(null, videoFromType(facts.recordingType)),
    screen: verdict(facts.hasSharedScreen, screenFromType(facts.recordingType)),
    transcript: facts.hasTranscript === true ? true : (facts.hasTranscript === false ? false : null),
  };

  const available: Modality[] = [];
  const missing: Modality[] = [];
  const unknown: Modality[] = [];
  for (const m of ALL_MODALITIES) {
    const v = decided[m];
    if (v === true) available.push(m);
    else if (v === false) missing.push(m);
    else unknown.push(m);
  }
  return { available, missing, unknown };
}

/**
 * Words that only mean something if the reviewer could SEE the attempt.
 *
 * Used to check feedback after it comes back, not only to instruct the model
 * beforehand. An instruction is a request; this is the check.
 */
const VISUAL_TERMS = /\b(?:slide|slides|deck|eye contact|gesture|gestures|posture|body language|facial|smil(?:e|ed|ing)|on-?screen|visual|appearance|background|camera|looked|watch(?:ed)?|saw)\b/i;

/** Words that only mean something if the reviewer could HEAR it. */
const AUDIO_TERMS = /\b(?:tone|pace|paced|pacing|volume|filler words?|um+\b|uh+\b|intonation|enunciat|mumbl|spoke|speech|voice|sounded|heard)\b/i;

export interface ModalityViolation {
  modality: Modality;
  /** The sentence that made a claim it could not support. */
  text: string;
}

/**
 * Sentences in a review that claim more than the recording could support.
 *
 * A sentence SAYING the modality is unavailable is not a violation — "we could not see
 * your slides" is exactly what we want it to say, and flagging that would make the
 * honest phrasing impossible.
 */
export function findModalityViolations(text: string, available: Modality[]): ModalityViolation[] {
  const has = new Set(available);
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const out: ModalityViolation[] = [];

  for (const s of sentences) {
    const disclaims = /\b(?:could not|couldn't|cannot|can't|no|not|without|unavailable|missing)\b/i.test(s);
    if (!has.has('video') && !has.has('screen') && VISUAL_TERMS.test(s) && !disclaims) {
      out.push({ modality: 'video', text: s });
    }
    if (!has.has('audio') && AUDIO_TERMS.test(s) && !disclaims) {
      out.push({ modality: 'audio', text: s });
    }
  }
  return out;
}

/** The sentence a student reads where a modality is missing. */
export function describeMissing(m: Modality): string {
  switch (m) {
    case 'video': return 'There is no video in this recording, so nothing here comments on how you looked or what was on screen.';
    case 'screen': return 'Your screen was not captured, so nothing here comments on your slides.';
    case 'audio': return 'There is no audio in this recording, so nothing here comments on how you sounded.';
    case 'transcript': return 'No transcript was produced for this attempt, so nothing here quotes your words.';
    default: return '';
  }
}
