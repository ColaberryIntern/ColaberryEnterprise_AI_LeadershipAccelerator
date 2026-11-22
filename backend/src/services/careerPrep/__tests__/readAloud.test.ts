const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockTranscribe = jest.fn();
jest.mock('../../hire/hireVideoTranscribe', () => ({ transcribe: (...a: unknown[]) => mockTranscribe(...a) }));
const mockWrite = jest.fn();
jest.mock('../observationWriter', () => ({ writeObservations: (...a: unknown[]) => mockWrite(...a) }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { inOrderMatches, READ_ALOUD_WEIGHTS, realWords, scoreReadAloud, tokens } from '../readAloudScore';
import { lineById, lineFor, READ_ALOUD_LINES } from '../readAloudLines';
import { attemptObservationRows, attemptRef, readAloudResult, scoreAttempt } from '../attempts';
import { pendingFile } from '../savedAnswers';
import readinessWeights from '../readinessWeights.json';

/** CP5.8 (Ali 2026-11-21, option B): the read-aloud warm-up, scored at full weight. */
const LINE = lineById('ra-01')!; // 21 words
const timed = (toks: string[], step = 0.4) => toks.map((word, i) => ({ word, start: i * step, end: i * step + step * 0.8 }));
const said = (text: string) => text.split(/\s+/);

beforeEach(() => { mockQuery.mockReset().mockResolvedValue([[], 0]); mockTranscribe.mockReset(); mockWrite.mockReset().mockResolvedValue(1); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('readAloudScore (pure)', () => {
  it('a clean read at about 150 wpm with no long pause scores 100 on all three parts', () => {
    const r = scoreReadAloud(timed(said(LINE.text)), 8.4, LINE.text);
    expect(r).toMatchObject({ pace: 100, smoothness: 100, completeness: 100, score: 100, wordsHeard: 21, wordsInLine: 21, pausesOverOneSecond: 0 });
    // 21 words over the speaking span (first word start to last word end, 8.32 s), as the intro-video scorer measures it.
    expect(r.wordsPerMinute).toBe(151);
  });

  it('a read far too fast scores low on pace (the existing band), and the composite drops with it', () => {
    const r = scoreReadAloud(timed(said(LINE.text), 0.2), 4.2, LINE.text);
    expect(r.pace).toBeLessThan(100);
    expect(r.score).toBeLessThan(100);
  });

  it('one pause of 1.2 s costs 15 smoothness points; the composite follows 0.4 / 0.3 / 0.3', () => {
    const w = timed(said(LINE.text));
    for (let i = 10; i < w.length; i += 1) { w[i] = { ...w[i], start: w[i].start + 1.2, end: w[i].end + 1.2 }; }
    const r = scoreReadAloud(w, 9.6, LINE.text);
    expect(r.pausesOverOneSecond).toBe(1);
    expect(r.smoothness).toBe(85);
    expect(r.score).toBe(Math.round(READ_ALOUD_WEIGHTS.pace * r.pace + 0.3 * 85 + 0.3 * r.completeness));
  });

  it('a pause just under 1.0 s is not counted; many long pauses floor smoothness at 0, never below', () => {
    const w = timed(said(LINE.text));
    w[5] = { ...w[5], start: w[4].end + 0.99, end: w[4].end + 1.3 };
    expect(scoreReadAloud(w, 8.4, LINE.text).pausesOverOneSecond).toBe(0);
    const slow = said(LINE.text).map((word, i) => ({ word, start: i * 2, end: i * 2 + 0.4 }));
    expect(scoreReadAloud(slow, 42, LINE.text).smoothness).toBe(0);
  });

  it('completeness counts the line\'s words said IN ORDER: a skipped half scores about half', () => {
    const half = said(LINE.text).slice(0, 11);
    expect(scoreReadAloud(timed(half), 5, LINE.text).completeness).toBe(Math.round((100 * 11) / 21));
    expect(inOrderMatches(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(1);
    expect(inOrderMatches(['a', 'b', 'c'], ['a', 'x', 'b', 'c', 'y'])).toBe(3);
    expect(inOrderMatches([], ['a'])).toBe(0);
  });

  // Fillers are inserted WITHOUT moving any real word: the real timestamps are identical, so a correct scorer must
  // return exactly the clean read's numbers (the bug this pins: an "um" inside a 1.2 s silence split it into two short
  // gaps and hid the pause, raising the score from 96 to 100; six fillers in a slow read raised the pace score).
  const fields = (r: ReturnType<typeof scoreReadAloud>) => ({ score: r.score, pace: r.pace, smoothness: r.smoothness, completeness: r.completeness, wordsPerMinute: r.wordsPerMinute, pausesOverOneSecond: r.pausesOverOneSecond });
  const insertAfter = (w: ReturnType<typeof timed>, at: number, word: string, from: number, to: number) => [...w.slice(0, at + 1), { word, start: from, end: to }, ...w.slice(at + 1)];

  it('filler words are NEVER scored: "um" inside a 1.2 s pause neither hides the pause nor changes anything', () => {
    const paused = timed(said(LINE.text));
    for (let i = 10; i < paused.length; i += 1) paused[i] = { ...paused[i], start: paused[i].start + 1.2, end: paused[i].end + 1.2 };
    const clean = scoreReadAloud(paused, 9.6, LINE.text);
    const gap = paused[9].end;
    const withUm = insertAfter(insertAfter(paused, 9, 'um', gap + 0.5, gap + 0.8), 4, 'uh', paused[4].end + 0.01, paused[4].end + 0.05);
    expect(clean.pausesOverOneSecond).toBe(1);
    expect(fields(scoreReadAloud(withUm, 9.6, LINE.text))).toEqual(fields(clean));
  });

  it('filler words are NEVER scored: six filler words (um, uh, um, uh, you know) in a slow read leave pace, wpm and every score unchanged', () => {
    const slow = timed(said(LINE.text)).map((x) => ({ ...x, start: x.start * 1.6, end: x.end * 1.6 }));
    const clean = scoreReadAloud(slow, 14, LINE.text);
    expect(clean.pace).toBeLessThan(100); // slow enough that the pace band matters
    const out: typeof slow = [];
    slow.forEach((x, i) => {
      out.push(x);
      if (i < 4) out.push({ word: ['um', 'uh', 'um', 'uh'][i], start: x.end + 0.01, end: x.end + 0.1 });
      // The phrase filler "you know": its two words together, between two real words.
      if (i === 4) out.push({ word: 'you', start: x.end + 0.01, end: x.end + 0.05 }, { word: 'know', start: x.end + 0.06, end: x.end + 0.1 });
    });
    const r = scoreReadAloud(out, 14, LINE.text);
    expect(fields(r)).toEqual(fields(clean));
    expect(JSON.stringify(r)).not.toMatch(/filler/i);
  });

  it('only fillers are dropped: realWords keeps every word of the line, in order, with its own timestamps', () => {
    const w = insertAfter(timed(said(LINE.text)), 3, 'um', 1.33, 1.37);
    expect(realWords(w)).toEqual(timed(said(LINE.text)));
  });

  it('nothing in a result names accent or pronunciation', () => {
    const r = readAloudResult(timed(said(LINE.text)), 8.4, LINE);
    expect(JSON.stringify(r)).not.toMatch(/accent|pronunc/i);
  });

  it('tokens ignore case and punctuation but keep contractions whole', () => {
    expect(tokens("I'm glad. Start-to-finish, OK!")).toEqual(["i'm", 'glad', 'starttofinish', 'ok']);
  });
});

describe('readAloudLines', () => {
  it('every line is 14 to 22 words, ids are unique, and no line holds a prototype name', () => {
    expect(READ_ALOUD_LINES.length).toBeGreaterThanOrEqual(8);
    for (const l of READ_ALOUD_LINES) {
      expect(tokens(l.text).length).toBeGreaterThanOrEqual(14);
      expect(tokens(l.text).length).toBeLessThanOrEqual(22);
      expect(l.text).not.toMatch(/Meridian|Summit|Lena|Kwame/);
    }
    expect(new Set(READ_ALOUD_LINES.map((l) => l.id)).size).toBe(READ_ALOUD_LINES.length);
  });
  it('no line contains a filler word, so stripping fillers can never remove a word the student was asked to read', () => {
    for (const l of READ_ALOUD_LINES) {
      const words = tokens(l.text).map((word, i) => ({ word, start: i, end: i + 0.5 }));
      expect(realWords(words)).toHaveLength(words.length);
      expect(tokens(l.text)).not.toEqual(expect.arrayContaining(['um', 'uh', 'like', 'er', 'ah', 'hmm']));
      expect(l.text.toLowerCase()).not.toMatch(/\byou know\b|\bi mean\b/);
    }
  });
  it('lines rotate by the count of earlier read-alouds and wrap around', () => {
    expect(lineFor(0).id).toBe('ra-01');
    expect(lineFor(1).id).toBe('ra-02');
    expect(lineFor(READ_ALOUD_LINES.length).id).toBe('ra-01');
    expect(lineFor(-1).id).toBe(READ_ALOUD_LINES[READ_ALOUD_LINES.length - 1].id);
    expect(lineById('ra-99')).toBeUndefined();
  });
});

describe('a read-aloud attempt (attempts.ts)', () => {
  const file = () => { const p = path.join(os.tmpdir(), `readaloud-test-${Math.random()}.webm`); fs.writeFileSync(p, 'x'); return p; };

  it('becomes ONE Pace and clarity observation, source read_aloud, ref readaloud:<id>, at full weight', () => {
    const result = readAloudResult(timed(said(LINE.text)), 8.4, LINE);
    const rows = attemptObservationRows('e1', 'a1', result, new Date('2026-11-21T15:00:00Z'));
    expect(rows).toEqual([{ enrollmentId: 'e1', skill: 'pace_clarity', value: result.readAloud!.score, source: 'read_aloud', sourceRef: 'readaloud:a1', observedAt: new Date('2026-11-21T15:00:00Z') }]);
    expect(rows[0]).not.toHaveProperty('weight'); // default 1 in the table
    expect(readinessWeights.sourceWeights.read_aloud).toBe(readinessWeights.sourceWeights.video); // option B: as much as a recorded answer
    expect(attemptRef('a1', result)).toBe('readaloud:a1');
  });

  it('scores, writes that one row, stores the result, and DELETES the recording (never kept for saving)', async () => {
    mockTranscribe.mockResolvedValue({ words: timed(said(LINE.text)), duration: 8.4, text: '', language: 'en' });
    const id = '55555555-5555-4555-8555-555555555555';
    const f = file();
    expect(await scoreAttempt(id, 'e1', f, { readAloudLine: LINE })).toBe('done');
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite.mock.calls[0][0]).toHaveLength(1);
    expect(mockWrite.mock.calls[0][0][0]).toMatchObject({ skill: 'pace_clarity', source: 'read_aloud', sourceRef: `readaloud:${id}` });
    expect(String(mockQuery.mock.calls[0][0])).toContain("status = 'done'");
    expect(JSON.parse(mockQuery.mock.calls[0][1].replacements.r).readAloud).toEqual({ score: 100, lineId: 'ra-01' });
    expect(fs.existsSync(f)).toBe(false);
    expect(fs.existsSync(pendingFile(id))).toBe(false);
  });

  it('a silent or garbled read is failed as UnclearAudio and writes NO observation', async () => {
    mockTranscribe.mockResolvedValue({ words: timed(['thank', 'you']), duration: 6, text: '', language: 'en' });
    const f = file();
    expect(await scoreAttempt('a2', 'e1', f, { readAloudLine: LINE })).toBe('failed');
    expect(mockWrite).not.toHaveBeenCalled();
    expect(String(mockQuery.mock.calls[0][1].replacements.c)).toBe('UnclearAudio');
    expect(fs.existsSync(f)).toBe(false);
  });

  it('re-deriving the rows (as the recap does) gives the same key, so a second write adds nothing', () => {
    const result = readAloudResult(timed(said(LINE.text)), 8.4, LINE);
    const at = new Date('2026-11-21T15:00:00Z');
    expect(attemptObservationRows('e1', 'a1', result, at)).toEqual(attemptObservationRows('e1', 'a1', result, at));
  });
});
