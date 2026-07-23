import { Router, Request, Response } from 'express';
import { handleAdminLogin, handleAdminLogout } from '../../controllers/adminAuthController';
import { requireAnyAdmin, adminAllowedSections } from '../../middlewares/authMiddleware';

const router = Router();

router.post('/api/admin/login', handleAdminLogin);
router.post('/api/admin/logout', handleAdminLogout);

// Return current admin user from JWT claims + the admin sidebar SECTIONS this
// identity may access (the frontend gates the nav/routes on these; the backend
// still enforces per-section via requireSection). Accepts any admin-portal token
// incl. a bridge-minted staff mgmt token, so a scoped role can learn its scope.
// `has_portal_account` drives the "AI Training" nav link — true for either a
// bridge-minted session (mgmt_role) or a direct login whose email is linked to
// a staff CommunityMember (portal_enrollment_id) — deliberately NOT the same
// signal as `mgmt_role`, which also (narrowly) controls section scope.
router.get('/api/admin/me', requireAnyAdmin, (req: Request, res: Response) => {
  const admin = (req as any).admin;
  res.json({
    user: admin,
    sections: adminAllowedSections(admin),
    mgmt_role: admin?.mgmt_role ?? null,
    has_portal_account: !!(admin?.mgmt_role || admin?.portal_enrollment_id),
  });
});

// Admin→portal bridge ("AI Training" nav link) — the reverse of
// POST /api/portal/mgmt/enter. Resolves the enrollment to bridge into from
// either claim: `portal_enrollment_id` (direct admin login linked to a staff
// account) or, for a bridge-minted mgmt token, `sub` (which IS the enrollment
// id there — see mintMgmtAdminToken). Neither present = no connected student
// portal account, so it 403s (e.g. a legacy admin with no staff link at all).
router.post('/api/admin/portal/enter', requireAnyAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const enrollmentId = admin?.portal_enrollment_id || (admin?.mgmt_role ? admin.sub : null);
  if (!enrollmentId) {
    res.status(403).json({ error: 'No connected student portal for this account.' });
    return;
  }
  const { mintPortalTokenForStaff } = await import('../../services/access/mgmtBridgeService');
  const minted = await mintPortalTokenForStaff(enrollmentId);
  if (!minted) {
    res.status(403).json({ error: 'No connected student portal for this account.' });
    return;
  }
  res.json(minted);
});

export default router;
