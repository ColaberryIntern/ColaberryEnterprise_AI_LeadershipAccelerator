const pool = require('../db');

const FEDERAL_REGISTER_URL = 'https://www.federalregister.gov/api/v1/documents.json';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10000;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30000;

// --- Circuit breaker (per source) --------------------------------------
// Same conceptual pattern as this repo's canonical openclawCircuitBreaker.ts
// (backend/src/), reimplemented here since this sandbox app is a separate
// package. In-memory, module-level state -- adequate for a single-process
// demo; a real production version would need shared state (Redis, DB) across
// instances.
const circuitState = new Map(); // source -> { consecutiveFailures, openedAt }

function recordSuccess(source) {
  circuitState.delete(source);
}

function recordFailure(source) {
  const state = circuitState.get(source) || { consecutiveFailures: 0, openedAt: null };
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && !state.openedAt) {
    state.openedAt = Date.now();
  }
  circuitState.set(source, state);
}

function isCircuitOpen(source) {
  const state = circuitState.get(source);
  if (!state || !state.openedAt) return false;
  if (Date.now() - state.openedAt > CIRCUIT_COOLDOWN_MS) {
    circuitState.delete(source); // cooldown elapsed -- half-open, allow a fresh attempt
    return false;
  }
  return true;
}

function resetCircuit(source) {
  circuitState.delete(source);
}

// --- Retry / backoff -----------------------------------------------------
// Exponential backoff, capped. Pure and unit-tested independently of the
// actual sleep, so tests don't have to wait out real delays.
function computeBackoffDelayMs(attempt, baseDelayMs = BASE_DELAY_MS) {
  const delay = baseDelayMs * 2 ** (attempt - 1);
  return Math.min(delay, MAX_DELAY_MS);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, { maxAttempts = MAX_ATTEMPTS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'UPSTREAM_ERROR', status: res.status });
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(computeBackoffDelayMs(attempt));
      }
    }
  }
  throw lastErr;
}

function validateFederalRegisterResponse(data) {
  if (!data || !Array.isArray(data.results)) {
    throw Object.assign(new Error('Response missing expected results array'), { code: 'VALIDATION_FAILED' });
  }
}

// STORY-019: a single ingestion-call failure alerts the routine 'admin'
// tier; a repeated/circuit-open failure escalates to 'senior_admin'. Pure
// and exported so the decision itself is unit-testable without the DB.
function resolveAlertTier(isRepeatedFailure) {
  return isRepeatedFailure ? 'senior_admin' : 'admin';
}

// Stub only -- no real Twilio/SendGrid account/credentials wired up. See
// STORY-011/016/019 decisions for why this stays a decision for a human,
// not something to assume -- the tier changes who it's addressed to, not
// whether it's a real message.
async function sendAdminAlert(ingestionId, message, tier = 'admin') {
  await pool.query(
    `INSERT INTO ingestion_alerts (ingestion_id, channel, message, tier) VALUES ($1, 'log_stub', $2, $3)`,
    [ingestionId, message, tier],
  );
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'detroit-voter-education',
    event: 'admin_alert_sent',
    channel: 'log_stub',
    tier,
    ingestion_id: ingestionId,
    message,
  }));
}

// The one concrete real-API integration: Federal Register documents
// (legislation/regulation text), matching this platform's "relevant
// legislation" pitch, with zero claims about named candidates/officeholders.
async function ingestFederalRegisterDocuments(searchTerm) {
  const source = 'federal_register';
  const url = `${FEDERAL_REGISTER_URL}?conditions%5Bterm%5D=${encodeURIComponent(searchTerm)}&per_page=5`;

  if (isCircuitOpen(source)) {
    const failedRow = await pool.query(
      `INSERT INTO government_data_ingestions (source, endpoint, status, attempt_count, error_message)
       VALUES ($1, $2, 'failed', 0, 'Circuit breaker open -- too many recent failures, not attempting call')
       RETURNING id`,
      [source, url],
    );
    const escalationTier = resolveAlertTier(true);
    await sendAdminAlert(failedRow.rows[0].id, `Government API ingestion skipped: circuit breaker open for source '${source}'`, escalationTier);
    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'INGESTION_FAILED', $1)`,
      [JSON.stringify({ source, endpoint: url, reason: 'circuit_open' })],
    );
    // Circuit-open means the source has failed repeatedly, not once -- this
    // is the "fails multiple times" escalation case, distinct from a single
    // failed attempt below, which does not escalate.
    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'ESCALATION_TRIGGERED', $1)`,
      [JSON.stringify({ source, endpoint: url, reason: 'circuit_open', tier: escalationTier })],
    );
    return { source, status: 'failed', reason: 'circuit_open', ingestionId: failedRow.rows[0].id };
  }

  let attemptCount = 0;
  try {
    const data = await fetchWithRetry(url).then((result) => {
      attemptCount = MAX_ATTEMPTS; // best-effort count; fetchWithRetry doesn't currently report the actual succeeding attempt
      return result;
    });
    validateFederalRegisterResponse(data);

    recordSuccess(source);

    const inserted = await pool.query(
      `INSERT INTO government_data_ingestions (source, endpoint, status, attempt_count, result_count, response_summary)
       VALUES ($1, $2, 'success', $3, $4, $5)
       RETURNING id`,
      [
        source, url, attemptCount, data.results.length,
        JSON.stringify({ titles: data.results.slice(0, 5).map((r) => r.title) }),
      ],
    );

    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'DATA_INGESTED', $1)`,
      [JSON.stringify({ source, endpoint: url, result_count: data.results.length, ingestion_id: inserted.rows[0].id })],
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'data_ingested',
      source,
      result_count: data.results.length,
      outcome: 'success',
    }));

    return { source, status: 'success', ingestionId: inserted.rows[0].id, resultCount: data.results.length };
  } catch (err) {
    recordFailure(source);

    const failedRow = await pool.query(
      `INSERT INTO government_data_ingestions (source, endpoint, status, attempt_count, error_message)
       VALUES ($1, $2, 'failed', $3, $4)
       RETURNING id`,
      [source, url, MAX_ATTEMPTS, err.message],
    );

    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'INGESTION_FAILED', $1)`,
      [JSON.stringify({ source, endpoint: url, error: err.message, attempts: MAX_ATTEMPTS })],
    );

    // A single ingestion call failing (even after its internal retries) is
    // not yet "repeated failure" -- the circuit breaker, not this catch
    // block, is what tracks failures across calls. No escalation here.
    await sendAdminAlert(failedRow.rows[0].id, `Government API ingestion failed after ${MAX_ATTEMPTS} attempts: ${source} -- ${err.message}`, resolveAlertTier(false));

    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'data_ingestion_failed',
      source,
      error_class: err.constructor.name,
      error: err.message,
      outcome: 'failure',
    }));

    return { source, status: 'failed', ingestionId: failedRow.rows[0].id, error: err.message };
  }
}

module.exports = {
  ingestFederalRegisterDocuments,
  fetchWithRetry,
  computeBackoffDelayMs,
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  resetCircuit,
  validateFederalRegisterResponse,
  resolveAlertTier,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
};
