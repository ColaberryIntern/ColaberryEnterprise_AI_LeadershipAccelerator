/**
 * hireVideoAnalysis - reads a colaberry/video-analysis result (`<record_id>/res.json` in its
 * output bucket) into two things Hire can use (kit §4.3):
 *
 *   1. CAPTIONS: a WebVTT track built from the AWS Transcribe items inside `transcript_json`.
 *   2. COACHING: length, pace, filler words and long pauses, as plain sentences. Shown to the
 *      CANDIDATE ONLY, never on Hire.
 *
 * Pure: no I/O, no clock. The worker's output is loosely typed (its text metrics pass through
 * Python `str()`, so `fwrd_counts` arrives as a Python dict repr and `transcript_json` as JSON
 * encoded once or twice), so every read here is defensive and a missing field drops that line
 * rather than failing the whole result.
 *
 * Length comes from OUR probe of the rendition, not the worker's `length`, which is a sample
 * count divided by a config constant rather than seconds.
 */
import { TARGET_SECONDS } from './hireVideoTranscode';

export interface VideoCoaching {
  readonly seconds: number;
  readonly words: number | null;
  readonly wordsPerMinute: number | null;
  readonly fillerTotal: number | null;
  readonly fillerTop: readonly { readonly word: string; readonly count: number }[];
  readonly fillerRate: number | null;
  readonly longPauses: number | null;
  readonly notes: readonly string[];
}

interface TranscribeItem {
  readonly start_time?: string;
  readonly end_time?: string;
  readonly type?: string;
  readonly alternatives?: readonly { readonly content?: string }[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** JSON that may have been encoded once, twice, or not at all. */
function decode(v: unknown): unknown {
  let out = v;
  for (let i = 0; i < 3 && typeof out === 'string'; i += 1) {
    try { out = JSON.parse(out); } catch { return null; }
  }
  return out;
}

/** `{'um': 3, 'you know': 2}` (a Python repr) or a real object, into counted words. */
export function fillerCounts(v: unknown): { word: string; count: number }[] {
  const pairs: { word: string; count: number }[] = [];
  if (v && typeof v === 'object') {
    for (const [word, c] of Object.entries(v as Record<string, unknown>)) { const n = num(c); if (n) pairs.push({ word, count: n }); }
  } else if (typeof v === 'string') {
    for (const m of v.matchAll(/['"]([^'"]{1,40})['"]\s*:\s*(\d+)/g)) pairs.push({ word: m[1], count: Number(m[2]) });
  }
  return pairs.filter((p) => p.count > 0).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

export function transcribeItems(transcriptJson: unknown): TranscribeItem[] {
  const doc = decode(transcriptJson) as { results?: { items?: unknown } } | null;
  const items = doc && typeof doc === 'object' ? doc.results?.items : null;
  return Array.isArray(items) ? (items as TranscribeItem[]) : [];
}

const stamp = (s: number): string => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3_600_000); const m = Math.floor(ms / 60_000) % 60; const sec = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms % 1000, 3)}`;
};

/** Cues of at most 7 words or 3.5 seconds, ending early at a sentence stop. `null` when there is nothing to caption. */
export function transcriptToVtt(transcriptJson: unknown): string | null {
  const cues: { start: number; end: number; text: string }[] = [];
  let cur: { start: number; end: number; words: string[] } | null = null;
  const flush = () => { if (cur && cur.words.length) cues.push({ start: cur.start, end: cur.end, text: cur.words.join(' ') }); cur = null; };
  for (const it of transcribeItems(transcriptJson)) {
    const text = String(it.alternatives?.[0]?.content ?? '').replace(/[\r\n]+/g, ' ').replace(/-->/g, '→').trim();
    if (!text) continue;
    if (it.type === 'punctuation') {
      if (cur && cur.words.length) cur.words[cur.words.length - 1] += text;
      if (/[.?!]/.test(text)) flush();
      continue;
    }
    const start = num(it.start_time); const end = num(it.end_time);
    if (start === null || end === null) continue;
    if (cur && (cur.words.length >= 7 || end - cur.start > 3.5)) flush();
    if (!cur) cur = { start, end, words: [] };
    cur.words.push(text);
    cur.end = end;
  }
  flush();
  if (!cues.length) return null;
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join('\n\n')}\n`;
}

export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

export function coachingNotes(c: Omit<VideoCoaching, 'notes'>): string[] {
  const notes: string[] = [];
  if (c.seconds > TARGET_SECONDS) notes.push(`${clock(c.seconds)}, over the ${TARGET_SECONDS}s target. Try trimming it to 90 seconds.`);
  else if (c.seconds < 45) notes.push(`${clock(c.seconds)}. You have room to say more; aim for about ${TARGET_SECONDS} seconds.`);
  else notes.push(`${clock(c.seconds)}, right around the ${TARGET_SECONDS}s target.`);
  const top = c.fillerTop[0];
  if (top && top.count >= 3) notes.push(`You said "${top.word}" ${top.count} times.`);
  else if (c.fillerTotal !== null) notes.push('Very few filler words. Nice.');
  if (c.wordsPerMinute !== null && c.wordsPerMinute > 0) {
    const wpm = Math.round(c.wordsPerMinute);
    if (wpm < 110) notes.push(`About ${wpm} words a minute, a little slow. Most people land between 120 and 160.`);
    else if (wpm > 170) notes.push(`About ${wpm} words a minute, a little fast. Slowing down helps it land.`);
    else notes.push(`About ${wpm} words a minute, a comfortable pace.`);
  }
  if (c.longPauses !== null && c.longPauses >= 3) notes.push(`${c.longPauses} long pauses. A short note of your three points can help.`);
  return notes;
}

/** A worker result plus our measured length into coaching. `null` when the worker reported an error. */
export function readCoaching(res: unknown, seconds: number): VideoCoaching | null {
  const doc = decode(res) as { error?: unknown; metrics?: Record<string, unknown> } | null;
  if (!doc || typeof doc !== 'object' || doc.error || !doc.metrics) return null;
  const m = doc.metrics;
  const fillers = fillerCounts(m.fwrd_counts);
  const words = num(m.transcript_length);
  const base = {
    seconds,
    words,
    wordsPerMinute: words !== null && seconds > 0 ? (words / seconds) * 60 : null,
    fillerTotal: m.fwrd_counts === undefined ? null : fillers.reduce((n, f) => n + f.count, 0),
    fillerTop: fillers.slice(0, 3),
    fillerRate: num(m.fwrd_rate),
    longPauses: num(m.long_pause_count),
  };
  return { ...base, notes: coachingNotes(base) };
}
