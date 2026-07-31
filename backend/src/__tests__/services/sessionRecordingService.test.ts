/**
 * sessionRecordingService unit tests — ingesting a Meet recording into a
 * session's Room. Models + Drive + outbox mocked; no DB/network I/O. The
 * critical property under test is idempotency: a re-run must never re-download
 * or create a duplicate RoomResource, and "no recording found" must be a
 * clean no-op, not an error.
 */

jest.mock('../../models/RoomBooking', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../models/RoomResource', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../../services/communityRooms/roomService', () => ({ ensureRoomForSession: jest.fn() }));
jest.mock('../../services/communityRooms/roomOutboxService', () => ({ emitRoomEvent: jest.fn() }));
jest.mock('../../services/driveService', () => ({ findRecordingForSession: jest.fn(), streamDriveFile: jest.fn() }));
jest.mock('../../config/upload', () => ({ ROOM_RECORDING_DIR: '/fake/room-recordings', MAX_ROOM_RECORDING_SIZE: 4 * 1024 * 1024 * 1024 }));
jest.mock('../../config/database', () => ({ sequelize: { transaction: jest.fn() } }));

import { EventEmitter } from 'events';
import fs from 'fs';
import RoomBooking from '../../models/RoomBooking';
import RoomResource from '../../models/RoomResource';
import { ensureRoomForSession } from '../../services/communityRooms/roomService';
import { emitRoomEvent } from '../../services/communityRooms/roomOutboxService';
import { findRecordingForSession, streamDriveFile } from '../../services/driveService';
import { sequelize } from '../../config/database';
import { ingestRecordingForSession } from '../../services/sessionRecordingService';

const findOrCreateBooking = RoomBooking.findOrCreate as jest.Mock;
const findOneResource = RoomResource.findOne as jest.Mock;
const createResource = RoomResource.create as jest.Mock;
const ensureRoomMock = ensureRoomForSession as jest.Mock;
const emitMock = emitRoomEvent as jest.Mock;
const findMatchMock = findRecordingForSession as jest.Mock;
const streamMock = streamDriveFile as jest.Mock;
const transactionMock = sequelize.transaction as jest.Mock;

const room = { id: 'room-1' };
const booking = { id: 'booking-1', room_id: 'room-1' };
const session = {
  id: 'session-1',
  title: 'Week 1 · Architecture Day',
  session_number: 2,
  session_date: '2026-07-27',
  start_time: '18:30:00',
  end_time: '20:30:00',
  meeting_link: 'https://meet.google.com/jda-mjtm-sgm',
  meeting_provider: 'google_meet',
  update: jest.fn().mockResolvedValue(undefined),
} as any;

function fakeWritable() {
  const w = new EventEmitter() as any;
  w.write = jest.fn();
  return w;
}

beforeEach(() => {
  jest.clearAllMocks();
  ensureRoomMock.mockResolvedValue(room);
  findOrCreateBooking.mockResolvedValue([booking, false]);
  transactionMock.mockResolvedValue({ commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) });
  jest.spyOn(fs, 'createWriteStream').mockImplementation(() => {
    const w = fakeWritable();
    // Simulate the pipe completing successfully on the next tick.
    setImmediate(() => w.emit('finish'));
    return w;
  });
  jest.spyOn(fs, 'statSync').mockReturnValue({ size: 123456 } as any);
  jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
});

describe('ingestRecordingForSession — idempotency', () => {
  it('no-ops when a recording resource already exists for the booking (never re-downloads)', async () => {
    findOneResource.mockResolvedValue({ id: 'existing-resource' });

    const result = await ingestRecordingForSession(session);

    expect(result).toEqual({ status: 'already_present', resourceId: 'existing-resource' });
    expect(findMatchMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
  });

  it('is safe to call twice in a row: second call sees the just-created resource and no-ops', async () => {
    findOneResource.mockResolvedValueOnce(null); // first call: nothing yet
    findMatchMock.mockResolvedValue({ fileId: 'drive-1', name: 'rec.mp4', mimeType: 'video/mp4', sizeBytes: 500, createdTime: '2026-07-27T20:35:00Z' });
    const source = new EventEmitter() as any;
    source.pipe = jest.fn((dest) => setImmediate(() => dest.emit('finish')));
    streamMock.mockResolvedValue(source);
    createResource.mockResolvedValue({ id: 'new-resource' });

    const first = await ingestRecordingForSession(session);
    expect(first).toEqual({ status: 'ingested', resourceId: 'new-resource' });
    expect(createResource).toHaveBeenCalledTimes(1);

    // Second call: findOne now returns the resource just created.
    findOneResource.mockResolvedValueOnce({ id: 'new-resource' });
    const second = await ingestRecordingForSession(session);
    expect(second).toEqual({ status: 'already_present', resourceId: 'new-resource' });
    expect(createResource).toHaveBeenCalledTimes(1); // still just once — not duplicated
    expect(streamMock).toHaveBeenCalledTimes(1); // not re-downloaded
  });
});

describe('ingestRecordingForSession — no recording found', () => {
  it('returns not_found cleanly without creating anything (recording is a manual toggle a host may not have used)', async () => {
    findOneResource.mockResolvedValue(null);
    findMatchMock.mockResolvedValue(null);

    const result = await ingestRecordingForSession(session);

    expect(result).toEqual({ status: 'not_found' });
    expect(streamMock).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });
});

describe('ingestRecordingForSession — successful ingest', () => {
  it('downloads, creates the resource, points recording_url at the new download route, and emits RecordingAttached', async () => {
    findOneResource.mockResolvedValue(null);
    findMatchMock.mockResolvedValue({ fileId: 'drive-1', name: 'rec.mp4', mimeType: 'video/mp4', sizeBytes: 500, createdTime: '2026-07-27T20:35:00Z' });
    const source = new EventEmitter() as any;
    source.pipe = jest.fn((dest) => setImmediate(() => dest.emit('finish')));
    streamMock.mockResolvedValue(source);
    createResource.mockResolvedValue({ id: 'new-resource' });

    const result = await ingestRecordingForSession(session);

    expect(result).toEqual({ status: 'ingested', resourceId: 'new-resource' });
    expect(createResource.mock.calls[0][0]).toMatchObject({
      room_id: 'room-1', booking_id: 'booking-1', resource_type: 'recording', mime_type: 'video/mp4',
    });
    expect(session.update).toHaveBeenCalledWith(
      { recording_url: '/api/portal/community/rooms/room-1/resources/new-resource/download' },
      expect.anything(),
    );
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({ aggregateId: 'new-resource' }));
  });

  it('skips a match that exceeds the size cap and treats it as not_found', async () => {
    findOneResource.mockResolvedValue(null);
    findMatchMock.mockResolvedValue({ fileId: 'drive-1', name: 'rec.mp4', mimeType: 'video/mp4', sizeBytes: 5 * 1024 * 1024 * 1024, createdTime: '2026-07-27T20:35:00Z' });

    const result = await ingestRecordingForSession(session);

    expect(result).toEqual({ status: 'not_found' });
    expect(streamMock).not.toHaveBeenCalled();
  });
});
