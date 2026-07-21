import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

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

export default router;
