jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CommunityMember', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
const mockPublish = jest.fn();
jest.mock('../showcaseService', () => ({
  ...jest.requireActual('../showcaseService'),
  publishShowcase: (...a: any[]) => mockPublish(...a),
}));

import { sequelize } from '../../../config/database';
import CommunityMember from '../../../models/CommunityMember';
import { requestShare, staffApprove, announceToCommunity, approveAndPublish } from '../showcaseLifecycle';

const q = sequelize.query as unknown as jest.Mock;
const findMember = (CommunityMember as unknown as { findOne: jest.Mock }).findOne;

/**
 * The three steps nothing could perform, and the one that joins them.
 *
 * Phase 6 built publish, withdraw and the entire access model for rows no code ever
 * inserted — `canPublish` guarded a state unreachable by any path. These are the
 * steps that make the other half mean something, so the properties that matter are
 * about WHO approves and HOW MANY TIMES anything happens: a demo posted twice is
 * visible to thirty people before anyone can delete it.
 */

const ATTEMPT = '11111111-1111-1111-1111-111111111111';
const SHOWCASE = '22222222-2222-2222-2222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COHORT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeEach(() => { jest.clearAllMocks(); q.mockReset(); });

describe('the author asks', () => {
  it('records the request and the AUTHOR approval only', async () => {
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]);
    const r = await requestShare({
      enrollmentId: OWNER, attemptId: ATTEMPT, cohortId: COHORT,
      draftSummary: 'A courier routing demo.', recordingIds: [ATTEMPT],
    });
    expect(r).toEqual({ ok: true, showcaseId: SHOWCASE, created: true });

    const [sql] = q.mock.calls[0];
    // Author approval is set here; staff approval is NOT. One column doing both
    // would let either party publish alone.
    expect(String(sql)).toContain('author_approved_at');
    expect(String(sql)).not.toContain('staff_approved_at');
    // Private until somebody approves it. An unapproved request is invisible.
    expect(String(sql)).toContain("'private'");
  });

  it('infers the PARTIAL unique index, or the insert fails outright', async () => {
    // The index is `(attempt_id) WHERE withdrawn_at IS NULL`. A bare
    // `ON CONFLICT (attempt_id)` cannot infer it and Postgres rejects the statement.
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]);
    await requestShare({
      enrollmentId: OWNER, attemptId: ATTEMPT, cohortId: COHORT,
      draftSummary: 'x', recordingIds: [ATTEMPT],
    });
    expect(String(q.mock.calls[0][0])).toContain('ON CONFLICT (attempt_id) WHERE withdrawn_at IS NULL');
  });

  it('asking twice is ONE request, and returns the existing one', async () => {
    q.mockResolvedValueOnce([[], {}]);                    // conflict: nothing inserted
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]);    // the existing row
    const r = await requestShare({
      enrollmentId: OWNER, attemptId: ATTEMPT, cohortId: COHORT,
      draftSummary: 'x', recordingIds: [ATTEMPT],
    });
    expect(r).toEqual({ ok: true, showcaseId: SHOWCASE, created: false });
    // Scoped to the LIVE row: a withdrawn showcase is history, and handing it back
    // would give the caller a dead row that then refuses to publish.
    expect(String(q.mock.calls[1][0])).toContain('withdrawn_at IS NULL');
  });

  it('refuses an empty summary — a showcase needs something readable', async () => {
    const r = await requestShare({
      enrollmentId: OWNER, attemptId: ATTEMPT, cohortId: COHORT,
      draftSummary: '   ', recordingIds: [ATTEMPT],
    });
    expect(r.ok).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });
});

describe('staff approve', () => {
  it('records who vouched, once', async () => {
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]);
    expect(await staffApprove(SHOWCASE, 'staff@colaberry.com')).toBe(true);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements).toMatchObject({ by: 'staff@colaberry.com' });
    // Guarded, so a second click is a no-op rather than moving the timestamp and
    // muddying who signed off when.
    expect(String(sql)).toContain('staff_approved_at IS NULL');
    expect(String(sql)).toContain('withdrawn_at IS NULL');
  });

  it('reports false when nothing changed', async () => {
    q.mockResolvedValueOnce([[], {}]);
    expect(await staffApprove(SHOWCASE, 'staff@colaberry.com')).toBe(false);
  });
});

describe('announcing to the cohort', () => {
  it('posts once, with the demo category and the recording REF', async () => {
    q.mockResolvedValueOnce([[], {}]);                 // no existing post
    q.mockResolvedValueOnce([[{ id: 'post-1' }], {}]); // insert
    const r = await announceToCommunity({
      showcaseId: SHOWCASE, memberId: 'm1', cohortId: COHORT,
      recordingRef: `recording:${ATTEMPT}`, summary: 'A courier routing demo.',
    });
    expect(r).toEqual({ postId: 'post-1', created: true });

    const [sql, opts] = q.mock.calls[1];
    expect(String(sql)).toContain("'demo_video'");
    expect(opts.replacements.meta).toContain(`recording:${ATTEMPT}`);
  });

  it('NEVER puts the video in media_urls', async () => {
    // Community media is res.sendFile with no auth, capped at 8 MB. Uploading a
    // rehearsal there would publish it on an unauthenticated path and break on the
    // larger takes.
    q.mockResolvedValueOnce([[], {}]);
    q.mockResolvedValueOnce([[{ id: 'post-1' }], {}]);
    await announceToCommunity({
      showcaseId: SHOWCASE, memberId: 'm1', cohortId: COHORT,
      recordingRef: `recording:${ATTEMPT}`, summary: 'x',
    });
    const [sql, opts] = q.mock.calls[1];
    expect(String(sql)).not.toContain('media_urls');
    expect(JSON.stringify(opts.replacements)).not.toMatch(/\.mp4|storage_key|https?:\/\//);
  });

  it('IDEMPOTENT: a second announce finds the existing post and inserts nothing', async () => {
    // Double-posting a demo is visible to thirty people before anyone can delete it.
    q.mockResolvedValueOnce([[{ id: 'post-1' }], {}]);
    const r = await announceToCommunity({
      showcaseId: SHOWCASE, memberId: 'm1', cohortId: COHORT,
      recordingRef: `recording:${ATTEMPT}`, summary: 'x',
    });
    expect(r).toEqual({ postId: 'post-1', created: false });
    expect(q).toHaveBeenCalledTimes(1);
  });
});

describe('approve, publish and announce as one decision', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: SHOWCASE, audience: 'private', content_hash: 'h1', current_content_hash: 'h1',
    summary: 'A courier routing demo.', author_approved_at: new Date(), staff_approved_at: new Date(),
    published_at: null, withdrawn_at: null, attempt_id: ATTEMPT,
    owner_enrollment_id: OWNER, cohort_id: COHORT, ...over,
  });

  it('RE-READS the showcase after approving, never trusting the caller', async () => {
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]); // staffApprove
    q.mockResolvedValueOnce([[row()], {}]);            // re-read
    q.mockResolvedValueOnce([[], {}]);                 // announce: none existing
    q.mockResolvedValueOnce([[{ id: 'post-1' }], {}]); // announce: insert
    mockPublish.mockResolvedValue({ ok: true, showcaseId: SHOWCASE, alreadyPublished: false, publicationRef: 'x' });
    findMember.mockResolvedValue({ id: 'm1' });

    const r = await approveAndPublish(SHOWCASE, 'staff@colaberry.com');

    expect(r).toMatchObject({ ok: true, postId: 'post-1' });
    // The SELECT happens after the approval UPDATE: publishing decides on current
    // state, not on what the request believed when it arrived.
    expect(String(q.mock.calls[0][0])).toContain('UPDATE presentation_showcases');
    expect(String(q.mock.calls[1][0])).toContain('SELECT');
  });

  it('refuses to publish when publishShowcase refuses, and posts nothing', async () => {
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]);
    q.mockResolvedValueOnce([[row()], {}]);
    mockPublish.mockResolvedValue({ ok: false, reason: 'It needs both approvals.' });

    const r = await approveAndPublish(SHOWCASE, 'staff@colaberry.com');

    expect(r).toEqual({ ok: false, reason: 'It needs both approvals.' });
    expect(findMember).not.toHaveBeenCalled();
  });

  it('PUBLISHED WITH NO POST is an honest outcome, not a failure', async () => {
    // No community member means the author was never onboarded to the feed. The
    // publication is real; the post simply does not exist, and the caller is told.
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]);
    q.mockResolvedValueOnce([[row()], {}]);
    mockPublish.mockResolvedValue({ ok: true, showcaseId: SHOWCASE, alreadyPublished: false, publicationRef: 'x' });
    findMember.mockResolvedValue(null);

    expect(await approveAndPublish(SHOWCASE, 'staff@colaberry.com'))
      .toEqual({ ok: true, showcaseId: SHOWCASE, postId: null, alreadyPublished: false });
  });

  it('a throwing announce does NOT roll back the publication', async () => {
    // Published is published. A missing post is a retry, and announcing is
    // idempotent, so the retry posts once rather than twice.
    q.mockResolvedValueOnce([[{ id: SHOWCASE }], {}]);
    q.mockResolvedValueOnce([[row()], {}]);
    q.mockRejectedValueOnce(new Error('feed down'));
    mockPublish.mockResolvedValue({ ok: true, showcaseId: SHOWCASE, alreadyPublished: false, publicationRef: 'x' });
    findMember.mockResolvedValue({ id: 'm1' });

    expect(await approveAndPublish(SHOWCASE, 'staff@colaberry.com'))
      .toMatchObject({ ok: true, postId: null });
  });

  it('says so when the showcase does not exist', async () => {
    q.mockResolvedValueOnce([[], {}]);
    q.mockResolvedValueOnce([[], {}]);
    expect(await approveAndPublish(SHOWCASE, 'staff@colaberry.com'))
      .toEqual({ ok: false, reason: 'No such showcase.' });
  });
});
