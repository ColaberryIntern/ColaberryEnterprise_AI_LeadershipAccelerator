/**
 * Audit Middleware
 * Logs all admin write operations (POST, PUT, PATCH, DELETE) to the audit_log table.
 * Applied to admin routes after requireAdmin — uses req.adminUser for identity.
 */

import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog';

/**
 * Extract entity type and ID from the request URL.
 */
function extractEntityInfo(req: Request): { entityType: string; entityId: string | null } {
  const path = req.path;
  // Match patterns like /api/admin/orchestration/artifacts/:id
  const segments = path.split('/').filter(Boolean);

  // Find the entity type (second-to-last non-UUID segment)
  let entityType = 'unknown';
  let entityId: string | null = null;

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
      entityId = seg;
      if (i > 0) entityType = segments[i - 1];
      break;
    }
  }

  if (entityType === 'unknown' && segments.length >= 3) {
    entityType = segments[segments.length - 1];
  }

  return { entityType, entityId };
}

/**
 * Determine the action from HTTP method.
 */
function methodToAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST': return 'create';
    case 'PUT': return 'update';
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return method.toLowerCase();
  }
}

/**
 * Audit middleware — logs write operations after response completes.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only log write operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    return next();
  }

  const startBody = { ...req.body };
  const { entityType, entityId } = extractEntityInfo(req);

  // Hook into response finish to log after success
  res.on('finish', () => {
    // Only log successful operations
    if (res.statusCode >= 200 && res.statusCode < 400) {
      // req.admin is populated by requireAdmin/requireSalesOrAdmin (AuthPayload: sub/email/role).
      // The prior code read (req as any).adminUser — a field nothing ever sets — so every admin
      // write was logged with admin_user_id=null (no actor). Use the real authenticated identity.
      AuditLog.create({
        admin_user_id: req.admin?.sub || null,
        action: methodToAction(req.method),
        entity_type: entityType,
        entity_id: entityId,
        old_values: null, // Would require pre-fetch; kept null for now
        new_values: startBody,
        ip_address: req.ip || req.socket.remoteAddress || null,
      }).catch(err => {
        console.error('[AuditMiddleware] Failed to log audit entry:', err.message);
      });
    }
  });

  next();
}
