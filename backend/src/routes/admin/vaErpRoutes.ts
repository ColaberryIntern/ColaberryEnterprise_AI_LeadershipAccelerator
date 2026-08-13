/**
 * VA ERP admin routes — STORY-005. DEMO SCOPE ONLY: these screens live
 * inside the Colaberry student/Accelerator admin shell for the proposal
 * rehearsal demo. See vaErpRoleService.ts for why this is not a shippable
 * production architecture as-is.
 */
import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { requireVaErpPermission } from '../../middlewares/vaErpRbacMiddleware';

const router = Router();

// Role-specific dashboard: reused by any VA ERP screen that needs to know
// "what can this user see." Also the single point that satisfies STORY-005's
// "audit log entry for login ... when they access the dashboard" acceptance
// criterion -- every hit writes an AuditLog row.
router.get(
  '/api/admin/va-erp/dashboard',
  requireAdmin,
  requireVaErpPermission('dashboard:read'),
  async (req: Request, res: Response) => {
    try {
      const { getVaErpRoleForEmail, getVaErpRoleDefinition } = await import('../../services/vaErpRoleService');
      const email = req.admin!.email;
      const role = getVaErpRoleForEmail(email);
      const roleDef = getVaErpRoleDefinition(role)!;

      const AuditLog = (await import('../../models/AuditLog')).default;
      await AuditLog.create({
        action: 'va_erp_dashboard_access',
        entity_type: 'va_erp_platform',
        entity_id: null,
        admin_user_id: req.admin!.sub,
        ip_address: req.ip ?? null,
        old_values: null,
        new_values: { email, role, timestamp: new Date().toISOString() },
      });

      res.json({
        email,
        role,
        role_label: roleDef.label,
        role_description: roleDef.description,
        permissions: roleDef.permissions,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// List VA ERP roles (for an admin-facing "who can see what" reference).
router.get('/api/admin/va-erp/roles', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { listVaErpRoles } = await import('../../services/vaErpRoleService');
    res.json(listVaErpRoles());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
