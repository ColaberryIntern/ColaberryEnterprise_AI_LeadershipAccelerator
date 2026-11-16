const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockTranscribe = jest.fn();
jest.mock('../../hire/hireVideoTranscribe', () => ({ transcribe: (...a: unknown[]) => mockTranscribe(...a) }));
const mockWrite = jest.fn();
jest.mock('../observationWriter', () => ({ writeObservations: (...a: unknown[]) => mockWrite(...a) }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { attemptResult, createAttempt, failStaleAttempts, getAttempt, scoreAttempt, unclearAudio } from '../attempts';
import { NotFoundError } from '../sessions';

/** A real answer: 60 words over 30 s with 3 "um"s: 120 wpm, 5% fillers. */
const ANSWER = ('At my last job I built an assistant um that read every support ticket and drafted a reply for the agent. ' +
  'Agents approved or edited each draft before it went out. Um within six weeks the median reply time fell from four hours ' +
  'to forty minutes and um the team closed the backlog for the first time that year, which my manager reported to the director.').split(/\s+/).slice(0, 60);
const timed = (toks: string[], step = 0.5) => toks.map((word, i) => ({ word, start: i * step, end: i * step + step * 0.8 }));
const words = timed(ANSWER);

beforeEach(() => { mockQuery.mockReset().mockResolvedValue([[], 0]); mockTranscribe.mockReset(); mockWrite.mockReset().mockResolvedValue(2); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('createAttempt', () => {
  it("refuses a session that is not this student's, or not open, and a segment out of range", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(createAttempt('e2', 's1', 0, 'key-12345678')).rejects.toBeInstanceOf(NotFoundError);
    mockQuery.mockResolvedValueOnce([[{ n: 3 }], 1]);
    await expect(createAttempt('e1', 's1', 5, 'key-12345678')).rejects.toBeInstanceOf(NotFoundError);
  });
  it('a retried upload with the same client key returns the same attempt, not a second one', async () => {
    mockQuery.mockResolvedValueOnce([[{ n: 3 }], 1]).mockResolvedValueOnce([[{ id: 'a1', status: 'pending', result: null, error_class: null }], 1]);
    expect(await createAttempt('e1', 's1', 2, 'key-12345678')).toMatchObject({ created: true, attempt: { id: 'a1', status: 'pending' } });
    mockQuery.mockResolvedValueOnce([[{ n: 3 }], 1]).mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[{ id: 'a1', status: 'done', result: null, error_class: null }], 1]);
    expect(await createAttempt('e1', 's1', 2, 'key-12345678')).toMatchObject({ created: false, attempt: { id: 'a1' } });
    expect(String(mockQuery.mock.calls[1][0])).toContain('ON CONFLICT (session_id, client_key) DO NOTHING');
  });
});

describe('attemptResult', () => {
  it('keeps pace and filler scores, drops the intro-video length score and note', () => {
    const r = attemptResult(words, 30);
    expect(r.scores.map((s) => s.key)).toEqual(expect.arrayContaining(['pace', 'fillers']));
    expect(r.scores.map((s) => s.key)).not.toContain('length');
    expect(r.notes.join(' ')).not.toMatch(/longer than most viewers|room to say more|a good length/);
  });
});

describe('unclearAudio: a silent or garbled recording is never scored', () => {
  it('a real answer passes, and so does a fast but real talker (230 wpm)', () => {
    expect(ANSWER).toHaveLength(60);
    expect(unclearAudio(words, 30)).toBeNull();
    expect(unclearAudio(timed(ANSWER, 60 / 230), 20)).toBeNull();
  });
  it('the production hallucination shape fails: one phrase looped ("i\'m i\'m" 69 times, 371 wpm)', () => {
    const loop = timed([...Array.from({ length: 69 }, () => "I'm"), 'here', 'today'], 60 / 371);
    expect(unclearAudio(loop, 25)).not.toBeNull();
    // The loop alone, at a plausible pace, is still caught by its repetition.
    expect(unclearAudio(timed(Array.from({ length: 40 }, (_, i) => (i % 2 ? 'thank' : 'you')), 0.5), 25)).toBe('loop');
  });
  it('short or silent recordings fail', () => {
    expect(unclearAudio([], 20)).toBe('few_words');
    expect(unclearAudio(timed(['Hello', 'um', 'so']), 20)).toBe('few_words');
  });
  it('words faster than a person speaks fail', () => {
    expect(unclearAudio(timed(ANSWER, 60 / 300), 15)).toBe('too_fast');
  });
  it('a short real answer that repeats "and I" is not a loop', () => {
    expect(unclearAudio(timed('I wrote the spec and I built it and I shipped it in two weeks'.split(' ')), 10)).toBeNull();
  });
});

describe('scoreAttempt', () => {
  const file = () => { const p = path.join(os.tmpdir(), `attempt-test-${Math.random()}.webm`); fs.writeFileSync(p, 'x'); return p; };

  it('scores, writes pace and filler observations for this student, stores the result, and deletes the file', async () => {
    mockTranscribe.mockResolvedValue({ words, duration: 30, text: '', language: 'en' });
    const f = file();
    expect(await scoreAttempt('a1', 'e1', f)).toBe('done');
    const rows = mockWrite.mock.calls[0][0] as Array<{ skill: string; sourceRef: string; enrollmentId: string; source: string }>;
    expect(rows.map((r) => r.skill).sort()).toEqual(['few_fillers', 'pace_clarity']);
    expect(rows.every((r) => r.sourceRef === 'attempt:a1' && r.enrollmentId === 'e1' && r.source === 'video')).toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toContain("status = 'done'");
    expect(fs.existsSync(f)).toBe(false);
  });

  it('an unclear recording is failed as UnclearAudio, writes NO observations, stores no result, and deletes the file', async () => {
    mockTranscribe.mockResolvedValue({ words: timed(Array.from({ length: 69 }, () => "i'm"), 60 / 371), duration: 25, text: '', language: 'en' });
    const f = file();
    expect(await scoreAttempt('a1', 'e1', f)).toBe('failed');
    expect(mockWrite).not.toHaveBeenCalled();
    expect(String(mockQuery.mock.calls[0][0])).toContain("status = 'failed'");
    expect(mockQuery.mock.calls[0][1].replacements.c).toBe('UnclearAudio');
    expect(fs.existsSync(f)).toBe(false);
  });

  it('on failure stores failed with an error class, writes no observations, and still deletes the file', async () => {
    mockTranscribe.mockRejectedValue(Object.assign(new Error('rate'), { error_class: 'RateLimitError' }));
    const f = file();
    expect(await scoreAttempt('a1', 'e1', f)).toBe('failed');
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls[0][1].replacements.c).toBe('RateLimitError');
    expect(fs.existsSync(f)).toBe(false);
  });
});

describe('reads and the boot sweep', () => {
  it("reads an attempt only within the student's own session", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(getAttempt('e2', 's1', 'a1')).rejects.toBeInstanceOf(NotFoundError);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ a: 'a1', s: 's1', e: 'e2' });
  });
  it('marks attempts left pending by a restart as failed', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'a1' }, { id: 'a2' }], 2]);
    expect(await failStaleAttempts()).toBe(2);
    expect(String(mockQuery.mock.calls[0][0])).toContain("error_class = 'Interrupted' WHERE status = 'pending'");
  });
});
