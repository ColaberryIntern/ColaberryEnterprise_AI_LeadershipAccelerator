/**
 * sessionRecordingService unit tests — ingesting a class recording (Google
 * Meet via Drive, or Zoom Cloud Recording) into a session's Room. Models +
 * both providers + outbox mocked; no DB/network I/O. The critical property
 * under test is idempotency: a re-run must never re-download or create a
 * duplicate RoomResource, "no recording found" must be a clean no-op (not an
 * error), and the two providers must dispatch to the right source based on
 * LiveSession.meeting_provider.
 */

jest.mock('../../models/RoomBooking', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../models/RoomResource', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../../models/CommunityRoom', () => ({ findOne: jest.fn(), findAll: jest.fn() }));
jest.mock('../../services/communityRooms/roomService', () => ({ ensureRoomForSession: jest.fn() }));
jest.mock('../../services/communityRooms/roomOutboxService', () => ({ emitRoomEvent: jest.fn() }));
jest.mock('../../services/driveService', () => ({ findRecordingForSession: jest.fn(), streamDriveFile: jest.fn() }));
jest.mock('../../services/zoomService', () => ({
  findRecordingForSession: jest.fn(),
  findRecordingByMeetingId: jest.fn(),
  extractZoomMeetingId: jest.fn(),
  streamZoomFile: jest.fn(),
}));
jest.mock('../../config/upload', () => ({ ROOM_RECORDING_DIR: '/fake/room-recordings', MAX_ROOM_RECORDING_SIZE: 4 * 1024 * 1024 * 1024 }));
jest.mock('../../config/database', () => ({ sequelize: { transaction: jest.fn() } }));

import { EventEmitter } from 'events';
import fs from 'fs';
import RoomBooking from '../../models/RoomBooking';
import RoomResource from '../../models/RoomResource';
import CommunityRoom from '../../models/CommunityRoom';
import { ensureRoomForSession } from '../../services/communityRooms/roomService';
import { emitRoomEvent } from '../../services/communityRooms/roomOutboxService';
import { findRecordingForSession as findDriveMatch, streamDriveFile } from '../../services/driveService';
import { findRecordingForSession as findZoomMatch, findRecordingByMeetingId, extractZoomMeetingId, streamZoomFile } from '../../services/zoomService';
import { sequelize } from '../../config/database';
import { ingestRecordingForSession, ingestRecordingForBooking, ingestRecordingForRoom, findAlwaysOpenRoomForZoomMeeting } from '../../services/sessionRecordingService';

const findOrCreateBooking = RoomBooking.findOrCreate as jest.Mock;
const findOneResource = RoomResource.findOne as jest.Mock;
const createResource = RoomResource.create as jest.Mock;
const findOneRoom = CommunityRoom.findOne as jest.Mock;
const findAllRooms = CommunityRoom.findAll as jest.Mock;
const ensureRoomMock = ensureRoomForSession as jest.Mock;
const emitMock = emitRoomEvent as jest.Mock;
const findDriveMatchMock = findDriveMatch as jest.Mock;
const streamDriveMock = streamDriveFile as jest.Mock;
const findZoomMatchMock = findZoomMatch as jest.Mock;
const findByMeetingIdMock = findRecordingByMeetingId as jest.Mock;
const extractZoomMeetingIdMock = extractZoomMeetingId as jest.Mock;
const streamZoomMock = streamZoomFile as jest.Mock;
const transactionMock = sequelize.transaction as jest.Mock;

const room = { id: 'room-1' };
const booking = { id: 'booking-1', room_id: 'room-1' };
const googleSession = {
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

const zoomSession = {
  id: 'session-2',
  title: 'Week 1 · Build Day',
  session_number: 3,
  session_date: '2026-07-30',
  start_time: '18:30:00',
  end_time: '20:30:00',
  meeting_link: 'https://zoom.us/j/123456789',
  meeting_provider: 'zoom',
  zoom_meeting_id: '123456789',
  update: jest.fn().mockResolvedValue(undefined),
} as any;

function fakeWritable() {
  const w = new EventEmitter() as any;
  w.write = jest.fn();
  return w;
}

function fakeSource() {
  const source = new EventEmitter() as any;
  source.pipe = jest.fn((dest: any) => setImmediate(() => dest.emit('finish')));
  return source;
}

beforeEach(() => {
  jest.clearAllMocks();
  ensureRoomMock.mockResolvedValue(room);
  findOrCreateBooking.mockResolvedValue([booking, false]);
  transactionMock.mockResolvedValue({ commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) });
  jest.spyOn(fs, 'createWriteStream').mockImplementation(() => {
    const w = fakeWritable();
    setImmediate(() => w.emit('finish'));
    return w;
  });
  jest.spyOn(fs, 'statSync').mockReturnValue({ size: 123456 } as any);
  jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
});

describe('ingestRecordingForSession — idempotency', () => {
  it('no-ops when a recording resource already exists for the booking (never re-downloads)', async () => {
    findOneResource.mockResolvedValue({ id: 'existing-resource' });

    const result = await ingestRecordingForSession(googleSession);

    expect(result).toEqual({ status: 'already_present', resourceId: 'existing-resource' });
    expect(findDriveMatchMock).not.toHaveBeenCalled();
    expect(streamDriveMock).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
  });

  it('is safe to call twice in a row: second call sees the just-created resource and no-ops', async () => {
    findOneResource.mockResolvedValueOnce(null); // first call: nothing yet
    findDriveMatchMock.mockResolvedValue({ fileId: 'drive-1', name: 'rec.mp4', mimeType: 'video/mp4', sizeBytes: 500, createdTime: '2026-07-27T20:35:00Z' });
    streamDriveMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValue({ id: 'new-resource' });

    const first = await ingestRecordingForSession(googleSession);
    expect(first).toEqual({ status: 'ingested', resourceId: 'new-resource' });
    expect(createResource).toHaveBeenCalledTimes(1);

    // Second call: findOne now returns the resource just created.
    findOneResource.mockResolvedValueOnce({ id: 'new-resource' });
    const second = await ingestRecordingForSession(googleSession);
    expect(second).toEqual({ status: 'already_present', resourceId: 'new-resource' });
    expect(createResource).toHaveBeenCalledTimes(1); // still just once — not duplicated
    expect(streamDriveMock).toHaveBeenCalledTimes(1); // not re-downloaded
  });
});

describe('ingestRecordingForSession — no recording found', () => {
  it('returns not_found cleanly without creating anything (recording is a manual toggle a host may not have used)', async () => {
    findOneResource.mockResolvedValue(null);
    findDriveMatchMock.mockResolvedValue(null);

    const result = await ingestRecordingForSession(googleSession);

    expect(result).toEqual({ status: 'not_found' });
    expect(streamDriveMock).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });
});

describe('ingestRecordingForSession — successful ingest (Google Meet / Drive)', () => {
  it('downloads, creates the resource, points recording_url at the new download route, and emits RecordingAttached', async () => {
    findOneResource.mockResolvedValue(null);
    findDriveMatchMock.mockResolvedValue({ fileId: 'drive-1', name: 'rec.mp4', mimeType: 'video/mp4', sizeBytes: 500, createdTime: '2026-07-27T20:35:00Z' });
    streamDriveMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValue({ id: 'new-resource' });

    const result = await ingestRecordingForSession(googleSession);

    expect(result).toEqual({ status: 'ingested', resourceId: 'new-resource' });
    expect(createResource.mock.calls[0][0]).toMatchObject({
      room_id: 'room-1', booking_id: 'booking-1', resource_type: 'recording', mime_type: 'video/mp4',
    });
    expect(googleSession.update).toHaveBeenCalledWith(
      { recording_url: '/api/portal/community/rooms/room-1/resources/new-resource/download' },
      expect.anything(),
    );
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({ aggregateId: 'new-resource' }));
    expect(findZoomMatchMock).not.toHaveBeenCalled();
  });

  it('skips a match that exceeds the size cap and treats it as not_found', async () => {
    findOneResource.mockResolvedValue(null);
    findDriveMatchMock.mockResolvedValue({ fileId: 'drive-1', name: 'rec.mp4', mimeType: 'video/mp4', sizeBytes: 5 * 1024 * 1024 * 1024, createdTime: '2026-07-27T20:35:00Z' });

    const result = await ingestRecordingForSession(googleSession);

    expect(result).toEqual({ status: 'not_found' });
    expect(streamDriveMock).not.toHaveBeenCalled();
  });
});

describe('ingestRecordingForSession — Zoom provider dispatch', () => {
  it('a zoom-provider session calls the Zoom finder/streamer, not Drive', async () => {
    findOneResource.mockResolvedValue(null);
    findZoomMatchMock.mockResolvedValue({ downloadUrl: 'https://zoom.us/rec/download/abc', name: 'Build Day.mp4', mimeType: 'video/mp4', sizeBytes: 700 });
    streamZoomMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValue({ id: 'zoom-resource' });

    const result = await ingestRecordingForSession(zoomSession);

    expect(result).toEqual({ status: 'ingested', resourceId: 'zoom-resource' });
    expect(findZoomMatchMock).toHaveBeenCalledWith(zoomSession);
    expect(streamZoomMock).toHaveBeenCalled();
    expect(findDriveMatchMock).not.toHaveBeenCalled();
    expect(streamDriveMock).not.toHaveBeenCalled();
  });

  it('a webhook-supplied preResolvedMatch skips the findRecording lookup entirely', async () => {
    findOneResource.mockResolvedValue(null);
    streamZoomMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValue({ id: 'zoom-resource-2' });

    const preResolvedMatch = { downloadUrl: 'https://zoom.us/rec/download/xyz', downloadToken: 'tok', name: 'Build Day.mp4', mimeType: 'video/mp4', sizeBytes: 900 };
    const result = await ingestRecordingForSession(zoomSession, preResolvedMatch);

    expect(result).toEqual({ status: 'ingested', resourceId: 'zoom-resource-2' });
    expect(findZoomMatchMock).not.toHaveBeenCalled();
    expect(streamZoomMock).toHaveBeenCalledWith(preResolvedMatch);
  });
});

describe('ingestRecordingForBooking — general Room bookings (the "+ Book a session" flow)', () => {
  const zoomBooking = {
    id: 'booking-zoom-1',
    room_id: 'room-zoom-1',
    title: 'Study Group',
    meeting_provider: 'zoom',
    related_live_session_id: null,
    google_event_id: '987654321',
    start_at: new Date('2026-08-04T18:30:00Z'),
  } as any;

  it('is a clean no-op for a non-zoom booking (legacy Google Meet ad-hoc bookings are not supported)', async () => {
    const result = await ingestRecordingForBooking({ ...zoomBooking, meeting_provider: 'google_meet' });
    expect(result).toEqual({ status: 'not_found' });
    expect(findOneResource).not.toHaveBeenCalled();
  });

  it('is a clean no-op for a class-session-derived booking (owned by ingestRecordingForSession instead)', async () => {
    const result = await ingestRecordingForBooking({ ...zoomBooking, related_live_session_id: 'session-1' });
    expect(result).toEqual({ status: 'not_found' });
    expect(findOneResource).not.toHaveBeenCalled();
  });

  it('is a clean no-op when the booking never got a Zoom meeting ID (e.g. never scheduled/provisioned)', async () => {
    const result = await ingestRecordingForBooking({ ...zoomBooking, google_event_id: null });
    expect(result).toEqual({ status: 'not_found' });
    expect(findOneResource).not.toHaveBeenCalled();
  });

  it('no-ops when a recording resource already exists (idempotency, same guard as the session path)', async () => {
    findOneResource.mockResolvedValue({ id: 'existing-resource' });
    const result = await ingestRecordingForBooking(zoomBooking);
    expect(result).toEqual({ status: 'already_present', resourceId: 'existing-resource' });
    expect(findByMeetingIdMock).not.toHaveBeenCalled();
  });

  it('finds by exact meeting ID (using the booking start date as the day-window hint) and ingests', async () => {
    findOneResource.mockResolvedValue(null);
    findByMeetingIdMock.mockResolvedValue({ downloadUrl: 'https://zoom.us/rec/download/booking', name: 'Study Group.mp4', mimeType: 'video/mp4', sizeBytes: 400 });
    streamZoomMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValue({ id: 'booking-resource' });

    const result = await ingestRecordingForBooking(zoomBooking);

    expect(result).toEqual({ status: 'ingested', resourceId: 'booking-resource' });
    expect(findByMeetingIdMock).toHaveBeenCalledWith('987654321', '2026-08-04', 'Study Group');
    expect(createResource.mock.calls[0][0]).toMatchObject({
      room_id: 'room-zoom-1', booking_id: 'booking-zoom-1', resource_type: 'recording', mime_type: 'video/mp4',
    });
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({
      aggregateId: 'booking-resource',
      payload: expect.objectContaining({ booking_id: 'booking-zoom-1' }),
    }));
    // Unlike the session path, there's no LiveSession.recording_url to keep in sync.
  });

  it('a webhook-supplied preResolvedMatch skips the findRecordingByMeetingId lookup entirely', async () => {
    findOneResource.mockResolvedValue(null);
    streamZoomMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValue({ id: 'booking-resource-2' });

    const preResolvedMatch = { downloadUrl: 'https://zoom.us/rec/download/xyz', downloadToken: 'tok', name: 'Study Group.mp4', mimeType: 'video/mp4', sizeBytes: 600 };
    const result = await ingestRecordingForBooking(zoomBooking, preResolvedMatch);

    expect(result).toEqual({ status: 'ingested', resourceId: 'booking-resource-2' });
    expect(findByMeetingIdMock).not.toHaveBeenCalled();
    expect(streamZoomMock).toHaveBeenCalledWith(preResolvedMatch);
  });

  it('returns not_found cleanly when no recording matches (recording is still a manual toggle a host may not have used)', async () => {
    findOneResource.mockResolvedValue(null);
    findByMeetingIdMock.mockResolvedValue(null);

    const result = await ingestRecordingForBooking(zoomBooking);

    expect(result).toEqual({ status: 'not_found' });
    expect(streamZoomMock).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
  });
});

describe('ingestRecordingForRoom — always-open persistent video Rooms (found live 2026-08-05: a cohort\'s real class room is one of these)', () => {
  const alwaysOpenRoom = {
    id: 'room-always-open-1',
    name: 'July 2026 - AI Systems Architect',
    is_video: true,
    always_open: true,
    meeting_link: 'https://colaberry.zoom.us/j/89581408269?pwd=abc.1',
  } as any;

  const match = { downloadUrl: 'https://zoom.us/rec/download/room', name: 'room-recording.mp4', mimeType: 'video/mp4', sizeBytes: 1200 };

  it('idempotency keys off the Zoom recording instance uuid, not booking_id (there is no booking for these rooms)', async () => {
    findOneResource.mockResolvedValue({ id: 'existing-room-resource' });

    const result = await ingestRecordingForRoom(alwaysOpenRoom, 'instance-uuid-1', match);

    expect(result).toEqual({ status: 'already_present', resourceId: 'existing-room-resource' });
    expect(findOneResource).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ room_id: 'room-always-open-1', resource_type: 'recording' }),
    }));
    expect(streamZoomMock).not.toHaveBeenCalled();
  });

  it('downloads, attaches with booking_id null, stores the instance uuid in metadata, and emits RecordingAttached', async () => {
    findOneResource.mockResolvedValue(null);
    streamZoomMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValue({ id: 'room-resource-1' });

    const result = await ingestRecordingForRoom(alwaysOpenRoom, 'instance-uuid-2', match);

    expect(result).toEqual({ status: 'ingested', resourceId: 'room-resource-1' });
    expect(createResource.mock.calls[0][0]).toMatchObject({
      room_id: 'room-always-open-1',
      booking_id: null,
      resource_type: 'recording',
      metadata: { zoom_uuid: 'instance-uuid-2', source: 'always_open_room' },
    });
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({
      aggregateId: 'room-resource-1',
      payload: expect.objectContaining({ room_id: 'room-always-open-1' }),
    }));
  });

  it('two different instances of the same persistent meeting both ingest as separate resources (not deduped against each other)', async () => {
    findOneResource.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    streamZoomMock.mockResolvedValue(fakeSource());
    createResource.mockResolvedValueOnce({ id: 'room-resource-a' }).mockResolvedValueOnce({ id: 'room-resource-b' });

    const first = await ingestRecordingForRoom(alwaysOpenRoom, 'uuid-a', match);
    const second = await ingestRecordingForRoom(alwaysOpenRoom, 'uuid-b', match);

    expect(first).toEqual({ status: 'ingested', resourceId: 'room-resource-a' });
    expect(second).toEqual({ status: 'ingested', resourceId: 'room-resource-b' });
    expect(createResource).toHaveBeenCalledTimes(2);
  });
});

describe('findAlwaysOpenRoomForZoomMeeting', () => {
  it('matches a room whose meeting_link resolves to the given Zoom meeting id', async () => {
    const rooms = [
      { id: 'room-a', meeting_link: 'https://colaberry.zoom.us/j/111' },
      { id: 'room-b', meeting_link: 'https://colaberry.zoom.us/j/89581408269' },
    ];
    findAllRooms.mockResolvedValue(rooms);
    extractZoomMeetingIdMock.mockImplementation((link: string) => link?.match(/\/j\/(\d+)/)?.[1] || null);

    const room = await findAlwaysOpenRoomForZoomMeeting('89581408269');

    expect(room).toBe(rooms[1]);
    expect(findAllRooms).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ is_video: true, always_open: true }),
    }));
  });

  it('returns null when no always-open room matches (a 1:1 call, a class session, or an ad-hoc booking on the same account)', async () => {
    findAllRooms.mockResolvedValue([{ id: 'room-a', meeting_link: 'https://colaberry.zoom.us/j/111' }]);
    extractZoomMeetingIdMock.mockImplementation((link: string) => link?.match(/\/j\/(\d+)/)?.[1] || null);

    const room = await findAlwaysOpenRoomForZoomMeeting('999999');
    expect(room).toBeNull();
  });
});
