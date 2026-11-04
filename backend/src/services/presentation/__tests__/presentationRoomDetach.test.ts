jest.mock('../../../models/PresentationAttempt', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../presentationCapacityService', () => ({ releaseSlotsForAttempt: jest.fn() }));

import { Op } from 'sequelize';
import PresentationAttempt from '../../../models/PresentationAttempt';
import { releaseSlotsForAttempt } from '../presentationCapacityService';
import { detachAttemptsForRoom } from '../presentationRoomDetach';

const attempts = PresentationAttempt as unknown as { findAll: jest.Mock };
const releaseForAttempt = releaseSlotsForAttempt as unknown as jest.Mock;

function attemptRow(id: string, over: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = { id, booking_id: 'b1', room_id: 'r1', ...over };
  (r as any).update = jest.fn(async (p: Record<string, unknown>) => { Object.assign(r, p); return r; });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  releaseForAttempt.mockResolvedValue(1);
});

describe('detaching practice attempts from a room about to be destroyed', () => {
  // Production, 2026-11-04: deleting a room hard-deletes its bookings, and
  // `presentation_attempts.booking_id` has no foreign key and no cascade. Two attempts
  // were left pointing at rows that no longer existed, and all seven slot reservations
  // ever created were still `held` because nothing had called the release path.
  it('clears the booking and room off every attempt in the room', async () => {
    const a1 = attemptRow('at1');
    const a2 = attemptRow('at2');
    attempts.findAll.mockResolvedValue([a1, a2]);

    const out = await detachAttemptsForRoom('r1', ['b1', 'b2'], 'room_deleted');

    expect(out.attempts).toBe(2);
    expect((a1 as any).update).toHaveBeenCalledWith({ booking_id: null, room_id: null });
    expect((a2 as any).update).toHaveBeenCalledWith({ booking_id: null, room_id: null });
  });

  it('gives the host time back by releasing each attempt’s holds', async () => {
    attempts.findAll.mockResolvedValue([attemptRow('at1'), attemptRow('at2')]);

    const out = await detachAttemptsForRoom('r1', [], 'room_deleted');

    expect(releaseForAttempt).toHaveBeenCalledWith('at1', 'room_deleted');
    expect(releaseForAttempt).toHaveBeenCalledWith('at2', 'room_deleted');
    expect(out.slots).toBe(2);
  });

  it('matches on the booking ids as well as the room', async () => {
    // An attempt can carry one reference without the other, so matching on room_id
    // alone would leave half of them dangling. Asserted through the Op symbol
    // because JSON.stringify silently drops symbol keys and would pass on {}.
    attempts.findAll.mockResolvedValue([attemptRow('at1')]);

    await detachAttemptsForRoom('r1', ['b1', 'b2'], 'room_deleted');

    const where = attempts.findAll.mock.calls[0][0].where as Record<symbol, unknown>;
    const or = where[Op.or] as Array<Record<string, any>>;
    expect(or[0]).toEqual({ room_id: 'r1' });
    expect(or[1].booking_id[Op.in]).toEqual(['b1', 'b2']);
  });

  it('does nothing, and queries nothing further, for a room with no attempts', async () => {
    // The ordinary case: most rooms are not practice rooms.
    attempts.findAll.mockResolvedValue([]);

    const out = await detachAttemptsForRoom('r9', [], 'room_deleted');

    expect(out).toEqual({ attempts: 0, slots: 0 });
    expect(releaseForAttempt).not.toHaveBeenCalled();
  });

  it('is safe to run twice — a second pass finds nothing to release', async () => {
    const a1 = attemptRow('at1');
    attempts.findAll.mockResolvedValue([a1]);
    await detachAttemptsForRoom('r1', [], 'room_deleted');

    jest.clearAllMocks();
    releaseForAttempt.mockResolvedValue(0); // already released
    attempts.findAll.mockResolvedValue([a1]);

    const second = await detachAttemptsForRoom('r1', [], 'room_deleted');

    expect(second.slots).toBe(0);
    expect(a1.booking_id).toBeNull();
  });
});
