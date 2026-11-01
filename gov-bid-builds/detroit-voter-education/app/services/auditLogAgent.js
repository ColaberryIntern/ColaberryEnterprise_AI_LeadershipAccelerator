// STORY-023: HMAC-SHA256 integrity signing for new audit_log writes.
// Decided narrowly: extends the existing audit_log table (13 other files
// already write to it unsigned) rather than a parallel table, and signs
// only NEW writes going forward -- the 13 existing call sites are not
// retrofitted in this story. See decision-record-STORY-023.md.
//
// "Digital signature" is implemented as HMAC-SHA256, not asymmetric
// public/private-key signing -- it proves tamper-evidence to holders of
// the signing key, which is what "integrity verification" means here, not
// third-party non-repudiation. Named honestly, not oversold as PKI-grade.
const crypto = require('node:crypto');
const pool = require('../db');
const { getSystemHealth } = require('./systemHealthAgent');

// Same 64-hex-char (32-byte) convention as the existing ENCRYPTION_KEY --
// see app/middleware/encryption.js.
function getSigningKey() {
  const hex = process.env.AUDIT_LOG_SIGNING_KEY || '';
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('AUDIT_LOG_SIGNING_KEY must be 64 hex chars (32 bytes)');
  return key;
}

// STORY-027 bug fix: PostgreSQL's JSONB column does NOT preserve object key
// insertion order on round-trip (verified directly: {permission,role,ip,path}
// came back as {ip,path,role,permission}) -- but JSON.stringify() depends on
// key order, so a signature computed at write time (JS insertion order)
// would never match one recomputed after a SELECT (JSONB's reordered form),
// even with zero tampering. Sorting keys before stringifying, on BOTH the
// signing and verifying paths, makes the canonical form independent of
// whatever order the object's keys happen to arrive in.
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortKeysDeep(value[key]);
      return acc;
    }, {});
  }
  return value;
}

// Pure -- canonical payload a signature is computed over. createdAt is
// generated in application code (not left to the DB's DEFAULT NOW()) so it
// can be included in the signed payload before the row is ever written --
// otherwise the signature couldn't cover its own timestamp.
function canonicalPayload(sessionId, action, metadata, createdAtIso) {
  return JSON.stringify({
    sessionId: sessionId || null,
    action,
    metadata: metadata ? sortKeysDeep(metadata) : null,
    createdAt: createdAtIso,
  });
}

function computeSignature(sessionId, action, metadata, createdAtIso) {
  const key = getSigningKey();
  return crypto
    .createHmac('sha256', key)
    .update(canonicalPayload(sessionId, action, metadata, createdAtIso))
    .digest('hex');
}

// Recomputes the signature from a persisted row's fields and compares.
// Returns 'unsigned' (not a boolean) for legacy rows that predate this
// story or came from one of the 13 not-yet-migrated call sites -- calling
// that "invalid" would be misleading, they were never signed at all.
function verifyAuditLogEntry(row) {
  if (!row.signature) return 'unsigned';
  const createdAtIso = new Date(row.created_at).toISOString();
  const expected = computeSignature(row.session_id, row.action, row.metadata, createdAtIso);
  return expected === row.signature ? 'valid' : 'invalid';
}

// The one function new/future stories should call instead of a raw
// INSERT INTO audit_log -- see the 13 existing call sites elsewhere in this
// app for the pattern this replaces going forward.
async function logAction(sessionId, action, metadata) {
  if (typeof action !== 'string' || action.trim().length === 0) {
    throw Object.assign(new Error('action must be a non-empty string'), { code: 'INVALID_ACTION' });
  }
  const createdAt = new Date();
  const createdAtIso = createdAt.toISOString();
  const signature = computeSignature(sessionId || null, action, metadata || null, createdAtIso);

  const result = await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata, created_at, signature)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [sessionId || null, action, metadata ? JSON.stringify(metadata) : null, createdAt, signature],
  );

  return { id: result.rows[0].id, createdAt: result.rows[0].created_at, signature };
}

async function getAuditLogEntry(id) {
  const result = await pool.query('SELECT * FROM audit_log WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, signatureStatus: verifyAuditLogEntry(row) };
}

const RECENT_ACTIONS_DEFAULT_LIMIT = 50;
const RECENT_ACTIONS_MAX_LIMIT = 200;

// Pure -- clamps an arbitrary (possibly client-supplied, possibly
// missing/non-numeric/negative/huge) limit into [1, RECENT_ACTIONS_MAX_LIMIT],
// falling back to the default for anything that isn't a usable number.
function boundLimit(limit) {
  const numeric = Number(limit);
  const base = Number.isFinite(numeric) && numeric > 0 ? numeric : RECENT_ACTIONS_DEFAULT_LIMIT;
  return Math.min(Math.max(1, base), RECENT_ACTIONS_MAX_LIMIT);
}

// STORY-027: the most recent N audit_log rows, each annotated with its
// signature status -- reuses verifyAuditLogEntry() so this dashboard also
// surfaces STORY-023's integrity work, not just raw log text.
async function listRecentActions(limit = RECENT_ACTIONS_DEFAULT_LIMIT) {
  const result = await pool.query(
    'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1',
    [boundLimit(limit)],
  );
  return result.rows.map((row) => ({ ...row, signatureStatus: verifyAuditLogEntry(row) }));
}

// STORY-028: "integrate monitoring tools to detect anomalies" reshaped to a
// real, deterministic, rule-based detector over data this app already
// produces -- no external monitoring integration, no fabricated ML/
// statistical scoring. See decision-record-STORY-028.md. Three real
// signals: the circuit breaker opening (STORY-019's ESCALATION_TRIGGERED),
// repeated audit-log access denials clustering (STORY-024's
// AUDIT_LOG_ACCESS_DENIED), and system health dropping below 'healthy'
// (STORY-025).
const ANOMALY_ESCALATION_WINDOW_MINUTES = 60;
const ANOMALY_ACCESS_DENIAL_WINDOW_MINUTES = 15;
const ANOMALY_ACCESS_DENIAL_THRESHOLD = 3;

// Pure -- builds the anomaly list from already-fetched raw signals, kept
// separate from the I/O below (same split as STORY-025's
// deriveOverallStatus/checkDatabase) so the detection rules themselves are
// unit-testable without a database.
function buildAnomalyList({
  escalationRows, accessDenialCount, accessDenialLastAt, health,
}) {
  const anomalies = [];

  for (const row of escalationRows) {
    anomalies.push({
      type: 'circuit_breaker_open',
      severity: 'high',
      detail: `Circuit breaker opened for source '${row.metadata?.source || 'unknown'}' after repeated failures`,
      detectedAt: row.created_at,
      auditLogId: row.id,
    });
  }

  if (accessDenialCount >= ANOMALY_ACCESS_DENIAL_THRESHOLD) {
    anomalies.push({
      type: 'repeated_access_denials',
      severity: 'medium',
      detail: `${accessDenialCount} denied audit-log access attempts in the last ${ANOMALY_ACCESS_DENIAL_WINDOW_MINUTES} minutes`,
      detectedAt: accessDenialLastAt,
      auditLogId: null,
    });
  }

  if (health.status !== 'healthy') {
    anomalies.push({
      type: 'system_health',
      severity: health.status === 'down' ? 'high' : 'medium',
      detail: `System health is ${health.status} (database ${health.database.status}, ${health.recentErrors.count} recent errors)`,
      detectedAt: health.timestamp,
      auditLogId: null,
    });
  }

  return anomalies.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
}

async function listAnomalies() {
  const escalations = await pool.query(
    `SELECT id, created_at, metadata FROM audit_log
     WHERE action = 'ESCALATION_TRIGGERED' AND created_at > NOW() - ($1 || ' minutes')::interval
     ORDER BY created_at DESC`,
    [ANOMALY_ESCALATION_WINDOW_MINUTES],
  );

  const denials = await pool.query(
    `SELECT COUNT(*)::int AS n, MAX(created_at) AS last_at FROM audit_log
     WHERE action = 'AUDIT_LOG_ACCESS_DENIED' AND created_at > NOW() - ($1 || ' minutes')::interval`,
    [ANOMALY_ACCESS_DENIAL_WINDOW_MINUTES],
  );

  const health = await getSystemHealth();

  return buildAnomalyList({
    escalationRows: escalations.rows,
    accessDenialCount: denials.rows[0].n,
    accessDenialLastAt: denials.rows[0].last_at,
    health,
  });
}

module.exports = {
  logAction,
  getAuditLogEntry,
  listRecentActions,
  listAnomalies,
  buildAnomalyList,
  verifyAuditLogEntry,
  computeSignature,
  boundLimit,
};
