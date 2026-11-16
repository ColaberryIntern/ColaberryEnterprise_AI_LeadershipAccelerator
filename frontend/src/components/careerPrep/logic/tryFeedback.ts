import type { AttemptView } from '../careerPrepApi';

/**
 * Career Prep v27: the score card under a Try answer (shot L3-5), from the attempt the server scored. PURE.
 *
 *   delivery   ONE number: the mean of the per-metric delivery scores the attempt returned (pace, filler
 *              words, repetition; each 0-100, 100 = inside its published target). Absent when there are none.
 *              Content is NOT scored in Release 1, so no content number exists and none is shown.
 *   well       metrics at their target, with the value.
 *   fix        the server's coaching notes that ask for a change (they carry the concrete number, e.g. "17.7
 *              seconds before your first word"); a metric below target that no note covers is added with its
 *              value and target.
 */
export type AttemptResultView = NonNullable<AttemptView['result']>;
type Score = AttemptResultView['scores'][number];

const ON_TARGET = 100;
/** Notes that praise rather than ask for a change (the scorer's own wording, hireVideoAnalysis.coachingNotes). */
const PRAISE = /a comfortable pace|Very few filler words|a good length/i;
/** Which metric a fix note is about, so a metric is not listed twice. */
const NOTE_KEY: Array<[RegExp, string]> = [[/words a minute/i, 'pace'], [/filler/i, 'fillers'], [/You repeated/i, 'repetition']];

export function deliveryScore(r: AttemptResultView): number | null {
  if (!r.scores.length) return null;
  return Math.round(r.scores.reduce((a, s) => a + s.score, 0) / r.scores.length);
}

export const onTarget = (s: Score): boolean => s.score >= ON_TARGET;

export function whereWell(r: AttemptResultView): string[] {
  return r.scores.filter(onTarget).map((s) => `${s.label}: ${s.value}, on target (${s.target})`);
}

export function whatToFix(r: AttemptResultView): string[] {
  const notes = r.notes.filter((n) => !PRAISE.test(n));
  const covered = new Set(notes.flatMap((n) => NOTE_KEY.filter(([re]) => re.test(n)).map(([, k]) => k)));
  const extra = r.scores.filter((s) => !onTarget(s) && !covered.has(s.key)).map((s) => `${s.label}: ${s.value}; the target is ${s.target}.`);
  return [...notes, ...extra];
}

/** The one line beside the number. */
export function headline(r: AttemptResultView): string {
  const n = r.scores.length;
  const on = r.scores.filter(onTarget).length;
  if (!n) return 'Scored. Here is what I heard.';
  if (on === n) return 'Every delivery number is on target.';
  if (on === 0) return 'None of the delivery numbers is on target yet. Start with the first fix.';
  return `${on} of ${n} delivery numbers on target. One fix at a time.`;
}

/** What the student reads when an answer could not be scored. */
export function failedText(errorClass: string | null): string {
  if (errorClass === 'UnclearAudio') return 'I could not hear a clear answer. Check your microphone and record again.';
  return 'Scoring did not work this time. Record your answer again.';
}

/** "0:07" for the recording clock. */
export const elapsedClock = (secs: number): string => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
