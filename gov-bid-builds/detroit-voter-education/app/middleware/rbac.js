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

// STORY-027: extracted so a non-HTTP caller (server.js's WebSocket admin
// channels) can perform the same permission check requireRole() does over
// HTTP, without duplicating resolveRole's credential-matching logic.
function hasPermission(providedKey, permission) {
  const role = resolveRole(providedKey);
  return Boolean(role && ROLES[role] && ROLES[role].includes(permission));
}

// STORY-027: extracted so both requireRole() (HTTP) and a non-HTTP caller
// can log an access attempt through the same signed logAction() path,
// correctly labeled, rather than duplicating this try/catch.
async function logAccessAttempt(permitted, providedKey, permission, context) {
  try {
    await logAction(null, permitted ? 'AUDIT_LOG_ACCESS_GRANTED' : 'AUDIT_LOG_ACCESS_DENIED', {
      permission,
      role: resolveRole(providedKey),
      ...context,
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
}

function requireRole(permission) {
  return async function roleMiddleware(req, res, next) {
    const provided = req.headers['x-admin-key'];
    const permitted = hasPermission(provided, permission);

    await logAccessAttempt(permitted, provided, permission, { ip: req.ip, path: req.originalUrl });

    if (!permitted) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.role = resolveRole(provided);
    return next();
  };
}

module.exports = {
  requireRole, resolveRole, hasPermission, logAccessAttempt,
};
