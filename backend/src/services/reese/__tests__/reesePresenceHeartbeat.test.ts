/**
 * Regression-safety test for runReesePresenceHeartbeat() — the critical property
 * is that it NEVER touches any CommunityMember row other than Reese's own, even
 * when multiple rows exist (protects real student presence data from a bug here).
 */
jest.mock('../../../models/Enrollment', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));

import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import { runReesePresenceHeartbeat } from '../reesePresenceHeartbeat';
import { REESE_EMAIL } from '../reeseIdentitySeed';

const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockCommunityMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runReesePresenceHeartbeat', () => {
  it('happy path: updates exactly one CommunityMember row — Reese\'s own — and only touches last_active_at', async () => {
    const reeseEnrollment = { id: 'enrollment-reese-1' };
    const reeseUpdate = jest.fn().mockResolvedValue(undefined);
    const reeseMember = { id: 'cm-reese-1', update: reeseUpdate };
    mockEnrollmentFindOne.mockResolvedValue(reeseEnrollment);
    mockCommunityMemberFindOne.mockResolvedValue(reeseMember);

    await runReesePresenceHeartbeat();

    expect(mockEnrollmentFindOne).toHaveBeenCalledWith({ where: { email: REESE_EMAIL } });
    expect(mockCommunityMemberFindOne).toHaveBeenCalledWith({ where: { enrollment_id: reeseEnrollment.id } });
    expect(reeseUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = reeseUpdate.mock.calls[0][0];
    expect(Object.keys(updatePayload)).toEqual(['last_active_at']);
    expect(updatePayload.last_active_at).toBeInstanceOf(Date);
  });

  it('regression-safety boundary: only queries by Reese\'s own enrollment_id — never a bulk update across all CommunityMember rows', async () => {
    // If this ever regressed to a bulk CommunityMember.update({...}, { where: {} })
    // call, it would silently reset every real student's presence. Assert the
    // lookup is scoped to a single enrollment_id, not a table-wide operation.
    const reeseEnrollment = { id: 'enrollment-reese-1' };
    const reeseUpdate = jest.fn().mockResolvedValue(undefined);
    mockEnrollmentFindOne.mockResolvedValue(reeseEnrollment);
    mockCommunityMemberFindOne.mockResolvedValue({ id: 'cm-reese-1', update: reeseUpdate });

    await runReesePresenceHeartbeat();

    const call = mockCommunityMemberFindOne.mock.calls[0][0];
    expect(call.where.enrollment_id).toBe(reeseEnrollment.id);
    expect(Object.keys(call.where)).toEqual(['enrollment_id']);
  });

  it('boundary: no-ops safely (no crash) when the Reese enrollment does not exist yet (before first seed)', async () => {
    mockEnrollmentFindOne.mockResolvedValue(null);
    await expect(runReesePresenceHeartbeat()).resolves.toBeUndefined();
    expect(mockCommunityMemberFindOne).not.toHaveBeenCalled();
  });

  it('boundary: no-ops safely when the enrollment exists but its CommunityMember row does not yet', async () => {
    mockEnrollmentFindOne.mockResolvedValue({ id: 'enrollment-reese-1' });
    mockCommunityMemberFindOne.mockResolvedValue(null);
    await expect(runReesePresenceHeartbeat()).resolves.toBeUndefined();
  });
});
