// Live-DB smoke test for STORY-023. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     AUDIT_LOG_SIGNING_KEY=<64 hex chars> \
//     node app/services/__tests__/auditLogAgent.smoke.js
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';
process.env.AUDIT_LOG_SIGNING_KEY = process.env.AUDIT_LOG_SIGNING_KEY || '1'.repeat(64);

const pool = require('../../db');
const { logAction, getAuditLogEntry, verifyAuditLogEntry } = require('../auditLogAgent');

async function run() {
  // --- Signed write + verification round-trip ---------------------------
  const written = await logAction('11111111-1111-1111-1111-111111111111', 'SMOKE_TEST_ACTION', { detail: 'first write' });
  assert.ok(written.id);
  assert.ok(written.signature && written.signature.length === 64, 'expected a 64-hex-char HMAC-SHA256 signature');
  console.log(`ok - logAction() writes a signed row (id=${written.id})`);

  const entry = await getAuditLogEntry(written.id);
  assert.equal(entry.signatureStatus, 'valid');
  console.log('ok - getAuditLogEntry() confirms the freshly-written row verifies as valid');

  // --- Tamper detection: modify the row directly in the DB, bypassing the
  // API entirely, then confirm verification catches it. This has to update
  // via a superuser-style raw connection that ignores the append-only
  // trigger's own protection to simulate what the trigger is FOR
  // preventing -- so this specific query is expected to fail (proving the
  // trigger works), and we verify tamper-detection a different way: by
  // constructing a tampered in-memory copy of a real fetched row, matching
  // what verifyAuditLogEntry's hermetic unit tests already prove, but here
  // against real DB-fetched data rather than hand-built fixtures.
  const realRow = (await pool.query('SELECT * FROM audit_log WHERE id = $1', [written.id])).rows[0];
  const tamperedRow = { ...realRow, action: 'TAMPERED_ACTION' };
  assert.equal(verifyAuditLogEntry(tamperedRow), 'invalid');
  console.log('ok - a tampered copy of a real fetched row correctly fails verification');

  // --- Legacy unsigned row: a raw INSERT matching the 13 existing call
  // sites elsewhere in this app (no signature column supplied) must still
  // work and read back as 'unsigned', not crash or be misreported. -------
  const legacy = await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata) VALUES (NULL, 'LEGACY_STYLE_ACTION', $1) RETURNING id`,
    [JSON.stringify({ note: 'written the old way, no signature' })],
  );
  const legacyEntry = await getAuditLogEntry(legacy.rows[0].id);
  assert.equal(legacyEntry.signatureStatus, 'unsigned');
  console.log('ok - a legacy-style unsigned row still inserts fine and reads back as "unsigned", not a crash');

  // --- Append-only enforcement: the DB-level trigger must block both
  // UPDATE and DELETE unconditionally, proving this isn't just an
  // application-code convention that a bug (or a direct psql session)
  // could silently bypass. --------------------------------------------
  await assert.rejects(
    () => pool.query(`UPDATE audit_log SET action = 'HACKED' WHERE id = $1`, [written.id]),
    (err) => /append-only/.test(err.message),
    'expected the append-only trigger to block a direct UPDATE',
  );
  console.log('ok - a direct UPDATE against audit_log is blocked by the append-only trigger');

  await assert.rejects(
    () => pool.query('DELETE FROM audit_log WHERE id = $1', [written.id]),
    (err) => /append-only/.test(err.message),
    'expected the append-only trigger to block a direct DELETE',
  );
  console.log('ok - a direct DELETE against audit_log is blocked by the append-only trigger');

  // Confirm the row is genuinely untouched after the blocked UPDATE/DELETE
  // attempts above (not partially applied before the trigger fired).
  const stillThere = await pool.query('SELECT action FROM audit_log WHERE id = $1', [written.id]);
  assert.equal(stillThere.rows[0].action, 'SMOKE_TEST_ACTION');
  console.log('ok - the row is unchanged after the blocked mutation attempts');

  console.log('\nAll live-DB smoke assertions passed.');
}

run()
  .catch((err) => {
    console.error('SMOKE TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
