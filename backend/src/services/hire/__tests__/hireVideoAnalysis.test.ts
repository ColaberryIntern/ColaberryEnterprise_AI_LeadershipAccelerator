import { bandScore, buildCoaching, deliveryScores, TARGETS, wordsToVtt } from '../hireVideoAnalysis';
import { speechMetrics } from '../hireVideoSpeech';
import type { Word } from '../hireVideoTranscribe';

/**
 * Captions and scored coaching from a timestamped transcript. Only metrics with a published
 * target are scored (pace, fillers, repetition, and our own length target); every score names
 * its source.
 */
const at = (text: string, step = 0.4): Word[] => text.split(' ').map((w, i) => ({ word: w, start: i * step, end: i * step + step * 0.8 }));

describe('wordsToVtt', () => {
  test('cues end at a sentence stop or after 7 words, with valid timestamps', () => {
    const vtt = wordsToVtt(at('Hi. I build retrieval systems for support teams at scale today.'))!;
    expect(vtt.startsWith('WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.320\nHi.')).toBe(true);
    expect(vtt).toContain('I build retrieval systems for support teams');
    expect(vtt.split('-->').length - 1).toBe(3);
  });

  test('nothing said means no captions, and "-->" in speech cannot break the file', () => {
    expect(wordsToVtt([])).toBeNull();
    expect(wordsToVtt([{ word: 'a-->b', start: 0, end: 1 }])).toContain('a→b');
  });
});

describe('bandScore', () => {
  test('100 inside the band, falling linearly to 0 at zeroAt past an edge', () => {
    expect(bandScore(140, TARGETS.pace)).toBe(100);
    expect(bandScore(100, TARGETS.pace)).toBe(100);
    expect(bandScore(70, TARGETS.pace)).toBe(50);
    expect(bandScore(10, TARGETS.pace)).toBe(0);
  });
});

describe('deliveryScores', () => {
  test('scores only sourced metrics, each naming where its target comes from', () => {
    const m = speechMetrics(at(Array.from({ length: 200 }, (_, i) => `word${i}`).join(' '), 0.45), 90);
    const s = deliveryScores(m);
    expect(s.map((x) => x.key)).toEqual(['length', 'pace', 'fillers', 'repetition']);
    for (const x of s) expect(x.source.length).toBeGreaterThan(10);
    expect(s.find((x) => x.key === 'pace')!.value).toBe('133 wpm');
  });

  test('a silent video scores its length and nothing it cannot measure', () => {
    expect(deliveryScores(speechMetrics([], 30)).map((x) => x.key)).toEqual(['length']);
  });
});

describe('buildCoaching', () => {
  test('notes call out fillers in the first 15 seconds, repeated fillers and a slow start', () => {
    const words = [{ word: 'Um,', start: 4, end: 4.3 }, { word: 'hi,', start: 4.4, end: 4.6 }, { word: 'um,', start: 5, end: 5.2 },
      { word: 'I', start: 5.5, end: 5.6 }, { word: 'um', start: 6, end: 6.2 }, { word: 'build.', start: 6.5, end: 6.9 }];
    const c = buildCoaching(words, 80, null);
    expect(c.version).toBe(2);
    expect(c.notes).toEqual(expect.arrayContaining([
      '3 filler words in your first 15 seconds, where first impressions form. Script your opening line.',
      'Filler words were 50% of what you said; under 3% is the goal. Most often "um" (3). A short pause works better.',
      '4 seconds before your first word. Start talking right away.',
    ]));
    expect(c.content).toBeNull();
    expect(c.voice).toBeNull();
  });

  test('the filler note never contradicts the filler score (seen on a real run: 5.6% said "Nice")', () => {
    // 4 fillers in 71 words, none repeated 3 times: over the 3% target, so no praise.
    const words = Array.from({ length: 71 }, (_, i) => ({ word: [0, 10, 30, 50].includes(i) ? (i % 20 ? 'um' : 'uh') : `w${i}`, start: i * 0.4, end: i * 0.4 + 0.3 }));
    const c = buildCoaching(words, 60, null);
    const score = c.scores.find((s) => s.key === 'fillers')!.score;
    expect(score).toBeLessThan(100);
    expect(c.notes.join(' ')).not.toContain('Nice');
    expect(c.notes.join(' ')).toContain('5.6% of what you said');
  });
});
