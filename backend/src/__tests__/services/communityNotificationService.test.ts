/**
 * communityNotificationService tests (REQ-C6, BC #9985689758): in-app
 * mention/reply notification feed. No DB I/O — models mocked.
 */

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../models/CommunityPost', () => ({}));
jest.mock('../../models/CommunityComment', () => ({}));
jest.mock('../../models/CommunityLike', () => ({}));
jest.mock('../../models/CommunityPostReport', () => ({}));
jest.mock('../../models/CommunityPointsEvent', () => ({}));
jest.mock('../../models/CommunityNotification', () => ({ findAll: jest.fn(), findByPk: jest.fn() }));

import { listNotifications, markNotificationRead } from '../../services/communityNotificationService';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import CommunityNotification from '../../models/CommunityNotification';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findOrCreateMember = CommunityMember.findOrCreate as jest.Mock;
const findAllNotifications = CommunityNotification.findAll as jest.Mock;
const findByPkNotification = CommunityNotification.findByPk as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const memberId = '33333333-3333-3333-3333-333333333333';
const mockEnrollment: any = { id: enrollmentId, full_name: 'Ada Lovelace', cohort_id: 'cohort-1' };
const mockMember: any = { id: memberId, enrollment_id: enrollmentId, display_name: 'Ada Lovelace' };

beforeEach(() => {
  findByPkEnrollment.mockResolvedValue(mockEnrollment);
  findOrCreateMember.mockResolvedValue([mockMember, false]);
});

describe('listNotifications', () => {
  it('happy path: maps read_at to a boolean read flag', async () => {
    findAllNotifications.mockResolvedValue([
      { id: 'n1', notification_type: 'mention', source_type: 'post', source_id: 'p1', read_at: null, created_at: new Date(), actor: { id: 'a1', display_name: 'Bea', avatar_url: null } },
      { id: 'n2', notification_type: 'reply', source_type: 'comment', source_id: 'c1', read_at: new Date(), created_at: new Date(), actor: null },
    ]);

    const result = await listNotifications(enrollmentId);

    expect(result[0].read).toBe(false);
    expect(result[1].read).toBe(true);
    expect(result[1].actor).toBeNull();
  });

  it('boundary path: an empty notification list returns an empty array', async () => {
    findAllNotifications.mockResolvedValue([]);

    expect(await listNotifications(enrollmentId)).toEqual([]);
  });

  it('happy path: scopes the query to the caller\'s own member id', async () => {
    findAllNotifications.mockResolvedValue([]);

    await listNotifications(enrollmentId);

    expect(findAllNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ where: { member_id: memberId } })
    );
  });
});

describe('markNotificationRead', () => {
  it('happy path: sets read_at on an unread notification', async () => {
    const update = jest.fn();
    findByPkNotification.mockResolvedValue({
      id: 'n1', member_id: memberId, notification_type: 'mention', source_type: 'post', source_id: 'p1',
      read_at: null, created_at: new Date(), actor: null, update,
    });

    const result = await markNotificationRead(enrollmentId, 'n1');

    expect(update).toHaveBeenCalledWith({ read_at: expect.any(Date) });
    expect(result.read).toBe(true);
  });

  it('idempotency: marking an already-read notification read again is a no-op', async () => {
    const update = jest.fn();
    findByPkNotification.mockResolvedValue({
      id: 'n1', member_id: memberId, notification_type: 'mention', source_type: 'post', source_id: 'p1',
      read_at: new Date('2026-07-01'), created_at: new Date(), actor: null, update,
    });

    await markNotificationRead(enrollmentId, 'n1');

    expect(update).not.toHaveBeenCalled();
  });

  it('failure path: throws NotFoundError for a missing notification', async () => {
    findByPkNotification.mockResolvedValue(null);

    await expect(markNotificationRead(enrollmentId, 'missing')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });

  it('failure path: throws ForbiddenError for a notification belonging to a different member', async () => {
    findByPkNotification.mockResolvedValue({
      id: 'n1', member_id: 'someone-else', notification_type: 'mention', source_type: 'post', source_id: 'p1',
      read_at: null, created_at: new Date(), actor: null, update: jest.fn(),
    });

    await expect(markNotificationRead(enrollmentId, 'n1')).rejects.toMatchObject({ error_class: 'ForbiddenError' });
  });
});
