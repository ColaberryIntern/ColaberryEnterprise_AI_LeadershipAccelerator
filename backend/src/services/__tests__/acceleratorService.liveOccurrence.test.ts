/**
 * L7.1 — enabling live on the Accelerator session setup flow creates a broadcast occurrence.
 *
 * Shaped after sessionGenerationService.roomLinkage.test.ts, which covers the sibling side
 * effect on the same function. Same three questions asked of the new one: does it fire when
 * enabled, stay quiet when not, and stay non-fatal when it fails.
 *
 * It also fills a real gap: before this file, NOTHING tested acceleratorService.createSession or
 * updateSession at all, despite createSession already carrying a side effect.
 */

const mockEnv = { communityRoomsEnabled: true };
jest.mock('../../config/env', () => ({ env: mockEnv }));

jest.spyOn(console, 'warn').mockImplementation(() => undefined);

jest.mock('../../models', () => ({
  __esModule: true,
  Cohort: {}, Enrollment: {}, AttendanceRecord: {}, AssignmentSubmission: {},
  Lead: {}, CampaignLead: {}, ScheduledEmail: {}, Subscription: {}, ProgramBlueprint: {},
  LiveSession: { create: jest.fn(), findByPk: jest.fn() },
}));

const mockEnsureRoomForSession = jest.fn();
jest.mock('../communityRooms/roomService', () => ({
  ensureRoomForSession: (...a: any[]) => mockEnsureRoomForSession(...a),
}));

const mockEnsureOccurrence = jest.fn();
const mockIsLiveEnabled = jest.fn();
jest.mock('../broadcast/broadcastSessionOccurrence', () => ({
  ensureOccurrenceForSession: (...a: any[]) => mockEnsureOccurrence(...a),
  isLiveEnabledForSession: (...a: any[]) => mockIsLiveEnabled(...a),
}));

import { LiveSession } from '../../models';
import { createSession, updateSession } from '../acceleratorService';

const liveSessionCreate = LiveSession.create as jest.Mock;
const liveSessionFindByPk = LiveSession.findByPk as jest.Mock;

const NEW_SESSION = {
  cohort_id: 'c1', session_number: 3, title: 'Week 3 Build Day',
  session_date: '2026-10-20', start_time: '09:00', end_time: '09:30',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.communityRoomsEnabled = true;
  mockEnsureRoomForSession.mockResolvedValue({ id: 'room-1' });
  mockEnsureOccurrence.mockResolvedValue({ outcome: 'created', occurrenceId: 'occ-1' });
  mockIsLiveEnabled.mockResolvedValue(false);
  liveSessionCreate.mockImplementation((d: any) => Promise.resolve({ id: 'session-1', ...d }));
});

describe('createSession — Colaberry Live occurrence', () => {
  it('creates an occurrence, with the room id, when live is enabled', async () => {
    await createSession(NEW_SESSION as any, { liveEnabled: true });

    expect(mockEnsureOccurrence).toHaveBeenCalledTimes(1);
    const [session, roomId] = mockEnsureOccurrence.mock.calls[0];
    expect(session).toEqual(expect.objectContaining({ id: 'session-1', title: 'Week 3 Build Day' }));
    // room_id is the ONLY key joining an occurrence to anything else in the portal, so passing
    // it is the whole point of capturing ensureRoomForSession's return value.
    expect(roomId).toBe('room-1');
  });

  it('does NOT create an occurrence when live was not enabled', async () => {
    await createSession(NEW_SESSION as any);

    expect(mockEnsureOccurrence).not.toHaveBeenCalled();
    // The room side effect is unconditional and must be unaffected by this change.
    expect(mockEnsureRoomForSession).toHaveBeenCalledTimes(1);
  });

  it('does not let an occurrence failure block session creation (best-effort, non-fatal)', async () => {
    mockEnsureOccurrence.mockRejectedValue(new Error('broadcast tables missing'));

    const session = await createSession(NEW_SESSION as any, { liveEnabled: true });

    expect(session).toEqual(expect.objectContaining({ id: 'session-1' }));
  });

  it('passes a null room id when Community Rooms is off, so the refusal is the occurrence path\'s to make', async () => {
    mockEnv.communityRoomsEnabled = false;
    mockEnsureOccurrence.mockResolvedValue({ outcome: 'refused', occurrenceId: null, reason: 'no_room' });

    await createSession(NEW_SESSION as any, { liveEnabled: true });

    expect(mockEnsureRoomForSession).not.toHaveBeenCalled();
    expect(mockEnsureOccurrence).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('survives a room failure and still attempts the occurrence with a null room', async () => {
    mockEnsureRoomForSession.mockRejectedValue(new Error('room service down'));

    const session = await createSession(NEW_SESSION as any, { liveEnabled: true });

    expect(session).toEqual(expect.objectContaining({ id: 'session-1' }));
    expect(mockEnsureOccurrence).toHaveBeenCalledWith(expect.anything(), null);
  });
});

describe('updateSession — Colaberry Live occurrence', () => {
  beforeEach(() => {
    liveSessionFindByPk.mockResolvedValue({
      id: 'session-1', title: 'Week 3 Build Day',
      update: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('creates the occurrence when live is enabled on an edit', async () => {
    await updateSession('session-1', { title: 'Renamed' }, { liveEnabled: true });

    expect(mockEnsureOccurrence).toHaveBeenCalledTimes(1);
  });

  it('RE-TIMES an already-live session even when the box was not ticked', async () => {
    // The occurrence key embeds the start instant, so a rescheduled class whose occurrence is
    // not moved would keep the old time — and the preview window and access decision are both
    // measured from it. Requiring the admin to re-tick a checkbox to keep them in sync is the
    // bug this test exists to prevent.
    mockIsLiveEnabled.mockResolvedValue(true);
    mockEnsureOccurrence.mockResolvedValue({ outcome: 'retimed', occurrenceId: 'occ-1' });

    await updateSession('session-1', { session_date: '2026-10-21' });

    expect(mockEnsureOccurrence).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way for a session that is not live and never was', async () => {
    await updateSession('session-1', { title: 'Renamed' });

    expect(mockEnsureOccurrence).not.toHaveBeenCalled();
    expect(mockEnsureRoomForSession).not.toHaveBeenCalled();
  });

  it('returns null for a missing session without touching the broadcast path', async () => {
    liveSessionFindByPk.mockResolvedValue(null);

    const result = await updateSession('nope', { title: 'x' }, { liveEnabled: true });

    expect(result).toBeNull();
    expect(mockEnsureOccurrence).not.toHaveBeenCalled();
  });

  it('does not let the already-enabled lookup failing turn an edit into an error', async () => {
    mockIsLiveEnabled.mockRejectedValue(new Error('db down'));

    const session = await updateSession('session-1', { title: 'Renamed' });

    expect(session).toEqual(expect.objectContaining({ id: 'session-1' }));
    expect(mockEnsureOccurrence).not.toHaveBeenCalled();
  });
});
