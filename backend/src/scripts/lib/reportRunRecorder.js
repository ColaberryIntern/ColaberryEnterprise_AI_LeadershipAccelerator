// reportRunRecorder.js
//
// Tiny helper so every report script can record its run to the
// automated_report_runs table, powering the /admin/reports history view.
//
// Usage:
//   const recorder = require('./lib/reportRunRecorder');
//   const run = await recorder.start('Weekly Intern Activity Report');
//   ... do work ...
//   await recorder.end(run, { status: 'success', messageIds: ['<id>'], recipientsSent: ['ali@colaberry.com'] });
//
// On the host (outside docker), Postgres is only reachable via docker-exec.
// So the recorder shells out to `docker exec accelerator-db psql ...` with
// parameterized SQL. Soft-fails: if recording can't happen (no docker, no
// container, no table), the script keeps running. We never want a recorder
// failure to break a real report.

const { spawnSync } = require('child_process');

function safeJson(v) { return JSON.stringify(v).replace(/'/g, "''"); }
function nowIso() { return new Date().toISOString(); }

function execPsql(sql) {
  // Soft-fail wrapper. Returns { ok, out, err }.
  try {
    const r = spawnSync('docker', ['exec', 'accelerator-db', 'psql', '-U', 'accelerator', '-d', 'accelerator_prod', '-tA', '-c', sql], { encoding: 'utf8', timeout: 8000 });
    if (r.status !== 0) return { ok: false, err: (r.stderr || '').trim() };
    return { ok: true, out: (r.stdout || '').trim() };
  } catch (e) { return { ok: false, err: e.message }; }
}

async function start(reportName, triggeredBy = 'cron') {
  // Resolve the report_id by name (the row should already exist; if not, skip).
  const idQ = execPsql(`SELECT id FROM automated_reports WHERE name = '${reportName.replace(/'/g, "''")}' LIMIT 1`);
  if (!idQ.ok || !idQ.out) {
    return { reportId: null, startedAt: nowIso(), disabled: true, reason: idQ.err || 'no row in automated_reports' };
  }
  const reportId = idQ.out;
  const startedAt = nowIso();
  const insertSql = `INSERT INTO automated_report_runs (report_id, started_at, status, triggered_by) VALUES ('${reportId}', '${startedAt}', 'running', '${triggeredBy.replace(/'/g, "''")}') RETURNING id`;
  const insQ = execPsql(insertSql);
  if (!insQ.ok || !insQ.out) {
    return { reportId, startedAt, disabled: true, reason: insQ.err || 'insert failed' };
  }
  return { runId: insQ.out, reportId, startedAt, disabled: false };
}

async function end(run, { status = 'success', messageIds = [], recipientsSent = [], error = null } = {}) {
  if (!run || run.disabled || !run.runId) return;
  const endedAt = nowIso();
  const messageIdsArr = messageIds.length ? `ARRAY[${messageIds.map((m) => `'${String(m).replace(/'/g, "''")}'`).join(',')}]::text[]` : `NULL`;
  const recipientsArr = recipientsSent.length ? `ARRAY[${recipientsSent.map((m) => `'${String(m).replace(/'/g, "''")}'`).join(',')}]::text[]` : `NULL`;
  const errorClause = error ? `, error = '${String(error).slice(0, 2000).replace(/'/g, "''")}'` : '';
  const updateSql = `UPDATE automated_report_runs SET ended_at = '${endedAt}', status = '${status}', message_ids = ${messageIdsArr}, recipients_sent = ${recipientsArr}${errorClause} WHERE id = '${run.runId}'`;
  execPsql(updateSql);
  // Also update last_run_at / last_status / last_message_id on the report row
  if (run.reportId) {
    const lastId = messageIds[0] ? `'${String(messageIds[0]).replace(/'/g, "''")}'` : 'NULL';
    execPsql(`UPDATE automated_reports SET last_run_at = '${endedAt}', last_status = '${status}', last_message_id = ${lastId}, updated_at = NOW() WHERE id = '${run.reportId}'`);
  }
}

module.exports = { start, end };
