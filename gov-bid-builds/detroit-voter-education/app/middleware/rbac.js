// STORY-024: role-based access control. Generalized (accepts any
// permission string), not hardcoded to the audit log, so a future story
// protecting a different resource can reuse requireRole() rather than
// duplicating this pattern -- its first real use is audit-log access.
//
// Logs every access attempt through STORY-023's signed logAction(), not a
// raw INSERT -- both granted and denied attempts get a real, tamper-evident
// audit_log entry, correctly labeled (fixes a real bug in the existing
// requireAdminKey middleware, which hardcodes PREFERENCES_READ/
// PREFERENCES_READ_DENIED regardless of which route actually calls it).
//
// 401 on denial, matching this app's existing convention (requireAdminKey
// uses 401 for every failure mode across ~5 other admin routes) rather than
// introducing a new 403 convention only this route would use.
const { ROLES, ROLE_CREDENTIAL_ENV } = require('../config/roles');
const { logAction } = require('../services/auditLogAgent');

function resolveRole(providedKey) {
  if (!providedKey) return null;
  for (const [role, envVar] of Object.entries(ROLE_CREDENTIAL_ENV)) {
    const expected = process.env[envVar];
    if (expected && providedKey === expected) return role;
  }
  return null;
}

function requireRole(permission) {
  return async function roleMiddleware(req, res, next) {
    const provided = req.headers['x-admin-key'];
    const role = resolveRole(provided);
    const permitted = Boolean(role && ROLES[role] && ROLES[role].includes(permission));

    try {
      await logAction(null, permitted ? 'AUDIT_LOG_ACCESS_GRANTED' : 'AUDIT_LOG_ACCESS_DENIED', {
        permission,
        role: role || null,
        ip: req.ip,
        path: req.originalUrl,
      });
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'detroit-voter-education',
        event: 'audit_log_write_failed',
        error_class: err.constructor.name,
        error: err.message,
      }));
    }

    if (!permitted) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.role = role;
    return next();
  };
}

module.exports = { requireRole, resolveRole };
