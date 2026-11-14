/**
 * hireVideoSpeech - delivery metrics from a timestamped transcript (pure: no I/O, no clock).
 *
 * Replicates what colaberry/video-analysis measured from speech (word rate, voiced ratio,
 * short/medium/long pauses, filler words) and adds what later coaching tools measure: hedging
 * language, pace over time, and how fast the speaker gets going. Every metric carries the moments
 * it came from (`events`), so the studio can show them live while the candidate plays the video
 * back, and mark them on the scrubber.
 *
 * Shown to the CANDIDATE ONLY, never on Hire.
 */
import type { Word } from './hireVideoTranscribe';

export type EventKind = 'filler' | 'hedge' | 'pause';
export interface SpeechEvent { readonly t: number; readonly kind: EventKind; readonly label: string; readonly dur?: number }

export interface SpeechMetrics {
  readonly seconds: number;
  readonly words: number;
  /** Words per minute over the time actually spent speaking (first word to last). */
  readonly wordsPerMinute: number | null;
  /** Pace in 5-second steps, each the average of the 10 seconds around it: the live gauge. */
  readonly pace: readonly { readonly t: number; readonly wpm: number }[];
  readonly fillerTotal: number;
  readonly fillerPerMinute: number | null;
  readonly fillerTop: readonly { readonly word: string; readonly count: number }[];
  readonly hedgeTotal: number;
  readonly hedgeTop: readonly { readonly word: string; readonly count: number }[];
  readonly pauses: { readonly short: number; readonly medium: number; readonly long: number };
  /** Share of the speaking span with a word being said. */
  readonly voicedRatio: number | null;
  /** Seconds of silence before the first word. */
  readonly startDelay: number | null;
  /** Fillers per 100 words (Yoodli's "under 3%"). */
  readonly fillerPercent: number | null;
  /** Share of words inside a repeated non-trivial 2- or 3-word phrase (Yoodli's "under 4%"). */
  readonly repetitionPercent: number | null;
  readonly repeatedTop: readonly { readonly word: string; readonly count: number }[];
  readonly longestPause: number | null;
  /** The first 15 seconds on their own: research weights the first impression most. */
  readonly opening: { readonly words: number; readonly fillers: number; readonly wordsPerMinute: number | null };
  readonly events: readonly SpeechEvent[];
}

export const OPENING_SECONDS = 15;

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it', 'i', 'my', 'that', 'this', 'was', 'with', 'as', 'at', 'be', 'we', 'so', 'um', 'uh', 'you', 'know', 'like']);

/** Repeated 2-3 word phrases that are not just function words, and the share of words they cover. */
export function repetition(words: readonly Word[]): { percent: number | null; top: { word: string; count: number }[] } {
  const toks = words.map((w) => norm(w.word)).filter(Boolean);
  if (toks.length < 20) return { percent: null, top: [] };
  const counts = new Map<string, number[]>();
  for (const n of [3, 2]) {
    for (let i = 0; i + n <= toks.length; i += 1) {
      const g = toks.slice(i, i + n);
      if (g.every((t) => STOP.has(t))) continue;
      const key = g.join(' ');
      counts.set(key, [...(counts.get(key) ?? []), i]);
    }
  }
  const covered = new Set<number>();
  const top: { word: string; count: number }[] = [];
  for (const [key, at] of [...counts].sort((a, b) => b[1].length - a[1].length || b[0].length - a[0].length)) {
    if (at.length < 2) continue;
    const n = key.split(' ').length;
    // Count every occurrence after the first; skip a phrase already inside a longer repeat.
    if (at.every((i) => covered.has(i))) continue;
    at.slice(1).forEach((i) => { for (let k = 0; k < n; k += 1) covered.add(i + k); });
    top.push({ word: key, count: at.length });
  }
  return { percent: Math.round((covered.size / toks.length) * 1000) / 10, top: top.slice(0, 3) };
}

/** Pause bands, in seconds of silence between two words. */
export const PAUSE = { short: 0.5, medium: 1.0, long: 2.0 } as const;

const norm = (w: string): string => w.toLowerCase().replace(/[^a-z']/g, '');

const SINGLE_FILLERS = new Set(['um', 'umm', 'uhm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'mm']);
const PHRASE_FILLERS: readonly string[][] = [['you', 'know'], ['i', 'mean']];
/** "like" is a filler only when it is not doing grammatical work. */
const LIKE_KEEPS_BEFORE = new Set(['i', 'you', 'we', 'they', 'would', "i'd", 'feel', 'feels', 'look', 'looks', 'seem', 'seems', 'something', 'things', 'just', "don't", 'really']);
const HEDGES: readonly string[][] = [
  ['i', 'think'], ['i', 'guess'], ['i', 'feel', 'like'], ['kind', 'of'], ['sort', 'of'], ['maybe'], ['probably'],
  ['hopefully'], ['i', 'hope'], ['i', 'believe'], ['somewhat'], ['i', "don't", 'know'], ['not', 'sure'],
];

const startsAt = (tokens: string[], i: number, phrase: readonly string[]): boolean =>
  phrase.every((p, k) => tokens[i + k] === p);

function count(list: string[]): { word: string; count: number }[] {
  const m = new Map<string, number>();
  for (const w of list) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m].map(([word, n]) => ({ word, count: n })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** Fillers and hedges, each found once (a phrase consumes its words), with the time it was said. */
export function findMarkers(words: readonly Word[]): SpeechEvent[] {
  const tokens = words.map((w) => norm(w.word));
  const out: SpeechEvent[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (!tok) continue;
    if (SINGLE_FILLERS.has(tok)) { out.push({ t: words[i].start, kind: 'filler', label: tok.replace(/^(umm|uhm)$/, 'um').replace(/^uhh$/, 'uh') }); continue; }
    const pf = PHRASE_FILLERS.find((p) => startsAt(tokens, i, p));
    if (pf) { out.push({ t: words[i].start, kind: 'filler', label: pf.join(' ') }); i += pf.length - 1; continue; }
    if (tok === 'like' && i > 0 && !LIKE_KEEPS_BEFORE.has(tokens[i - 1]) && tokens[i + 1] !== 'to' && tokens[i + 1] !== 'this' && tokens[i + 1] !== 'that') {
      // A comma or pause around it is the tell; without one it is too often the real verb.
      const after = /,$/.test(words[i].word) || /,$/.test(words[i - 1].word) || (words[i + 1] && words[i + 1].start - words[i].end >= 0.3);
      if (after) { out.push({ t: words[i].start, kind: 'filler', label: 'like' }); continue; }
    }
    const h = HEDGES.find((p) => startsAt(tokens, i, p));
    if (h) { out.push({ t: words[i].start, kind: 'hedge', label: h.join(' ') }); i += h.length - 1; }
  }
  return out;
}

/** Silences between consecutive words, banded. */
export function findPauses(words: readonly Word[]): SpeechEvent[] {
  const out: SpeechEvent[] = [];
  for (let i = 1; i < words.length; i += 1) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= PAUSE.short) {
      const band = gap >= PAUSE.long ? 'long' : gap >= PAUSE.medium ? 'medium' : 'short';
      out.push({ t: words[i - 1].end, kind: 'pause', label: band, dur: Math.round(gap * 10) / 10 });
    }
  }
  return out;
}

/** Words per minute in 5 s steps, each over the 10 s window centred on it. */
export function paceSeries(words: readonly Word[], seconds: number): { t: number; wpm: number }[] {
  const out: { t: number; wpm: number }[] = [];
  for (let t = 5; t <= Math.max(5, seconds - 2.5); t += 5) {
    const from = Math.max(0, t - 5); const to = Math.min(seconds, t + 5);
    const n = words.filter((w) => w.start >= from && w.start < to).length;
    if (to > from) out.push({ t, wpm: Math.round((n / (to - from)) * 60) });
  }
  return out;
}

export function speechMetrics(words: readonly Word[], seconds: number): SpeechMetrics {
  const markers = findMarkers(words);
  const pauses = findPauses(words);
  const fillers = markers.filter((m) => m.kind === 'filler');
  const hedges = markers.filter((m) => m.kind === 'hedge');
  const span = words.length > 1 ? words[words.length - 1].end - words[0].start : 0;
  const spoken = words.reduce((s, w) => s + (w.end - w.start), 0);
  const minutes = span / 60;
  const band = (b: string) => pauses.filter((p) => p.label === b).length;
  const rep = repetition(words);
  const early = words.filter((w) => w.start < OPENING_SECONDS);
  const earlySpan = early.length > 1 ? early[early.length - 1].end - early[0].start : 0;
  return {
    fillerPercent: words.length ? Math.round((fillers.length / words.length) * 1000) / 10 : null,
    repetitionPercent: rep.percent,
    repeatedTop: rep.top,
    longestPause: pauses.length ? Math.max(...pauses.map((p) => p.dur ?? 0)) : null,
    opening: {
      words: early.length,
      fillers: fillers.filter((f) => f.t < OPENING_SECONDS).length,
      wordsPerMinute: earlySpan > 0 ? Math.round((early.length / earlySpan) * 60) : null,
    },
    seconds,
    words: words.length,
    wordsPerMinute: minutes > 0 ? Math.round(words.length / minutes) : null,
    pace: paceSeries(words, seconds),
    fillerTotal: fillers.length,
    fillerPerMinute: minutes > 0 ? Math.round((fillers.length / minutes) * 10) / 10 : null,
    fillerTop: count(fillers.map((f) => f.label)).slice(0, 3),
    hedgeTotal: hedges.length,
    hedgeTop: count(hedges.map((h) => h.label)).slice(0, 3),
    pauses: { short: band('short'), medium: band('medium'), long: band('long') },
    voicedRatio: span > 0 ? Math.round((spoken / span) * 100) / 100 : null,
    startDelay: words.length ? Math.round(words[0].start * 10) / 10 : null,
    events: [...markers, ...pauses].sort((a, b) => a.t - b.t),
  };
}
