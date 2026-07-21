/**
 * dmService unit tests — 1:1 DMs over a 2-person private room. Room models +
 * message service mocked; no DB I/O.
 */

jest.mock('../../models/CommunityRoom', () => ({ findOrCreate: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/RoomMembership', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../services/communityRooms/roomMessageService', () => ({ postMessage: jest.fn(), listMessages: jest.fn() }));

import { openDm, sendDmMessage, listDmMessages } from '../../services/communityRooms/dmService';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import Enrollment from '../../models/Enrollment';
import { postMessage, listMessages } from '../../services/communityRooms/roomMessageService';

const findOrCreateRoom = CommunityRoom.findOrCreate as jest.Mock;
const findByPkRoom = CommunityRoom.findByPk as jest.Mock;
const findOrCreateMember = RoomMembership.findOrCreate as jest.Mock;
const findByPkEnroll = Enrollment.findByPk as jest.Mock;
const postMock = postMessage as jest.Mock;
const listMock = listMessages as jest.Mock;

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
