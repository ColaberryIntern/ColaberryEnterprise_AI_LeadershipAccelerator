#!/usr/bin/env node
// Weekly Cohort Performance Report — replaces Taiwo's Wednesday manual report.
//
// Data: vw_ClassSignUps_EventProgress in CCPP (MSSQL).
// Snapshot store: cohort_report_snapshots in Postgres (for week-over-week trends).
// Output: rich self-contained interactive HTML attachment + Ali-personalized email.
//
// Flags:
//   --dry            do not email, do not snapshot
//   --no-email       skip email (still snapshots)
//   --no-snapshot    skip writing to snapshot store (still emails)
//   --test           include "[TEST]" in subject for non-Wed runs
//
// Schedule: Wed 13:00 UTC (= 8am CT during DST, 7am CT during standard time).

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const sql = require(path.resolve(__dirname, '../../../node_modules/mssql'));
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const recorder = require(path.resolve(__dirname, './lib/reportRunRecorder'));

const DRY = process.argv.includes('--dry');
const NO_EMAIL = process.argv.includes('--no-email');
const NO_SNAPSHOT = process.argv.includes('--no-snapshot');
const TEST = process.argv.includes('--test');

const COHORT_LOOKBACK_MONTHS = 18;
const COHORT_MIN_STUDENTS = 5;

// Tiering thresholds (within-cohort relative position)
const TIER_AT_RISK_PCTILE = 0.25;
const TIER_HIGH_PCTILE = 0.75;

const OUTPUT_DIR = path.resolve(__dirname, '../../../tmp/cohort-reports');
const ALI_EMAIL = 'ali@colaberry.com';
const CC_EMAIL = 'alimuwwakkil@gmail.com';

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function htmlEscape(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function median(arr) { const s = [...arr].sort((a, b) => a - b); const n = s.length; if (n === 0) return 0; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function quantile(arr, q) { const s = [...arr].sort((a, b) => a - b); const i = q * (s.length - 1); const lo = Math.floor(i); const hi = Math.ceil(i); if (lo === hi) return s[lo]; return s[lo] + (s[hi] - s[lo]) * (i - lo); }

// ============================================================================
// Postgres snapshot helpers (via docker exec)
// ============================================================================

function pgExec(sqlText) {
  // Use stdin to safely pipe SQL with quotes / JSON
  const r = spawnSync('docker', ['exec', '-i', 'accelerator-db', 'psql', '-U', 'accelerator', '-d', 'accelerator_prod', '-tA', '-c', sqlText], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) {
    throw new Error(`pgExec failed: ${(r.stderr || '').trim()}`);
  }
  return (r.stdout || '').trim();
}
function pgExecFromFile(fpath) {
  const r = spawnSync('docker', ['exec', '-i', 'accelerator-db', 'psql', '-U', 'accelerator', '-d', 'accelerator_prod', '-tA', '-f', '-'], {
    input: fs.readFileSync(fpath, 'utf8'),
    encoding: 'utf8',
    timeout: 60000,
  });
  if (r.status !== 0) throw new Error(`pgExecFromFile: ${(r.stderr || '').trim()}`);
  return (r.stdout || '').trim();
}
function pgInsertSnapshot(cohort, snapshotDate) {
  // Use a temp file to pass JSON safely through docker exec
  const tmpSql = path.resolve(OUTPUT_DIR, '.pg-insert.sql');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const dataJson = JSON.stringify(cohort.students).replace(/'/g, "''");
  const sqlText = `INSERT INTO cohort_report_snapshots
    (snapshot_date, class_id, class_name, enrollment_date_min, total_students, median_completion_pct, mean_completion_pct, min_completion_pct, max_completion_pct, at_risk_count, on_track_count, high_count, data_json)
    VALUES ('${snapshotDate}', ${cohort.classId}, '${cohort.className.replace(/'/g, "''")}', ${cohort.enrollmentDateMin ? `'${cohort.enrollmentDateMin}'` : 'NULL'}, ${cohort.totalStudents}, ${cohort.medianPct.toFixed(2)}, ${cohort.meanPct.toFixed(2)}, ${cohort.minPct.toFixed(2)}, ${cohort.maxPct.toFixed(2)}, ${cohort.atRiskCount}, ${cohort.onTrackCount}, ${cohort.highCount}, '${dataJson}'::jsonb)
    ON CONFLICT (snapshot_date, class_id) DO UPDATE SET
      total_students = EXCLUDED.total_students,
      median_completion_pct = EXCLUDED.median_completion_pct,
      mean_completion_pct = EXCLUDED.mean_completion_pct,
      min_completion_pct = EXCLUDED.min_completion_pct,
      max_completion_pct = EXCLUDED.max_completion_pct,
      at_risk_count = EXCLUDED.at_risk_count,
      on_track_count = EXCLUDED.on_track_count,
      high_count = EXCLUDED.high_count,
      data_json = EXCLUDED.data_json;`;
  fs.writeFileSync(tmpSql, sqlText);
  pgExecFromFile(tmpSql);
}
function pgPriorSnapshot(classId, beforeDate) {
  // Latest snapshot before beforeDate (one week ago target)
  const sqlText = `SELECT total_students, median_completion_pct, at_risk_count, on_track_count, high_count, snapshot_date::text FROM cohort_report_snapshots WHERE class_id = ${classId} AND snapshot_date < '${beforeDate}' ORDER BY snapshot_date DESC LIMIT 1`;
  const out = pgExec(sqlText);
  if (!out) return null;
  const parts = out.split('|');
  return {
    totalStudents: parseInt(parts[0], 10),
    medianPct: parseFloat(parts[1]),
    atRiskCount: parseInt(parts[2], 10),
    onTrackCount: parseInt(parts[3], 10),
    highCount: parseInt(parts[4], 10),
    snapshotDate: parts[5],
  };
}
function pgLastNSnapshots(classId, n = 4) {
  const sqlText = `SELECT snapshot_date::text, total_students, median_completion_pct, at_risk_count, on_track_count, high_count FROM cohort_report_snapshots WHERE class_id = ${classId} ORDER BY snapshot_date DESC LIMIT ${n}`;
  const out = pgExec(sqlText);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    const p = line.split('|');
    return { date: p[0], total: +p[1], median: +p[2], atRisk: +p[3], onTrack: +p[4], high: +p[5] };
  }).reverse(); // chronological
}

// ============================================================================
// CCPP fetch
// ============================================================================

async function fetchCohorts() {
  const pool = await sql.connect({
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true, requestTimeout: 60000 },
  });

  // Pull all signups from recent cohorts. Filter to ClassStartDate within
  // the lookback window. Per-cohort minimum size to drop test classes.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - COHORT_LOOKBACK_MONTHS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result = await pool.request().query(`
    SELECT
      ep.ClassSignUpsID,
      ep.ClassId,
      ep.ClassName,
      ep.FirstName,
      ep.LastName,
      ep.Email,
      ep.EnrollmentDate,
      ep.NoOfSections,
      ep.CurrentSection,
      ep.NoOfEvents,
      ep.TotalEventsCompleted,
      ep.EventsCompletionPercentage
    FROM vw_ClassSignUps_EventProgress ep
    WHERE ep.EnrollmentDate >= '${cutoffStr}'
      AND ep.NoOfSections > 0
  `);
  await pool.close();
  // Group by ClassId
  const byCohort = new Map();
  for (const r of result.recordset) {
    if (!byCohort.has(r.ClassId)) {
      byCohort.set(r.ClassId, { classId: r.ClassId, className: r.ClassName, students: [] });
    }
    byCohort.get(r.ClassId).students.push({
      signupId: r.ClassSignUpsID,
      name: `${r.FirstName || ''} ${r.LastName || ''}`.trim(),
      email: r.Email,
      enrollmentDate: r.EnrollmentDate,
      sectionsTotal: r.NoOfSections,
      sectionsCurrent: r.CurrentSection,
      eventsTotal: r.NoOfEvents,
      eventsDone: r.TotalEventsCompleted,
      pct: parseFloat(r.EventsCompletionPercentage) || 0,
    });
  }
  // Compute per-cohort aggregates
  const cohorts = [];
  for (const c of byCohort.values()) {
    if (c.students.length < COHORT_MIN_STUDENTS) continue;
    const pcts = c.students.map((s) => s.pct);
    const med = median(pcts);
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const atRiskThreshold = quantile(pcts, TIER_AT_RISK_PCTILE);
    const highThreshold = quantile(pcts, TIER_HIGH_PCTILE);
    // Tag each student with their tier
    for (const s of c.students) {
      if (s.pct <= atRiskThreshold) s.tier = 'AT_RISK';
      else if (s.pct >= highThreshold) s.tier = 'HIGH';
      else s.tier = 'ON_TRACK';
    }
    const atRiskCount = c.students.filter((s) => s.tier === 'AT_RISK').length;
    const onTrackCount = c.students.filter((s) => s.tier === 'ON_TRACK').length;
    const highCount = c.students.filter((s) => s.tier === 'HIGH').length;
    // Use earliest enrollment date as the cohort start proxy (cast to ISO string)
    const enrollmentDateMin = c.students.map((s) => s.enrollmentDate ? new Date(s.enrollmentDate).toISOString() : null).filter(Boolean).sort()[0] || null;
    cohorts.push({
      classId: c.classId,
      className: c.className,
      enrollmentDateMin,
      totalStudents: c.students.length,
      medianPct: med,
      meanPct: mean,
      minPct: Math.min(...pcts),
      maxPct: Math.max(...pcts),
      atRiskCount, onTrackCount, highCount,
      atRiskThreshold, highThreshold,
      students: c.students,
    });
  }
  // Sort by enrollmentDateMin desc (most recent cohort first)
  cohorts.sort((a, b) => String(b.enrollmentDateMin || '').localeCompare(String(a.enrollmentDateMin || '')));
  return cohorts;
}

// ============================================================================
// Interactive HTML render
// ============================================================================

function buildInteractiveHtml(cohorts, snapshotDate) {
  // Build per-cohort trend data and prior-snapshot delta
  const cohortBlocks = cohorts.map((c, idx) => {
    let prior = null, trend = [];
    try { prior = pgPriorSnapshot(c.classId, snapshotDate); } catch (_e) {}
    try { trend = pgLastNSnapshots(c.classId, 6); } catch (_e) {}
    const delta = prior ? {
      atRiskDelta: c.atRiskCount - prior.atRiskCount,
      onTrackDelta: c.onTrackCount - prior.onTrackCount,
      highDelta: c.highCount - prior.highCount,
      medianDelta: c.medianPct - prior.medianPct,
    } : null;
    return { ...c, prior, delta, trend };
  });

  const overallTotal = cohortBlocks.reduce((s, c) => s + c.totalStudents, 0);
  const overallAtRisk = cohortBlocks.reduce((s, c) => s + c.atRiskCount, 0);
  const overallHigh = cohortBlocks.reduce((s, c) => s + c.highCount, 0);
  const overallOnTrack = cohortBlocks.reduce((s, c) => s + c.onTrackCount, 0);
  const overallMedianAvg = cohortBlocks.reduce((s, c) => s + c.medianPct, 0) / Math.max(1, cohortBlocks.length);

  // Inline JSON payload that the browser-side JS reads
  const payload = JSON.stringify({
    snapshotDate,
    overall: { totalStudents: overallTotal, atRisk: overallAtRisk, onTrack: overallOnTrack, high: overallHigh, medianAvg: overallMedianAvg, cohortCount: cohortBlocks.length },
    cohorts: cohortBlocks,
  }).replace(/</g, '\\u003c'); // safe inside <script>

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cohort Performance Report - ${snapshotDate}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #f1f5f9;
    --card: #ffffff;
    --text: #1a202c;
    --muted: #64748b;
    --border: #cbd5e0;
    --navy: #1a365d;
    --navy-light: #2b6cb0;
    --warm: #fbbf24;
    --gold: #d97706;
    --green-bg: #dcfce7;
    --green: #166534;
    --green-accent: #16a34a;
    --red-bg: #fee2e2;
    --red: #991b1b;
    --red-accent: #dc2626;
    --yellow-bg: #fef9c3;
    --yellow: #854d0e;
    --yellow-accent: #ca8a04;
    --orange-bg: #fed7aa;
    --orange: #9a3412;
  }
  html[data-theme="dark"] {
    --bg: #0c0a09;
    --card: #1c1917;
    --text: #f5f5f4;
    --muted: #a8a29e;
    --border: #44403c;
    --navy: #0f172a;
    --navy-light: #1e3a5f;
    --green-bg: #14532d;
    --red-bg: #7f1d1d;
    --yellow-bg: #713f12;
    --orange-bg: #7c2d12;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.55; transition: background .2s, color .2s; }
  .container { max-width: 1240px; margin: 0 auto; padding: 24px; }
  .hero { background: linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%); color: white; padding: 32px 40px; border-radius: 12px; margin-bottom: 24px; position: relative; overflow: hidden; }
  .hero .kicker { font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--warm); font-weight: 700; }
  .hero h1 { font-size: 32px; font-weight: 800; margin: 8px 0 6px; line-height: 1.15; }
  .hero .sub { font-size: 14px; color: rgba(255,255,255,.85); }
  .theme-toggle { position: absolute; top: 24px; right: 24px; background: rgba(255,255,255,.1); color: white; border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 6px 14px; font-size: 11px; cursor: pointer; letter-spacing: 1px; }
  .theme-toggle:hover { background: rgba(255,255,255,.2); }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; transition: transform .2s; }
  .kpi:hover { transform: translateY(-2px); }
  .kpi .label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .kpi .value { font-size: 32px; font-weight: 800; color: var(--text); margin-top: 4px; line-height: 1; }
  .kpi .delta { font-size: 11px; margin-top: 6px; }
  .kpi .delta.up { color: var(--green-accent); }
  .kpi .delta.down { color: var(--red-accent); }
  .kpi.at-risk .value { color: var(--red-accent); }
  .kpi.on-track .value { color: var(--gold); }
  .kpi.high .value { color: var(--green-accent); }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; flex-wrap: wrap; }
  .tab { background: transparent; border: none; padding: 12px 18px; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 3px solid transparent; transition: all .15s; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--navy-light); border-bottom-color: var(--navy-light); }
  .tab-content { display: none; }
  .tab-content.active { display: block; animation: fadeIn .25s; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .cohort-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px 22px; margin-bottom: 16px; }
  .cohort-head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
  .cohort-title { font-size: 17px; font-weight: 700; color: var(--text); }
  .cohort-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .cohort-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin: 12px 0; }
  .stat { background: var(--bg); border-radius: 6px; padding: 10px 12px; }
  .stat .label { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .stat .value { font-size: 18px; font-weight: 700; color: var(--text); }
  .stat .delta { font-size: 10px; }
  .stat .delta.up { color: var(--green-accent); }
  .stat .delta.down { color: var(--red-accent); }
  .stat.at-risk .value { color: var(--red-accent); }
  .stat.on-track .value { color: var(--gold); }
  .stat.high .value { color: var(--green-accent); }
  .chart-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-top: 14px; }
  @media (max-width: 760px) { .chart-row { grid-template-columns: 1fr; } }
  .chart-box { background: var(--bg); border-radius: 8px; padding: 14px; height: 240px; position: relative; }
  .drill-toggle { background: transparent; color: var(--navy-light); border: 1px solid var(--navy-light); border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 600; cursor: pointer; margin-top: 14px; }
  .drill-toggle:hover { background: var(--navy-light); color: white; }
  .drill-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; display: none; }
  .drill-table.shown { display: table; }
  .drill-table th { background: var(--navy); color: white; padding: 8px 10px; text-align: left; font-size: 10px; letter-spacing: 1px; cursor: pointer; user-select: none; position: sticky; top: 0; }
  .drill-table td { padding: 6px 10px; border-bottom: 1px solid var(--border); }
  .drill-table tr.at-risk td { background: var(--red-bg); }
  .drill-table tr.high td { background: var(--green-bg); }
  .drill-wrap { max-height: 360px; overflow-y: auto; border-radius: 6px; margin-top: 8px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; letter-spacing: 1px; }
  .pill.at-risk { background: var(--red-bg); color: var(--red); }
  .pill.on-track { background: var(--yellow-bg); color: var(--yellow); }
  .pill.high { background: var(--green-bg); color: var(--green); }
  .filter-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-row input, .filter-row select { background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 13px; }
  .footer { text-align: center; color: var(--muted); font-size: 11px; padding: 24px; }
  .empty-state { text-align: center; padding: 40px; color: var(--muted); }
</style>
</head>
<body>
<div class="container">

  <div class="hero">
    <button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
    <div class="kicker">Cohort Performance Report</div>
    <h1>Week of ${shortDate(snapshotDate)}</h1>
    <div class="sub">Live data from CCPP. Tracks every cohort with at least ${COHORT_MIN_STUDENTS} students enrolled in the last ${COHORT_LOOKBACK_MONTHS} months.</div>
  </div>

  <div class="kpi-grid" id="kpis"></div>

  <div class="tabs">
    <button class="tab active" data-tab="cohorts">Cohorts (<span id="cohort-count"></span>)</button>
    <button class="tab" data-tab="at-risk">At-Risk Students</button>
    <button class="tab" data-tab="trends">Trends</button>
  </div>

  <div class="tab-content active" id="tab-cohorts">
    <div class="filter-row">
      <input type="text" id="cohort-search" placeholder="Filter cohorts by name..." oninput="renderCohorts()" style="flex:1;min-width:200px">
      <select id="cohort-sort" onchange="renderCohorts()">
        <option value="recent">Sort: Most recent first</option>
        <option value="atrisk">Sort: Most at-risk first</option>
        <option value="size">Sort: Largest cohort first</option>
        <option value="median">Sort: Highest median %</option>
      </select>
    </div>
    <div id="cohort-list"></div>
  </div>

  <div class="tab-content" id="tab-at-risk">
    <div class="filter-row">
      <input type="text" id="atrisk-search" placeholder="Filter by name or email..." oninput="renderAtRisk()" style="flex:1;min-width:200px">
    </div>
    <div id="atrisk-table-wrap"></div>
  </div>

  <div class="tab-content" id="tab-trends">
    <div id="trends-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px"></div>
  </div>

  <div class="footer">
    Source: CCPP <code>vw_ClassSignUps_EventProgress</code> + Postgres <code>cohort_report_snapshots</code> for week-over-week trends.
    Snapshot ${snapshotDate}. Generated automatically every Wednesday.
  </div>

</div>

<script>
const DATA = ${payload};
const PCT_FMT = (n) => n == null ? '-' : (Math.round(n * 10) / 10) + '%';
const NUM_FMT = (n) => n == null ? '-' : Number(n).toLocaleString();
const DELTA_FMT = (n) => n == null || n === 0 ? '&nbsp;' : (n > 0 ? '&#9650; ' : '&#9660; ') + Math.abs(Math.round(n * 10) / 10);

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light');
  setTimeout(rebuildAllCharts, 100);
}

let CHARTS = [];
function rebuildAllCharts() {
  for (const c of CHARTS) try { c.destroy(); } catch (_e) {}
  CHARTS = [];
  renderCohorts();
  renderTrends();
}

// === KPIs ===
function renderKpis() {
  const k = document.getElementById('kpis');
  const o = DATA.overall;
  k.innerHTML = [
    { label: 'Cohorts tracked', value: NUM_FMT(o.cohortCount), cls: '' },
    { label: 'Total students', value: NUM_FMT(o.totalStudents), cls: '' },
    { label: 'High performers', value: NUM_FMT(o.high), cls: 'high' },
    { label: 'On track', value: NUM_FMT(o.onTrack), cls: 'on-track' },
    { label: 'At risk', value: NUM_FMT(o.atRisk), cls: 'at-risk' },
    { label: 'Avg median %', value: PCT_FMT(o.medianAvg), cls: '' },
  ].map(k => '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>').join('');
}

// === Cohorts tab ===
function renderCohorts() {
  for (const c of CHARTS) try { c.destroy(); } catch (_e) {}
  CHARTS = [];
  const search = (document.getElementById('cohort-search').value || '').toLowerCase();
  const sort = document.getElementById('cohort-sort').value;
  let list = DATA.cohorts.filter(c => !search || c.className.toLowerCase().includes(search));
  if (sort === 'atrisk') list.sort((a,b) => b.atRiskCount - a.atRiskCount);
  else if (sort === 'size') list.sort((a,b) => b.totalStudents - a.totalStudents);
  else if (sort === 'median') list.sort((a,b) => b.medianPct - a.medianPct);
  // default 'recent' = already sorted by enrollmentDateMin desc in payload

  document.getElementById('cohort-count').textContent = list.length;
  const container = document.getElementById('cohort-list');
  if (list.length === 0) { container.innerHTML = '<div class="empty-state">No cohorts match this filter.</div>'; return; }
  container.innerHTML = list.map((c, i) => cohortCardHtml(c, i)).join('');
  // After DOM in place, build the per-cohort charts
  list.forEach((c, i) => {
    buildDistChart(c, i);
  });
}

function deltaTag(d) {
  if (d == null) return '';
  if (d === 0) return '<span class="delta">&rarr; 0</span>';
  const cls = d > 0 ? 'up' : 'down';
  const arrow = d > 0 ? '&#9650;' : '&#9660;';
  return '<span class="delta ' + cls + '">' + arrow + ' ' + Math.abs(d) + '</span>';
}
function pctDelta(d) {
  if (d == null) return '';
  if (Math.abs(d) < 0.05) return '<span class="delta">&rarr; 0</span>';
  const cls = d > 0 ? 'up' : 'down';
  const arrow = d > 0 ? '&#9650;' : '&#9660;';
  return '<span class="delta ' + cls + '">' + arrow + ' ' + Math.abs(Math.round(d * 10) / 10) + '</span>';
}

function cohortCardHtml(c, i) {
  const enrollDate = c.enrollmentDateMin ? new Date(c.enrollmentDateMin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown';
  const dCount = c.delta;
  const priorBlock = c.prior ? '<span style="font-size:10px;color:var(--muted)">vs ' + c.prior.snapshotDate + '</span>' : '<span style="font-size:10px;color:var(--muted)">first snapshot</span>';
  return '<div class="cohort-card">' +
    '<div class="cohort-head"><div><div class="cohort-title">' + esc(c.className) + '</div><div class="cohort-meta">Started ' + enrollDate + ' &middot; class id ' + c.classId + ' &middot; ' + priorBlock + '</div></div></div>' +
    '<div class="cohort-stats">' +
      stat('Students', NUM_FMT(c.totalStudents), c.delta ? deltaTag(c.delta.atRiskDelta == null ? 0 : (c.totalStudents - (c.prior ? c.prior.totalStudents : c.totalStudents))) : '') +
      stat('Median %', PCT_FMT(c.medianPct), c.delta ? pctDelta(c.delta.medianDelta) : '', '') +
      stat('At-Risk', NUM_FMT(c.atRiskCount), c.delta ? deltaTag(c.delta.atRiskDelta) : '', 'at-risk') +
      stat('On Track', NUM_FMT(c.onTrackCount), c.delta ? deltaTag(c.delta.onTrackDelta) : '', 'on-track') +
      stat('High', NUM_FMT(c.highCount), c.delta ? deltaTag(c.delta.highDelta) : '', 'high') +
    '</div>' +
    '<div class="chart-row"><div class="chart-box"><canvas id="dist-' + i + '"></canvas></div><div class="chart-box"><canvas id="tier-' + i + '"></canvas></div></div>' +
    '<button class="drill-toggle" onclick="toggleDrill(' + i + ')">Show students &darr;</button>' +
    '<div class="drill-wrap"><table class="drill-table" id="drill-' + i + '"><thead><tr><th onclick="sortDrill(' + i + ',\\'name\\')">Student</th><th onclick="sortDrill(' + i + ',\\'pct\\')">Completion %</th><th onclick="sortDrill(' + i + ',\\'sectionsCurrent\\')">Section</th><th>Events</th><th>Tier</th><th>Email</th></tr></thead><tbody id="drill-body-' + i + '">' + drillBody(c) + '</tbody></table></div>' +
    '</div>';
}
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function stat(label, value, delta, cls) {
  return '<div class="stat ' + (cls||'') + '"><div class="label">' + label + '</div><div class="value">' + value + '</div>' + (delta||'') + '</div>';
}
function tierPill(t) { return '<span class="pill ' + (t === 'AT_RISK' ? 'at-risk' : t === 'HIGH' ? 'high' : 'on-track') + '">' + t.replace('_',' ') + '</span>'; }
function drillBody(c) {
  return [...c.students].sort((a,b) => b.pct - a.pct).map(s =>
    '<tr class="' + (s.tier === 'AT_RISK' ? 'at-risk' : s.tier === 'HIGH' ? 'high' : '') + '">' +
    '<td>' + esc(s.name) + '</td>' +
    '<td><strong>' + (s.pct != null ? s.pct.toFixed(1) : '-') + '%</strong></td>' +
    '<td>' + (s.sectionsCurrent || '-') + '/' + (s.sectionsTotal || '-') + '</td>' +
    '<td>' + (s.eventsDone || 0) + '/' + (s.eventsTotal || 0) + '</td>' +
    '<td>' + tierPill(s.tier) + '</td>' +
    '<td><a href="mailto:' + esc(s.email) + '" style="color:var(--navy-light);text-decoration:none">' + esc(s.email || '') + '</a></td>' +
    '</tr>'
  ).join('');
}
function toggleDrill(i) {
  const t = document.getElementById('drill-' + i);
  t.classList.toggle('shown');
}
function sortDrill(i, field) {
  const c = DATA.cohorts.filter(c => !document.getElementById('cohort-search').value || c.className.toLowerCase().includes(document.getElementById('cohort-search').value.toLowerCase()))[i];
  const tbody = document.getElementById('drill-body-' + i);
  const sorted = [...c.students].sort((a, b) => {
    if (typeof a[field] === 'string') return a[field].localeCompare(b[field]);
    return b[field] - a[field];
  });
  c.students = sorted;
  tbody.innerHTML = drillBody(c);
}

// === Charts ===
function getThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: isDark ? '#f5f5f4' : '#1a202c',
    muted: isDark ? '#a8a29e' : '#64748b',
    grid: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)',
  };
}
function buildDistChart(c, i) {
  const buckets = [0,10,20,30,40,50,60,70,80,90,100];
  const counts = new Array(buckets.length - 1).fill(0);
  for (const s of c.students) {
    let idx = Math.min(Math.floor(s.pct / 10), buckets.length - 2);
    counts[idx]++;
  }
  const labels = buckets.slice(0, -1).map((b, j) => b + '-' + buckets[j + 1] + '%');
  const colors = labels.map((_, j) => {
    const center = (buckets[j] + buckets[j + 1]) / 2;
    if (center <= c.atRiskThreshold) return '#dc2626';
    if (center >= c.highThreshold) return '#16a34a';
    return '#ca8a04';
  });
  const tc = getThemeColors();
  const ctx = document.getElementById('dist-' + i);
  if (!ctx) return;
  CHARTS.push(new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Students', data: counts, backgroundColor: colors, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Completion % distribution', color: tc.text, font: { size: 12, weight: '600' } } }, scales: { x: { ticks: { color: tc.muted, font: { size: 10 } }, grid: { color: tc.grid } }, y: { ticks: { color: tc.muted, font: { size: 10 } }, grid: { color: tc.grid }, beginAtZero: true } } }
  }));
  const ctx2 = document.getElementById('tier-' + i);
  if (!ctx2) return;
  CHARTS.push(new Chart(ctx2, {
    type: 'doughnut',
    data: { labels: ['At Risk', 'On Track', 'High'], datasets: [{ data: [c.atRiskCount, c.onTrackCount, c.highCount], backgroundColor: ['#dc2626', '#ca8a04', '#16a34a'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: tc.text, font: { size: 10 }, boxWidth: 12 } }, title: { display: true, text: 'Tiers', color: tc.text, font: { size: 12, weight: '600' } } } }
  }));
}

// === At-Risk tab ===
function renderAtRisk() {
  const search = (document.getElementById('atrisk-search').value || '').toLowerCase();
  const flat = [];
  for (const c of DATA.cohorts) {
    for (const s of c.students) {
      if (s.tier === 'AT_RISK') flat.push({ ...s, cohort: c.className, classId: c.classId });
    }
  }
  flat.sort((a, b) => a.pct - b.pct);
  const filtered = flat.filter(s => !search || (s.name || '').toLowerCase().includes(search) || (s.email || '').toLowerCase().includes(search) || (s.cohort || '').toLowerCase().includes(search));
  const html = '<table class="drill-table shown"><thead><tr><th>Student</th><th>Cohort</th><th>Completion %</th><th>Section</th><th>Email</th></tr></thead><tbody>' +
    filtered.map(s =>
      '<tr class="at-risk"><td>' + esc(s.name) + '</td><td>' + esc(s.cohort) + '</td><td><strong>' + s.pct.toFixed(1) + '%</strong></td><td>' + (s.sectionsCurrent || '-') + '/' + (s.sectionsTotal || '-') + '</td><td><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></td></tr>'
    ).join('') + '</tbody></table>';
  document.getElementById('atrisk-table-wrap').innerHTML = '<div class="drill-wrap" style="max-height:600px">' + html + '</div>';
}

// === Trends tab ===
function renderTrends() {
  const grid = document.getElementById('trends-grid');
  grid.innerHTML = DATA.cohorts.filter(c => c.trend && c.trend.length >= 2).map((c, i) =>
    '<div class="cohort-card"><div class="cohort-title">' + esc(c.className) + '</div><div class="cohort-meta">' + c.trend.length + ' snapshots</div><div style="height:240px;margin-top:12px"><canvas id="trend-' + i + '"></canvas></div></div>'
  ).join('') || '<div class="empty-state">Not enough historical snapshots yet. Trends appear after 2+ Wednesday runs.</div>';
  const tc = getThemeColors();
  DATA.cohorts.filter(c => c.trend && c.trend.length >= 2).forEach((c, i) => {
    const ctx = document.getElementById('trend-' + i);
    if (!ctx) return;
    CHARTS.push(new Chart(ctx, {
      type: 'line',
      data: { labels: c.trend.map(t => t.date), datasets: [
        { label: 'At Risk', data: c.trend.map(t => t.atRisk), borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.12)', tension: .3, fill: true },
        { label: 'On Track', data: c.trend.map(t => t.onTrack), borderColor: '#ca8a04', backgroundColor: 'rgba(202,138,4,.12)', tension: .3, fill: true },
        { label: 'High', data: c.trend.map(t => t.high), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.12)', tension: .3, fill: true },
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: tc.text, font: { size: 10 }, boxWidth: 12 } } }, scales: { x: { ticks: { color: tc.muted, font: { size: 9 } }, grid: { color: tc.grid } }, y: { ticks: { color: tc.muted, font: { size: 10 } }, grid: { color: tc.grid }, beginAtZero: true } } }
    }));
  });
}

// === Tab switching ===
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const target = document.getElementById('tab-' + t.dataset.tab);
    target.classList.add('active');
    if (t.dataset.tab === 'at-risk') renderAtRisk();
    if (t.dataset.tab === 'trends') renderTrends();
  });
});

// Init
renderKpis();
renderCohorts();
</script>
</body>
</html>`;
}

// ============================================================================
// Email
// ============================================================================

function buildEmailHtml(cohorts, snapshotDate, attachmentName) {
  const overallTotal = cohorts.reduce((s, c) => s + c.totalStudents, 0);
  const overallAtRisk = cohorts.reduce((s, c) => s + c.atRiskCount, 0);
  const overallHigh = cohorts.reduce((s, c) => s + c.highCount, 0);

  // Identify cohorts that moved week-over-week (got worse)
  const worsening = [];
  const improving = [];
  for (const c of cohorts) {
    let prior = null;
    try { prior = pgPriorSnapshot(c.classId, snapshotDate); } catch (_e) {}
    if (!prior) continue;
    const atRiskDelta = c.atRiskCount - prior.atRiskCount;
    if (atRiskDelta >= 2) worsening.push({ name: c.className, delta: atRiskDelta });
    else if (atRiskDelta <= -2) improving.push({ name: c.className, delta: atRiskDelta });
  }

  const topAtRiskCohorts = [...cohorts].sort((a, b) => b.atRiskCount - a.atRiskCount).slice(0, 3);

  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Cohort Performance &middot; Weekly</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">Week of ${shortDate(snapshotDate)}</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:6px">${cohorts.length} cohorts &middot; ${overallTotal} students &middot; ${overallAtRisk} at-risk &middot; ${overallHigh} high performers</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, this is the weekly cohort dashboard (replaces Taiwo's manual report). ${overallAtRisk > 0 ? `<strong>${overallAtRisk} students across ${cohorts.length} cohorts are in the at-risk tier (bottom 25% of their cohort).</strong>` : 'No students are flagged at-risk this week.'} ${worsening.length > 0 ? `<strong>${worsening.length} ${worsening.length === 1 ? 'cohort got' : 'cohorts got'} worse</strong> (+2 or more at-risk vs last week).` : ''} The interactive HTML report is attached - open it in a browser for filterable per-cohort drill-down, sortable student tables, and trend charts.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:16px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 12px">Top 3 cohorts by at-risk count</h2>
<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Cohort</th><th align="center" style="padding:10px">Students</th><th align="center" style="padding:10px">At-risk</th><th align="center" style="padding:10px">On track</th><th align="center" style="padding:10px">High</th><th align="center" style="padding:10px">Median %</th></tr>
${topAtRiskCohorts.map((c, i) => `<tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'}">
<td style="padding:8px"><strong>${htmlEscape(stripEmDashes(c.className))}</strong></td>
<td align="center">${c.totalStudents}</td>
<td align="center" style="color:#dc2626;font-weight:700">${c.atRiskCount}</td>
<td align="center" style="color:#ca8a04">${c.onTrackCount}</td>
<td align="center" style="color:#16a34a">${c.highCount}</td>
<td align="center">${c.medianPct.toFixed(1)}%</td>
</tr>`).join('')}
</table>

${worsening.length > 0 ? `
<h2 style="font-size:16px;color:#991b1b;border-bottom:2px solid #fecaca;padding-bottom:8px;margin:24px 0 12px">Cohorts that got worse this week</h2>
<ul style="font-size:13px;margin:0 0 0 18px;padding:0;color:#475569">
${worsening.map((w) => `<li><strong>${htmlEscape(stripEmDashes(w.name))}</strong> - <span style="color:#dc2626">+${w.delta} at-risk</span></li>`).join('')}
</ul>` : ''}

${improving.length > 0 ? `
<h2 style="font-size:16px;color:#166534;border-bottom:2px solid #bbf7d0;padding-bottom:8px;margin:24px 0 12px">Cohorts that improved</h2>
<ul style="font-size:13px;margin:0 0 0 18px;padding:0;color:#475569">
${improving.map((w) => `<li><strong>${htmlEscape(stripEmDashes(w.name))}</strong> - <span style="color:#16a34a">${w.delta} at-risk</span></li>`).join('')}
</ul>` : ''}

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:220px;color:#475569"><strong>Drill into a cohort</strong></td><td style="padding:6px 0;vertical-align:top">Open the attached HTML. Click any cohort to see the full student list with completion %, section position, email links.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Reach out to at-risk students</strong></td><td style="padding:6px 0;vertical-align:top">Open the "At-Risk Students" tab in the HTML. Student emails are clickable. Or tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System draft outreach to at-risk students in &lt;cohort&gt;</code>.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Check trend history</strong></td><td style="padding:6px 0;vertical-align:top">Open the "Trends" tab in the HTML. Each cohort's at-risk / on-track / high counts plotted over the past several snapshots.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in any Basecamp thread.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Change the tier thresholds</strong></td><td style="padding:6px 0;vertical-align:top">Currently: at-risk = bottom 25% of cohort, high = top 25%. Tell me your preferred bands and I'll adjust.</td></tr>
</table>
</div>

<div style="margin-top:18px;padding:14px;background:#f8fafc;border-left:4px solid #1a365d;font-size:11px;color:#475569">
Source: CCPP <code>vw_ClassSignUps_EventProgress</code>. Snapshot stored in Postgres <code>cohort_report_snapshots</code> for trend comparison. Generated automatically every Wednesday morning. Attachment: <strong>${attachmentName}</strong>.
</div>

</div>
</div>
</body></html>`;
}

// ============================================================================
// Main
// ============================================================================

(async () => {
  console.log(`[cohort-report] start ${new Date().toISOString()}, dry=${DRY}, test=${TEST}`);
  const runRecord = await recorder.start('Weekly Cohort Performance Report');
  const messageIds = [];
  const recipientsSent = [];
  let runStatus = 'success';
  let runError = null;

  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const snapshotDate = new Date().toISOString().slice(0, 10);

    console.log('[cohort-report] querying CCPP...');
    const cohorts = await fetchCohorts();
    console.log(`[cohort-report] ${cohorts.length} cohorts, ${cohorts.reduce((s, c) => s + c.totalStudents, 0)} students`);

    // Snapshot to Postgres
    if (!NO_SNAPSHOT && !DRY) {
      console.log('[cohort-report] writing snapshots...');
      for (const c of cohorts) {
        try { pgInsertSnapshot(c, snapshotDate); }
        catch (e) { console.warn(`  snapshot fail for ${c.className}: ${e.message}`); }
      }
    }

    // Build the HTML
    const html = buildInteractiveHtml(cohorts, snapshotDate);
    const attachmentName = `cohort-report-${snapshotDate}.html`;
    const htmlPath = path.resolve(OUTPUT_DIR, attachmentName);
    fs.writeFileSync(htmlPath, stripEmDashes(html));
    console.log(`[cohort-report] HTML written: ${htmlPath} (${(fs.statSync(htmlPath).size / 1024).toFixed(1)}KB)`);

    // Email
    if (!DRY && !NO_EMAIL) {
      const emailHtml = stripEmDashes(buildEmailHtml(cohorts, snapshotDate, attachmentName));
      const emailText = stripEmDashes(`Ali, weekly cohort report for week of ${shortDate(snapshotDate)}. ${cohorts.length} cohorts, ${cohorts.reduce((s, c) => s + c.totalStudents, 0)} students, ${cohorts.reduce((s, c) => s + c.atRiskCount, 0)} at-risk.\n\nOpen the attached HTML for filterable per-cohort drill-down, sortable student tables, and trend charts.\n\nWhat you can do:\n  - Drill into a cohort: open the HTML\n  - Reach out to at-risk: at-risk tab in HTML, clickable emails\n  - Check trends: trends tab in HTML\n  - Ask CB: tag @CB System <anything>\n  - Change tier thresholds: tell me preferred bands\n`);
      validateBeforeSend(emailHtml, emailText);
      const transport = nodemailer.createTransport({
        host: 'smtp.mandrillapp.com', port: 587,
        auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
      });
      const r = await transport.sendMail({
        from: '"Ali Muwwakkil" <ali@colaberry.com>',
        to: ALI_EMAIL,
        cc: CC_EMAIL,
        subject: `${TEST ? '[TEST] ' : ''}[Cohort Report] Week of ${shortDate(snapshotDate)} - ${cohorts.length} cohorts, ${cohorts.reduce((s, c) => s + c.atRiskCount, 0)} at-risk`,
        text: emailText,
        html: emailHtml,
        attachments: [{ filename: attachmentName, path: htmlPath }],
        headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': cohorts.reduce((s, c) => s + c.atRiskCount, 0) > 0 ? 'high' : 'normal' },
      });
      console.log(`[cohort-report] email sent: ${r.messageId}`);
      messageIds.push(r.messageId);
      recipientsSent.push(ALI_EMAIL, CC_EMAIL);
    }

    console.log('[cohort-report] done');
  } catch (e) {
    runStatus = 'failure';
    runError = e.message;
    console.error('[cohort-report] FATAL:', e.stack || e.message);
    await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent, error: runError });
    process.exit(1);
  }
  await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent });
})();
