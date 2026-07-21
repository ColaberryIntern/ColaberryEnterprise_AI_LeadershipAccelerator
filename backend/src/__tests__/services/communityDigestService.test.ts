/**
 * communityDigestService tests (REQ-C6, BC #9985689758): the deduped daily
 * digest. Trust control: "keyed on (date, member) so re-runs never
 * double-send." No DB I/O — models mocked; communityCalendarService and
 * emailService are mocked at the module level (not their own model deps)
 * since this test only cares about how the digest job uses them.
 */

jest.mock('../../models/CommunityMember', () => ({ findAll: jest.fn() }));
jest.mock('../../models/CommunityPost', () => ({ count: jest.fn() }));
jest.mock('../../models/CommunityNotification', () => ({ count: jest.fn() }));
jest.mock('../../models/CommunityDigestLog', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../models/Enrollment', () => ({}));
jest.mock('../../services/communityCalendarService', () => ({ getUpcomingEvents: jest.fn() }));
jest.mock('../../services/emailService', () => ({ sendCommunityDigestEmail: jest.fn() }));

import { runDailyDigest } from '../../services/communityDigestService';
import CommunityMember from '../../models/CommunityMember';
import CommunityPost from '../../models/CommunityPost';
import CommunityNotification from '../../models/CommunityNotification';
import CommunityDigestLog from '../../models/CommunityDigestLog';
import { getUpcomingEvents } from '../../services/communityCalendarService';
import { sendCommunityDigestEmail } from '../../services/emailService';

const findAllMembers = CommunityMember.findAll as jest.Mock;
const countPosts = CommunityPost.count as jest.Mock;
const countNotifications = CommunityNotification.count as jest.Mock;
const findOrCreateDigestLog = CommunityDigestLog.findOrCreate as jest.Mock;
const getUpcomingEventsMock = getUpcomingEvents as jest.Mock;
const sendCommunityDigestEmailMock = sendCommunityDigestEmail as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  countPosts.mockResolvedValue(0);
  countNotifications.mockResolvedValue(0);
  getUpcomingEventsMock.mockResolvedValue([]);
});

const now = new Date('2026-07-14T08:00:00.000Z');
const memberA: any = { id: 'member-a', enrollment_id: 'enr-a', enrollment: { id: 'enr-a', cohort_id: 'cohort-1', email: 'ada@example.com', full_name: 'Ada Lovelace' } };
const memberB: any = { id: 'member-b', enrollment_id: 'enr-b', enrollment: { id: 'enr-b', cohort_id: 'cohort-1', email: 'grace@example.com', full_name: 'Grace Hopper' } };

describe('runDailyDigest', () => {
  it('happy path: sends one digest per member with an unsent log row for today', async () => {
    findAllMembers.mockResolvedValue([memberA]);
    findOrCreateDigestLog.mockResolvedValue([{ update: jest.fn() }, true]);

    const result = await runDailyDigest(now);

    expect(result).toEqual({ sent: 1, skipped: 0, errors: 0 });
    expect(sendCommunityDigestEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@example.com', digestDate: '2026-07-14' })
    );
  });

  it('idempotency (trust control): a member already digested today is skipped, not re-sent', async () => {
    findAllMembers.mockResolvedValue([memberA]);
    findOrCreateDigestLog.mockResolvedValue([{ update: jest.fn() }, false]);

    const result = await runDailyDigest(now);

    expect(result).toEqual({ sent: 0, skipped: 1, errors: 0 });
    expect(sendCommunityDigestEmailMock).not.toHaveBeenCalled();
  });

  it('idempotency: findOrCreate is keyed on (member_id, digest_date), per the trust control', async () => {
    findAllMembers.mockResolvedValue([memberA]);
    findOrCreateDigestLog.mockResolvedValue([{ update: jest.fn() }, true]);

    await runDailyDigest(now);

    expect(findOrCreateDigestLog).toHaveBeenCalledWith({
      where: { member_id: 'member-a', digest_date: '2026-07-14' },
      defaults: { member_id: 'member-a', digest_date: '2026-07-14' },
    });
  });

  it('happy path: processes multiple members independently, each with their own log row', async () => {
    findAllMembers.mockResolvedValue([memberA, memberB]);
    findOrCreateDigestLog
      .mockResolvedValueOnce([{ update: jest.fn() }, true])
      .mockResolvedValueOnce([{ update: jest.fn() }, false]);

    const result = await runDailyDigest(now);

    expect(result).toEqual({ sent: 1, skipped: 1, errors: 0 });
  });

  it('boundary path: a member with no enrollment record is skipped, not errored', async () => {
    findAllMembers.mockResolvedValue([{ id: 'member-orphan', enrollment_id: 'enr-x', enrollment: null }]);

    const result = await runDailyDigest(now);

    expect(result).toEqual({ sent: 0, skipped: 1, errors: 0 });
    expect(findOrCreateDigestLog).not.toHaveBeenCalled();
  });

  it('failure path: an email-send failure for one member is recorded as an error and does not abort the batch', async () => {
    findAllMembers.mockResolvedValue([memberA, memberB]);
    findOrCreateDigestLog.mockResolvedValue([{ update: jest.fn() }, true]);
    sendCommunityDigestEmailMock.mockRejectedValueOnce(new Error('SMTP down')).mockResolvedValueOnce(undefined);

    const result = await runDailyDigest(now);

    expect(result).toEqual({ sent: 1, skipped: 0, errors: 1 });
  });

  it('boundary path: an empty member list is a clean no-op run', async () => {
    findAllMembers.mockResolvedValue([]);

    expect(await runDailyDigest(now)).toEqual({ sent: 0, skipped: 0, errors: 0 });
  });
});
