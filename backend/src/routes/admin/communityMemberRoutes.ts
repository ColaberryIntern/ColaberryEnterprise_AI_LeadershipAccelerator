import { Router, Request, Response } from 'express';
import { z } from 'zod';
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
 *
 * `requireAdmin` alone was NOT enough here, and this is the one route on which that mattered.
 * A bridge-minted staff token reaches `/api/admin/community` through the `program` section, so
 * every scoped role holding `program` could write this field — and `mgmt_role: 'owner'` is the
 * only role that reaches `inbox_content`. See `services/access/mgmtRoleGrant.ts` for the
 * no-escalation rule that now gates the write, and why it is a subset test rather than
 * owner-only.
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

    // No escalation: the role being granted, and the role the target holds right now, must both
    // be within the caller's own access. Checked AFTER the member is loaded because the current
    // role is half the question, and BEFORE the write because this is access control.
    const { canGrantMgmtRole } = await import('../../services/access/mgmtRoleGrant');
    const { adminAllowedSections } = await import('../../middlewares/authMiddleware');
    const verdict = canGrantMgmtRole({
      // `requireAdmin` has already set req.admin, but an absent role resolves to no sections,
      // so the failure direction here is deny rather than grant.
      callerSections: adminAllowedSections({ role: req.admin?.role ?? '', mgmt_role: req.admin?.mgmt_role, mgmt_extra_sections: req.admin?.mgmt_extra_sections }),
      currentRole: member.mgmt_role ?? null,
      newRole: mgmt_role,
      currentExtras: member.mgmt_extra_sections ?? [], // C82: their access is role + extras
    });
    if (!verdict.allowed) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'backend', event: 'mgmt_role_grant_denied',
        outcome: 'failure', error_class: 'AuthorizationError',
        context: {
          caller_role: req.admin?.role, caller_mgmt_role: req.admin?.mgmt_role ?? null,
          target_member_id: req.params.memberId, requested_role: mgmt_role, blocked_by: verdict.blockedBy,
        },
      }));
      res.status(403).json({ error: verdict.reason });
      return;
    }

    // C82: clearing the role clears the extras too, so revoking management access removes all of it
    await member.update(mgmt_role === null ? { mgmt_role, mgmt_extra_sections: [] } : { mgmt_role });
    res.json({ member: { id: member.id, mgmt_role, mgmt_extra_sections: mgmt_role === null ? [] : member.mgmt_extra_sections ?? [] } });
  } catch (err: any) {
    console.error('[CommunityMemberRoutes] PATCH /community/members/:memberId/mgmt-role error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/community/members/:memberId/mgmt-extra-sections   body: { sections: SectionKey[] }
 * C82 (Campus HQ H4, option A, Ali's pick): sections granted on top of a staff member's management role (Sarbjit: Marketing plus
 * AI Internship). Their access becomes effectiveSections(role, extras) everywhere: mgmtSectionGate, the sidebar, the portal status
 * and the campus building. The same no-escalation rule as the role (canGrantExtraSections). Every key must be a real section;
 * keys the role already gives are dropped (normalizeExtraSections). Audited by auditMiddleware; a denial is logged. The person's
 * campus building updates at once (the portal status reads the database); an open admin session picks it up at its next sign-in
 * through the bridge (the token carries the extras), like a role change.
 */
const ExtraSectionsBody = z.object({ sections: z.array(z.string().max(40)).max(40) }).strict();
router.patch('/api/admin/community/members/:memberId/mgmt-extra-sections', requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = ExtraSectionsBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'sections must be a list of section keys', error_class: 'ValidationError' }); return; }
    const { SECTION_KEYS, isSectionKey, normalizeExtraSections } = await import('../../services/access/mgmtRoles');
    const unknown = parsed.data.sections.filter((x) => !isSectionKey(x));
    if (unknown.length) { res.status(400).json({ error: `unknown section(s): ${unknown.join(', ')}. Allowed: ${SECTION_KEYS.join(', ')}`, error_class: 'ValidationError' }); return; }
    const { default: CommunityMember } = await import('../../models/CommunityMember');
    const member = await CommunityMember.findByPk(req.params.memberId as string);
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
    if (member.role !== 'staff' || !member.mgmt_role) {
      res.status(400).json({ error: 'Extra sections go on top of a management role: give the member a role first', error_class: 'ValidationError' });
      return;
    }
    const extras = normalizeExtraSections(member.mgmt_role, parsed.data.sections);
    const { canGrantExtraSections } = await import('../../services/access/mgmtRoleGrant');
    const { adminAllowedSections } = await import('../../middlewares/authMiddleware');
    const verdict = canGrantExtraSections({
      callerSections: adminAllowedSections({ role: req.admin?.role ?? '', mgmt_role: req.admin?.mgmt_role, mgmt_extra_sections: req.admin?.mgmt_extra_sections }),
      role: member.mgmt_role,
      currentExtras: member.mgmt_extra_sections ?? [],
      newExtras: extras,
    });
    if (!verdict.allowed) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'backend', event: 'mgmt_extra_sections_grant_denied',
        outcome: 'failure', error_class: 'AuthorizationError',
        context: { caller_role: req.admin?.role, caller_mgmt_role: req.admin?.mgmt_role ?? null, target_member_id: req.params.memberId, requested: extras, blocked_by: verdict.blockedBy },
      }));
      res.status(403).json({ error: verdict.reason });
      return;
    }
    await member.update({ mgmt_extra_sections: extras });
    res.json({ member: { id: member.id, mgmt_role: member.mgmt_role, mgmt_extra_sections: extras } });
  } catch (err: any) {
    console.error('[CommunityMemberRoutes] PATCH /community/members/:memberId/mgmt-extra-sections error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
