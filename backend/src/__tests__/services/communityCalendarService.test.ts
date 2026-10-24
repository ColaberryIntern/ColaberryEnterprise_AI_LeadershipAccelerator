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
// MOCKED AT THE SERVICE BOUNDARY, not the model layer. `communityService` imports
// `subscriptionService`, whose own line 2 is `import { Enrollment, Cohort, Subscription } from
// '../models'` - so importing it executes `models/index.ts`, and line 548 there runs
// `Cohort.hasMany(Enrollment, ...)` against the plain object this file mocks as a model.
// Sequelize refuses it and the suite dies at IMPORT, before a single test, which is how it ended
// up on `jest.ci.config.ts`'s ignore list with no test names ever attached to the failure.
// Mocking a model harder cannot fix that; the index associates whatever it is handed.
jest.mock('../../services/subscriptionService', () => ({
  activeCompEnrollmentIds: jest.fn(async () => new Set<string>()),
}));

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

  // These two did not exist before, and their absence is why a five-hour error lived here
  // unnoticed: every pre-existing assertion checked ORDER or membership, never the actual
  // instant, and both the buggy and correct derivations produce the same order for the
  // fixtures above.
  it('resolves a live session wall-clock as CENTRAL, not as UTC', async () => {
    findAllSessions.mockResolvedValue([
      { id: 's-tz', title: 'Evening Class', session_type: 'core', session_date: '2026-07-16', start_time: '6:00 PM', end_time: '8:00 PM', meeting_link: null },
    ]);

    const [event] = await getUpcomingEvents(enrollmentId, now);

    // 2026-07-16 is CDT (UTC-5), so 6:00 PM Central is 23:00Z.
    expect(event.starts_at.toISOString()).toBe('2026-07-16T23:00:00.000Z');
    // The bug: a naive parse yields 18:00Z. If these were ever equal the conversion is gone.
    expect(event.starts_at.toISOString()).not.toBe('2026-07-16T18:00:00.000Z');
    expect(event.ends_at!.toISOString()).toBe('2026-07-17T01:00:00.000Z');
  });

  it('tolerates the trailing seconds a Sequelize TIME column returns', async () => {
    // The removed local parser rejected "HH:MM:SS" and silently fell through to 10:00,
    // moving the class by eight hours with no error anywhere.
    findAllSessions.mockResolvedValue([
      { id: 's-sec', title: 'Evening Class', session_type: 'core', session_date: '2026-07-16', start_time: '18:00:00', end_time: '20:00:00', meeting_link: null },
    ]);

    const [event] = await getUpcomingEvents(enrollmentId, now);

    expect(event.starts_at.toISOString()).toBe('2026-07-16T23:00:00.000Z');
    expect(event.starts_at.toISOString()).not.toBe('2026-07-16T15:00:00.000Z'); // the 10:00 CDT fallback
  });

  it('failure path: propagates NotFoundError for a missing enrollment', async () => {
    findByPkEnrollment.mockResolvedValue(null);

    await expect(getUpcomingEvents(enrollmentId, now)).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});
