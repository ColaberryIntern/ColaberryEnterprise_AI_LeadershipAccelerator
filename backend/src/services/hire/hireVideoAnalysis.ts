/**
 * hireVideoAnalysis - a timestamped transcript becomes the two things Hire uses (kit §4.3):
 *
 *   1. CAPTIONS: a WebVTT track, cues of at most 7 words or 3.5 seconds.
 *   2. COACHING: delivery scores (0-100, like colaberry/video-analysis gave), the moments behind
 *      them for the live playback overlay, the content review, and plain sentences. Shown to the
 *      CANDIDATE ONLY, never on Hire.
 *
 * Pure: no I/O, no clock. Length comes from OUR probe of the rendition.
 */
import { TARGET_SECONDS } from './hireVideoTranscode';
import type { Word } from './hireVideoTranscribe';
import { speechMetrics, type SpeechMetrics } from './hireVideoSpeech';
import type { ContentReview } from './hireVideoContent';
import type { VoiceTrack } from './hireVideoVoice';

export interface DeliveryScore {
  readonly key: 'length' | 'pace' | 'fillers' | 'repetition';
  readonly label: string;
  readonly score: number;
  readonly value: string;
  readonly target: string;
  /** Where the target comes from. Only metrics with a published target are scored. */
  readonly source: string;
}

export interface VideoCoaching extends SpeechMetrics {
  readonly version: 2;
  readonly scores: readonly DeliveryScore[];
  readonly voice: VoiceTrack | null;
  readonly content: ContentReview | null;
  readonly notes: readonly string[];
}

/**
 * Target bands. ONLY metrics with a published target are scored (research, 2026-11-14); hedges,
 * long pauses and voice are shown as information because no source gives a cutoff. A value
 * inside the band scores 100; outside it falls off linearly to 0 at `zeroAt` past the edge.
 */
export const TARGETS = {
  length: { lo: 60, hi: TARGET_SECONDS + 30, zeroAt: 60, source: 'Hire intro kit: about 90 seconds' },
  pace: { lo: 100, hi: 165, zeroAt: 60, source: 'Microsoft Speaker Coach: 100 to 165 words a minute' },
  fillerPercent: { lo: 0, hi: 3, zeroAt: 9, source: 'Yoodli: fillers under 3% of words' },
  repetitionPercent: { lo: 0, hi: 4, zeroAt: 12, source: 'Yoodli: repetition under 4% of words' },
} as const;

export function bandScore(v: number, t: { lo: number; hi: number; zeroAt: number }): number {
  const off = v < t.lo ? t.lo - v : v > t.hi ? v - t.hi : 0;
  return Math.max(0, Math.round(100 * (1 - off / t.zeroAt)));
}

const stamp = (s: number): string => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3_600_000); const m = Math.floor(ms / 60_000) % 60; const sec = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms % 1000, 3)}`;
};

/** Cues of at most 7 words or 3.5 seconds, ending early at a sentence stop. `null` when nothing was said. */
export function wordsToVtt(words: readonly Word[]): string | null {
  const cues: { start: number; end: number; text: string }[] = [];
  let cur: { start: number; end: number; words: string[] } | null = null;
  const flush = () => { if (cur && cur.words.length) cues.push({ start: cur.start, end: cur.end, text: cur.words.join(' ') }); cur = null; };
  for (const w of words) {
    const text = w.word.replace(/[\r\n]+/g, ' ').replace(/-->/g, '→').trim();
    if (!text) continue;
    if (cur && (cur.words.length >= 7 || w.end - cur.start > 3.5)) flush();
    if (!cur) cur = { start: w.start, end: w.end, words: [] };
    cur.words.push(text);
    cur.end = w.end;
    if (/[.?!]$/.test(text)) flush();
  }
  flush();
  if (!cues.length) return null;
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join('\n\n')}\n`;
}

export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

export function deliveryScores(m: SpeechMetrics): DeliveryScore[] {
  const T = TARGETS;
  const out: DeliveryScore[] = [
    { key: 'length', label: 'Length', score: bandScore(m.seconds, T.length), value: clock(m.seconds), target: `${clock(T.length.lo)} to ${clock(T.length.hi)}`, source: T.length.source },
  ];
  if (m.wordsPerMinute !== null) out.push({ key: 'pace', label: 'Pace', score: bandScore(m.wordsPerMinute, T.pace), value: `${m.wordsPerMinute} wpm`, target: `${T.pace.lo} to ${T.pace.hi} wpm`, source: T.pace.source });
  if (m.fillerPercent !== null) out.push({ key: 'fillers', label: 'Filler words', score: bandScore(m.fillerPercent, T.fillerPercent), value: `${m.fillerTotal} (${m.fillerPercent}%)`, target: `under ${T.fillerPercent.hi}% of words`, source: T.fillerPercent.source });
  if (m.repetitionPercent !== null) out.push({ key: 'repetition', label: 'Repetition', score: bandScore(m.repetitionPercent, T.repetitionPercent), value: `${m.repetitionPercent}%`, target: `under ${T.repetitionPercent.hi}% of words`, source: T.repetitionPercent.source });
  return out;
}

export function coachingNotes(m: SpeechMetrics): string[] {
  const notes: string[] = [];
  if (m.seconds > TARGETS.length.hi) notes.push(`${clock(m.seconds)}, longer than most viewers stay. Try trimming it toward ${clock(TARGET_SECONDS)}.`);
  else if (m.seconds < TARGETS.length.lo) notes.push(`${clock(m.seconds)}. You have room to say more; aim for about ${clock(TARGET_SECONDS)}.`);
  else notes.push(`${clock(m.seconds)}, a good length.`);
  if (m.opening.words > 0 && m.opening.fillers >= 2) notes.push(`${m.opening.fillers} filler words in your first 15 seconds, where first impressions form. Script your opening line.`);
  if (m.wordsPerMinute !== null) {
    if (m.wordsPerMinute < TARGETS.pace.lo) notes.push(`About ${m.wordsPerMinute} words a minute, a little slow. Most people land between ${TARGETS.pace.lo} and ${TARGETS.pace.hi}.`);
    else if (m.wordsPerMinute > TARGETS.pace.hi) notes.push(`About ${m.wordsPerMinute} words a minute, a little fast. Slowing down helps it land.`);
    else notes.push(`About ${m.wordsPerMinute} words a minute, a comfortable pace.`);
  }
  // Judged on the same percentage the score uses, so the note can never contradict the score.
  const top = m.fillerTop[0];
  if (m.fillerPercent !== null && m.fillerPercent > TARGETS.fillerPercent.hi && top) {
    notes.push(`Filler words were ${m.fillerPercent}% of what you said; under ${TARGETS.fillerPercent.hi}% is the goal. Most often "${top.word}" (${top.count}). A short pause works better.`);
  } else if (top && top.count >= 3) notes.push(`You said "${top.word}" ${top.count} times. A short pause works better than a filler.`);
  else if (m.words > 0) notes.push('Very few filler words. Nice.');
  const hedge = m.hedgeTop[0];
  if (hedge && hedge.count >= 2) notes.push(`"${hedge.word}" ${hedge.count} times. Say what you did plainly; it sounds more sure.`);
  if (m.pauses.long >= 3) notes.push(`${m.pauses.long} long pauses. A short note of your three points can help.`);
  if (m.startDelay !== null && m.startDelay > 3) notes.push(`${m.startDelay} seconds before your first word. Start talking right away.`);
  const rep = m.repeatedTop[0];
  if (m.repetitionPercent !== null && m.repetitionPercent > TARGETS.repetitionPercent.hi && rep) notes.push(`You repeated "${rep.word}" ${rep.count} times. Vary the wording.`);
  return notes;
}

/** The whole coaching record from one transcript (and the voice track, when it could be read). */
export function buildCoaching(words: readonly Word[], seconds: number, content: ContentReview | null, voice: VoiceTrack | null = null): VideoCoaching {
  const m = speechMetrics(words, seconds);
  return { ...m, version: 2, scores: deliveryScores(m), voice, content, notes: coachingNotes(m) };
}
