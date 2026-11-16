const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockTranscribe = jest.fn();
jest.mock('../../hire/hireVideoTranscribe', () => ({ transcribe: (...a: unknown[]) => mockTranscribe(...a) }));
const mockWrite = jest.fn();
jest.mock('../observationWriter', () => ({ writeObservations: (...a: unknown[]) => mockWrite(...a) }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { attemptResult, createAttempt, failStaleAttempts, getAttempt, scoreAttempt } from '../attempts';
import { NotFoundError } from '../sessions';

/** 60 words over 30 s with 3 "um"s: 120 wpm, 5% fillers. */
const words = Array.from({ length: 60 }, (_, i) => ({ word: i % 20 === 5 ? 'um' : 'word', start: i * 0.5, end: i * 0.5 + 0.4 }));

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
