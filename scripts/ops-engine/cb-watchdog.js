#!/usr/bin/env node
// CB WATCHDOG - daily health check for the @CB dispatcher pipeline.
// Runs once a day (cron). Computes 24hr metrics, runs the coverage audit,
// detects anomalies, emails Ali a status report.
//
// GREEN: everything healthy, ticks running on schedule, mentions caught, no errors.
// YELLOW: minor issues (slow ticks, low mention rate vs trend, one error).
// RED: dispatcher unhealthy (tick gaps, repeated errors, coverage failures).
//
// Usage:
//   node scripts/ops-engine/cb-watchdog.js          - run + email
//   node scripts/ops-engine/cb-watchdog.js --dry    - run + print, don't email

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const REPO = path.resolve(__dirname, '../..');
const LOG_PATH = '/var/log/cb-inbound.log';
const STATE_PATH = path.resolve(REPO, 'tmp/ops-engine/inbound-state.json');
const DRY = process.argv.includes('--dry');

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-Watchdog', Accept: 'application/json' };

const EXPECTED_TICKS_PER_DAY = 480; // cron every 3 min
const ANOMALY_THRESHOLDS = {
  tickCountMinOk: 400,     // <400 ticks/day = warn
  tickCountMinCritical: 200, // <200 ticks/day = critical
  maxGapMinutes: 30,        // any gap >30min in tick schedule = warn
};

function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

// =============================================================================
// LOG PARSER - 24hr tick stats from /var/log/cb-inbound.log
// =============================================================================

function parseLog24hr() {
  let raw;
  try { raw = fs.readFileSync(LOG_PATH, 'utf8'); }
  catch (e) { return { error: `log unreadable: ${e.message}` }; }
  const cutoffMs = Date.now() - 24 * 3600 * 1000;
  const lines = raw.split('\n');
  const ticks = [];
  const errors = [];
  const mentions = [];
  let currentTick = null;
  for (const line of lines) {
    const tickM = line.match(/^tick (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z)/);
    if (tickM) {
      const ts = new Date(tickM[1]).getTime();
      if (ts >= cutoffMs) {
        currentTick = { ts, ts_iso: tickM[1], projectsScanned: null, mentionsFound: 0, errors: [] };
        ticks.push(currentTick);
      } else {
        currentTick = null;
      }
      continue;
    }
    if (!currentTick) continue;
    const scanM = line.match(/scanning (\d+) projects/);
    if (scanM) currentTick.projectsScanned = parseInt(scanM[1], 10);
    const menM = line.match(/(\d+) new @CB mentions/);
    if (menM) currentTick.mentionsFound = parseInt(menM[1], 10);
    const llmM = line.match(/llm handler for (\d+): invocation=\S+ tools=([^\s]+)/);
    if (llmM) mentions.push({ ts: currentTick.ts_iso, commentId: llmM[1], tools: llmM[2] });
    if (/FAIL|FATAL|error|Error/.test(line) && !line.includes('falling back')) errors.push({ ts: currentTick.ts_iso, line: line.trim() });
  }

  // Compute gaps between consecutive ticks
  ticks.sort((a, b) => a.ts - b.ts);
  const gaps = [];
  for (let i = 1; i < ticks.length; i++) {
    const gapMin = (ticks[i].ts - ticks[i - 1].ts) / 60000;
    if (gapMin > ANOMALY_THRESHOLDS.maxGapMinutes) {
      gaps.push({ from: ticks[i - 1].ts_iso, to: ticks[i].ts_iso, minutes: Math.round(gapMin) });
    }
  }

  const projectsScannedSamples = ticks.map((t) => t.projectsScanned).filter((n) => n != null);
  const maxScanned = projectsScannedSamples.length ? Math.max(...projectsScannedSamples) : null;
  const minScanned = projectsScannedSamples.length ? Math.min(...projectsScannedSamples) : null;

  return {
    tickCount: ticks.length,
    mentionsFound: ticks.reduce((s, t) => s + t.mentionsFound, 0),
    llmInvocations: mentions.length,
    recentMentions: mentions.slice(-5),
    errors: errors.slice(-10),
    errorCount: errors.length,
    gaps,
    projectsScannedRange: maxScanned == null ? null : { min: minScanned, max: maxScanned },
  };
}

// =============================================================================
// COVERAGE AUDIT - all active projects enumerable
// =============================================================================

async function bcGetAll(p) {
  let next = `https://3.basecampapi.com/3945211${p}`;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    next = lh ? lh[1] : null;
  }
  return out;
}

async function coverageAudit() {
  try {
    const projects = await bcGetAll('/projects.json');
    const active = projects.filter((p) => !p.status || p.status === 'active');
    return { ok: true, activeCount: active.length, sampleNames: active.slice(0, 8).map((p) => p.name) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// =============================================================================
// STATE FILE METRICS - how many mentions processed total, recent activity
// =============================================================================

function stateMetrics() {
  let s;
  try { s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch (e) { return { error: e.message }; }
  const processed = s.processed || {};
  const entries = Object.entries(processed);
  const recentEntries = entries.filter(([_k, v]) => v.at && (Date.now() - new Date(v.at).getTime()) < 24 * 3600 * 1000);
  const buckets = new Set(entries.map(([k]) => k.split('-')[0]));
  return {
    totalProcessed: entries.length,
    last24hr: recentEntries.length,
    distinctBuckets: buckets.size,
    lastTick: s.last_tick,
  };
}

// =============================================================================
// STATUS DETERMINATION
// =============================================================================

function determineStatus(log, audit, state) {
  const flags = [];
  if (log.error) flags.push({ level: 'red', msg: `Log parse error: ${log.error}` });
  if (!audit.ok) flags.push({ level: 'red', msg: `Coverage audit failed: ${audit.error}` });
  if (audit.ok && audit.activeCount === 0) flags.push({ level: 'red', msg: 'Zero active projects discovered' });
  if (log.tickCount != null && log.tickCount < ANOMALY_THRESHOLDS.tickCountMinCritical) flags.push({ level: 'red', msg: `Only ${log.tickCount} ticks in 24hr (expected ~${EXPECTED_TICKS_PER_DAY})` });
  else if (log.tickCount != null && log.tickCount < ANOMALY_THRESHOLDS.tickCountMinOk) flags.push({ level: 'yellow', msg: `Only ${log.tickCount} ticks in 24hr (expected ~${EXPECTED_TICKS_PER_DAY})` });
  if (log.gaps && log.gaps.length) flags.push({ level: 'yellow', msg: `${log.gaps.length} schedule gap(s) >${ANOMALY_THRESHOLDS.maxGapMinutes}min` });
  if (log.errorCount > 5) flags.push({ level: 'yellow', msg: `${log.errorCount} error lines in log` });
  else if (log.errorCount > 20) flags.push({ level: 'red', msg: `${log.errorCount} error lines in log` });
  if (log.projectsScannedRange && log.projectsScannedRange.max < 20) flags.push({ level: 'yellow', msg: `Max projects scanned per tick = ${log.projectsScannedRange.max} (expected 40+)` });

  const hasRed = flags.some((f) => f.level === 'red');
  const hasYellow = flags.some((f) => f.level === 'yellow');
  const overall = hasRed ? 'RED' : hasYellow ? 'YELLOW' : 'GREEN';
  return { overall, flags };
}

// =============================================================================
// EMAIL
// =============================================================================

async function sendEmail({ overall, log, audit, state, status }) {
  if (DRY) { console.log('[dry] would send email - overall status', overall); return; }
  const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
  if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY not set'); return; }

  const statusColor = overall === 'GREEN' ? '#16a34a' : overall === 'YELLOW' ? '#f59e0b' : '#dc2626';
  const statusBg = overall === 'GREEN' ? '#dcfce7' : overall === 'YELLOW' ? '#fef3c7' : '#fee2e2';
  const tickHealth = log.tickCount == null ? 'unknown' : `${log.tickCount} / ${EXPECTED_TICKS_PER_DAY} expected (${Math.round(log.tickCount / EXPECTED_TICKS_PER_DAY * 100)}%)`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 30px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">CB dispatcher watchdog</div>
<div style="font-size:22px;font-weight:700;margin-top:4px">Daily health check &middot; ${new Date().toISOString().slice(0, 10)}</div>
<div style="display:inline-block;margin-top:14px;background:${statusBg};color:${statusColor};padding:8px 16px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px">STATUS: ${overall}</div>
</div>

${status.flags.length === 0 ? '' : `
<div style="padding:18px 30px;background:${statusBg};border-bottom:1px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${statusColor};font-weight:700">Anomalies (${status.flags.length})</div>
<ul style="margin:8px 0 0;font-size:13px;color:#0f172a">
${status.flags.map((f) => `<li style="margin-bottom:4px"><strong style="color:${f.level === 'red' ? '#7f1d1d' : '#78350f'};text-transform:uppercase">${f.level}:</strong> ${escape(f.msg)}</li>`).join('')}
</ul>
</div>`}

<div style="padding:24px 30px;border-bottom:1px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">24hr metrics</div>
<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:12px;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0">
<tr style="background:#f8fafc"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;width:40%">Tick health</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${tickHealth}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">@CB mentions caught</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${log.mentionsFound || 0}</td></tr>
<tr style="background:#f8fafc"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">LLM handler invocations</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${log.llmInvocations || 0}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Projects scanned per tick</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${log.projectsScannedRange ? `${log.projectsScannedRange.min} - ${log.projectsScannedRange.max}` : 'unknown'}</td></tr>
<tr style="background:#f8fafc"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Error lines in log</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:${log.errorCount > 0 ? '#dc2626' : '#16a34a'};font-weight:600">${log.errorCount || 0}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Schedule gaps &gt;${ANOMALY_THRESHOLDS.maxGapMinutes}min</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:${log.gaps && log.gaps.length > 0 ? '#dc2626' : '#16a34a'};font-weight:600">${log.gaps ? log.gaps.length : 0}</td></tr>
</table>
</div>

<div style="padding:24px 30px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">Project enumeration coverage</div>
<div style="font-size:14px;margin-top:8px;color:#0f172a">${audit.ok ? `Discovered <strong>${audit.activeCount}</strong> active Basecamp projects via /projects.json. All will be scanned each dispatcher tick.` : `<strong style="color:#dc2626">Coverage audit FAILED:</strong> ${escape(audit.error)}`}</div>
${audit.ok && audit.sampleNames ? `<div style="margin-top:10px;font-size:12px;color:#475569">Sample: ${audit.sampleNames.map((n) => escape(n)).join(' &middot; ')}${audit.activeCount > audit.sampleNames.length ? ` &middot; +${audit.activeCount - audit.sampleNames.length} more` : ''}</div>` : ''}
</div>

<div style="padding:24px 30px;border-bottom:1px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">State file (lifetime)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:12px;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0">
${state.error ? `<tr><td style="padding:10px 14px;color:#dc2626">${escape(state.error)}</td></tr>` : `
<tr style="background:#f8fafc"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;width:40%">Total mentions processed (lifetime)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${state.totalProcessed}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Mentions processed in last 24hr</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${state.last24hr}</td></tr>
<tr style="background:#f8fafc"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Distinct buckets touched (lifetime)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${state.distinctBuckets}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Last tick recorded</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">${escape(state.lastTick || 'unknown')}</td></tr>`}
</table>
</div>

${log.recentMentions && log.recentMentions.length ? `
<div style="padding:24px 30px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">Recent activity (last ${log.recentMentions.length} LLM invocations)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:10px;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0">
<thead><tr style="background:#1a365d;color:white"><th style="padding:8px 12px;text-align:left">Timestamp</th><th style="padding:8px 12px;text-align:left">Comment ID</th><th style="padding:8px 12px;text-align:left">Tools used</th></tr></thead>
<tbody>${log.recentMentions.map((m) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">${escape(m.ts)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">${escape(m.commentId)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">${escape(m.tools)}</td></tr>`).join('')}</tbody>
</table>
</div>` : ''}

${log.errors && log.errors.length ? `
<div style="padding:24px 30px;border-bottom:1px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#dc2626;font-weight:700">Recent error lines (last ${log.errors.length})</div>
<div style="margin-top:10px;background:#fef2f2;border:1px solid #fee2e2;border-radius:4px;padding:10px 12px;font-family:monospace;font-size:11px;color:#7f1d1d;white-space:pre-wrap">${log.errors.map((e) => `[${escape(e.ts)}] ${escape(e.line)}`).join('\n')}</div>
</div>` : ''}

<div style="padding:24px 30px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Diagnostics on demand</div>
<div style="font-size:14px;margin-top:6px">If a specific @CB went silent, run on the VPS: <code style="background:#1f2937;color:#fbbf24;padding:3px 8px;border-radius:3px;font-size:11px">node scripts/ops-engine/cb-coverage-check.js &lt;basecamp-url&gt;</code></div>
<div style="font-size:13px;color:#cbd5e0;margin-top:8px">Runs 12 deterministic checks (project enumeration, dock structure, lookback windows, comment pagination, allowed-requester, mention regex). Reports the failing check by number so you know exactly what to fix.</div>
</div>

</div></body></html>`;

  const text = strip(`CB Watchdog - Daily health check - ${new Date().toISOString().slice(0, 10)} - STATUS: ${overall}

24hr metrics:
- Ticks: ${log.tickCount || '?'} / ${EXPECTED_TICKS_PER_DAY} expected
- Mentions caught: ${log.mentionsFound || 0}
- LLM invocations: ${log.llmInvocations || 0}
- Projects scanned per tick: ${log.projectsScannedRange ? `${log.projectsScannedRange.min}-${log.projectsScannedRange.max}` : '?'}
- Error lines: ${log.errorCount || 0}
- Schedule gaps >30min: ${log.gaps ? log.gaps.length : 0}

Coverage audit: ${audit.ok ? `${audit.activeCount} active projects discovered` : `FAILED: ${audit.error}`}

State file: ${state.error ? state.error : `${state.totalProcessed} lifetime mentions, ${state.last24hr} in last 24hr, ${state.distinctBuckets} distinct buckets, last tick ${state.lastTick || '?'}`}

Anomalies: ${status.flags.length === 0 ? 'none' : status.flags.map((f) => `[${f.level.toUpperCase()}] ${f.msg}`).join(' | ')}

For a specific @CB silent issue:
  node scripts/ops-engine/cb-coverage-check.js <basecamp-url>`);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"CB Watchdog" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    subject: `[CB Watchdog] ${overall} - ${log.mentionsFound || 0} mentions / ${log.tickCount || 0} ticks / ${audit.ok ? audit.activeCount : '?'} projects`,
    text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('[watchdog] sent:', r.messageId);
}

// =============================================================================
// MAIN
// =============================================================================

(async () => {
  console.log(`[watchdog] starting ${new Date().toISOString()} (dry=${DRY})`);
  const log = parseLog24hr();
  const audit = await coverageAudit();
  const state = stateMetrics();
  const status = determineStatus(log, audit, state);
  console.log('[watchdog] status:', status.overall, 'flags:', status.flags.length);
  await sendEmail({ overall: status.overall, log, audit, state, status });
  console.log('[watchdog] done.');
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
