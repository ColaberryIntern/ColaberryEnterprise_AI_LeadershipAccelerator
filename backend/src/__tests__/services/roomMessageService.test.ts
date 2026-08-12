/**
 * roomMessageService unit tests — focused on postMessage's optional
 * resource_id linking (chat file-attach). Models mocked; no DB I/O.
 */

jest.mock('../../models/RoomMessage', () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/CommunityRoom', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/RoomMembership', () => ({ findOne: jest.fn() }));
jest.mock('../../models/RoomResource', () => ({ findByPk: jest.fn() }));
jest.mock('../../services/communityService', () => ({ getOrCreateMember: jest.fn() }));

import RoomMessage from '../../models/RoomMessage';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import RoomResource from '../../models/RoomResource';
import { getOrCreateMember } from '../../services/communityService';
import { postMessage } from '../../services/communityRooms/roomMessageService';

const createMessage = RoomMessage.create as jest.Mock;
const findOneMessage = RoomMessage.findOne as jest.Mock;
const findByPkRoom = CommunityRoom.findByPk as jest.Mock;
const findOneMembership = RoomMembership.findOne as jest.Mock;
const findByPkResource = RoomResource.findByPk as jest.Mock;
const getOrCreateMemberMock = getOrCreateMember as jest.Mock;

const roomId = 'room-1';
const sender = 'enrollment-sender';
const activeRoom = { id: roomId, status: 'active', privacy: 'private' };

beforeEach(() => {
  jest.clearAllMocks();
  findByPkRoom.mockResolvedValue(activeRoom);
  findOneMembership.mockResolvedValue({ access_state: 'active', role: 'member' });
  findOneMessage.mockResolvedValue(null); // no prior message with this client_id, by default
  getOrCreateMemberMock.mockResolvedValue({ display_name: 'Test Sender' });
  createMessage.mockImplementation(async (attrs) => attrs);
});

describe('postMessage — plain text (regression)', () => {
  it('creates a message with empty metadata when no resource_id is given', async () => {
    const msg = await postMessage({ enrollmentId: sender }, roomId, { content: 'Setup_Guide.pdf' });
    expect(findByPkResource).not.toHaveBeenCalled();
    expect(msg).toMatchObject({ content: 'Setup_Guide.pdf', metadata: {} });
  });
});

describe('postMessage — resource_id linking (chat file-attach)', () => {
  it('links a valid file resource from the same room into the message metadata', async () => {
    findByPkResource.mockResolvedValue({ id: 'res-1', room_id: roomId, resource_type: 'file' });
    const msg = await postMessage({ enrollmentId: sender }, roomId, { content: '📎 Setup_Guide.pdf', resource_id: 'res-1' });
    expect(msg).toMatchObject({ metadata: { resource_id: 'res-1' } });
  });

  it('rejects a resource_id belonging to a different room', async () => {
    findByPkResource.mockResolvedValue({ id: 'res-1', room_id: 'some-other-room', resource_type: 'file' });
    await expect(
      postMessage({ enrollmentId: sender }, roomId, { content: '📎 Setup_Guide.pdf', resource_id: 'res-1' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('rejects a resource_id that is not a file (e.g. a link or note)', async () => {
    findByPkResource.mockResolvedValue({ id: 'res-1', room_id: roomId, resource_type: 'note' });
    await expect(
      postMessage({ enrollmentId: sender }, roomId, { content: 'see notes', resource_id: 'res-1' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('rejects a resource_id that does not exist', async () => {
    findByPkResource.mockResolvedValue(null);
    await expect(
      postMessage({ enrollmentId: sender }, roomId, { content: '📎 ghost.pdf', resource_id: 'missing' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('still enforces canPost before ever looking at resource_id', async () => {
    findByPkRoom.mockResolvedValue({ id: roomId, status: 'archived', privacy: 'private' });
    await expect(
      postMessage({ enrollmentId: sender }, roomId, { content: '📎 Setup_Guide.pdf', resource_id: 'res-1' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(findByPkResource).not.toHaveBeenCalled();
  });
});

describe('postMessage — client_id idempotency (retry-safe send)', () => {
  const clientId = 'aaaaaaaa-1111-2222-3333-444444444444';

  it('happy: stores the client_id in metadata on first send', async () => {
    const msg = await postMessage({ enrollmentId: sender }, roomId, { content: 'hi', client_id: clientId });
    expect(msg).toMatchObject({ content: 'hi', metadata: { client_id: clientId } });
    expect(findOneMessage).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ room_id: roomId }) }),
    );
  });

  it('idempotent: a retry with the same client_id returns the original message instead of creating a duplicate', async () => {
    const original = { id: 'm-1', content: 'hi', metadata: { client_id: clientId } };
    findOneMessage.mockResolvedValue(original);
    const msg = await postMessage({ enrollmentId: sender }, roomId, { content: 'hi', client_id: clientId });
    expect(msg).toBe(original);
    expect(createMessage).not.toHaveBeenCalled();
    // Doesn't even need to re-check auth/room state for a message that already exists.
    expect(findByPkRoom).not.toHaveBeenCalled();
  });

  it('boundary: no client_id given never dedups (plain sends stay independent)', async () => {
    await postMessage({ enrollmentId: sender }, roomId, { content: 'one' });
    await postMessage({ enrollmentId: sender }, roomId, { content: 'two' });
    expect(findOneMessage).not.toHaveBeenCalled();
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it('failure path: still enforces canPost when client_id is new (not just on the dedup lookup)', async () => {
    findByPkRoom.mockResolvedValue({ id: roomId, status: 'archived', privacy: 'private' });
    await expect(
      postMessage({ enrollmentId: sender }, roomId, { content: 'hi', client_id: clientId }),
    ).rejects.toMatchObject({ status: 403 });
    expect(createMessage).not.toHaveBeenCalled();
  });
});
