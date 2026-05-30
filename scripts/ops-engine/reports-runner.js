#!/usr/bin/env node
// Unified reports runner - reads automated_reports table, dispatches due reports,
// logs every run to automated_report_runs. Cron: */5 * * * * (every 5 min).
// Single source of truth for "what reports are scheduled and what ran when."

const { Sequelize } = require('sequelize');
const { execSync } = require('child_process');
const path = require('path');

const sql = new Sequelize(process.env.DATABASE_URL || process.env.POSTGRES_URL, {
  logging: false,
  dialect: 'postgres',
});

// Minimal cron evaluator - checks if a cron expression's next fire time is in the past
// relative to last_run_at. Supports the patterns we use (no special chars beyond
// digits, comma, asterisk, slash).
function shouldFire(cronExpr, lastRunAt) {
  // For now: parse simple cron, check if the current minute matches
  // and last_run_at is before the current minute boundary.
  // More precise: use 'cron-parser' npm package if available.
  try {
    const parser = require(path.resolve(__dirname, '../../node_modules/cron-parser'));
    const interval = parser.parseExpression(cronExpr, { tz: 'America/Chicago' });
    const prevFire = interval.prev().toDate();
    if (!lastRunAt) return true;
    return new Date(lastRunAt) < prevFire;
  } catch (e) {
    // Fallback: minute-of-day match (5-field cron)
    const parts = cronExpr.split(/\s+/);
    if (parts.length !== 5) return false;
    const [mn, hr, dom, mon, dow] = parts;
    const now = new Date();
    const match = (val, current) => val === '*' || val.split(',').includes(String(current));
    return match(mn, now.getMinutes()) && match(hr, now.getHours()) &&
      match(dom, now.getDate()) && match(mon, now.getMonth() + 1) &&
      match(dow, now.getDay());
  }
}

async function runOne(report) {
  const startTs = new Date();
  const [runRow] = await sql.query(
    "INSERT INTO automated_report_runs (report_id, started_at, status, triggered_by) VALUES ($1, $2, 'running', 'unified-runner') RETURNING id",
    { bind: [report.id, startTs] }
  );
  const runId = runRow[0].id;

  try {
    const scriptPath = path.resolve(__dirname, '../..', report.script_path);
    console.log(`[runner] firing ${report.name} -> ${scriptPath}`);
    execSync(`node ${JSON.stringify(scriptPath)}`, { stdio: 'inherit', timeout: 5 * 60 * 1000 });

    await sql.query(
      "UPDATE automated_report_runs SET ended_at = NOW(), status = 'success' WHERE id = $1",
      { bind: [runId] }
    );
    await sql.query(
      "UPDATE automated_reports SET last_run_at = NOW(), last_status = 'success', updated_at = NOW() WHERE id = $1",
      { bind: [report.id] }
    );
    console.log(`[runner] ✓ ${report.name}`);
  } catch (e) {
    const errMsg = (e.message || String(e)).slice(0, 500);
    await sql.query(
      "UPDATE automated_report_runs SET ended_at = NOW(), status = 'failed', error = $2 WHERE id = $1",
      { bind: [runId, errMsg] }
    );
    await sql.query(
      "UPDATE automated_reports SET last_run_at = NOW(), last_status = 'failed', updated_at = NOW() WHERE id = $1",
      { bind: [report.id] }
    );
    console.error(`[runner] ✗ ${report.name}: ${errMsg}`);
  }
}

(async () => {
  const [reports] = await sql.query(
    "SELECT id, name, script_path, cron_schedule, last_run_at, enabled FROM automated_reports WHERE enabled = true AND script_path LIKE '%/scripts/%' ORDER BY name"
  );
  console.log(`[runner] checking ${reports.length} enabled script-based reports`);
  let fired = 0;
  for (const r of reports) {
    if (shouldFire(r.cron_schedule, r.last_run_at)) {
      await runOne(r);
      fired++;
    } else {
      console.log(`[runner] - skip ${r.name} (not due)`);
    }
  }
  console.log(`[runner] done. fired=${fired} skipped=${reports.length - fired}`);
  await sql.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
