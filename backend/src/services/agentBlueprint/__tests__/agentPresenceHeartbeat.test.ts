/**
 * runAgentPresenceHeartbeat — the generic extraction Reese's own
 * reesePresenceHeartbeat.ts now delegates to (REESE_STANDARD_AUDIT.md gap
 * 10 — closed). Same regression-safety property the original Reese-only
 * test proved: NEVER touches any CommunityMember row other than the one
 * keyed to the given email's own Enrollment.
 */
jest.mock('../../../models/Enrollment', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));

import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import { runAgentPresenceHeartbeat } from '../agentPresenceHeartbeat';

const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockCommunityMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runAgentPresenceHeartbeat', () => {
  it('happy path: updates exactly one CommunityMember row — the one keyed to the given email — and only touches last_active_at', async () => {
    const enrollment = { id: 'enrollment-dara-1' };
    const update = jest.fn().mockResolvedValue(undefined);
    mockEnrollmentFindOne.mockResolvedValue(enrollment);
    mockCommunityMemberFindOne.mockResolvedValue({ id: 'cm-dara-1', update });

    await runAgentPresenceHeartbeat('dara@colaberry.com');

    expect(mockEnrollmentFindOne).toHaveBeenCalledWith({ where: { email: 'dara@colaberry.com' } });
    expect(mockCommunityMemberFindOne).toHaveBeenCalledWith({ where: { enrollment_id: enrollment.id } });
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(['last_active_at']);
    expect(payload.last_active_at).toBeInstanceOf(Date);
  });

  it('genuinely generic: two different emails resolve two completely independent rows, never conflated', async () => {
    const daraEnrollment = { id: 'enrollment-dara-1' };
    const reeseEnrollment = { id: 'enrollment-reese-1' };
    const daraUpdate = jest.fn().mockResolvedValue(undefined);
    const reeseUpdate = jest.fn().mockResolvedValue(undefined);

    mockEnrollmentFindOne.mockResolvedValueOnce(daraEnrollment).mockResolvedValueOnce(reeseEnrollment);
    mockCommunityMemberFindOne
      .mockResolvedValueOnce({ id: 'cm-dara-1', update: daraUpdate })
      .mockResolvedValueOnce({ id: 'cm-reese-1', update: reeseUpdate });

    await runAgentPresenceHeartbeat('dara@colaberry.com');
    await runAgentPresenceHeartbeat('reese@colaberry.com');

    expect(daraUpdate).toHaveBeenCalledTimes(1);
    expect(reeseUpdate).toHaveBeenCalledTimes(1);
  });

  it('boundary: no-ops safely when the enrollment does not exist yet (before first seed)', async () => {
    mockEnrollmentFindOne.mockResolvedValue(null);
    await expect(runAgentPresenceHeartbeat('dara@colaberry.com')).resolves.toBeUndefined();
    expect(mockCommunityMemberFindOne).not.toHaveBeenCalled();
  });

  it('boundary: no-ops safely when the enrollment exists but its CommunityMember row does not yet', async () => {
    mockEnrollmentFindOne.mockResolvedValue({ id: 'enrollment-dara-1' });
    mockCommunityMemberFindOne.mockResolvedValue(null);
    await expect(runAgentPresenceHeartbeat('dara@colaberry.com')).resolves.toBeUndefined();
  });
});
