/**
 * Reading a colaberry/video-analysis result. The fixture is shaped like the worker's real output:
 * text metrics pass through Python str(), so fwrd_counts is a dict repr and transcript_json is a
 * pandas `to_json()` string that was json.dumps'd again (sound_features.TranscriptAnalytics).
 */
import { clock, coachingNotes, fillerCounts, readCoaching, transcribeItems, transcriptToVtt } from '../hireVideoAnalysis';

const w = (content: string, start: number, end: number) =>
  ({ start_time: start.toFixed(2), end_time: end.toFixed(2), type: 'pronunciation', alternatives: [{ confidence: '0.99', content }] });
const p = (content: string) => ({ type: 'punctuation', alternatives: [{ confidence: '0.0', content }] });

const ITEMS = [
  w('Hi', 0.1, 0.3), p(','), w("I'm", 0.35, 0.5), w('Ann', 0.5, 0.8), p('.'),
  w('I', 1.0, 1.1), w('build', 1.1, 1.4), w('test', 1.4, 1.7), w('suites', 1.7, 2.1), w('that', 2.1, 2.3), w('catch', 2.3, 2.6), w('bugs', 2.6, 2.9), w('early', 2.9, 3.3), p('.'),
];
// pandas DataFrame.to_json() is column-oriented: { column: { indexLabel: value } }.
const PANDAS = JSON.stringify({
  jobName: { items: 'vfs-x', transcripts: 'vfs-x' },
  results: { transcripts: [{ transcript: "Hi, I'm Ann. I build test suites that catch bugs early." }], items: ITEMS },
  status: { items: 'COMPLETED', transcripts: 'COMPLETED' },
});
const RES = {
  api_version: '0.2',
  metrics: {
    fwrd_counts: "{'um': 9, 'like': 2, 'so': 1}",
    transcript_length: '210',
    fwrd_rate: '5.71',
    long_pause_count: '4',
    transcript_json: JSON.stringify(PANDAS),
  },
};

describe('captions from the Transcribe items', () => {
  test('decodes a double-encoded pandas result and finds the items', () => {
    expect(transcribeItems(RES.metrics.transcript_json)).toHaveLength(ITEMS.length);
    expect(transcribeItems({ results: { items: ITEMS } })).toHaveLength(ITEMS.length); // raw Transcribe JSON too
  });

  test('builds cues of at most 7 words, breaking at a sentence stop, punctuation attached', () => {
    const vtt = transcriptToVtt(RES.metrics.transcript_json)!;
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain("1\n00:00:00.100 --> 00:00:00.800\nHi, I'm Ann.");
    expect(vtt).toContain('2\n00:00:01.000 --> 00:00:02.900\nI build test suites that catch bugs\n');
    expect(vtt).toContain('3\n00:00:02.900 --> 00:00:03.300\nearly.');
  });

  test('a caption can never forge a cue timing line', () => {
    const vtt = transcriptToVtt({ results: { items: [w('a-->b', 0, 1)] } })!;
    expect(vtt).not.toMatch(/a-->b/);
  });

  test('nothing to caption is null, never an empty track', () => {
    expect(transcriptToVtt('None')).toBeNull();
    expect(transcriptToVtt(undefined)).toBeNull();
    expect(transcriptToVtt({ results: { items: [] } })).toBeNull();
  });
});

describe('coaching, for the candidate only', () => {
  test('the kit examples: a filler word count and running over 90 seconds', () => {
    const c = readCoaching(RES, 125)!;
    expect(c.fillerTop[0]).toEqual({ word: 'um', count: 9 });
    expect(c.fillerTotal).toBe(12);
    expect(c.notes).toContain('2:05, over the 90s target. Try trimming it to 90 seconds.');
    expect(c.notes).toContain('You said "um" 9 times.');
    expect(c.notes).toContain('About 101 words a minute, a little slow. Most people land between 120 and 160.');
    expect(c.notes).toContain('4 long pauses. A short note of your three points can help.');
  });

  test('a clean take reads as encouragement, and missing metrics drop their line', () => {
    const notes = coachingNotes({ seconds: 88, words: 210, wordsPerMinute: 143, fillerTotal: 1, fillerTop: [{ word: 'so', count: 1 }], fillerRate: 0.5, longPauses: null });
    expect(notes).toEqual(['1:28, right around the 90s target.', 'Very few filler words. Nice.', 'About 143 words a minute, a comfortable pace.']);
    expect(readCoaching({ metrics: {} }, 30)!.notes).toEqual(['0:30. You have room to say more; aim for about 90 seconds.']);
  });

  test('a worker error, or no result at all, is no coaching', () => {
    expect(readCoaching({ error: 'NoFaceDetectedError', metrics: {} }, 80)).toBeNull();
    expect(readCoaching(null, 80)).toBeNull();
    expect(readCoaching(JSON.stringify(RES), 80)?.fillerTop[0].word).toBe('um'); // res.json read as text
  });

  test('filler counts read from a Python repr or a real object, biggest first', () => {
    expect(fillerCounts("{'you know': 2, 'um': 5}")).toEqual([{ word: 'um', count: 5 }, { word: 'you know', count: 2 }]);
    expect(fillerCounts({ like: 3, so: 0 })).toEqual([{ word: 'like', count: 3 }]);
    expect(clock(65)).toBe('1:05');
  });
});
