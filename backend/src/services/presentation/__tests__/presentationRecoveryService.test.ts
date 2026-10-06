/**
 * presentationRecoveryService — the recording never arrived, and which take counts.
 *
 * The two rules these tests exist to defend:
 *   1. A recovery link NEVER overwrites a recording we actually captured.
 *   2. Choosing a final take DESTROYS NOTHING. The flag moves; every earlier take
 *      and every recording under it stays.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));

import { sequelize } from '../../../config/database';
import { getOwnedProjectTree } from '../../projects/projectReadService';
import {
  recoverMissingRecording,
  recoverMissingRecordingForOwner,
  selectFinalTake,
  selectFinalTakeForOwner,
} from '../presentationRecoveryService';

const q = sequelize.query as unknown as jest.Mock;
const mockTree = getOwnedProjectTree as unknown as jest.Mock;

const ATTEMPT = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const PROJECT = 'proj-1';
const GOOD = 'https://drive.google.com/file/d/abc/view?usp=sharing';

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  mockTree.mockResolvedValue({ id: PROJECT, name: 'Load Intake Agent', lists: [] });
});

/** The attempt exists on this task, with n parts that arrived. */
const state = (arrived: number, recovered = 0) =>
  [[{ arrived_parts: arrived, recovered_parts: recovered }], {}];

describe('recovering a recording that never arrived', () => {
  it('records where the student says the file is, and labels it a recovery', async () => {
    q.mockResolvedValueOnce(state(0) as any);
    q.mockResolvedValueOnce([[{ id: 'rec-9' }], {}] as any);

    const r = await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, GOOD);

    expect(r).toEqual({
      ok: true,
      recovered: { attemptId: ATTEMPT, recordingId: 'rec-9', recoveryUrl: GOOD, provenance: 'student_recovery' },
    });
    const insert = String(q.mock.calls[1][0]);
    expect(insert).toContain('INSERT INTO presentation_recordings');
    expect(insert).toContain("'student_recovery'");
    // Idempotent by constraint, not by read-then-write: two clicks must not stack.
    expect(insert).toContain('ON CONFLICT (occurrence_uuid, provider_file_id) DO NOTHING');
  });

  /**
   * THE RULE. A link must never be able to paste over the recording of what the
   * student really did — that is the one thing this evidence path exists to stop.
   */
  it('refuses when a real recording already arrived, and writes nothing', async () => {
    q.mockResolvedValueOnce(state(1) as any);
    const r = await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, GOOD);
    expect(r).toEqual({ ok: false, reason: 'already_recorded' });
    expect(q).toHaveBeenCalledTimes(1); // the state read only — no INSERT
  });

  it('treats a lost INSERT race as already recovered rather than reporting success', async () => {
    q.mockResolvedValueOnce(state(0) as any);
    q.mockResolvedValueOnce([[], {}] as any); // DO NOTHING returned no row
    const r = await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, GOOD);
    expect(r).toEqual({ ok: false, reason: 'already_recorded' });
  });

  // Same rule, same function, as the evidence form. Evidence is only evidence if
  // somebody else can open it.
  it('refuses a link that only opens on the student\'s own machine', async () => {
    for (const bad of [
      'http://localhost:8420/demo.mp4',
      'http://127.0.0.1:3000/x',
      'http://192.168.1.20/video.mp4',
      'http://my-laptop:8420/',
      'http://printer.local/x',
    ]) {
      q.mockReset();
      const r = await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, bad);
      expect({ bad, r }).toEqual({ bad, r: { ok: false, reason: 'private_link' } });
      expect(q).not.toHaveBeenCalled();
    }
  });

  it('refuses anything that is not a full http(s) URL', async () => {
    for (const bad of ['', '   ', 'youtu.be/abc', 'javascript:alert(1)', 'ftp://x/y']) {
      q.mockReset();
      const r = await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, bad);
      expect({ bad, ok: r.ok }).toEqual({ bad, ok: false });
      if (!r.ok) expect(r.reason).toBe('bad_link');
      expect(q).not.toHaveBeenCalled();
    }
  });

  it('refuses an over-long link without touching the database', async () => {
    const r = await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, `https://x.com/${'a'.repeat(2100)}`);
    expect(r).toEqual({ ok: false, reason: 'bad_link' });
    expect(q).not.toHaveBeenCalled();
  });

  it('an attempt that is not on this task is not_found, and says nothing more', async () => {
    q.mockResolvedValueOnce([[], {}] as any);
    const r = await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, GOOD);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('pins the attempt to this project AND this task', async () => {
    q.mockResolvedValueOnce(state(0) as any);
    q.mockResolvedValueOnce([[{ id: 'rec-9' }], {}] as any);
    await recoverMissingRecording(PROJECT, 'PREP-2', ATTEMPT, GOOD);
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toMatch(/s\.project_id = :projectId/);
    expect(sql).toMatch(/s\.story_id = :storyId/);
  });

  it('refuses a non-uuid attempt without going near the database', async () => {
    const r = await recoverMissingRecording(PROJECT, 'PREP-2', "' OR 1=1 --", GOOD);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });
});

describe('choosing the final take', () => {
  const owned = (previousFinal: string | null, total: number) =>
    [[{ id: ATTEMPT, previous_final_id: previousFinal, takes_total: total }], {}];

  /**
   * THE RULE. A student with four takes who marks the third must still have four
   * takes, each with its recording. "Selecting" is not "replacing".
   */
  it('keeps every earlier take, and deletes nothing', async () => {
    q.mockResolvedValueOnce(owned(OTHER, 4) as any);
    q.mockResolvedValueOnce([[], {}] as any); // clear
    q.mockResolvedValueOnce([[], {}] as any); // set

    const r = await selectFinalTake(PROJECT, 'PREP-5', ATTEMPT);

    expect(r).toEqual({ ok: true, attemptId: ATTEMPT, previousFinalAttemptId: OTHER, takesKept: 4 });
    const statements = q.mock.calls.map((c) => String(c[0]));
    for (const sql of statements) {
      expect(sql).not.toMatch(/\bDELETE\b/i);
      expect(sql).not.toMatch(/presentation_recordings/);
    }
    // Only the flag is written.
    expect(statements[1]).toMatch(/SET is_final_take = FALSE/);
    expect(statements[2]).toMatch(/SET is_final_take = TRUE/);
  });

  it('clears the previous final before setting the new one, so two are never final at once', async () => {
    q.mockResolvedValueOnce(owned(OTHER, 2) as any);
    q.mockResolvedValueOnce([[], {}] as any);
    q.mockResolvedValueOnce([[], {}] as any);
    await selectFinalTake(PROJECT, 'PREP-5', ATTEMPT);
    const order = q.mock.calls.map((c) => String(c[0]));
    expect(order[1].indexOf('FALSE')).toBeGreaterThan(-1);
    expect(order[2].indexOf('TRUE')).toBeGreaterThan(-1);
  });

  it('the clear is scoped to this task, never to every attempt the student has', async () => {
    q.mockResolvedValueOnce(owned(null, 1) as any);
    q.mockResolvedValueOnce([[], {}] as any);
    q.mockResolvedValueOnce([[], {}] as any);
    await selectFinalTake(PROJECT, 'PREP-5', ATTEMPT);
    const clear = String(q.mock.calls[1][0]);
    expect(clear).toMatch(/s\.project_id = :projectId/);
    expect(clear).toMatch(/s\.story_id = :storyId/);
  });

  it('re-selecting the take that is already final reports no previous, not itself', async () => {
    q.mockResolvedValueOnce(owned(ATTEMPT, 3) as any);
    q.mockResolvedValueOnce([[], {}] as any);
    q.mockResolvedValueOnce([[], {}] as any);
    const r = await selectFinalTake(PROJECT, 'PREP-5', ATTEMPT);
    if (!r.ok) throw new Error('expected ok');
    expect(r.previousFinalAttemptId).toBeNull();
    expect(r.takesKept).toBe(3);
  });

  it('an attempt that is not on this task changes nothing', async () => {
    q.mockResolvedValueOnce([[], {}] as any);
    const r = await selectFinalTake(PROJECT, 'PREP-5', ATTEMPT);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).toHaveBeenCalledTimes(1); // the ownership read only
  });
});

describe('ownership', () => {
  it('a project that is not yours cannot be recovered into', async () => {
    mockTree.mockResolvedValue(null);
    const r = await recoverMissingRecordingForOwner('enr-1', 'someone-elses', 'PREP-2', ATTEMPT, GOOD);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });

  it('a project that is not yours cannot have its final take changed', async () => {
    mockTree.mockResolvedValue(null);
    const r = await selectFinalTakeForOwner('enr-1', 'someone-elses', 'PREP-5', ATTEMPT);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });
});
