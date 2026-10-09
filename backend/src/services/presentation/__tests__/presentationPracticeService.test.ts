jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../models/PresentationAssignment', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../../models/PresentationAttempt', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../models/RoomBooking', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../presentationCapacityService', () => ({
  reserveSlot: jest.fn(),
  releaseSlot: jest.fn(),
}));
jest.mock('../../communityRooms/roomBookingService', () => ({ createBooking: jest.fn() }));

import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import PresentationAttempt from '../../../models/PresentationAttempt';
import RoomBooking from '../../../models/RoomBooking';
import { reserveSlot, releaseSlot } from '../presentationCapacityService';
import { createBooking } from '../../communityRooms/roomBookingService';
import { startPracticeAttempt, abandonPracticeAttempt } from '../presentationPracticeService';

const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const assignments = PresentationAssignment as unknown as { findOne: jest.Mock };
const attempts = PresentationAttempt as unknown as {
  findAll: jest.Mock; findOne: jest.Mock; findByPk: jest.Mock; create: jest.Mock;
};
const bookings = RoomBooking as unknown as { findByPk: jest.Mock; findOne: jest.Mock };
const reserve = reserveSlot as unknown as jest.Mock;
const release = releaseSlot as unknown as jest.Mock;
const book = createBooking as unknown as jest.Mock;

const START = new Date('2026-11-04T19:00:00Z');
const END = new Date('2026-11-04T19:30:00Z');

function attemptRow(over: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    id: 'at1', assignment_id: 'as1', attempt_no: 1, mode: 'practice_solo',
    booking_id: null, room_id: null, attempt_state: 'draft', recording_state: 'expected',
    ended_at: null, ...over,
  };
  (r as any).update = jest.fn(async (p: Record<string, unknown>) => { Object.assign(r, p); return r; });
  return r;
}

const uniqueViolation = () =>
  Object.assign(new Error('duplicate key value violates unique constraint "presentation_attempts_unique_try"'),
    { parent: { code: '23505' } });

const input = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-4',
  startAt: START, endAt: END, ...over,
}) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockTree.mockResolvedValue({ id: 'p1', name: 'Load Intake Agent', lists: [] });
  assignments.findOne.mockResolvedValue({ id: 'as1', project_id: 'p1', story_id: 'PREP-4' });
  attempts.findAll.mockResolvedValue([]);
  attempts.create.mockImplementation(async (v: Record<string, unknown>) => attemptRow(v));
  reserve.mockResolvedValue({ ok: true, reservationId: 'res1', startAt: START, endAt: END });
  book.mockResolvedValue({ id: 'b1', room_id: 'r1', title: 'Practice: Load Intake Agent', meeting_link: null, state: 'scheduled', related_project_id: 'p1' });
  release.mockResolvedValue(true);
});

describe('a rehearsal is private, and the slot is really reserved', () => {
  it('reserves the single Zoom host before creating any room', async () => {
    // The whole point of PR 2902 was an exclusion constraint nothing called.
    const r = await startPracticeAttempt(input());
    expect(r.ok).toBe(true);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve.mock.calls[0][0]).toMatchObject({
      enrollmentId: 'e1', startAt: START, endAt: END, mode: 'practice_solo', assignmentId: 'as1',
    });
  });

  it('books the room PRIVATE — the service default is public and would publish it', async () => {
    await startPracticeAttempt(input());
    expect(book).toHaveBeenCalledTimes(1);
    expect(book.mock.calls[0][1]).toMatchObject({ privacy: 'private', variant: 'demo', related_project_id: 'p1' });
  });

  it('keys the booking off the attempt so a retry reuses one room, not two', async () => {
    await startPracticeAttempt(input());
    expect(book.mock.calls[0][1].idempotency_key).toBe('presentation-attempt-at1');
  });

  it('hands back a truthful next-available time instead of a bare refusal', async () => {
    const next = new Date('2026-11-04T20:00:00Z');
    reserve.mockResolvedValue({ ok: false, reason: 'class_window', nextAvailable: next, message: 'A class owns the host then.' });

    const r = await startPracticeAttempt(input());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('slot_unavailable');
    if (r.reason !== 'slot_unavailable') return;
    expect(r.why).toBe('class_window');
    expect(r.nextAvailable).toBe(next.toISOString());
    // And no room was created for a session that cannot happen.
    expect(book).not.toHaveBeenCalled();
  });
});

describe('the slot is given back when the room cannot be made', () => {
  it('releases the reservation if createBooking throws', async () => {
    // Otherwise the host is held for half an hour for a meeting that never existed,
    // and the next student is told "taken" about a ghost.
    book.mockRejectedValue(new Error('zoom unavailable'));

    await expect(startPracticeAttempt(input())).rejects.toThrow('zoom unavailable');

    expect(release).toHaveBeenCalledWith('res1', 'booking_failed');
  });

  it('does not release the slot when everything succeeds', async () => {
    await startPracticeAttempt(input());
    expect(release).not.toHaveBeenCalled();
  });
});

describe('double-click makes one attempt; a deliberate retry makes another', () => {
  it('a racing second insert reads back the winner rather than making a second take', async () => {
    attempts.create.mockRejectedValueOnce(uniqueViolation());
    const winner = attemptRow({ id: 'at-winner', attempt_no: 1 });
    attempts.findOne.mockResolvedValue(winner);

    const r = await startPracticeAttempt(input());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(r.session.attemptId).toBe('at-winner');
    // One insert attempted, none retried at a higher number.
    expect(attempts.create).toHaveBeenCalledTimes(1);
    expect(attempts.findOne).toHaveBeenCalledWith({ where: { assignment_id: 'as1', attempt_no: 1 } });
  });

  it('resumes the open take instead of opening a second one', async () => {
    attempts.findAll.mockResolvedValue([attemptRow({ id: 'at-open', attempt_no: 2, attempt_state: 'draft' })]);
    const r = await startPracticeAttempt(input());
    expect(attempts.create).not.toHaveBeenCalled();
    if (!r.ok) return;
    expect(r.session.attemptId).toBe('at-open');
  });

  it('a deliberate retry allocates the NEXT number, leaving the earlier take alone', async () => {
    const earlier = attemptRow({ id: 'at1', attempt_no: 1, attempt_state: 'recorded', ended_at: new Date() });
    attempts.findAll.mockResolvedValue([earlier]);

    const r = await startPracticeAttempt(input({ newAttempt: true }));

    expect(attempts.create).toHaveBeenCalledTimes(1);
    expect(attempts.create.mock.calls[0][0]).toMatchObject({ assignment_id: 'as1', attempt_no: 2 });
    if (!r.ok) return;
    expect(r.created).toBe(true);
    // Previous evidence retained: the earlier attempt was never written to.
    expect((earlier as any).update).not.toHaveBeenCalled();
  });

  it('a repeat click on an already-booked take reserves nothing', async () => {
    attempts.findAll.mockResolvedValue([attemptRow({ id: 'at9', attempt_no: 9, booking_id: 'b1', attempt_state: 'scheduled' })]);
    bookings.findByPk.mockResolvedValue({ id: 'b1', room_id: 'r1', meeting_link: 'x', state: 'scheduled', related_project_id: 'p1' });

    const r = await startPracticeAttempt(input());

    expect(reserve).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(r.session.bookingId).toBe('b1');
  });
});

describe('ownership', () => {
  it('a project that is not yours is indistinguishable from one that does not exist', async () => {
    mockTree.mockResolvedValue(null);
    const r = await startPracticeAttempt(input({ projectId: 'someone-elses' }));
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    // Nothing reserved, nothing booked, nothing written.
    expect(reserve).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it('abandoning someone elses attempt releases nothing', async () => {
    mockTree.mockResolvedValue(null);
    const r = await abandonPracticeAttempt('e1', 'not-mine', 'at1', 'res1');
    expect(r).toEqual({ ok: false });
    expect(release).not.toHaveBeenCalled();
  });
});

describe('abandoning a take', () => {
  it('gives the slot back but keeps the attempt number spent', async () => {
    const row = attemptRow({ id: 'at1', attempt_no: 1, booking_id: 'b1' });
    attempts.findByPk.mockResolvedValue(row);

    const r = await abandonPracticeAttempt('e1', 'p1', 'at1', 'res1');

    expect(r).toEqual({ ok: true });
    expect(release).toHaveBeenCalledWith('res1', 'abandoned_by_student');
    // Cleared of its room, but still row attempt_no 1 — the next take is genuinely
    // a later take, and anything already attached to this one survives.
    expect((row as any).update).toHaveBeenCalledWith({ attempt_state: 'draft', booking_id: null, room_id: null });
    expect(row.attempt_no).toBe(1);
  });
});
