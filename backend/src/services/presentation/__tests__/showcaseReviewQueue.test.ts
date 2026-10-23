jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret-value' } }));

import { sequelize } from '../../../config/database';
import { listPendingShowcases } from '../showcaseReviewQueue';
import { verifyRecordingTicket, isStaffTicket } from '../recordingTicket';

const q = sequelize.query as unknown as jest.Mock;

/**
 * THE QUEUE THAT HAD NO CALLER.
 *
 * This service shipped on 2026-10-18 with no route, no screen and no tests, so
 * for five days "waiting for staff approval" meant waiting for somebody to run
 * a query by hand. These tests exist partly to make sure the shape it returns is
 * the shape the screen needs — the previous version could say "3 takes on this
 * attempt" but not WHICH take was being published, which is the only thing a
 * reviewer is actually deciding about.
 */

const REC = 'aaaaaaa1-1111-4111-8111-111111111111';
const STAFF = 'ali@colaberry.com';

const dbRow = (over: Record<string, unknown> = {}) => ({
  showcase_id: 'cafe0000-0000-4000-8000-000000000001',
  attempt_id: 'bbbbbbb2-2222-4222-8222-222222222222',
  recording_id: REC,
  summary: 'The booking email becoming a load record.',
  current_content_hash: 'h1',
  content_hash: 'h1',
  author_approved_at: '2026-10-21T09:00:00Z',
  project_id: '6e4bd9da-a22b-4b90-b5b2-55686487f39f',
  story_id: 'PREP-4',
  cohort_id: 'ccccccc3-3333-4333-8333-333333333333',
  template_slug: 'ai_visual_presentation',
  learner_name: 'Paul Sane',
  learner_email: 'paulsane@yahoo.com',
  cohort_name: 'Cohort 12',
  shown_type: 'working_system_demo',
  shown_duration: 94,
  recording_count: '3',
  ...over,
});

beforeEach(() => { jest.clearAllMocks(); });

const run = async (rows: Array<Record<string, unknown>>) => {
  q.mockResolvedValueOnce([rows, undefined]);
  return listPendingShowcases(STAFF);
};

describe('what the reviewer is shown', () => {
  it('names the ONE take being published, not just the attempt', async () => {
    const [row] = await run([dbRow()]);
    expect(row.recordingId).toBe(REC);
    // The attempt has three takes; the duration shown is the published one's.
    expect(row.recordingCount).toBe(3);
    expect(row.durationSeconds).toBe(94);
  });

  it('carries the learner, the cohort and the summary', async () => {
    const [row] = await run([dbRow()]);
    expect(row.learnerName).toBe('Paul Sane');
    expect(row.cohortName).toBe('Cohort 12');
    expect(row.summary).toContain('booking email');
  });

  it('uses the take\'s own type when it has one', async () => {
    const [row] = await run([dbRow()]);
    expect(row.typeId).toBe('working_system_demo');
    expect(row.typeLabel).toBe('Working-system demo');
  });

  it('falls back to the task\'s type when the take is unclassified', async () => {
    // Every recording in production today has a NULL presentation_type, so this
    // is the normal path rather than an edge case.
    const [row] = await run([dbRow({ shown_type: null })]);
    expect(row.typeId).toBe('ai_visual_presentation');
    expect(row.typeLabel).toBe('AI visual presentation');
  });

  it('shows an unknown type id rather than dropping it', async () => {
    const [row] = await run([dbRow({ shown_type: 'something_retired' })]);
    expect(row.typeLabel).toBe('something_retired');
  });
});

describe('the playback ticket', () => {
  it('issues a staff-scoped ticket bound to the published recording', async () => {
    const [row] = await run([dbRow()]);
    expect(row.playbackUrl).toContain(`/api/admin/presentation/recordings/${REC}/file?t=`);

    const t = decodeURIComponent(row.playbackUrl!.split('t=')[1]);
    const claims = verifyRecordingTicket(t);
    expect(isStaffTicket(claims)).toBe(true);
    expect(claims!.recordingId).toBe(REC);
    expect(claims!.staffIdentity).toBe(STAFF);
  });

  it('points the poster at the same recording', async () => {
    const [row] = await run([dbRow()]);
    expect(row.thumbnailUrl).toContain(`/api/admin/presentation/recordings/${REC}/thumbnail?t=`);
  });

  it('gives the reviewer longer than a learner gets', async () => {
    const [row] = await run([dbRow()]);
    const t = decodeURIComponent(row.playbackUrl!.split('t=')[1]);
    const claims = verifyRecordingTicket(t)!;
    // 30 minutes, not 10: a ticket that dies mid-review sends them back to the
    // queue to start again.
    const ttl = claims.exp - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(1500);
  });

  it('offers no player when the showcase names no recording', async () => {
    const [row] = await run([dbRow({ recording_id: null })]);
    expect(row.recordingId).toBeNull();
    expect(row.playbackUrl).toBeNull();
    expect(row.thumbnailUrl).toBeNull();
  });
});

describe('stale approvals', () => {
  it('flags a take that changed after the learner asked', async () => {
    const [row] = await run([dbRow({ content_hash: 'h1', current_content_hash: 'h2' })]);
    expect(row.stale).toBe(true);
  });

  it('does not flag a missing hash as a change', async () => {
    const [row] = await run([dbRow({ content_hash: null, current_content_hash: 'h2' })]);
    expect(row.stale).toBe(false);
  });
});

describe('the query', () => {
  it('asks only for requests the author made and staff have not answered', async () => {
    await run([]);
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain('s.author_approved_at IS NOT NULL');
    expect(sql).toContain('s.staff_approved_at  IS NULL');
    expect(sql).toContain('s.withdrawn_at       IS NULL');
  });

  it('returns the longest wait first, so nothing starves', async () => {
    await run([]);
    expect(String(q.mock.calls[0][0])).toContain('ORDER BY s.author_approved_at ASC');
  });

  it('returns an empty list rather than throwing when nothing is pending', async () => {
    await expect(run([])).resolves.toEqual([]);
  });
});
