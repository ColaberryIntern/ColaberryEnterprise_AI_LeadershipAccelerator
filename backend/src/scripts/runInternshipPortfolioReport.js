#!/usr/bin/env node
/**
 * Host-side shim for the Internship Portfolio Report.
 *
 * The reporting registry (lib/reportingRegistry.js) runs each report as `node <scriptPath>` on the
 * prod HOST. This report needs the backend's compiled services and DB connection, which live in the
 * container, so this shim runs the compiled script there and passes its exit code back, which is
 * what the registry's audit email reads.
 *
 *   node backend/src/scripts/runInternshipPortfolioReport.js [--dry] [--no-llm]
 *
 * Failure path: docker missing / container down / the report failing all exit non-zero, and the
 * runner's audit email reports the failure. Hard timeout 10 minutes (a normal run takes ~10s), so
 * a hung DB call can never wedge the hourly runner. No retry here: the report itself is idempotent
 * (email_send_ledger), so the next scheduled run is the retry.
 */
const { spawnSync } = require('child_process');

const CONTAINER = process.env.INTERN_REPORT_CONTAINER || 'accelerator-backend';
const passthrough = process.argv.slice(2).filter((a) => ['--dry', '--no-llm'].includes(a));

const r = spawnSync('docker', ['exec', CONTAINER, 'node', 'dist/scripts/internshipPortfolioReport.js', ...passthrough], {
  stdio: 'inherit',
  timeout: 10 * 60 * 1000,
});

if (r.error) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'internship-portfolio-report', event: 'shim_failed', outcome: 'failure', error_class: r.error.code === 'ETIMEDOUT' ? 'TimeoutError' : 'UpstreamUnavailable', context: { message: r.error.message, container: CONTAINER } }));
  process.exit(1);
}
process.exit(r.status === null ? 1 : r.status);
