/**
 * The monthly batch model's room rules (C10.14, Ali 2026-11-06):
 *
 *   "Each batch should have their own room that only they can see and staff.
 *    1st meeting will be on their batch but after that they will use shared rooms."
 *
 * `detectDayKind` is deliberately NOT mocked. It is the policy - the real
 * question these tests ask is "does a November open house get treated as the
 * batch's first meeting", and a mocked day-kind would answer whatever the mock
 * said rather than whatever the code does. kitSpec declares itself pure (no DB,
 * no I/O), so using the real one costs nothing.
 */

jest.mock('../../services/communityRooms/roomOutboxService', () => ({ emitRoomEvent: jest.fn() }));
jest.mock('../../models/CommunityRoom', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));

import CommunityRoom from '../../models/CommunityRoom';
import { emitRoomEvent } from '../../services/communityRooms/roomOutboxService';
import {
  cohortRoomSlug,
  ensureRoomForCohort,
  isBatchCohort,
  sessionRoomPrivacy,
} from '../../services/communityRooms/cohortRoomService';

const findOrCreate = (CommunityRoom as any).findOrCreate as jest.Mock;
const emit = emitRoomEvent as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findOrCreate.mockResolvedValue([{ id: 'room-1' }, true]);
});

describe('sessionRoomPrivacy — the first meeting is the batch orientation', () => {
  it('keeps the orientation private to the batch', () => {
    expect(sessionRoomPrivacy({ title: 'Orientation — Welcome to the Accelerator', session_date: '2026-12-07' }))
      .toBe('cohort');
  });

  it('opens every later session to all batches', () => {
    expect(sessionRoomPrivacy({ title: 'Week 3 · Build Day — Claude API', session_date: '2027-01-15' }))
      .toBe('public');
    expect(sessionRoomPrivacy({ title: 'Week 5 · Architecture Day — MCP Foundations', session_date: '2027-02-01' }))
      .toBe('public');
  });

  /**
   * THE REGRESSION THIS RULE EXISTS FOR. `session_number === 1` is the obvious
   * reading of "1st meeting" and is wrong on the one batch that runs next: the
   * November 2026 cohort's session 1 is this open house, dated 2026-10-29, five
   * weeks BEFORE its 7 December orientation. Keying on the ordinal would shut a
   * prospect-facing marketing event to one batch and open the real orientation
   * to everyone - backwards on both counts.
   */
  it('does not treat a prospect-facing open house as the batch meeting, even as session 1', () => {
    expect(sessionRoomPrivacy({ title: 'Open House — The Forward Deployed Engineer', session_date: '2026-10-29' }))
      .toBe('public');
  });

  it('treats an untitled session as shared rather than accidentally private', () => {
    expect(sessionRoomPrivacy({ title: '', session_date: '2027-01-04' })).toBe('public');
    expect(sessionRoomPrivacy({})).toBe('public');
  });

  it('matches the orientation case-insensitively and mid-title', () => {
    expect(sessionRoomPrivacy({ title: 'January 2027 ORIENTATION', session_date: '2027-02-01' })).toBe('cohort');
  });
});

describe('isBatchCohort — only accelerator cohorts are batches', () => {
  it('accepts an accelerator cohort', () => {
    expect(isBatchCohort({ id: 'c1', name: 'Cohort - December 2026', cohort_type: 'accelerator' })).toBe(true);
  });

  /**
   * The Explorer pool carries 473 enrollments, 433 of them active. A "batch
   * room" there is a room for every lead the platform has ever captured, which
   * is not a batch room at all. The internship already has its own hand-made
   * persistent cohort room (`ai-internship-standup`).
   */
  it('refuses the Explorer prospect pool and the internship', () => {
    expect(isBatchCohort({ id: 'c2', name: 'Explorer — Prospects', cohort_type: 'explorer' })).toBe(false);
    expect(isBatchCohort({ id: 'c3', name: 'AI Internship', cohort_type: 'ai_internship' })).toBe(false);
  });

  it('treats a missing cohort_type as a batch, matching the column default', () => {
    expect(isBatchCohort({ id: 'c4', name: 'Cohort - March 2027' })).toBe(true);
    expect(isBatchCohort({ id: 'c5', name: 'Cohort - April 2027', cohort_type: null })).toBe(true);
  });
});

describe('cohortRoomSlug', () => {
  it('is deterministic, so the room can be found again', () => {
    expect(cohortRoomSlug('abc-123')).toBe('cohort-abc-123');
    expect(cohortRoomSlug('abc-123')).toBe(cohortRoomSlug('abc-123'));
  });
});

describe('ensureRoomForCohort', () => {
  const batch = { id: 'cohort-uuid', name: 'Cohort - December 2026', cohort_type: 'accelerator' };

  it('creates the batch room private to the batch, and browsable', async () => {
    await ensureRoomForCohort(batch);

    const arg = findOrCreate.mock.calls[0][0];
    expect(arg.where).toEqual({ slug: 'cohort-cohort-uuid' });
    expect(arg.defaults.privacy).toBe('cohort');
    expect(arg.defaults.linked_cohort_id).toBe('cohort-uuid');
    expect(arg.defaults.category).toBe('your_cohort');
    expect(arg.defaults.is_system).toBe(true);
    expect(arg.defaults.created_by).toBe('system');
  });

  /**
   * `listRoomsForViewer` excludes room_type ['dm','scheduled'] from the browse
   * rail, so a 'scheduled' batch room would exist and be unfindable - the
   * per-session rooms have always been in exactly that position.
   */
  it('is persistent, which is the only room_type the browse rail shows', async () => {
    await ensureRoomForCohort(batch);
    expect(findOrCreate.mock.calls[0][0].defaults.room_type).toBe('persistent');
  });

  it('keys on the slug, not on linked_cohort_id', async () => {
    // linked_cohort_id is written by createRoom for ANY member-created room and
    // by dmService for DMs, so it cannot identify the batch's own room.
    await ensureRoomForCohort(batch);
    expect(findOrCreate.mock.calls[0][0].where).not.toHaveProperty('linked_cohort_id');
  });

  it('does nothing for a cohort that is not a batch', async () => {
    const room = await ensureRoomForCohort({ id: 'c2', name: 'Explorer — Prospects', cohort_type: 'explorer' });
    expect(room).toBeNull();
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it('announces the room once on create and never on a re-run', async () => {
    await ensureRoomForCohort(batch);
    expect(emit).toHaveBeenCalledTimes(1);

    emit.mockClear();
    findOrCreate.mockResolvedValue([{ id: 'room-1' }, false]);
    const again = await ensureRoomForCohort(batch);

    expect(again).toEqual({ id: 'room-1' });
    expect(emit).not.toHaveBeenCalled();
  });
});
