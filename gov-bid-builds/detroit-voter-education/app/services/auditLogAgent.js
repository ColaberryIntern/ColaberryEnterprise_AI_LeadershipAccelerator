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

// Same 64-hex-char (32-byte) convention as the existing ENCRYPTION_KEY --
// see app/middleware/encryption.js.
function getSigningKey() {
  const hex = process.env.AUDIT_LOG_SIGNING_KEY || '';
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('AUDIT_LOG_SIGNING_KEY must be 64 hex chars (32 bytes)');
  return key;
}

// Pure -- canonical payload a signature is computed over. createdAt is
// generated in application code (not left to the DB's DEFAULT NOW()) so it
// can be included in the signed payload before the row is ever written --
// otherwise the signature couldn't cover its own timestamp.
function canonicalPayload(sessionId, action, metadata, createdAtIso) {
  return JSON.stringify({
    sessionId: sessionId || null,
    action,
    metadata: metadata || null,
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

module.exports = {
  logAction, getAuditLogEntry, verifyAuditLogEntry, computeSignature,
};
