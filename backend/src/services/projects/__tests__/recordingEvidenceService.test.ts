/**
 * recordingEvidenceService — handing in a recording the platform already holds.
 *
 * The rule these tests defend: a student who rehearsed in a practice room must
 * not have to download the video, upload it to YouTube, make it public, and
 * paste the link, purely to satisfy the shape of an evidence form. The
 * workaround produced a worse artifact than the one we already had.
 *
 * The second rule: an attempt id is a claim, not a proof. It is checked against
 * THIS task every time, and the two ways it can miss stay distinguishable.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));

import { sequelize } from '../../../config/database';
import { getOwnedProjectTree } from '../projectReadService';
import {
  isUuid,
  recordingRef,
  parseRecordingRef,
  listRecordedAttempts,
  listRecordedAttemptsForOwner,
  resolveRecordingEvidence,
  RECORDING_REF_PREFIX,
  describeTakeContents,
} from '../recordingEvidenceService';

const q = sequelize.query as unknown as jest.Mock;
const mockTree = getOwnedProjectTree as unknown as jest.Mock;

const ATTEMPT = '11111111-2222-4333-8444-555555555555';
const PROJECT = 'proj-1';

const row = (over: Record<string, unknown> = {}) => ({
  attempt_id: ATTEMPT,
  attempt_no: 2,
  mode: 'practice_solo',
  is_final_take: false,
  started_at: '2026-11-20T19:00:00Z',
  ended_at: '2026-11-20T19:10:00Z',
  usable_parts: 2,
  duration_seconds: 600,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  mockTree.mockResolvedValue({ id: PROJECT, name: 'Load Intake Agent', lists: [] });
});

describe('the ref can never be mistaken for a commit sha or a URL', () => {
  it('namespaces the attempt id', () => {
    expect(recordingRef(ATTEMPT)).toBe(`${RECORDING_REF_PREFIX}${ATTEMPT}`);
    expect(parseRecordingRef(recordingRef(ATTEMPT))).toBe(ATTEMPT);
  });

  // `verified_ref` is read as a commit sha by awardedEvidenceRef and
  // latchedFromNothing. A bare uuid in that column is indistinguishable from one.
  it('reads back as null for everything that is not one of ours', () => {
    expect(parseRecordingRef(ATTEMPT)).toBeNull();                       // bare uuid
    expect(parseRecordingRef('https://youtu.be/abc')).toBeNull();        // external link
    expect(parseRecordingRef('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBeNull(); // sha
    expect(parseRecordingRef('ali@colaberry.com')).toBeNull();           // staff identity
    expect(parseRecordingRef(null)).toBeNull();
    expect(parseRecordingRef(`${RECORDING_REF_PREFIX}not-a-uuid`)).toBeNull();
  });

  it('accepts only a real uuid shape', () => {
    expect(isUuid(ATTEMPT)).toBe(true);
    expect(isUuid('../../etc/passwd')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('resolving one attempt', () => {
  it('returns the ref and a detail a reviewer can read', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    const r = await resolveRecordingEvidence(PROJECT, 'PREP-2', ATTEMPT);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ref).toBe(`${RECORDING_REF_PREFIX}${ATTEMPT}`);
    expect(r.detail).toMatchObject({ kind: 'recording', source: 'internal', attempt_id: ATTEMPT, parts: 2, duration_seconds: 600 });
    expect(r.attempt.attemptNo).toBe(2);
  });

  // The whole point is that the recording stays inside the platform, where the
  // access checks live. A URL frozen onto the task row would outlive them.
  it('never returns or stores a playback URL', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    const r = await resolveRecordingEvidence(PROJECT, 'PREP-2', ATTEMPT);
    if (!r.ok) return;
    const blob = JSON.stringify({ ref: r.ref, detail: r.detail, attempt: r.attempt });
    expect(blob).not.toMatch(/https?:\/\//);
    expect(blob).not.toMatch(/zoom\.us/i);
  });

  it('an attempt that is not on this task is not_found, and says nothing more', async () => {
    q.mockResolvedValueOnce([[], {}]);
    const r = await resolveRecordingEvidence(PROJECT, 'PREP-2', ATTEMPT);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  // not_ready is a WAIT, not a mistake. Flattening it into not_found would tell a
  // student to fix an id that was correct.
  it('an attempt of theirs whose recording has not arrived is not_ready', async () => {
    q.mockResolvedValueOnce([[row({ usable_parts: 0, duration_seconds: null })], {}]);
    const r = await resolveRecordingEvidence(PROJECT, 'PREP-2', ATTEMPT);
    expect(r).toEqual({ ok: false, reason: 'not_ready' });
  });

  it('refuses a non-uuid without going near the database', async () => {
    const r = await resolveRecordingEvidence(PROJECT, 'PREP-2', "' OR 1=1 --");
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });

  it('pins the attempt to this project AND this task, not just the attempt id', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    await resolveRecordingEvidence(PROJECT, 'PREP-2', ATTEMPT);
    const [sql, opts] = q.mock.calls[0];
    expect(String(sql)).toMatch(/s\.project_id = :projectId/);
    expect(String(sql)).toMatch(/s\.story_id = :storyId/);
    expect(String(sql)).toMatch(/JOIN presentation_assignments/);
    expect((opts as any).replacements).toEqual({ projectId: PROJECT, storyId: 'PREP-2', attemptId: ATTEMPT });
  });

  it('excludes parts known to be missing or failed', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    await resolveRecordingEvidence(PROJECT, 'PREP-2', ATTEMPT);
    expect(String(q.mock.calls[0][0])).toMatch(/ingest_status NOT IN \('missing', 'failed'\)/);
  });
});

describe('listing the takes a student can hand in', () => {
  it('offers only attempts whose recording actually arrived', async () => {
    q.mockResolvedValueOnce([[row(), row({ attempt_id: '99999999-2222-4333-8444-555555555555', attempt_no: 1 })], {}]);
    const list = await listRecordedAttempts(PROJECT, 'PREP-2');
    expect(list).toHaveLength(2);
    expect(String(q.mock.calls[0][0])).toMatch(/HAVING COUNT\(r\.id\) FILTER/);
  });

  it('a duration no part reported is null, not zero', async () => {
    q.mockResolvedValueOnce([[row({ duration_seconds: null })], {}]);
    const [a] = await listRecordedAttempts(PROJECT, 'PREP-2');
    expect(a.durationSeconds).toBeNull();
  });

  it('nothing recorded is an empty list, not an error', async () => {
    q.mockResolvedValueOnce([[], {}]);
    await expect(listRecordedAttempts(PROJECT, 'PREP-2')).resolves.toEqual([]);
  });
});

describe('ownership', () => {
  it('a project that is not yours is indistinguishable from one that does not exist', async () => {
    mockTree.mockResolvedValue(null);
    const r = await listRecordedAttemptsForOwner('enr-1', 'someone-elses', 'PREP-2');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });

  it('proves ownership BEFORE reading any attempt', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    const r = await listRecordedAttemptsForOwner('enr-1', PROJECT, 'PREP-2');
    expect(mockTree).toHaveBeenCalledWith('enr-1', PROJECT);
    expect(r.ok).toBe(true);
  });
});

/**
 * What a take actually contains.
 *
 * A recording with no audio is still the student's recording and is still offered —
 * hiding it helps nobody. It is offered WITH the warning, so handing in a silent
 * video is a choice rather than an accident discovered by a reviewer.
 */
describe('saying what is actually on the recording', () => {
  it('warns about a take with no audio, and one with no shared screen', () => {
    expect(describeTakeContents(false, true).warnings).toEqual([
      'This recording has no audio track. Nobody reviewing it will hear you.',
    ]);
    expect(describeTakeContents(true, false).warnings).toEqual([
      'This recording has no shared screen — it is camera only, so your demo will not be visible.',
    ]);
    expect(describeTakeContents(false, false).warnings).toHaveLength(2);
  });

  /**
   * THE RULE. Zoom does not always tell us what a file contains. Reporting "we do
   * not know" as "no audio" would send a student to re-record a perfectly good take.
   */
  it('says nothing when the provider did not tell us — null is not false', () => {
    expect(describeTakeContents(null, null)).toEqual({ hasAudio: null, hasSharedScreen: null, warnings: [] });
    expect(describeTakeContents(undefined, undefined).warnings).toEqual([]);
    expect(describeTakeContents(true, true).warnings).toEqual([]);
  });

  it('carries the flags and the warning through to the picker', async () => {
    q.mockResolvedValueOnce([[row({ has_audio: false, has_shared_screen: true })], {}]);
    const [a] = await listRecordedAttempts(PROJECT, 'PREP-2');
    expect(a.hasAudio).toBe(false);
    expect(a.warnings).toHaveLength(1);
    expect(a.recoveredFromLink).toBe(false);
  });

  // A take the student pointed us at is not one we captured, and a reviewer must be
  // able to tell. Nobody fetched it or checked what is on the other end.
  it('marks a take the student recovered by link', async () => {
    q.mockResolvedValueOnce([[row({ recovered: true })], {}]);
    const [a] = await listRecordedAttempts(PROJECT, 'PREP-2');
    expect(a.recoveredFromLink).toBe(true);
  });

  it('asks the database for the flags across parts with bool_or, not just the first part', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    await listRecordedAttempts(PROJECT, 'PREP-2');
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toMatch(/bool_or\(r\.has_audio\)/);
    expect(sql).toMatch(/bool_or\(r\.has_shared_screen\)/);
  });
});
