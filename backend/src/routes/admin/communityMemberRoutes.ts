import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

/**
 * GET /api/admin/community/members?search=
 * Admin roster for the role-assignment screen — every community member (across
 * cohorts) with name + email + current role. Optional name search (ILIKE).
 */
router.get('/api/admin/community/members', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { listMembersForAdmin } = await import('../../services/communityService');
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const members = await listMembersForAdmin(search);
    res.json({ members });
  } catch (err: any) {
    console.error('[CommunityMemberRoutes] GET /community/members error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/community/members/:memberId/role
 * Admin assigns a directory role (student | mentor | staff) to a community
 * member. Idempotent — re-setting the same role is a no-op write. Audited
 * automatically via auditMiddleware (adminRoutes.ts).
 */
router.patch('/api/admin/community/members/:memberId/role', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { setMemberRole, isMemberRole } = await import('../../services/communityService');
    const role = (req.body?.role ?? '') as string;
    if (!isMemberRole(role)) {
      res.status(400).json({ error: "role must be one of 'student', 'mentor', 'staff'" });
      return;
    }
    const profile = await setMemberRole(req.params.memberId as string, role);
    res.json({ member: profile });
  } catch (err: any) {
    const status = err?.error_class === 'NotFoundError' ? 404 : err?.error_class === 'ValidationError' ? 400 : 500;
    console.error('[CommunityMemberRoutes] PATCH /community/members/:memberId/role error:', err.message);
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST/DELETE /api/admin/community/members/:memberId/free-access
 * Admin grants (POST) or revokes (DELETE) a comped "Free Access" seat for the
 * member — full program access at $0, no employee/staff role, normal student
 * experience. Resolves the member → enrollment, then delegates to the
 * subscription service. Idempotent (grant reuses an active comp; revoke no-ops
 * when none exists).
 */
async function resolveMemberEnrollment(memberId: string): Promise<{ id: string; enrollment_id: string } | null> {
  const { default: CommunityMember } = await import('../../models/CommunityMember');
  const member = await CommunityMember.findByPk(memberId, { attributes: ['id', 'enrollment_id'] });
  return member ? { id: member.id, enrollment_id: member.enrollment_id } : null;
}

router.post('/api/admin/community/members/:memberId/free-access', requireAdmin, async (req: Request, res: Response) => {
  try {
    const member = await resolveMemberEnrollment(req.params.memberId as string);
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
    const { grantFreeAccess } = await import('../../services/subscriptionService');
    await grantFreeAccess(member.enrollment_id);
    res.json({ member: { id: member.id, free_access: true } });
  } catch (err: any) {
    const status = err?.error_class === 'NotFoundError' ? 404 : 500;
    console.error('[CommunityMemberRoutes] POST /community/members/:memberId/free-access error:', err.message);
    res.status(status).json({ error: err.message });
  }
});

router.delete('/api/admin/community/members/:memberId/free-access', requireAdmin, async (req: Request, res: Response) => {
  try {
    const member = await resolveMemberEnrollment(req.params.memberId as string);
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
    const { revokeFreeAccess } = await import('../../services/subscriptionService');
    await revokeFreeAccess(member.enrollment_id);
    res.json({ member: { id: member.id, free_access: false } });
  } catch (err: any) {
    console.error('[CommunityMemberRoutes] DELETE /community/members/:memberId/free-access error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/community/members/:memberId/mgmt-role
 * Assign (or clear, with null) the management-portal role for a staff member.
 * Only a 'staff' member may hold a mgmt role. Drives admin-section access via
 * mgmtRoles.ts + the student→admin bridge.
 */
router.patch('/api/admin/community/members/:memberId/mgmt-role', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MGMT_ROLES } = await import('../../services/access/mgmtRoles');
    const raw = req.body?.mgmt_role;
    const mgmt_role = raw === null || raw === undefined || raw === '' ? null : String(raw);
    if (mgmt_role !== null && !(MGMT_ROLES as readonly string[]).includes(mgmt_role)) {
      res.status(400).json({ error: `mgmt_role must be null or one of: ${MGMT_ROLES.join(', ')}` });
      return;
    }
    const { default: CommunityMember } = await import('../../models/CommunityMember');
    const member = await CommunityMember.findByPk(req.params.memberId as string);
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
    if (mgmt_role !== null && member.role !== 'staff') {
      res.status(400).json({ error: 'Member must be Staff to hold a management role' });
      return;
    }
    await member.update({ mgmt_role });
    res.json({ member: { id: member.id, mgmt_role } });
  } catch (err: any) {
    console.error('[CommunityMemberRoutes] PATCH /community/members/:memberId/mgmt-role error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
