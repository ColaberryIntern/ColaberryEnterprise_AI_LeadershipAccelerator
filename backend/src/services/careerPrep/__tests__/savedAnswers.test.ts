const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'saved-answers-test-secret' } }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  deleteAnswer, deliveryOf, keepPending, listSavedAnswers, NotSaveableError, PENDING_MS, pendingFile, pendingRecording, playToken,
  readPublicAnswers, RecordingGoneError, resolveAnswerFile, resolvePublicAnswerFile, saveAnswer, setShowPublic, sweepPending, verifyPlayToken,
} from '../savedAnswers';
import { NotFoundError } from '../sessions';

const A1 = '66666666-6666-4666-8666-666666666666';
const tmp = (name: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`)); return d; };
const write = (p: string) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'video'); return p; };

beforeEach(() => { mockQuery.mockReset().mockResolvedValue([[], 0]); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('the pending hour', () => {
  it('moves a scored recording into the pending area, readable for an hour and swept after', async () => {
    const dir = tmp('pending');
    const src = write(path.join(tmp('upload'), 'x.upload'));
    await keepPending(A1, src, dir);
    expect(fs.existsSync(src)).toBe(false);
    const f = pendingFile(A1, dir);
    expect(await pendingRecording(A1, Date.now(), dir)).toBe(f);
    expect(await pendingRecording(A1, Date.now() + PENDING_MS + 1, dir)).toBeNull();
    expect(await sweepPending(Date.now(), dir)).toBe(0);
    expect(await sweepPending(Date.now() + PENDING_MS + 1, dir)).toBe(1);
    expect(fs.existsSync(f)).toBe(false);
  });
  it('refuses an attempt id that is not a uuid (no path tricks)', () => {
    expect(() => pendingFile('../../etc/passwd')).toThrow();
  });
});

describe('playback tokens', () => {
  it('verifies only the asset it was signed for, and only until it expires', () => {
    const id = 'abcdefabcdefabcdefabcdef';
    const now = Date.now();
    const t = playToken(id, now);
    expect(verifyPlayToken(id, t, now)).toBe(true);
    expect(verifyPlayToken('bbbbbbbbbbbbbbbbbbbbbbbb', t, now)).toBe(false);
    expect(verifyPlayToken(id, t, now + 3 * 3600 * 1000)).toBe(false);
    expect(verifyPlayToken(id, 'nope', now)).toBe(false);
  });
  it('serves nothing without a valid token, a known asset and a known kind', async () => {
    const id = 'abcdefabcdefabcdefabcdef';
    expect(await resolveAnswerFile(id, 'stream', undefined)).toBeNull();
    expect(await resolveAnswerFile(id, 'captions', playToken(id))).toBeNull();
    mockQuery.mockResolvedValueOnce([[], 0]);
    expect(await resolveAnswerFile(id, 'stream', playToken(id))).toBeNull();
    mockQuery.mockResolvedValueOnce([[{ '?column?': 1 }], 1]);
    expect((await resolveAnswerFile(id, 'stream', playToken(id), Date.now(), '/root'))?.type).toBe('video/mp4');
  });
});

describe('saveAnswer', () => {
  it("404s someone else's attempt and 409s an attempt that was not scored (UnclearAudio included)", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(saveAnswer('e2', A1, null)).rejects.toBeInstanceOf(NotFoundError);
    mockQuery.mockResolvedValueOnce([[{ id: A1, status: 'failed', result: null }], 1]);
    await expect(saveAnswer('e1', A1, null)).rejects.toBeInstanceOf(NotSaveableError);
  });
  it('410s when the pending hour has passed', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: A1, status: 'done', result: null }], 1]).mockResolvedValueOnce([[], 0]);
    await expect(saveAnswer('e1', A1, null)).rejects.toBeInstanceOf(RecordingGoneError);
  });
  it('transcodes the pending recording into the saved folder, records it, and drops the pending copy', async () => {
    const root = tmp('saved');
    const pending = write(pendingFile(A1));
    const result = { scores: [{ score: 80 }, { score: 91 }] };
    mockQuery
      .mockResolvedValueOnce([[{ id: A1, status: 'done', result }], 1])
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[{ attempt_id: A1, asset_id: 'abcdefabcdefabcdefabcdef', question: 'Tell me about a project.', delivery: 86, seconds: 41, created_at: new Date() }], 1]);
    const run = jest.fn(async (cmd: string) => (cmd === 'ffprobe' ? '41.2' : ''));
    const saved = await saveAnswer('e1', A1, 'Tell me about a project.', { run, root });
    expect(saved.delivery).toBe(86);
    expect(saved.streamUrl).toMatch(/^\/api\/portal\/career-prep\/answer-video\/abcdefabcdefabcdefabcdef\/stream\?t=\d{13}\.[0-9a-f]{64}$/);
    const insert = mockQuery.mock.calls[2];
    expect(String(insert[0])).toContain('INSERT INTO prep_saved_answers');
    expect(insert[1].replacements).toMatchObject({ e: 'e1', a: A1, q: 'Tell me about a project.', d: 86, s: 41 });
    expect(fs.existsSync(pending)).toBe(false);
  });
});

describe('deleteAnswer', () => {
  it('deletes the row and its folder for the owner; 404 for anyone else', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(deleteAnswer('e2', A1)).rejects.toBeInstanceOf(NotFoundError);
    const root = tmp('del');
    const dir = path.join(root, 'abcdefabcdefabcdefabcdef');
    write(path.join(dir, 'stream.mp4'));
    mockQuery.mockResolvedValueOnce([[{ '?column?': 1 }], 1]).mockResolvedValueOnce([[{ asset_id: 'abcdefabcdefabcdefabcdef' }], 1]);
    await deleteAnswer('e1', A1, root);
    expect(String(mockQuery.mock.calls[2][0])).toContain('DELETE FROM prep_saved_answers WHERE attempt_id = :a AND enrollment_id = :e');
    expect(fs.existsSync(dir)).toBe(false);
  });
});

it('delivery is the rounded mean of the delivery scores', () => {
  expect(deliveryOf({ scores: [{ score: 80 }, { score: 91 }] })).toBe(86);
  expect(deliveryOf(null)).toBeNull();
});

describe('public practice answers (R1.2, the second opt-in)', () => {
  const ID = 'abcdefabcdefabcdefabcdef';
  const row = { attempt_id: A1, asset_id: ID, question: 'Q?', delivery: 81, seconds: 42, created_at: '2026-11-17T00:00:00Z', show_public: true };

  it('setShowPublic flips only the caller\'s own saved answer, and 404s anything else', async () => {
    mockQuery.mockResolvedValueOnce([[row], 1]);
    expect((await setShowPublic('e1', A1, true)).showPublic).toBe(true);
    const [sql, opts] = mockQuery.mock.calls[0] as [string, { replacements: Record<string, unknown> }];
    expect(sql).toContain('WHERE attempt_id = :a AND enrollment_id = :e');
    expect(opts.replacements).toEqual({ on: true, a: A1, e: 'e1' });
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(setShowPublic('e2', A1, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a saved answer reads as private unless show_public is true', async () => {
    mockQuery.mockResolvedValueOnce([[{ ...row, show_public: false }, { ...row, attempt_id: 'x', show_public: null }], 2]);
    expect((await listSavedAnswers('e1')).map((a) => a.showPublic)).toEqual([false, false]);
  });

  it('the public list carries the question and the public recording only: no score, no attempt id, no token', async () => {
    mockQuery.mockResolvedValueOnce([[{ asset_id: ID, question: 'Q?', seconds: 42 }], 1]);
    const list = await readPublicAnswers('e1');
    expect(list).toEqual([{ question: 'Q?', seconds: 42, streamUrl: `/api/public/hire/practice-answer/${ID}/stream`, posterUrl: `/api/public/hire/practice-answer/${ID}/poster` }]);
    expect(JSON.stringify(list)).not.toMatch(/delivery|81|\?t=|attempt/);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('a.show_public = true');
    expect(sql).toContain("p.status = 'published' AND p.visibility = 'public'");
  });

  it('public playback needs a known kind, a real asset id and a row passing the rule; it never reads a token', async () => {
    expect(await resolvePublicAnswerFile('../etc', 'stream')).toBeNull();
    expect(await resolvePublicAnswerFile(ID, 'captions')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockResolvedValueOnce([[], 0]);
    expect(await resolvePublicAnswerFile(ID, 'stream')).toBeNull();
    mockQuery.mockResolvedValueOnce([[{ '?column?': 1 }], 1]);
    expect(await resolvePublicAnswerFile(ID, 'poster', '/root')).toEqual({ path: expect.stringContaining(ID), type: 'image/jpeg' });
    expect(String(mockQuery.mock.calls[1][0])).toContain("a.show_public = true AND EXISTS (SELECT 1 FROM career_portfolio_pages p");
  });
});
