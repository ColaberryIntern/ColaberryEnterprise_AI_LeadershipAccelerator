/**
 * communityCalendarService tests (REQ-C6, BC #9985689758): merges LiveSession
 * (Mon/Thu sessions) + OpenHouseEvent + CommunityEvent into one sorted feed.
 * No DB I/O — models mocked. Imports resolveCohortId from communityService.ts,
 * so that module's own dependencies need mocks too or the real Model.init()
 * runs against these mocked, non-functional models.
 */

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({}));
jest.mock('../../models/CommunityPost', () => ({}));
jest.mock('../../models/CommunityComment', () => ({}));
jest.mock('../../models/CommunityLike', () => ({}));
jest.mock('../../models/CommunityPostReport', () => ({}));
jest.mock('../../models/CommunityPointsEvent', () => ({}));
jest.mock('../../models/LiveSession', () => ({ findAll: jest.fn() }));
jest.mock('../../models/OpenHouseEvent', () => ({ findAll: jest.fn() }));
jest.mock('../../models/CommunityEvent', () => ({ findAll: jest.fn() }));

import { Op } from 'sequelize';
import { getUpcomingEvents } from '../../services/communityCalendarService';
import Enrollment from '../../models/Enrollment';
import LiveSession from '../../models/LiveSession';
import OpenHouseEvent from '../../models/OpenHouseEvent';
import CommunityEvent from '../../models/CommunityEvent';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findAllSessions = LiveSession.findAll as jest.Mock;
const findAllOpenHouses = OpenHouseEvent.findAll as jest.Mock;
const findAllCommunityEvents = CommunityEvent.findAll as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const cohortId = '22222222-2222-2222-2222-222222222222';
const mockEnrollment: any = { id: enrollmentId, full_name: 'Ada Lovelace', cohort_id: cohortId };
const now = new Date('2026-07-14T12:00:00.000Z');

describe('getUpcomingEvents', () => {
  beforeEach(() => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllSessions.mockResolvedValue([]);
    findAllOpenHouses.mockResolvedValue([]);
    findAllCommunityEvents.mockResolvedValue([]);
  });

  it('happy path: merges all three sources into one feed, sorted ascending', async () => {
    findAllSessions.mockResolvedValue([
      { id: 's1', title: 'Build Day', session_type: 'lab', session_date: '2026-07-16', start_time: '6:00 PM', end_time: '8:00 PM', meeting_link: 'https://meet.example/s1' },
    ]);
    findAllOpenHouses.mockResolvedValue([
      { id: 'o1', title: 'Open House', starts_at: new Date('2026-07-15T18:00:00.000Z'), meeting_link: 'https://meet.example/o1' },
    ]);
    findAllCommunityEvents.mockResolvedValue([
      { id: 'e1', title: 'Office Hours', event_type: 'office_hours', starts_at: new Date('2026-07-14T20:00:00.000Z'), ends_at: null, location_url: null },
    ]);

    const result = await getUpcomingEvents(enrollmentId, now);

    expect(result).toHaveLength(3);
    expect(result.map((e) => e.source)).toEqual(['community_event', 'open_house', 'live_session']);
    expect(result[0].starts_at.getTime()).toBeLessThan(result[1].starts_at.getTime());
    expect(result[1].starts_at.getTime()).toBeLessThan(result[2].starts_at.getTime());
  });

  it('happy path: scopes LiveSession and CommunityEvent queries to the caller\'s cohort', async () => {
    await getUpcomingEvents(enrollmentId, now);

    expect(findAllSessions).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cohort_id: cohortId }) })
    );
    expect(findAllCommunityEvents).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cohort_id: cohortId }) })
    );
  });

  it('boundary path: a cancelled session is excluded (query filters status)', async () => {
    await getUpcomingEvents(enrollmentId, now);

    const callArgs = findAllSessions.mock.calls[0][0];
    expect(callArgs.where.status[Op.in]).toEqual(['scheduled', 'live']);
  });

  it('boundary path: an empty result across all three sources returns an empty array', async () => {
    const result = await getUpcomingEvents(enrollmentId, now);

    expect(result).toEqual([]);
  });

  it('boundary path: a live session earlier today than `now` is filtered out even though session_date matches today', async () => {
    findAllSessions.mockResolvedValue([
      { id: 's-past', title: 'Earlier Today', session_type: 'core', session_date: '2026-07-14', start_time: '6:00 AM', end_time: '8:00 AM', meeting_link: null },
    ]);

    const result = await getUpcomingEvents(enrollmentId, now);

    expect(result).toEqual([]);
  });

  it('failure path: propagates NotFoundError for a missing enrollment', async () => {
    findByPkEnrollment.mockResolvedValue(null);

    await expect(getUpcomingEvents(enrollmentId, now)).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});
