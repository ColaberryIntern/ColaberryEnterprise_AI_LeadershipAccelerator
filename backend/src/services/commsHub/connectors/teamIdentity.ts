import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import { PROGRAM_IDENTITY_DOMAIN } from '../../staffDetection';

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
 * (RFC 2606), so nothing that mails enrollments can deliver to it (reply emails skip that
 * domain: replyNotificationService). It is out of revenue and funnel numbers because IS_STAFF_SQL
 * (services/staffDetection.ts) counts that domain as Colaberry staff, the same carve-out the agent
 * identities get from their @colaberry.com addresses. It never ranks: leaderboards are scoped to the
 * viewer's cohort and it has none.
 */
export const TEAM_EMAIL = `colaberry-team@${PROGRAM_IDENTITY_DOMAIN}`;
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
    },
  });
  const [member] = await CommunityMember.findOrCreate({
    where: { enrollment_id: enrollment.id },
    defaults: { enrollment_id: enrollment.id, display_name: TEAM_NAME, role: 'staff', last_active_at: new Date() },
  });
  cached = { enrollmentId: enrollment.id, memberId: member.id };
  return cached;
}

export function __resetTeamIdentityForTests(): void { cached = null; }
