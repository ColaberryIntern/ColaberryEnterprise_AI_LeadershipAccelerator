// STORY-025: real system-health data, not fabricated demo numbers. This
// project's fake-data framing covers fictional demo content (officeholder
// names/positions); it does not extend to system telemetry, which is
// either real or not claimed at all.
const pool = require('../db');

const RECENT_ERROR_WINDOW_MINUTES = 5;
const DB_LATENCY_DEGRADED_MS = 500;
const RECENT_ERROR_COUNT_DEGRADED = 10;

async function checkDatabase() {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - start, error: err.message };
  }
}

// Real signal reused from the audit_log this project has spent several
// stories hardening (STORY-023/024) -- not a separate, invented metrics
// pipeline. Counts recently-logged failure/denial actions as a rough
// error-rate proxy.
async function countRecentErrors() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_log
       WHERE (action LIKE '%_FAILED' OR action LIKE '%_DENIED')
         AND created_at > NOW() - ($1 || ' minutes')::interval`,
      [RECENT_ERROR_WINDOW_MINUTES],
    );
    return result.rows[0].n;
  } catch {
    // Same failure mode as checkDatabase(): if the DB is unreachable, the
    // health check's job is to report that -- not to itself 500 and hide
    // it. -1 is a sentinel distinct from a real "0 errors" count.
    return -1;
  }
}

// Pure -- derives an overall status from already-computed signals, kept
// separate from the I/O above so the decision logic is unit-testable
// without a database.
function deriveOverallStatus(db, recentErrorCount) {
  if (db.status === 'down') return 'down';
  if (db.latencyMs > DB_LATENCY_DEGRADED_MS || recentErrorCount > RECENT_ERROR_COUNT_DEGRADED) return 'degraded';
  return 'healthy';
}

async function getSystemHealth() {
  const db = await checkDatabase();
  const recentErrorCount = await countRecentErrors();
  const status = deriveOverallStatus(db, recentErrorCount);

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    database: db,
    recentErrors: { windowMinutes: RECENT_ERROR_WINDOW_MINUTES, count: recentErrorCount },
  };
}

module.exports = {
  getSystemHealth, deriveOverallStatus, checkDatabase, countRecentErrors,
};
