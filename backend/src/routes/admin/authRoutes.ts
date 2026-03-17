import { Router, Request, Response } from 'express';
import { handleAdminLogin, handleAdminLogout } from '../../controllers/adminAuthController';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

router.post('/api/admin/login', handleAdminLogin);
router.post('/api/admin/logout', handleAdminLogout);

// Return current admin user from JWT claims
router.get('/api/admin/me', requireAdmin, (req: Request, res: Response) => {
  res.json({ user: (req as any).admin });
});

export default router;
