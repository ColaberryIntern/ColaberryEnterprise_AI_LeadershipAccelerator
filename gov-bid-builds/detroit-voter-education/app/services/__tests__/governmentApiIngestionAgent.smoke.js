// Live-DB smoke test for STORY-017. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/governmentApiIngestionAgent.smoke.js
//
// Success path hits the REAL Federal Register API (official U.S. government,
// no key required) -- genuine confidence the integration works, not mocked.
// Failure path temporarily monkey-patches global.fetch to force failures,
// since we can't make the real government API go down on demand; this is
// the only section using a mock, clearly scoped and restored afterward.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const {
  ingestFederalRegisterDocuments, resetCircuit, isCircuitOpen, CIRCUIT_FAILURE_THRESHOLD,
} = require('../governmentApiIngestionAgent');

async function run() {
  // --- Real success path ---------------------------------------------
  resetCircuit('federal_register');
  const success = await ingestFederalRegisterDocuments('education');
  assert.equal(success.status, 'success');
  assert.ok(success.resultCount > 0, 'expected at least one real document back from the Federal Register API');
  console.log(`ok - real ingestion against the live Federal Register API succeeded, resultCount=${success.resultCount}`);

  const successRow = await pool.query('SELECT * FROM government_data_ingestions WHERE id = $1', [success.ingestionId]);
  assert.equal(successRow.rows[0].status, 'success');
  assert.ok(successRow.rows[0].response_summary.titles.length > 0);
  console.log('ok - government_data_ingestions row stored with real response data');

  const successAudit = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'DATA_INGESTED' AND (metadata->>'ingestion_id')::int = $1`,
    [success.ingestionId],
  );
  assert.equal(successAudit.rows[0].n, 1);
  console.log('ok - DATA_INGESTED audit row written');

  // No alert should have fired on a successful ingestion.
  const noAlert = await pool.query('SELECT COUNT(*)::int AS n FROM ingestion_alerts WHERE ingestion_id = $1', [success.ingestionId]);
  assert.equal(noAlert.rows[0].n, 0);
  console.log('ok - no admin alert fired for a successful ingestion');

  // --- Simulated failure path (monkey-patched fetch) -------------------
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('Simulated network failure'); };

  try {
    resetCircuit('federal_register');
    const failed = await ingestFederalRegisterDocuments('housing');
    assert.equal(failed.status, 'failed');
    console.log('ok - simulated failure: ingestFederalRegisterDocuments reports status=failed after retries exhausted');

    const failedRow = await pool.query('SELECT * FROM government_data_ingestions WHERE id = $1', [failed.ingestionId]);
    assert.equal(failedRow.rows[0].status, 'failed');
    assert.match(failedRow.rows[0].error_message, /Simulated network failure/);
    console.log('ok - failed ingestion row stored with the real error message');

    const failAudit = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'INGESTION_FAILED' AND (metadata->>'endpoint') LIKE '%housing%'`,
    );
    assert.ok(failAudit.rows[0].n >= 1);
    console.log('ok - INGESTION_FAILED audit row written');

    const alertRow = await pool.query('SELECT * FROM ingestion_alerts WHERE ingestion_id = $1', [failed.ingestionId]);
    assert.equal(alertRow.rows.length, 1);
    assert.equal(alertRow.rows[0].channel, 'log_stub');
    assert.equal(alertRow.rows[0].tier, 'admin', 'a single failure must alert the routine admin tier, not escalate');
    console.log('ok - admin alert stored (log_stub channel, admin tier -- no real Twilio/SendGrid call)');

    const noEscalationYet = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'ESCALATION_TRIGGERED' AND (metadata->>'endpoint') LIKE '%housing%'`,
    );
    assert.equal(noEscalationYet.rows[0].n, 0, 'a single failure must not trigger an escalation audit entry');
    console.log('ok - single failure does not write an ESCALATION_TRIGGERED audit row');

    // Repeat failures should open the circuit breaker.
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) {
      await ingestFederalRegisterDocuments('transportation');
    }
    assert.equal(isCircuitOpen('federal_register'), true, 'circuit should be open after repeated failures');
    console.log('ok - circuit breaker opens after repeated failures');

    // While open, a new call must fail fast (skip the network entirely) and still alert.
    const circuitOpenResult = await ingestFederalRegisterDocuments('healthcare');
    assert.equal(circuitOpenResult.status, 'failed');
    assert.equal(circuitOpenResult.reason, 'circuit_open');
    console.log('ok - while circuit is open, ingestion fails fast with reason=circuit_open');

    // STORY-019: circuit-open is the "fails multiple times" case -- must
    // escalate to the senior_admin tier and write a dedicated audit entry,
    // unlike the single-failure case asserted above.
    const escalationAlertRow = await pool.query('SELECT * FROM ingestion_alerts WHERE ingestion_id = $1', [circuitOpenResult.ingestionId]);
    assert.equal(escalationAlertRow.rows.length, 1);
    assert.equal(escalationAlertRow.rows[0].tier, 'senior_admin', 'circuit-open (repeated failure) must escalate to senior_admin');
    console.log('ok - circuit-open alert stored at the senior_admin tier');

    const escalationAudit = await pool.query(
      `SELECT * FROM audit_log WHERE action = 'ESCALATION_TRIGGERED' AND (metadata->>'endpoint') LIKE '%healthcare%'`,
    );
    assert.equal(escalationAudit.rows.length, 1);
    assert.equal(escalationAudit.rows[0].metadata.tier, 'senior_admin');
    assert.equal(escalationAudit.rows[0].metadata.reason, 'circuit_open');
    console.log('ok - ESCALATION_TRIGGERED audit row written for the circuit-open (repeated) failure');
  } finally {
    global.fetch = realFetch;
    resetCircuit('federal_register');
  }

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
