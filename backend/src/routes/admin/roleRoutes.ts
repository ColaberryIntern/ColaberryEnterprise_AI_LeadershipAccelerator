import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/rbacMiddleware';

const router = Router();

// List available roles with their permissions
router.get('/api/admin/roles', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { listRoles } = await import('../../services/roleService');
    res.json(listRoles());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// List admin users with their roles
router.get('/api/admin/users', requireAdmin, requireRole('super_admin', 'admin'), async (_req: Request, res: Response) => {
  try {
    const { listAdminUsers } = await import('../../services/roleService');
    res.json(await listAdminUsers());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Assign role to admin user (super_admin only)
router.put('/api/admin/users/:id/role', requireAdmin, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!role) { res.status(400).json({ error: 'role is required in request body' }); return; }
    const { assignRole } = await import('../../services/roleService');
    res.json(await assignRole(req.params.id as string, role));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
