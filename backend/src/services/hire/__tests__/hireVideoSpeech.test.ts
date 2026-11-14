import { findMarkers, findPauses, paceSeries, repetition, speechMetrics } from '../hireVideoSpeech';
import type { Word } from '../hireVideoTranscribe';

/** Delivery metrics, each traceable to the moment it came from (the live overlay reads `events`). */
const seq = (words: string[], gaps: number[] = []): Word[] => {
  let t = 0;
  return words.map((w, i) => { const s = t; t += 0.3 + (gaps[i] ?? 0.1); return { word: w, start: s, end: s + 0.3 }; });
};

describe('findMarkers', () => {
  test('finds fillers and phrase fillers once each, with the time they were said', () => {
    const ev = findMarkers(seq(['Um,', 'so', 'you', 'know,', 'I', 'mean', 'it', 'works.', 'Uhh', 'yes.']));
    expect(ev.map((e) => [e.kind, e.label])).toEqual([['filler', 'um'], ['filler', 'you know'], ['filler', 'i mean'], ['filler', 'uh']]);
    expect(ev[0].t).toBe(0);
  });

  test('"like" is a filler only when it is not doing grammatical work', () => {
    expect(findMarkers(seq(['I', 'like', 'Python.']))).toEqual([]);
    expect(findMarkers(seq(['looks', 'like', 'rain']))).toEqual([]);
    expect(findMarkers(seq(['we', 'need', 'like', 'to', 'ship']))).toEqual([]);
    expect(findMarkers(seq(['it', 'was,', 'like,', 'huge'])).map((e) => e.label)).toEqual(['like']);
  });

  test('hedges are found as phrases', () => {
    const ev = findMarkers(seq(['I', 'think', 'I', 'kind', 'of', 'led', 'it,', 'maybe.']));
    expect(ev.map((e) => [e.kind, e.label])).toEqual([['hedge', 'i think'], ['hedge', 'kind of'], ['hedge', 'maybe']]);
  });
});

describe('findPauses', () => {
  test('bands silences between words: short, medium, long', () => {
    const p = findPauses(seq(['a', 'b', 'c', 'd', 'e'], [0.1, 0.6, 1.2, 2.5]));
    expect(p.map((x) => [x.label, x.dur])).toEqual([['short', 0.6], ['medium', 1.2], ['long', 2.5]]);
  });
});

describe('paceSeries and speechMetrics', () => {
  test('pace in 5 s steps over a 10 s window', () => {
    const words = Array.from({ length: 60 }, (_, i) => ({ word: 'w', start: i * 0.5, end: i * 0.5 + 0.4 }));
    expect(paceSeries(words, 30)[0]).toEqual({ t: 5, wpm: 120 });
  });

  test('empty transcript gives zeros and nulls, never NaN', () => {
    const m = speechMetrics([], 40);
    expect(m).toMatchObject({ words: 0, wordsPerMinute: null, fillerPercent: null, voicedRatio: null, startDelay: null, longestPause: null, repetitionPercent: null });
    expect(JSON.stringify(m)).not.toContain('NaN');
  });

  test('opening counts only the first 15 seconds', () => {
    const words = [{ word: 'Um', start: 1, end: 1.2 }, { word: 'hello', start: 2, end: 2.4 }, { word: 'um', start: 20, end: 20.2 }];
    expect(speechMetrics(words, 30).opening).toMatchObject({ words: 2, fillers: 1 });
  });
});

describe('repetition', () => {
  test('counts repeated non-trivial phrases, not function words', () => {
    const text = 'I built the agent pipeline and then the agent pipeline grew and the agent pipeline scaled to many teams across the company this year'.split(' ');
    const r = repetition(text.map((w, i) => ({ word: w, start: i, end: i + 0.5 })));
    expect(r.top[0]).toEqual({ word: 'the agent pipeline', count: 3 });
    expect(r.percent).toBeGreaterThan(4);
  });

  test('too little speech to judge is null', () => {
    expect(repetition([{ word: 'hi', start: 0, end: 1 }]).percent).toBeNull();
  });
});
