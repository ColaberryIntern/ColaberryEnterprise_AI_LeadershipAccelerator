/**
 * friendshipService unit tests — the friend graph behind the Contacts rail.
 * Model layer mocked; no DB I/O.
 */

jest.mock('../../models/Friendship', () => ({ findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() }));
jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../services/access/staffAccess', () => ({ isStaffOrMgmt: jest.fn() }));

import { sendFriendRequest, respondToRequest, getFriendshipStatuses } from '../../services/friendshipService';
import Friendship from '../../models/Friendship';
import Enrollment from '../../models/Enrollment';
import { isStaffOrMgmt } from '../../services/access/staffAccess';

const findOne = Friendship.findOne as jest.Mock;
const findAll = Friendship.findAll as jest.Mock;
const create = Friendship.create as jest.Mock;
const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const isStaffOrMgmtMock = isStaffOrMgmt as jest.Mock;

const me = '11111111-1111-1111-1111-111111111111';
const target = '22222222-2222-2222-2222-222222222222';
const COHORT = 'cohort-1';

// a friendship row whose update() mutates in place, like a Sequelize instance
function row(fields: any) {
  return {
    ...fields,
    update: jest.fn(async function (this: any, patch: any) { Object.assign(this, patch); }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findByPkEnrollment.mockImplementation((id: string) => Promise.resolve({ id, cohort_id: COHORT })); // same cohort
  isStaffOrMgmtMock.mockResolvedValue(false);
  findOne.mockResolvedValue(null);
  findAll.mockResolvedValue([]);
  create.mockResolvedValue({});
});

describe('sendFriendRequest', () => {
  it('happy: creates a pending request between cohort-mates', async () => {
    const r = await sendFriendRequest(me, target);
    expect(r).toEqual({ status: 'requested' });
    expect(create).toHaveBeenCalledWith({ requester_id: me, addressee_id: target, status: 'pending' });
  });

  it('rejects a self-request', async () => {
    await expect(sendFriendRequest(me, me)).rejects.toMatchObject({ name: 'FriendRequestError' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a cross-cohort request from a regular student', async () => {
    findByPkEnrollment.mockImplementation((id: string) => Promise.resolve({ id, cohort_id: id === me ? 'A' : 'B' }));
    await expect(sendFriendRequest(me, target)).rejects.toMatchObject({ name: 'FriendRequestError' });
    expect(create).not.toHaveBeenCalled();
  });

  it('staff/mgmt bypasses the cohort check and can connect cross-cohort', async () => {
    findByPkEnrollment.mockImplementation((id: string) => Promise.resolve({ id, cohort_id: id === me ? 'A' : 'B' }));
    isStaffOrMgmtMock.mockResolvedValue(true);
    const r = await sendFriendRequest(me, target);
    expect(r).toEqual({ status: 'requested' });
    expect(create).toHaveBeenCalledWith({ requester_id: me, addressee_id: target, status: 'pending' });
  });

  it('idempotent: an existing pending request returns requested without a new row', async () => {
    findOne.mockImplementation((q: any) =>
      q.where.requester_id === me && q.where.addressee_id === target
        ? Promise.resolve(row({ requester_id: me, addressee_id: target, status: 'pending' }))
        : Promise.resolve(null),
    );
    const r = await sendFriendRequest(me, target);
    expect(r).toEqual({ status: 'requested' });
    expect(create).not.toHaveBeenCalled();
  });

  it('auto-accepts when the target already requested me (reverse pending -> friend)', async () => {
    const reverse = row({ requester_id: target, addressee_id: me, status: 'pending' });
    findOne.mockImplementation((q: any) =>
      q.where.requester_id === target && q.where.addressee_id === me
        ? Promise.resolve(reverse)
        : Promise.resolve(null),
    );
    const r = await sendFriendRequest(me, target);
    expect(r).toEqual({ status: 'friend' });
    expect(reverse.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('respondToRequest', () => {
  it('accepts an incoming pending request', async () => {
    const req = row({ requester_id: target, addressee_id: me, status: 'pending' });
    findOne.mockResolvedValueOnce(req);
    const r = await respondToRequest(me, target, true);
    expect(req.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(r.status).toBe('accepted');
  });

  it('declines an incoming pending request', async () => {
    const req = row({ requester_id: target, addressee_id: me, status: 'pending' });
    findOne.mockResolvedValueOnce(req);
    const r = await respondToRequest(me, target, false);
    expect(req.update).toHaveBeenCalledWith({ status: 'declined' });
    expect(r.status).toBe('declined');
  });

  it('rejects when there is no pending request', async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(respondToRequest(me, target, true)).rejects.toMatchObject({ name: 'FriendRequestError' });
  });
});

describe('getFriendshipStatuses', () => {
  it('maps accepted->friend, my-pending->requested, their-pending->incoming, unknown->omitted', async () => {
    findAll.mockResolvedValueOnce([
      { requester_id: me, addressee_id: 'a', status: 'accepted' },
      { requester_id: me, addressee_id: 'b', status: 'pending' },
      { requester_id: 'c', addressee_id: me, status: 'pending' },
    ]);
    const out = await getFriendshipStatuses(me, ['a', 'b', 'c', 'd']);
    expect(out).toEqual({ a: 'friend', b: 'requested', c: 'incoming' });
  });

  it('returns {} for an empty id list without querying', async () => {
    const out = await getFriendshipStatuses(me, []);
    expect(out).toEqual({});
    expect(findAll).not.toHaveBeenCalled();
  });
});
