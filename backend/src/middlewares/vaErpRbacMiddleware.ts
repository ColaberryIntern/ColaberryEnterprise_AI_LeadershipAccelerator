/**
 * VA ERP RBAC middleware — STORY-005/006. DEMO SCOPE ONLY (see
 * vaErpRoleService.ts). Layers on top of requireAdmin (authn): resolves the
 * caller's VA ERP role from their admin email, then checks permissions
 * against that separate role model rather than the platform's real
 * roleService.ts.
 */
import { Request, Response, NextFunction } from 'express';
import { getVaErpRoleForEmail, hasVaErpPermission } from '../services/vaErpRoleService';

/**
 * Require the authenticated admin's VA ERP role to include the specified
 * permission(s). Must run AFTER requireAdmin.
 */
export function requireVaErpPermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const email = req.admin?.email;
    if (!email) {
      res.status(403).json({ error: 'Forbidden. No admin identity on request.' });
      return;
    }
    const role = getVaErpRoleForEmail(email);
    const missing = requiredPermissions.filter(p => !hasVaErpPermission(role, p));
    if (missing.length > 0) {
      res.status(403).json({ error: `Forbidden. Missing VA ERP permissions: ${missing.join(', ')}` });
      return;
    }
    next();
  };
}
