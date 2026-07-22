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
router.get('/api/admin/me', requireAnyAdmin, (req: Request, res: Response) => {
  const admin = (req as any).admin;
  res.json({ user: admin, sections: adminAllowedSections(admin), mgmt_role: admin?.mgmt_role ?? null });
});

export default router;
