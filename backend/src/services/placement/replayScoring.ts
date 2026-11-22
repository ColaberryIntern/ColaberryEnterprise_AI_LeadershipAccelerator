import type { VttCue } from '../zoom/zoomTranscripts';
import type { Word } from '../hire/hireVideoTranscribe';
import { speechMetrics } from '../hire/hireVideoSpeech';
import { deliveryScores } from '../hire/hireVideoAnalysis';
import { scoreAnswer } from '../interviewService';
import type { ObservationRow } from '../careerPrep/observationAdapters';

/**
 * Career Prep v27, CP9.2 (kit F5 "replay"): a held interview's transcript, scored for the CANDIDATE. PURE: no I/O.
 *
 *   speaker   the candidate's turns are the transcript speaker whose display name is the learner's full name, or
 *             failing that, whose first name is the learner's first name and nobody else's. No match, or two matches,
 *             = nothing is scored ("we could not tell which voice was yours"); a score is never guessed onto a voice.
 *   turns     consecutive cues by one speaker. Each candidate turn of at least MIN_ANSWER_WORDS words is an answer;
 *             its question is the turn just before it by another speaker (null when there is none). At most
 *             MAX_QUESTIONS answers, in order.
 *   delivery  pace and filler words, from the published targets the intro video uses (hireVideoAnalysis.deliveryScores:
 *             Microsoft Speaker Coach 100 to 165 wpm; Yoodli fillers under 3%). Zoom's transcript times each CUE, not
 *             each word, so the words of a cue are spread evenly across it (words per minute is then exact over the
 *             cue; pauses are only seen between cues). Zoom's transcript may leave some fillers out, so the filler
 *             count is what the transcript shows (said plainly on the sheet).
 *   content   interviewService.scoreAnswer: how many of the question's own key words (topicsOf) the answer covers,
 *             0 to 100. A question with no key words, or no question, has no content score (never a made-up one).
 *   score     the mean of every part score above, rounded. Logged assumption (execution contract, T24).
 * Observations (source 'real_interview', ref replay:<interviewId>:<n>): pace -> pace_clarity, fillers -> few_fillers,
 * the same two mappings as the intro video. Content is shown, not written: its "topics" come from the question's words,
 * not from a rubric, so it is a hint for the candidate, not a skill reading (logged assumption).
 * Audio and words only: nothing here reads, stores or names anything about the video.
 */
export const MIN_ANSWER_WORDS = 12;
export const MAX_QUESTIONS = 15;
export const MAX_ANSWER_CHARS = 1200;
export const MAX_QUESTION_CHARS = 400;
export const MAX_TOPICS = 6;

export interface Turn { speaker: string | null; start: number; end: number; cues: VttCue[]; text: string }
export interface Part { score: number; value: string; target: string }
export interface ScoredQuestion {
  n: number; question: string | null; answer: string; at: number; seconds: number;
  pace: Part | null; fillers: Part | null; content: { score: number; covered: number; of: number } | null;
}
export type Scored = { status: 'scored'; score: number; questions: ScoredQuestion[] } | { status: 'no_score'; reason: string };

export const NO_SPEAKER = 'We could not tell which voice in the transcript was yours, so nothing was scored.';
export const NO_ANSWERS = 'The transcript has no answer of yours long enough to score.';

/** "HH:MM:SS.mmm" as seconds; anything unreadable is 0. */
export function secondsOf(stamp: string): number {
  const m = /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/.exec(stamp.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
}

export function turnsOf(cues: readonly VttCue[]): Turn[] {
  const out: Turn[] = [];
  for (const c of cues) {
    const last = out[out.length - 1];
    if (last && last.speaker === c.speaker) {
      last.cues.push(c); last.end = secondsOf(c.end); last.text = `${last.text} ${c.text}`.trim();
    } else {
      out.push({ speaker: c.speaker, start: secondsOf(c.start), end: secondsOf(c.end), cues: [c], text: c.text.trim() });
    }
  }
  return out;
}

const nameKey = (s: string): string => s.toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim();

/** The candidate's speaker name, or null when no single voice matches the learner. */
export function candidateSpeaker(cues: readonly VttCue[], fullName: string | null): string | null {
  const full = nameKey(fullName ?? '');
  if (!full) return null;
  const speakers = Array.from(new Set(cues.map((c) => c.speaker).filter((s): s is string => !!s)));
  const exact = speakers.filter((s) => nameKey(s) === full);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const first = full.split(' ')[0];
  const byFirst = speakers.filter((s) => nameKey(s).split(' ')[0] === first);
  return byFirst.length === 1 ? byFirst[0] : null;
}

/** Each cue's words spread evenly over the cue (Zoom times cues, not words). */
export function wordsOf(turn: Turn): Word[] {
  return turn.cues.flatMap((c) => {
    const ws = c.text.split(/\s+/).filter(Boolean);
    const s = secondsOf(c.start); const e = Math.max(s, secondsOf(c.end));
    const step = ws.length ? (e - s) / ws.length : 0;
    return ws.map((word, i) => ({ word, start: s + i * step, end: s + (i + 1) * step }));
  });
}

const STOP = new Set(['about', 'after', 'again', 'also', 'because', 'been', 'before', 'being', 'could', 'does', 'doing', 'from', 'have',
  'into', 'just', 'more', 'most', 'much', 'only', 'other', 'over', 'said', 'should', 'some', 'such', 'tell', 'than', 'that', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'very', 'walk', 'want', 'were', 'what', 'when', 'where', 'which', 'while',
  'will', 'with', 'would', 'your', 'yours', 'through', 'thing', 'things', 'something', 'anything', 'like', 'know', 'think', 'give']);

/** The question's key words: distinct, four letters or more, not a common word, at most MAX_TOPICS. */
export function topicsOf(question: string | null): string[] {
  if (!question) return [];
  const words = question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  return Array.from(new Set(words)).slice(0, MAX_TOPICS);
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);

export function scoreQuestion(n: number, answer: Turn, question: Turn | null): ScoredQuestion {
  const seconds = Math.max(0, answer.end - answer.start);
  const scores = deliveryScores(speechMetrics(wordsOf(answer), seconds));
  const part = (key: 'pace' | 'fillers'): Part | null => {
    const s = scores.find((x) => x.key === key);
    return s ? { score: s.score, value: s.value, target: s.target } : null;
  };
  const topics = topicsOf(question?.text ?? null);
  const lower = answer.text.toLowerCase();
  return {
    n, question: question ? clip(question.text, MAX_QUESTION_CHARS) : null, answer: clip(answer.text, MAX_ANSWER_CHARS),
    at: Math.round(answer.start), seconds: Math.round(seconds), pace: part('pace'), fillers: part('fillers'),
    content: topics.length ? { score: scoreAnswer(answer.text, topics, 100), covered: topics.filter((t) => lower.includes(t)).length, of: topics.length } : null,
  };
}

export function scoreTranscript(cues: readonly VttCue[], fullName: string | null): Scored {
  const me = candidateSpeaker(cues, fullName);
  if (!me) return { status: 'no_score', reason: NO_SPEAKER };
  const turns = turnsOf(cues);
  const questions: ScoredQuestion[] = [];
  turns.forEach((t, i) => {
    if (questions.length >= MAX_QUESTIONS || t.speaker !== me || t.text.split(/\s+/).length < MIN_ANSWER_WORDS) return;
    const before = turns[i - 1];
    questions.push(scoreQuestion(questions.length + 1, t, before && before.speaker !== me ? before : null));
  });
  if (!questions.length) return { status: 'no_score', reason: NO_ANSWERS };
  const parts = questions.flatMap((q) => [q.pace?.score, q.fillers?.score, q.content?.score]).filter((v): v is number => typeof v === 'number');
  if (!parts.length) return { status: 'no_score', reason: NO_ANSWERS };
  return { status: 'scored', score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), questions };
}

export const replayRef = (interviewId: string, n: number): string => `replay:${interviewId}:${n}`;

/** One pace_clarity and one few_fillers row per scored answer (when measured), at the interview's start time. */
export function replayObservationRows(enrollmentId: string, interviewId: string, questions: readonly ScoredQuestion[], observedAt: Date): ObservationRow[] {
  return questions.flatMap((q) => [
    ...(q.pace ? [{ enrollmentId, skill: 'pace_clarity', value: q.pace.score, source: 'real_interview' as const, sourceRef: replayRef(interviewId, q.n), observedAt }] : []),
    ...(q.fillers ? [{ enrollmentId, skill: 'few_fillers', value: q.fillers.score, source: 'real_interview' as const, sourceRef: replayRef(interviewId, q.n), observedAt }] : []),
  ]);
}
