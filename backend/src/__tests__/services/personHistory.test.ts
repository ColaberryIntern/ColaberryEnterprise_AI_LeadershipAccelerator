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
    Enrollment: { findByPk: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
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
    AccountCredit: emptyList(),
    Subscription: emptyList(),
  };
});

import { Enrollment, Lead, Subscription } from '../../models';
import { getEnrollmentHistory } from '../../services/personHistoryService';

const findByPk = Enrollment.findByPk as jest.Mock;
const enrollmentFindAll = Enrollment.findAll as jest.Mock;
const leadFindOne = Lead.findOne as jest.Mock;
const subscriptionFindAll = Subscription.findAll as jest.Mock;

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

  it('reports free_access true when the active comp subscription lives on a SIBLING enrollment, not the one being viewed (Brianna Woodard shape, 2026-07-31)', async () => {
    findByPk.mockResolvedValue({
      toJSON: () => ({
        id: 'explorer-row', email: 'brianna_w_22@outlook.com', full_name: 'Brianna Woodard',
        enrollment_type: 'explorer', payment_status: 'pending', amount_paid: null,
        created_at: '2026-07-21T00:00:00Z', cohort: { name: 'Explorer — Prospects' },
      }),
    });
    leadFindOne.mockResolvedValue(null);
    enrollmentFindAll.mockResolvedValue([
      { toJSON: () => ({ id: 'explorer-row', email: 'brianna_w_22@outlook.com', payment_status: 'pending', amount_paid: null, created_at: '2026-07-21T00:00:00Z' }) },
      { toJSON: () => ({ id: 'member-row', email: 'brianna_w_22@outlook.com', payment_status: 'paid', amount_paid: '0.00', created_at: '2026-07-21T00:10:00Z' }) },
    ]);
    subscriptionFindAll.mockResolvedValue([
      { toJSON: () => ({ enrollment_id: 'member-row', plan: 'comp', status: 'active' }) },
    ]);

    const h = await getEnrollmentHistory('explorer-row');

    expect(h!.profile.free_access).toBe(true);
    expect(h!.profile.enrollment_records).toBe(2);
  });

  it('reports free_access false when no sibling holds an active comp subscription (no false positive)', async () => {
    findByPk.mockResolvedValue({
      toJSON: () => ({ id: 'e1', email: 'nofree@example.com', full_name: 'No Free', enrollment_type: 'standard', created_at: '2026-07-01T00:00:00Z', cohort: null }),
    });
    leadFindOne.mockResolvedValue(null);
    enrollmentFindAll.mockResolvedValue([{ toJSON: () => ({ id: 'e1', email: 'nofree@example.com', payment_status: 'paid', amount_paid: '199.00', created_at: '2026-07-01T00:00:00Z' }) }]);
    subscriptionFindAll.mockResolvedValue([{ toJSON: () => ({ enrollment_id: 'e1', plan: 'monthly', status: 'active' }) }]);

    const h = await getEnrollmentHistory('e1');

    expect(h!.profile.free_access).toBe(false);
  });
});
