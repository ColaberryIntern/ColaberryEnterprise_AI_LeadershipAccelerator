jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../models/PresentationAssignment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/RoomBooking', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/RoomMembership', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../communityRooms/roomEntitlementService', () => ({ canModerate: jest.fn() }));

import { sequelize } from '../../../config/database';
import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import RoomBooking from '../../../models/RoomBooking';
import RoomMembership from '../../../models/RoomMembership';
import { canModerate } from '../../communityRooms/roomEntitlementService';
import { mySlot, runningOrder } from '../presentationPresenterSlots';

const q = sequelize.query as unknown as jest.Mock;
const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const assignments = PresentationAssignment as unknown as { findOne: jest.Mock };
const bookings = RoomBooking as unknown as { findByPk: jest.Mock };
const memberships = RoomMembership as unknown as { findOne: jest.Mock };
const moderate = canModerate as unknown as jest.Mock;

const SLOT = {
  booking_id: 'b1', position: 4, role: 'presenter', state: 'scheduled',
  starts_at: '2026-11-20T19:10:00Z', duration_seconds: 300,
};

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  mockTree.mockResolvedValue({ id: 'p1', name: 'Load Intake Agent', lists: [] });
  assignments.findOne.mockResolvedValue({ id: 'as1' });
  bookings.findByPk.mockResolvedValue({ id: 'b1', room_id: 'r1' });
  memberships.findOne.mockResolvedValue(null);
  moderate.mockReturnValue(false);
});

describe('a learner sees their own slot and nothing about anyone else', () => {
  it('returns position and total, so "4 of 11" means something', async () => {
    q.mockResolvedValueOnce([[SLOT], {}]);
    q.mockResolvedValueOnce([[{ n: 11 }], {}]);

    const r = await mySlot('e1', 'p1', 'PREP-6');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slot?.position).toBe(4);
    expect(r.slot?.totalPresenters).toBe(11);
  });

  it('the total is a COUNT, never the other learners rows', async () => {
    q.mockResolvedValueOnce([[SLOT], {}]);
    q.mockResolvedValueOnce([[{ n: 11 }], {}]);
    await mySlot('e1', 'p1', 'PREP-6');

    const countSql = String(q.mock.calls[1][0]);
    expect(countSql).toMatch(/COUNT\(\*\)/i);
    // If this ever selects columns, someone is about to render another learner's
    // name on this page.
    expect(countSql).not.toMatch(/SELECT\s+(assignment_id|enrollment_id)/i);
  });

  it('never returns another learners identifiers in the payload', async () => {
    q.mockResolvedValueOnce([[SLOT], {}]);
    q.mockResolvedValueOnce([[{ n: 11 }], {}]);
    const r = await mySlot('e1', 'p1', 'PREP-6');
    if (!r.ok || !r.slot) return;
    const keys = Object.keys(r.slot);
    expect(keys).not.toContain('enrollmentId');
    expect(keys).not.toContain('assignmentId');
  });

  it('scopes the lookup to the callers own assignment', async () => {
    q.mockResolvedValueOnce([[SLOT], {}]);
    q.mockResolvedValueOnce([[{ n: 1 }], {}]);
    await mySlot('e1', 'p1', 'PREP-6');
    expect(q.mock.calls[0][1].replacements).toEqual({ aid: 'as1' });
  });

  it('no slot yet is a 200 with null, not a 404', async () => {
    q.mockResolvedValueOnce([[], {}]);
    const r = await mySlot('e1', 'p1', 'PREP-6');
    expect(r).toEqual({ ok: true, slot: null });
  });

  it('a project that is not yours is indistinguishable from one that does not exist', async () => {
    mockTree.mockResolvedValue(null);
    const r = await mySlot('e1', 'someone-elses', 'PREP-6');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });
});

describe('swapping an id cannot buy moderator rights', () => {
  it('refuses the full order for a learner who is not a moderator', async () => {
    moderate.mockReturnValue(false);
    const r = await runningOrder({ enrollmentId: 'e1', cohortId: 'c1' }, 'b1');
    expect(r).toEqual({ ok: false, reason: 'not_authorized' });
    // And it never read the order on the way to refusing.
    expect(q).not.toHaveBeenCalled();
  });

  it('asks about the CALLERS membership, not anything from the request', async () => {
    // THE PROPERTY THIS WHOLE TEST FILE EXISTS FOR. The booking id selects which
    // room is being asked about; it is never evidence about who is asking.
    moderate.mockReturnValue(true);
    q.mockResolvedValueOnce([[], {}]);

    await runningOrder({ enrollmentId: 'e-caller', cohortId: 'c1' }, 'b1');

    expect(memberships.findOne).toHaveBeenCalledWith({
      where: { room_id: 'r1', enrollment_id: 'e-caller' },
    });
    // canModerate is handed the caller's own context and that membership — there is
    // no path by which a different id reaches it.
    expect(moderate.mock.calls[0][0].enrollmentId).toBe('e-caller');
  });

  it('a staff context is authorized through isAdmin, not through a body field', async () => {
    moderate.mockReturnValue(true);
    q.mockResolvedValueOnce([[{
      position: 1, assignment_id: 'as1', enrollment_id: 'e9', role: 'presenter',
      state: 'scheduled', starts_at: '2026-11-20T19:00:00Z', duration_seconds: 300,
    }], {}]);

    const r = await runningOrder({ enrollmentId: 'staff1', cohortId: 'c1', isAdmin: true }, 'b1');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].enrollmentId).toBe('e9');
  });

  it('a booking that does not exist is not_found, and asks no question about rights', async () => {
    bookings.findByPk.mockResolvedValue(null);
    const r = await runningOrder({ enrollmentId: 'e1' }, 'nope');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(moderate).not.toHaveBeenCalled();
  });

  it('cancelled slots are excluded from the order', async () => {
    moderate.mockReturnValue(true);
    q.mockResolvedValueOnce([[], {}]);
    await runningOrder({ enrollmentId: 'staff1', isAdmin: true }, 'b1');
    expect(String(q.mock.calls[0][0])).toMatch(/state <> 'cancelled'/);
  });
});
