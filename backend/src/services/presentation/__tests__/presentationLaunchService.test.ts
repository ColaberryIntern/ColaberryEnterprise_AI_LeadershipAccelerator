jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../models/PresentationAssignment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/PresentationAttempt', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/RoomBooking', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../communityRooms/roomBookingService', () => ({ joinBooking: jest.fn() }));

import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import PresentationAttempt from '../../../models/PresentationAttempt';
import RoomBooking from '../../../models/RoomBooking';
import { joinBooking } from '../../communityRooms/roomBookingService';
import { launchAttempt } from '../presentationLaunchService';

const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const assignments = PresentationAssignment as unknown as { findOne: jest.Mock };
const attempts = PresentationAttempt as unknown as { findByPk: jest.Mock };
const bookings = RoomBooking as unknown as { findByPk: jest.Mock };
const join = joinBooking as unknown as jest.Mock;

function attemptRow(over: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    id: 'at1', assignment_id: 'as1', attempt_no: 1, mode: 'practice_solo',
    booking_id: 'b1', join_intent_at: null, ...over,
  };
  (r as any).update = jest.fn(async (p: Record<string, unknown>) => { Object.assign(r, p); return r; });
  return r;
}

const bookingRow = (over: Record<string, unknown> = {}) => ({
  id: 'b1', room_id: 'r1', privacy: 'private', recording_policy: 'always', ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-4', attemptId: 'at1', ...over,
}) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockTree.mockResolvedValue({ id: 'p1', name: 'Load Intake Agent', lists: [] });
  assignments.findOne.mockResolvedValue({ id: 'as1' });
  attempts.findByPk.mockResolvedValue(attemptRow());
  bookings.findByPk.mockResolvedValue(bookingRow());
  join.mockResolvedValue({ join_url: 'https://zoom.us/j/123', state: 'scheduled' });
});

describe('the link is issued at the moment it is asked for', () => {
  it('returns the join URL and records that the student meant to join', async () => {
    const row = attemptRow();
    attempts.findByPk.mockResolvedValue(row);

    const r = await launchAttempt(input());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.joinUrl).toBe('https://zoom.us/j/123');
    expect((row as any).update).toHaveBeenCalledWith({ join_intent_at: expect.any(Date) });
  });

  it('goes through joinBooking, which re-checks entitlement on this call', async () => {
    await launchAttempt(input());
    expect(join).toHaveBeenCalledTimes(1);
    expect(join.mock.calls[0][0]).toMatchObject({ enrollmentId: 'e1' });
    expect(join.mock.calls[0][1]).toBe('b1');
  });

  it('tells the student who can see the room and that it records itself', async () => {
    const r = await launchAttempt(input());
    if (!r.ok) return;
    expect(r.brief.whoCanSee).toMatch(/only you/i);
    expect(r.brief.recordingAutomatic).toBe(true);
  });

  it('does not claim automatic recording when the policy only asks', async () => {
    bookings.findByPk.mockResolvedValue(bookingRow({ recording_policy: 'ask' }));
    const r = await launchAttempt(input());
    if (!r.ok) return;
    expect(r.brief.recordingAutomatic).toBe(false);
  });

  it('says a cohort room is visible to the cohort, not "only you"', async () => {
    bookings.findByPk.mockResolvedValue(bookingRow({ privacy: 'cohort' }));
    const r = await launchAttempt(input());
    if (!r.ok) return;
    expect(r.brief.whoCanSee).toMatch(/cohort/i);
  });
});

describe('the attendance award is not a faucet', () => {
  it('suppresses the award for a solo rehearsal the student minted themselves', async () => {
    // joinBooking pays 5 points per BOOKING. A learner can create a fresh practice
    // room whenever they like, so "book, join, repeat" would print points.
    await launchAttempt(input());
    expect(join.mock.calls[0][2]).toEqual({ recognize: false });
  });

  it('suppresses it for peer practice too — that booking is also student-created', async () => {
    attempts.findByPk.mockResolvedValue(attemptRow({ mode: 'practice_peer' }));
    await launchAttempt(input());
    expect(join.mock.calls[0][2]).toEqual({ recognize: false });
  });

  it('still awards it for the cohort session an instructor scheduled', async () => {
    attempts.findByPk.mockResolvedValue(attemptRow({ mode: 'cohort_live' }));
    await launchAttempt(input());
    expect(join.mock.calls[0][2]).toEqual({ recognize: true });
  });
});

describe('what it refuses, and how quietly', () => {
  it('a project that is not yours never reaches the room layer', async () => {
    mockTree.mockResolvedValue(null);
    const r = await launchAttempt(input({ projectId: 'someone-elses' }));
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(join).not.toHaveBeenCalled();
  });

  it('an attempt belonging to a different assignment is not_found, never forbidden', async () => {
    // Attempt ids are guessable. Owning the PROJECT does not prove ownership of an
    // arbitrary attempt row, and a 403 here would confirm the row exists.
    attempts.findByPk.mockResolvedValue(attemptRow({ assignment_id: 'as-someone-else' }));
    const r = await launchAttempt(input());
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(join).not.toHaveBeenCalled();
  });

  it('says not_booked when the take has no room yet', async () => {
    attempts.findByPk.mockResolvedValue(attemptRow({ booking_id: null }));
    const r = await launchAttempt(input());
    expect(r).toEqual({ ok: false, reason: 'not_booked' });
  });

  it('says not_ready — truthfully — while the outbox is still provisioning', async () => {
    join.mockResolvedValue({ join_url: null, state: 'scheduled' });
    const r = await launchAttempt(input());
    expect(r).toEqual({ ok: false, reason: 'not_ready' });
  });

  it('maps a room-entitlement refusal to not_authorized rather than crashing', async () => {
    join.mockRejectedValue(Object.assign(new Error('You are not authorized to join this session'), { status: 403 }));
    const r = await launchAttempt(input());
    expect(r).toEqual({ ok: false, reason: 'not_authorized' });
  });

  it('lets an unexpected error through instead of reporting it as a refusal', async () => {
    join.mockRejectedValue(new Error('connection terminated'));
    await expect(launchAttempt(input())).rejects.toThrow('connection terminated');
  });
});
