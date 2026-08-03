/**
 * roomResourceService unit tests — Docs & Files list/create/delete/download.
 * Models + outbox mocked; no DB I/O. Proves the public-room-staff-only rule
 * and the room/booking read gate at the SERVICE layer, independent of the
 * controller.
 */

jest.mock('../../models/RoomResource', () => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() }));
jest.mock('../../models/CommunityRoom', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/RoomMembership', () => ({ findOne: jest.fn() }));
jest.mock('../../models/RoomBooking', () => ({ findByPk: jest.fn() }));
jest.mock('../../services/communityRooms/roomOutboxService', () => ({ emitRoomEvent: jest.fn() }));
jest.mock('../../config/upload', () => ({ ROOM_RESOURCE_DIR: '/fake/room-resources' }));
jest.mock('fs/promises', () => ({ unlink: jest.fn() }));

import RoomResource from '../../models/RoomResource';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import RoomBooking from '../../models/RoomBooking';
import { emitRoomEvent } from '../../services/communityRooms/roomOutboxService';
import {
  listResources, createFileResource, createLinkOrNoteResource, deleteResource,
} from '../../services/communityRooms/roomResourceService';

const findAllResource = RoomResource.findAll as jest.Mock;
const findByPkResource = RoomResource.findByPk as jest.Mock;
const createResource = RoomResource.create as jest.Mock;
const findByPkRoom = CommunityRoom.findByPk as jest.Mock;
const findOneMembership = RoomMembership.findOne as jest.Mock;
const findByPkBooking = RoomBooking.findByPk as jest.Mock;
const emitMock = emitRoomEvent as jest.Mock;

const roomId = 'room-1';
const uploader = 'enrollment-uploader';
const stranger = 'enrollment-stranger';
const moderator = 'enrollment-mod';

const publicRoom = { id: roomId, privacy: 'public', status: 'active' };
const privateRoom = { id: roomId, privacy: 'private', status: 'active' };

beforeEach(() => {
  jest.clearAllMocks();
  emitMock.mockResolvedValue({});
});

describe('listResources', () => {
  it('computes can_delete for the uploader, a moderator, and a stranger', async () => {
    findByPkRoom.mockResolvedValue(privateRoom);
    findOneMembership.mockResolvedValue({ access_state: 'active', role: 'member' });
    const rows = [
      { id: 'r1', created_by_enrollment_id: uploader },
      { id: 'r2', created_by_enrollment_id: stranger },
    ];
    findAllResource.mockResolvedValue(rows);

    const asUploader = await listResources({ enrollmentId: uploader }, roomId, {});
    expect(asUploader[0].can_delete).toBe(true); // owns r1
    expect(asUploader[1].can_delete).toBe(false); // does not own r2, not a moderator
  });

  it('a moderator can delete every resource in the room', async () => {
    findByPkRoom.mockResolvedValue(privateRoom);
    findOneMembership.mockResolvedValue({ access_state: 'active', role: 'moderator' });
    findAllResource.mockResolvedValue([{ id: 'r1', created_by_enrollment_id: stranger }]);
    const rows = await listResources({ enrollmentId: moderator }, roomId, {});
    expect(rows[0].can_delete).toBe(true);
  });

  it('rejects a non-eligible viewer of a private room with 403', async () => {
    findByPkRoom.mockResolvedValue(privateRoom);
    findOneMembership.mockResolvedValue(null);
    await expect(listResources({ enrollmentId: stranger }, roomId, {})).rejects.toMatchObject({ status: 403 });
    expect(findAllResource).not.toHaveBeenCalled();
  });
});

describe('createFileResource / createLinkOrNoteResource — public-room staff-only rule', () => {
  const file = { originalname: 'CLAUDE.md', mimetype: 'text/markdown', size: 1024, filename: 'uuid.md' } as Express.Multer.File;

  it('rejects a non-staff participant uploading a file to a public room', async () => {
    findByPkRoom.mockResolvedValue(publicRoom);
    findOneMembership.mockResolvedValue(null);
    await expect(
      createFileResource({ enrollmentId: stranger, isAdmin: false }, roomId, { file }),
    ).rejects.toMatchObject({ status: 403 });
    expect(createResource).not.toHaveBeenCalled();
  });

  it('allows staff to upload a file to a public room', async () => {
    findByPkRoom.mockResolvedValue(publicRoom);
    findOneMembership.mockResolvedValue(null);
    createResource.mockResolvedValue({ id: 'new-resource', booking_id: null });
    const result = await createFileResource({ enrollmentId: 'staff-1', isAdmin: true }, roomId, { file });
    expect(result.id).toBe('new-resource');
    expect(createResource.mock.calls[0][0]).toMatchObject({
      room_id: roomId, resource_type: 'file', mime_type: 'text/markdown', size_bytes: 1024, storage_key: 'uuid.md',
    });
    expect(emitMock).toHaveBeenCalled();
  });

  it('rejects a non-staff participant creating a link resource in a public room', async () => {
    findByPkRoom.mockResolvedValue(publicRoom);
    findOneMembership.mockResolvedValue(null);
    await expect(
      createLinkOrNoteResource({ enrollmentId: stranger, isAdmin: false }, roomId, { resourceType: 'link', url: 'https://example.com' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows any eligible member (non-staff) to upload in a private room', async () => {
    findByPkRoom.mockResolvedValue(privateRoom);
    findOneMembership.mockResolvedValue({ access_state: 'active', role: 'member' });
    createResource.mockResolvedValue({ id: 'note-1' });
    const result = await createLinkOrNoteResource({ enrollmentId: uploader }, roomId, { resourceType: 'note', body: 'Great session today.' });
    expect(result.id).toBe('note-1');
  });

  it('rejects a booking_id belonging to a different room', async () => {
    findByPkRoom.mockResolvedValue(privateRoom);
    findOneMembership.mockResolvedValue({ access_state: 'active', role: 'member' });
    findByPkBooking.mockResolvedValue({ id: 'booking-1', room_id: 'some-other-room' });
    await expect(
      createLinkOrNoteResource({ enrollmentId: uploader }, roomId, { resourceType: 'note', body: 'x', bookingId: 'booking-1' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(createResource).not.toHaveBeenCalled();
  });
});

describe('deleteResource', () => {
  it('allows the uploader to delete their own resource', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    findByPkResource.mockResolvedValue({ id: 'r1', room_id: roomId, created_by_enrollment_id: uploader, resource_type: 'note', destroy });
    findOneMembership.mockResolvedValue(null);
    await deleteResource({ enrollmentId: uploader }, roomId, 'r1');
    expect(destroy).toHaveBeenCalled();
  });

  it('allows a moderator to delete someone else\'s resource', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    findByPkResource.mockResolvedValue({ id: 'r1', room_id: roomId, created_by_enrollment_id: stranger, resource_type: 'note', destroy });
    findOneMembership.mockResolvedValue({ access_state: 'active', role: 'moderator' });
    await deleteResource({ enrollmentId: moderator }, roomId, 'r1');
    expect(destroy).toHaveBeenCalled();
  });

  it('rejects a random member deleting someone else\'s resource', async () => {
    const destroy = jest.fn();
    findByPkResource.mockResolvedValue({ id: 'r1', room_id: roomId, created_by_enrollment_id: stranger, resource_type: 'note', destroy });
    findOneMembership.mockResolvedValue({ access_state: 'active', role: 'member' });
    await expect(deleteResource({ enrollmentId: 'random-member' }, roomId, 'r1')).rejects.toMatchObject({ status: 403 });
    expect(destroy).not.toHaveBeenCalled();
  });
});
