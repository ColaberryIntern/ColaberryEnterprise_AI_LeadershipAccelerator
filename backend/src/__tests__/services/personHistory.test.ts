/**
 * getEnrollmentHistory — Person 360 aggregation (CC-20260712-b4x9).
 * Proves it degrades gracefully (empty sources → a valid shape with the
 * Registered event) and returns null for a missing enrollment.
 */

jest.spyOn(console, 'error').mockImplementation(() => {});

jest.mock('../../models', () => {
  const emptyList = () => ({ findAll: jest.fn().mockResolvedValue([]) });
  return {
    __esModule: true,
    Enrollment: { findByPk: jest.fn() },
    Lead: { findOne: jest.fn() },
    Cohort: {},
    LiveSession: {},
    CommunicationLog: emptyList(),
    CampaignLead: emptyList(),
    Campaign: emptyList(),
    AssignmentSubmission: emptyList(),
    AttendanceRecord: emptyList(),
    StudentNavigationEvent: emptyList(),
    UserCurriculumProfile: { findOne: jest.fn().mockResolvedValue(null) },
    Project: emptyList(),
    LessonInstance: emptyList(),
    ScheduledEmail: emptyList(),
    LeadTemperatureHistory: emptyList(),
  };
});

import { Enrollment, Lead } from '../../models';
import { getEnrollmentHistory } from '../../services/personHistoryService';

const findByPk = Enrollment.findByPk as jest.Mock;
const leadFindOne = Lead.findOne as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getEnrollmentHistory', () => {
  it('returns null when the enrollment does not exist', async () => {
    findByPk.mockResolvedValue(null);
    expect(await getEnrollmentHistory('missing')).toBeNull();
  });

  it('builds a valid 360 with a Registered event and zeroed summary when there is no other data', async () => {
    findByPk.mockResolvedValue({
      toJSON: () => ({
        id: 'e1', email: 'A@b.com', full_name: 'Ada', enrollment_type: 'explorer',
        created_at: '2026-07-01T00:00:00Z', cohort: { name: 'Explorer — Prospects' },
      }),
    });
    leadFindOne.mockResolvedValue(null);

    const h = await getEnrollmentHistory('e1');

    expect(h).not.toBeNull();
    expect(h!.profile.full_name).toBe('Ada');
    expect(h!.acquisition).toBeNull();
    expect(h!.summary).toEqual({ emails: 0, campaigns: 0, sessionsAttended: 0, submissions: 0, pagesViewed: 0, lessonsCompleted: 0 });
    expect(h!.timeline.some((ev) => ev.kind === 'registered')).toBe(true);
  });
});
