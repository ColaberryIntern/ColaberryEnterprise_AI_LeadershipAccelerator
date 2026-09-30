/**
 * getCheckinInfo's room_id linkage (2026-07-30) — part of retiring the old
 * /portal/sessions/:id waiting room. The public check-in landing page needs
 * the linked Colaberry Commons room's id to route "Open the live room" there
 * instead. Exposing just the id pre-login is safe: the room's actual content
 * stays gated behind auth + cohort entitlement downstream.
 */

jest.mock('../../models', () => ({
  __esModule: true,
  LiveSession: { findByPk: jest.fn() },
  Cohort: { findByPk: jest.fn() },
  CommunityRoom: { findOne: jest.fn() },
}));

import { LiveSession, Cohort, CommunityRoom } from '../../models';
import { getCheckinInfo } from '../../services/sessionKitService';

const liveSessionFindByPk = LiveSession.findByPk as jest.Mock;
const cohortFindByPk = Cohort.findByPk as jest.Mock;
const roomFindOne = CommunityRoom.findOne as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  cohortFindByPk.mockResolvedValue({ name: 'Cohort - July 2026' });
});

describe('getCheckinInfo', () => {
  it('returns the linked room id when the session has a provisioned Commons room', async () => {
    liveSessionFindByPk.mockResolvedValue({
      title: 'Build Day', session_date: '2026-07-30', start_time: '18:30:00', cohort_id: 'c1',
    });
    roomFindOne.mockResolvedValue({ id: 'room-1' });

    const info = await getCheckinInfo('s1');

    expect(info?.room_id).toBe('room-1');
    expect(roomFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { linked_live_session_id: 's1' },
    }));
  });

  it('returns room_id: null for a session with no provisioned room', async () => {
    liveSessionFindByPk.mockResolvedValue({
      title: 'Build Day', session_date: '2026-07-30', start_time: '18:30:00', cohort_id: 'c1',
    });
    roomFindOne.mockResolvedValue(null);

    const info = await getCheckinInfo('s1');

    expect(info?.room_id).toBeNull();
  });

  it('returns null when the session does not exist', async () => {
    liveSessionFindByPk.mockResolvedValue(null);

    expect(await getCheckinInfo('missing')).toBeNull();
    expect(roomFindOne).not.toHaveBeenCalled();
  });
});
