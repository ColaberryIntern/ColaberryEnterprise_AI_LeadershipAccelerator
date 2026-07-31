/**
 * dmService unit tests — 1:1 DMs over a 2-person private room. Room models +
 * message service mocked; no DB I/O.
 */

jest.mock('../../models/CommunityRoom', () => ({ findOrCreate: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() }));
jest.mock('../../models/RoomMembership', () => ({ findOrCreate: jest.fn(), findAll: jest.fn(), update: jest.fn() }));
jest.mock('../../models/RoomMessage', () => ({ findOne: jest.fn() }));
jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../services/communityRooms/roomMessageService', () => ({ postMessage: jest.fn(), listMessages: jest.fn() }));
jest.mock('../../services/access/staffAccess', () => ({ isStaffOrMgmt: jest.fn() }));

import { openDm, sendDmMessage, listDmMessages, listConversations, markDmRead } from '../../services/communityRooms/dmService';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import RoomMessage from '../../models/RoomMessage';
import Enrollment from '../../models/Enrollment';
import { postMessage, listMessages } from '../../services/communityRooms/roomMessageService';
import { isStaffOrMgmt } from '../../services/access/staffAccess';

const findOrCreateRoom = CommunityRoom.findOrCreate as jest.Mock;
const findByPkRoom = CommunityRoom.findByPk as jest.Mock;
const findAllRoom = CommunityRoom.findAll as jest.Mock;
const findOrCreateMember = RoomMembership.findOrCreate as jest.Mock;
const findAllMember = RoomMembership.findAll as jest.Mock;
const updateMember = RoomMembership.update as jest.Mock;
const findOneMsg = RoomMessage.findOne as jest.Mock;
const findByPkEnroll = Enrollment.findByPk as jest.Mock;
const postMock = postMessage as jest.Mock;
const listMock = listMessages as jest.Mock;
const isStaffOrMgmtMock = isStaffOrMgmt as jest.Mock;

const me = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const cohort = 'cohort-1';
const ctx = { enrollmentId: me, cohortId: cohort, isAdmin: false };
const [a, b] = [me, other].sort();

beforeEach(() => {
  jest.clearAllMocks();
  findByPkEnroll.mockResolvedValue({ id: other, cohort_id: cohort }); // same cohort
  findOrCreateRoom.mockResolvedValue([{ id: 'room-1' }, true]);
  findOrCreateMember.mockResolvedValue([{}, true]);
  isStaffOrMgmtMock.mockResolvedValue(false);
});

describe('openDm', () => {
  it('happy: find-or-creates a dm room keyed on the sorted-pair slug and adds both as active members', async () => {
    const r = await openDm(me, other, cohort);
    expect(r).toEqual({ roomId: 'room-1' });
    expect(findOrCreateRoom.mock.calls[0][0].where).toEqual({ slug: `dm-${a}-${b}` });
    expect(findOrCreateRoom.mock.calls[0][0].defaults).toMatchObject({ room_type: 'dm', privacy: 'private', is_system: true });
    expect(findOrCreateMember).toHaveBeenCalledTimes(2);
    const memberIds = findOrCreateMember.mock.calls.map((c) => c[0].where.enrollment_id).sort();
    expect(memberIds).toEqual([a, b]);
    expect(findOrCreateMember.mock.calls[0][0].defaults).toMatchObject({ access_state: 'active', role: 'member' });
  });

  it('slug is order-independent: either person opens the SAME room', async () => {
    await openDm(me, other, cohort);
    const slug1 = findOrCreateRoom.mock.calls[0][0].where.slug;
    findOrCreateRoom.mockClear();
    findByPkEnroll.mockResolvedValue({ id: me, cohort_id: cohort });
    await openDm(other, me, cohort);
    expect(findOrCreateRoom.mock.calls[0][0].where.slug).toBe(slug1);
  });

  it('rejects a self-DM', async () => {
    await expect(openDm(me, me, cohort)).rejects.toMatchObject({ name: 'DmError' });
    expect(findOrCreateRoom).not.toHaveBeenCalled();
  });

  it('rejects a cross-cohort DM', async () => {
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'OTHER-COHORT' });
    await expect(openDm(me, other, cohort)).rejects.toMatchObject({ name: 'DmError' });
    expect(findOrCreateRoom).not.toHaveBeenCalled();
  });

  it('rejects when the caller has no cohort and is not staff/mgmt', async () => {
    await expect(openDm(me, other, null)).rejects.toMatchObject({ name: 'DmError', message: 'You are not in a cohort yet' });
    expect(findOrCreateRoom).not.toHaveBeenCalled();
  });

  it('staff/mgmt bypasses the cohort check and can DM a person in a different cohort', async () => {
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'OTHER-COHORT' });
    isStaffOrMgmtMock.mockResolvedValue(true);
    const r = await openDm(me, other, cohort);
    expect(r).toEqual({ roomId: 'room-1' });
  });

  it('staff/mgmt with no cohort of their own can still DM', async () => {
    isStaffOrMgmtMock.mockResolvedValue(true);
    const r = await openDm(me, other, null);
    expect(r).toEqual({ roomId: 'room-1' });
  });
});

describe('send / list guards', () => {
  it('sendDmMessage delegates to postMessage for a dm room', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
    const m = await sendDmMessage(ctx, 'room-1', 'hi');
    expect(m).toEqual({ id: 'm1', content: 'hi' });
    expect(postMock).toHaveBeenCalledWith(ctx, 'room-1', { content: 'hi' });
  });

  it('refuses to send into a non-dm room (guards against posting to cohort rooms)', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-9', room_type: 'persistent' });
    await expect(sendDmMessage(ctx, 'room-9', 'hi')).rejects.toMatchObject({ name: 'DmError' });
    expect(postMock).not.toHaveBeenCalled();
  });

  it('listDmMessages delegates to listMessages with the since cursor', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    listMock.mockResolvedValue({ messages: [], active_count: 0 });
    const r = await listDmMessages(ctx, 'room-1', 'since-ts');
    expect(r).toEqual({ messages: [], active_count: 0 });
    expect(listMock).toHaveBeenCalledWith(ctx, 'room-1', { since: 'since-ts' });
  });
});

describe('inbox', () => {
  const at = (s: string) => new Date(s);

  it('listConversations returns a dm convo with peer, last message, and unread=true', async () => {
    findAllMember.mockImplementation((q: any) =>
      q.where.enrollment_id === me
        ? Promise.resolve([{ room_id: 'r1', last_read_at: at('2026-07-20T10:00:00Z') }]) // my membership
        : Promise.resolve([{ enrollment_id: other }]), // the other member of r1
    );
    findAllRoom.mockResolvedValue([{ id: 'r1', room_type: 'dm' }]);
    findByPkEnroll.mockResolvedValue({ id: other, full_name: 'Bob', avatar_data_url: null });
    findOneMsg.mockResolvedValue({ room_id: 'r1', enrollment_id: other, content: 'yo', created_at: at('2026-07-20T11:00:00Z'), deleted_at: null });

    const convos = await listConversations(me);
    expect(convos).toHaveLength(1);
    expect(convos[0]).toMatchObject({ roomId: 'r1', peerId: other, peerName: 'Bob', lastMessage: 'yo', unread: true });
  });

  it('markDmRead sets last_read_at on my membership', async () => {
    findByPkRoom.mockResolvedValue({ id: 'r1', room_type: 'dm' });
    await markDmRead(me, 'r1');
    expect(updateMember).toHaveBeenCalledWith(
      expect.objectContaining({ last_read_at: expect.any(Date) }),
      { where: { room_id: 'r1', enrollment_id: me } },
    );
  });
});
