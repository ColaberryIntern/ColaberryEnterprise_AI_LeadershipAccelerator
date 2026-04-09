/**
 * RBAC Middleware
 * Role-based authorization checks that layer on top of requireAdmin (authn).
 */

import { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../services/roleService';

/**
 * Require the authenticated admin to have one of the specified roles.
 * Must be used AFTER requireAdmin middleware.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.admin?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: `Forbidden. Required role: ${allowedRoles.join(' or ')}` });
      return;
    }
    next();
  };
}

/**
 * Require the authenticated admin's role to include the specified permission.
 * Must be used AFTER requireAdmin middleware.
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.admin?.role;
    if (!role) {
      res.status(403).json({ error: 'Forbidden. No role assigned.' });
      return;
    }
    const missing = requiredPermissions.filter(p => !hasPermission(role, p));
    if (missing.length > 0) {
      res.status(403).json({ error: `Forbidden. Missing permissions: ${missing.join(', ')}` });
      return;
    }
    next();
  };
}
