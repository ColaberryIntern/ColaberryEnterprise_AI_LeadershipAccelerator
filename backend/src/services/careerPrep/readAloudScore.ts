import { fillerWordIndexes, speechMetrics, PAUSE } from '../hire/hireVideoSpeech';
import { deliveryScores } from '../hire/hireVideoAnalysis';

/**
 * Career Prep v27, CP5.8 (Ali, 2026-11-21, option B: full weight): the out-loud warm-up, scored. The student reads ONE
 * known line aloud; three things are measured and shown, and one composite becomes a Pace and clarity observation
 * with the same weight as a real answer:
 *
 *   pace          the existing pace band from the intro-video scorer (hireVideoAnalysis.deliveryScores), 0 to 100.
 *   smoothness    100 minus 15 for every pause of 1.0 s or more between two words (PAUSE.medium), floored at 0.
 *   completeness  the share of the line's words that were said, in order (longest common subsequence), 0 to 100.
 *   score         round(0.4 x pace + 0.3 x smoothness + 0.3 x completeness). The 0.4 / 0.3 / 0.3 split and the 15-point
 *                 pause step are the run's logged assumption 3 (execution-contract.md), not research findings.
 *
 * NEVER SCORED: filler words. They are REMOVED before pace, words per minute and pauses are measured (the same filler
 * detection as the intro video: "um", "uh", "you know", "i mean", a non-grammatical "like"), and a pause is measured
 * from the last real word to the next real word, so an "um" inside a silence neither hides nor adds a pause. Accent or pronunciation
 * (speech recognition errs more for some speakers, so a missed word counts against completeness only as "not heard",
 * and nothing here names a sound, an accent or a way of speaking). PURE: no I/O.
 */
export type Word = Parameters<typeof speechMetrics>[0][number];

export interface ReadAloudScore {
  score: number;
  pace: number;
  smoothness: number;
  completeness: number;
  wordsPerMinute: number | null;
  pausesOverOneSecond: number;
  wordsHeard: number;
  wordsInLine: number;
}

export const READ_ALOUD_WEIGHTS = { pace: 0.4, smoothness: 0.3, completeness: 0.3, pausePenalty: 15 } as const;

/** Lowercase words with punctuation removed; "it's" stays one word. */
export function tokens(text: string): string[] {
  return text.toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '')).filter(Boolean);
}

/** Length of the longest common subsequence: words of the line said in the same order, skips and extras ignored. */
export function inOrderMatches(line: readonly string[], said: readonly string[]): number {
  let prev = new Array<number>(said.length + 1).fill(0);
  for (let i = 1; i <= line.length; i += 1) {
    const cur = new Array<number>(said.length + 1).fill(0);
    for (let j = 1; j <= said.length; j += 1) {
      cur[j] = line[i - 1] === said[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[said.length];
}

/** The words that are not fillers, in order, with their real timestamps. */
export function realWords(words: readonly Word[]): Word[] {
  const fillers = fillerWordIndexes(words);
  return words.filter((_, i) => !fillers.has(i));
}

function pausesOverOneSecond(words: readonly Word[]): number {
  let n = 0;
  for (let i = 1; i < words.length; i += 1) if (words[i].start - words[i - 1].end >= PAUSE.medium) n += 1;
  return n;
}

export function scoreReadAloud(words: readonly Word[], seconds: number, line: string): ReadAloudScore {
  const real = realWords(words);
  const m = speechMetrics(real, seconds);
  const pace = deliveryScores(m).find((s) => s.key === 'pace')?.score ?? 0;
  const longPauses = pausesOverOneSecond(real);
  const smoothness = Math.max(0, 100 - READ_ALOUD_WEIGHTS.pausePenalty * longPauses);
  const lineWords = tokens(line);
  const heard = inOrderMatches(lineWords, tokens(words.map((w) => w.word).join(' ')));
  const completeness = lineWords.length ? Math.round((100 * heard) / lineWords.length) : 0;
  const w = READ_ALOUD_WEIGHTS;
  return {
    score: Math.round(w.pace * pace + w.smoothness * smoothness + w.completeness * completeness),
    pace, smoothness, completeness,
    wordsPerMinute: m.wordsPerMinute,
    pausesOverOneSecond: longPauses,
    wordsHeard: heard,
    wordsInLine: lineWords.length,
  };
}
