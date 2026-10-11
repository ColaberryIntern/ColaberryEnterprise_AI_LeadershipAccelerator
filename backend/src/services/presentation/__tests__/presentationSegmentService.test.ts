jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../models/PresentationAssignment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import { segmentForAttempt } from '../presentationSegmentService';

const q = sequelize.query as unknown as jest.Mock;
const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const assignments = PresentationAssignment as unknown as { findOne: jest.Mock };

/**
 * Demo day is ONE recording of eleven presenters. Handing a student that file and
 * calling it "your demo" is false twice over: most of it is other people, and some
 * of those people did not agree to appear on someone else's task.
 */

const row = (over: Record<string, unknown> = {}) => ({
  recording_id: 'rec-1',
  occurrence_uuid: 'OCC==',
  rec_starts_at: '2026-11-20T19:00:00Z',
  rec_ends_at: '2026-11-20T20:00:00Z',
  slot_starts_at: '2026-11-20T19:10:00Z',
  duration_seconds: 300,
  presenter_count: 11,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  mockTree.mockResolvedValue({ id: 'p1', name: 'Load Intake Agent', lists: [] });
  assignments.findOne.mockResolvedValue({ id: 'as1' });
});

describe('a cohort recording is pointed INTO, never handed over as "your demo"', () => {
  it('returns the offset of this presenter, in seconds from the recording start', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');

    expect(r.ok).toBe(true);
    if (!r.ok || !r.segment) return;
    // 19:10 is ten minutes into a recording that began at 19:00.
    expect(r.segment.startOffsetSeconds).toBe(600);
    expect(r.segment.endOffsetSeconds).toBe(900);
  });

  it('says the range is an ESTIMATE, because it comes from the schedule not the video', async () => {
    // Presenters start late, run over and swap order. A range presented as fact
    // sends a reviewer to the wrong ninety seconds and makes them doubt the
    // recording rather than the timestamp.
    q.mockResolvedValueOnce([[row()], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    if (!r.ok || !r.segment) return;
    expect(r.segment.estimated).toBe(true);
    expect(r.segment.basis).toBe('scheduled_slot');
  });

  it('states plainly that no clip exists, rather than implying one is coming', async () => {
    // There is no video-cutting pipeline here. "clipAvailable: false" must not be
    // mistaken for "still processing".
    q.mockResolvedValueOnce([[row()], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    if (!r.ok || !r.segment) return;
    expect(r.segment.clipAvailable).toBe(false);
    expect(r.segment.clipNote).toMatch(/cannot cut it into a separate clip/i);
  });

  it('flags that the recording contains other people', async () => {
    q.mockResolvedValueOnce([[row({ presenter_count: 11 })], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    if (!r.ok || !r.segment) return;
    expect(r.segment.sharedWithOthers).toBe(true);
  });

  it('does not claim sharing when the student presented alone', async () => {
    q.mockResolvedValueOnce([[row({ presenter_count: 1 })], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    if (!r.ok || !r.segment) return;
    expect(r.segment.sharedWithOthers).toBe(false);
  });
});

describe('it refuses to invent a number it does not have', () => {
  it('returns no segment when the recording has no start time', async () => {
    // Offsetting from an unknown origin would produce a confident, wrong number.
    q.mockResolvedValueOnce([[row({ rec_starts_at: null })], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    expect(r).toEqual({ ok: true, segment: null });
  });

  it('returns no segment when the slot has no start time', async () => {
    q.mockResolvedValueOnce([[row({ slot_starts_at: null })], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    expect(r).toEqual({ ok: true, segment: null });
  });

  it('clamps to zero rather than reporting a negative offset', async () => {
    // A slot that begins before the recording did cannot put the presenter at
    // minute -3 of the video.
    q.mockResolvedValueOnce([[row({ slot_starts_at: '2026-11-20T18:55:00Z' })], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    if (!r.ok || !r.segment) return;
    expect(r.segment.startOffsetSeconds).toBe(0);
  });

  it('falls back to a default length rather than a zero-length segment', async () => {
    q.mockResolvedValueOnce([[row({ duration_seconds: null })], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    if (!r.ok || !r.segment) return;
    expect(r.segment.endOffsetSeconds).toBeGreaterThan(r.segment.startOffsetSeconds);
  });

  it('returns no segment when nothing has been recorded for this task', async () => {
    q.mockResolvedValueOnce([[], {}]);
    const r = await segmentForAttempt('e1', 'p1', 'PREP-6');
    expect(r).toEqual({ ok: true, segment: null });
  });

  it('excludes recordings known to be missing or failed', async () => {
    q.mockResolvedValueOnce([[row()], {}]);
    await segmentForAttempt('e1', 'p1', 'PREP-6');
    expect(String(q.mock.calls[0][0])).toMatch(/ingest_status NOT IN \('missing', 'failed'\)/);
  });
});

describe('ownership', () => {
  it('a project that is not yours is indistinguishable from one that does not exist', async () => {
    mockTree.mockResolvedValue(null);
    const r = await segmentForAttempt('e1', 'someone-elses', 'PREP-6');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });
});
