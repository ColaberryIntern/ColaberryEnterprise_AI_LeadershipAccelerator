jest.spyOn(console, 'error').mockImplementation(() => undefined);
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

const mockRenderKitDoc = jest.fn();
jest.mock('../sessionKitDocService', () => ({ renderSessionKitDoc: (...a: unknown[]) => mockRenderKitDoc(...a) }));

const mockEnsureBooking = jest.fn();
jest.mock('../sessionRecordingService', () => ({ ensureBookingForSession: (...a: unknown[]) => mockEnsureBooking(...a) }));

const mockEmit = jest.fn();
jest.mock('../communityRooms/roomOutboxService', () => ({ emitRoomEvent: (...a: unknown[]) => mockEmit(...a) }));
// roomEvents is deliberately NOT mocked. Mocking it hid a real bug: the service
// referenced ROOM_EVENTS.RESOURCE_ADDED, which does not exist, and the mock
// invented it so local tsc and these tests both passed. CI caught it. Use the
// real constants so an invalid event name fails here first.
jest.mock('../communityRooms/roomShared', () => ({ log: jest.fn() }));
jest.mock('../../config/upload', () => ({ ROOM_RESOURCE_DIR: '/fake/room-resources' }));

const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockFindAll = jest.fn();
jest.mock('../../models/RoomResource', () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => mockFindOne(...a), create: (...a: unknown[]) => mockCreate(...a) },
}));
jest.mock('../../models/LiveSession', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockFindAll(...a) },
}));

import fs from 'fs';
import { attachClassNotesForSession, attachClassNotesForCompletedSessions } from '../sessionClassNotesService';

const booking = { id: 'booking-1', room_id: 'room-1' };
const session = { id: 'session-5', session_number: 5, title: 'Week 2 · Build Day' } as any;

let writeSpy: jest.SpyInstance;
let unlinkSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureBooking.mockResolvedValue(booking);
  mockEmit.mockResolvedValue(undefined);
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
  writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('attachClassNotesForSession', () => {
  it('renders the STANDALONE deck (not the live one) and stores it as a file resource', async () => {
    mockFindOne.mockResolvedValue(null);
    mockRenderKitDoc.mockResolvedValue('<html>deck</html>');
    mockCreate.mockResolvedValue({ id: 'notes-1' });

    const result = await attachClassNotesForSession(session);

    expect(mockRenderKitDoc).toHaveBeenCalledWith('session-5', 'standalone');
    expect(writeSpy).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      room_id: 'room-1',
      booking_id: 'booking-1',
      resource_type: 'file',
      mime_type: 'text/html',
      title: 'Class Notes — Week 2 · Build Day',
      metadata: { source: 'class_notes', session_id: 'session-5' },
    }));
    expect(result).toEqual({ status: 'attached', resourceId: 'notes-1' });
  });

  it('is idempotent — a second sweep does not re-snapshot or duplicate', async () => {
    mockFindOne.mockResolvedValue({ id: 'notes-existing' });

    const result = await attachClassNotesForSession(session);

    expect(result).toEqual({ status: 'already_present', resourceId: 'notes-existing' });
    expect(mockRenderKitDoc).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('force re-snapshots in place, keeping the same resource id so shared links survive', async () => {
    const existing = { id: 'notes-1', storage_key: 'old.html', update: jest.fn().mockResolvedValue(undefined) };
    mockFindOne.mockResolvedValue(existing);
    mockRenderKitDoc.mockResolvedValue('<html>updated deck</html>');

    const result = await attachClassNotesForSession(session, { force: true });

    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ mime_type: 'text/html' }));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('old.html')); // old bytes reclaimed
    expect(result).toEqual({ status: 'attached', resourceId: 'notes-1' });
  });

  it('returns not_found without writing anything when the deck cannot be rendered', async () => {
    mockFindOne.mockResolvedValue(null);
    mockRenderKitDoc.mockResolvedValue(null);

    const result = await attachClassNotesForSession(session);

    expect(result).toEqual({ status: 'not_found' });
    expect(writeSpy).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not leave an orphan file behind when the row insert fails', async () => {
    mockFindOne.mockResolvedValue(null);
    mockRenderKitDoc.mockResolvedValue('<html>deck</html>');
    mockCreate.mockRejectedValue(new Error('db down'));

    await expect(attachClassNotesForSession(session)).rejects.toThrow('db down');
    expect(unlinkSpy).toHaveBeenCalled();
  });

  it('still succeeds when the room feed event fails (snapshot must not be undone)', async () => {
    mockFindOne.mockResolvedValue(null);
    mockRenderKitDoc.mockResolvedValue('<html>deck</html>');
    mockCreate.mockResolvedValue({ id: 'notes-2' });
    mockEmit.mockRejectedValue(new Error('outbox unavailable'));

    const result = await attachClassNotesForSession(session);

    expect(result).toEqual({ status: 'attached', resourceId: 'notes-2' });
  });

  it('emits a REAL room event type (guards the bug a mocked roomEvents hid)', async () => {
    mockFindOne.mockResolvedValue(null);
    mockRenderKitDoc.mockResolvedValue('<html>deck</html>');
    mockCreate.mockResolvedValue({ id: 'notes-3' });

    await attachClassNotesForSession(session);

    const { ROOM_EVENTS } = jest.requireActual('../communityRooms/roomEvents');
    const emitted = mockEmit.mock.calls[0][0];
    expect(Object.values(ROOM_EVENTS)).toContain(emitted.eventType);
    expect(emitted.eventType).toBe(ROOM_EVENTS.ArtifactShared);
    expect(emitted.aggregateId).toBe('notes-3');
  });
});

describe('attachClassNotesForCompletedSessions', () => {
  it('one failing deck does not stop the rest of the backfill', async () => {
    mockFindAll.mockResolvedValue([
      { id: 's1', session_number: 1, title: 'Orientation' },
      { id: 's2', session_number: 2, title: 'Week 1 Architecture' },
      { id: 's3', session_number: 3, title: 'Week 1 Build' },
    ]);
    mockFindOne.mockResolvedValue(null);
    mockRenderKitDoc
      .mockResolvedValueOnce('<html>1</html>')
      .mockRejectedValueOnce(new Error('render blew up'))
      .mockResolvedValueOnce('<html>3</html>');
    mockCreate.mockResolvedValue({ id: 'notes-x' });

    const result = await attachClassNotesForCompletedSessions();

    expect(result).toEqual({ attached: 2, alreadyPresent: 0, failed: 1 });
  });
});
