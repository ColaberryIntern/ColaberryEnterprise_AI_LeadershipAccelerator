/**
 * getNextLiveSession's room_id linkage (2026-07-30). Part of retiring the old
 * /portal/sessions/:id waiting room in favor of the Colaberry Commons room
 * ensureRoomForSession() already auto-provisions per session — the Today card
 * and topbar pill need room_id to route into that room. selectNextLiveSession
 * itself (lowest-numbered scheduled/live session) was also previously untested.
 */

jest.mock('../../models', () => ({
  __esModule: true,
  LiveSession: { findAll: jest.fn() },
  Cohort: { findByPk: jest.fn() },
}));

import { LiveSession, Cohort } from '../../models';
import { getNextLiveSession, selectNextLiveSession } from '../../services/participantService';

const liveSessionFindAll = LiveSession.findAll as jest.Mock;
const cohortFindByPk = Cohort.findByPk as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  cohortFindByPk.mockResolvedValue({ timezone: 'America/Chicago' });
});

describe('selectNextLiveSession', () => {
  it('picks the lowest-numbered scheduled/live session, skipping completed ones', () => {
    const sessions = [
      { session_number: 1, status: 'completed' },
      { session_number: 3, status: 'scheduled' },
      { session_number: 2, status: 'live' },
    ];
    expect(selectNextLiveSession(sessions)?.session_number).toBe(2);
  });

  it('returns null when every session is completed or cancelled', () => {
    const sessions = [{ session_number: 1, status: 'completed' }, { session_number: 2, status: 'cancelled' }];
    expect(selectNextLiveSession(sessions)).toBeNull();
  });
});

describe('getNextLiveSession', () => {
  const baseSession = {
    id: 's1', session_number: 1, title: 'Build Day', session_date: '2026-07-30',
    start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    meeting_link: 'https://meet.example/abc', meeting_provider: 'google_meet',
  };

  it('surfaces the linked Colaberry Commons room id when one exists', async () => {
    liveSessionFindAll.mockResolvedValue([
      { ...baseSession, communityRoom: { id: 'room-1' } },
    ]);

    const result = await getNextLiveSession('cohort-1');

    expect(result.next_session?.room_id).toBe('room-1');
  });

  it('returns room_id: null for a session with no provisioned room (left join)', async () => {
    liveSessionFindAll.mockResolvedValue([{ ...baseSession, communityRoom: null }]);

    const result = await getNextLiveSession('cohort-1');

    expect(result.next_session?.room_id).toBeNull();
  });

  it('returns null next_session when nothing is upcoming', async () => {
    liveSessionFindAll.mockResolvedValue([]);

    const result = await getNextLiveSession('cohort-1');

    expect(result.next_session).toBeNull();
  });
});
