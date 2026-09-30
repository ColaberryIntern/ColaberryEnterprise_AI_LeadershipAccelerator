/**
 * generateSessionsFromCohort's Colaberry Commons room linkage (2026-07-31).
 * Real production gap found while completing the room-based waiting-room
 * plan: acceleratorService.createSession already called ensureRoomForSession,
 * but the actual bulk curriculum-schedule generator (this function) never
 * did — so every real, bulk-generated session in production had no linked
 * room at all, silently. Same flag-gated, best-effort pattern as the
 * already-working call site.
 */

const mockEnv = { communityRoomsEnabled: true };
jest.mock('../../config/env', () => ({ env: mockEnv }));

jest.spyOn(console, 'log').mockImplementation(() => undefined);
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

jest.mock('../../models', () => ({
  __esModule: true,
  Cohort: { findByPk: jest.fn() },
  LiveSession: { destroy: jest.fn(), create: jest.fn() },
}));

const mockEnsureRoomForSession = jest.fn();
jest.mock('../communityRooms/roomService', () => ({
  ensureRoomForSession: (...a: any[]) => mockEnsureRoomForSession(...a),
}));

import { Cohort, LiveSession } from '../../models';
import { generateSessionsFromCohort } from '../sessionGenerationService';

const cohortFindByPk = Cohort.findByPk as jest.Mock;
const liveSessionDestroy = LiveSession.destroy as jest.Mock;
const liveSessionCreate = LiveSession.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.communityRoomsEnabled = true;
  liveSessionDestroy.mockResolvedValue(0);
  mockEnsureRoomForSession.mockResolvedValue({ id: 'room-1' });
});

describe('generateSessionsFromCohort room linkage', () => {
  it('calls ensureRoomForSession for every generated session when Community Rooms is enabled', async () => {
    cohortFindByPk.mockResolvedValue({
      id: 'c1', name: 'Test Cohort', start_date: '2026-08-03', // a Monday
      core_day: 'Monday', core_time: '1:00-3:00 PM CT',
    });
    liveSessionCreate.mockImplementation((data: any) => Promise.resolve({ id: `session-${data.session_number}`, ...data }));

    const result = await generateSessionsFromCohort('c1');

    expect(result.sessions.length).toBeGreaterThan(0);
    expect(mockEnsureRoomForSession).toHaveBeenCalledTimes(result.sessions.length);
    expect(mockEnsureRoomForSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-1' }));
  });

  it('does not call ensureRoomForSession when Community Rooms is disabled', async () => {
    mockEnv.communityRoomsEnabled = false;
    cohortFindByPk.mockResolvedValue({
      id: 'c1', name: 'Test Cohort', start_date: '2026-08-03',
      core_day: 'Monday', core_time: '1:00-3:00 PM CT',
    });
    liveSessionCreate.mockImplementation((data: any) => Promise.resolve({ id: `session-${data.session_number}`, ...data }));

    await generateSessionsFromCohort('c1');

    expect(mockEnsureRoomForSession).not.toHaveBeenCalled();
  });

  it('does not let a room-linking failure block session generation (best-effort, non-fatal)', async () => {
    cohortFindByPk.mockResolvedValue({
      id: 'c1', name: 'Test Cohort', start_date: '2026-08-03',
      core_day: 'Monday', core_time: '1:00-3:00 PM CT',
    });
    liveSessionCreate.mockImplementation((data: any) => Promise.resolve({ id: `session-${data.session_number}`, ...data }));
    mockEnsureRoomForSession.mockRejectedValue(new Error('room service down'));

    const result = await generateSessionsFromCohort('c1');

    expect(result.sessions.length).toBeGreaterThan(0);
  });
});
