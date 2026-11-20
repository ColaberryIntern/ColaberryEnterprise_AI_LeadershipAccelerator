import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';

/**
 * "Colaberry Team": the community identity hub messages are posted as (CH7.1, design 03's feed card).
 *
 * Why not the approver's own account: a hub post goes to several cohort feeds, and a person's
 * enrollment sits in one cohort; it is sent later by the worker, not by a person at a keyboard; and
 * members should see the program speaking, not whichever staff member clicked Approve.
 *
 * It follows the agent identities' shape (agentBlueprint/agentIdentitySeed.ts: an Enrollment with no
 * cohort, portal access off, and a CommunityMember) WITHOUT an AiAgent or AdminUser row: nobody
 * operates it and it never signs in. The address uses the reserved `.invalid` top-level domain
 * (RFC 2606), so no automation that mails enrollments can ever deliver to it. payment_mode 'test'
 * keeps it out of live enrollment and revenue counts.
 */
export const TEAM_EMAIL = 'colaberry-team@comms-hub.invalid';
export const TEAM_NAME = 'Colaberry Team';

let cached: { enrollmentId: string; memberId: string } | null = null;

export async function ensureTeamIdentity(): Promise<{ enrollmentId: string; memberId: string }> {
  if (cached) return cached;
  const [enrollment] = await Enrollment.findOrCreate({
    where: { email: TEAM_EMAIL },
    defaults: {
      full_name: TEAM_NAME, email: TEAM_EMAIL, company: 'Colaberry',
      payment_status: 'paid', payment_method: 'invoice', payment_mode: 'test',
      status: 'active', tier: 'member', cohort_id: null, enrollment_type: 'standard', portal_enabled: false,
    } as never,
  });
  const [member] = await CommunityMember.findOrCreate({
    where: { enrollment_id: enrollment.id },
    defaults: { enrollment_id: enrollment.id, display_name: TEAM_NAME, role: 'staff', last_active_at: new Date() } as never,
  });
  cached = { enrollmentId: enrollment.id, memberId: member.id };
  return cached;
}

export function __resetTeamIdentityForTests(): void { cached = null; }
