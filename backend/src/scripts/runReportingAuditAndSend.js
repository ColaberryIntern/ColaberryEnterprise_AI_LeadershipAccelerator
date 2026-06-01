#!/usr/bin/env node
/**
 * Audit + send the full daily reporting suite.
 *
 * For each of the 6 daily reports:
 *   1. Run preflight checks (env, Mandrill auth, BC project, cron, recipients)
 *   2. If preflight passes -> execute the report's send script
 *   3. If preflight fails  -> skip the send + record the failure
 *
 * Then send Ali a consolidated AUDIT email summarizing every report's status,
 * recipients, and any errors/warnings.
 *
 * Cron: replace the individual per-report cron entries with one entry for
 *   this orchestrator. Runs Mon-Fri 8am CDT (13:00 UTC).
 *
 * Run: node backend/src/scripts/runReportingAuditAndSend.js
 *      Add --audit-only to skip the actual sends (audit-only smoke test).
 *      Add --skip-launch-pmo / --skip-gov / --skip-clients / --skip-anthropic
 *        to control which reports execute.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { auditAll } = require('./lib/reportingPreflight');
const { REPORTS: REGISTRY, shouldFireToday } = require('./lib/reportingRegistry');
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const AUDIT_ONLY = process.argv.includes('--audit-only');
const FORCE_ALL = process.argv.includes('--force-all'); // Ignore cadence; fire every report once
const REPO = path.resolve(__dirname, '../../..');

// ---------------- Report registry (LEGACY inline copy - now driven by lib/reportingRegistry.js) ----------------
// Kept here for reference; the active list is REGISTRY imported above.
const REPORTS_LEGACY_UNUSED = [
  {
    name: 'Launch PMO',
    scriptPath: 'backend/src/scripts/runLaunchPmoDailyUpdate.js',
    args: [],
    projectId: 47502609,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: 'tmp/launch-pmo-ai-runner-state.json',
    skipFlag: '--skip-launch-pmo',
  },
  {
    name: 'Gov Contracts',
    scriptPath: 'backend/src/scripts/dailyGovContractsAnalysis.js',
    args: [],
    projectId: 47346103,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: null,
    skipFlag: '--skip-gov',
  },
  {
    name: 'AI Pathway',
    scriptPath: 'backend/src/scripts/dailyClientProjectsReport.js',
    args: ['--only=AI Pathway'],
    projectId: 46697389,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: 'tmp/cb-ai-runner-state-46697389.json',
    skipFlag: '--skip-clients',
  },
  {
    name: 'ShipCES (Autonomous Brokerage)',
    scriptPath: 'backend/src/scripts/dailyClientProjectsReport.js',
    args: ['--only=ShipCES'],
    projectId: 47126345,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: 'tmp/cb-ai-runner-state-47126345.json',
    skipFlag: '--skip-clients',
  },
  {
    name: 'LandJet',
    scriptPath: 'backend/src/scripts/dailyClientProjectsReport.js',
    args: ['--only=LandJet'],
    projectId: 46699826,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: 'tmp/cb-ai-runner-state-46699826.json',
    skipFlag: '--skip-clients',
  },
  {
    name: 'Anthropic Partner Network',
    scriptPath: 'backend/src/scripts/dailyAnthropicPartnerCountdown.js',
    args: [],
    projectId: 47477101,
    needsOpenai: false,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: null,
    skipFlag: '--skip-anthropic',
  },
  {
    name: 'Intern Daily Nudges (BLACK/RED/ORANGE digest)',
    scriptPath: 'backend/src/scripts/dailyInternNudges.js',
    args: [],
    projectId: 24865175, // Internship / Apprenticeship Projects
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: null,
    skipFlag: '--skip-intern',
  },
  {
    name: 'Intern Weekly Report (last 10 days activity)',
    scriptPath: 'backend/src/scripts/weeklyInternReport.js',
    args: [],
    projectId: 24865175,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] },
    cbRunnerState: null,
    skipFlag: '--skip-intern',
    // Weekly cadence: only run on Mondays unless --force-intern-weekly passed
    onlyOnDayOfWeek: 1,
  },
];

// ---------------- Helpers ----------------
function statusBadge(status) {
  if (status === 'ok') return '<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534">PASS</span>';
  if (status === 'warn') return '<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:#fef3c7;color:#92400e">WARN</span>';
  return '<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:#fee2e2;color:#7f1d1d">FAIL</span>';
}

function checkBadge(status) {
  if (status === 'ok') return '<span style="color:#16a34a;font-weight:700">&#x2713;</span>';
  if (status === 'warn') return '<span style="color:#d97706;font-weight:700">!</span>';
  return '<span style="color:#dc2626;font-weight:700">&#x2717;</span>';
}

function htmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function runScript(reportName, scriptAbs, args) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('node', [scriptAbs, ...args], { env: process.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({ exitCode: code, stdout, stderr, durationMs: Date.now() - start });
    });
    child.on('error', (e) => resolve({ exitCode: -1, stdout, stderr: e.message, durationMs: Date.now() - start }));
  });
}

// ---------------- Render audit email ----------------
function renderAuditEmail(now, auditResults, sendResults) {
  const fmtDate = now.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const totalPass = auditResults.filter((r) => r.overall === 'ok').length;
  const totalWarn = auditResults.filter((r) => r.overall === 'warn').length;
  const totalFail = auditResults.filter((r) => r.overall === 'fail').length;
  const sentCount = sendResults.filter((s) => s?.exitCode === 0).length;

  const rows = auditResults.map((r, idx) => {
    const send = sendResults[idx];
    const sendStatus = send == null ? '<span style="color:#94a3b8">skipped (audit-only)</span>'
      : send.exitCode === 0 ? `<span style="color:#16a34a;font-weight:700">sent (${(send.durationMs / 1000).toFixed(1)}s)</span>`
      : send.exitCode === -2 ? '<span style="color:#94a3b8">skipped (preflight failed)</span>'
      : `<span style="color:#dc2626;font-weight:700">send fail exit=${send.exitCode}</span>`;
    const checksHtml = (r.checks || []).map((c) => `<div style="font-size:11px;color:#475569;margin:2px 0">${checkBadge(c.status)} <strong>${htmlEsc(c.name)}:</strong> ${htmlEsc(c.detail || '')}</div>`).join('');
    const recipientsHtml = `<strong>To:</strong> ${(r.recipients.to || []).join(', ') || '(none)'}<br><strong>CC:</strong> ${(r.recipients.cc || []).join(', ') || '(none)'}`;
    return `<tr style="background:${idx % 2 === 0 ? '#f8fafc' : 'white'}">
<td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top"><div style="font-weight:700;color:#1a365d;font-size:13px">${htmlEsc(r.name)}</div><div style="font-size:11px;color:#64748b;margin-top:2px">${htmlEsc(r.scriptPath)}</div>${r.projectName ? `<div style="font-size:11px;color:#64748b">Project: ${htmlEsc(r.projectName)} (${r.projectId})</div>` : ''}</td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top">${statusBadge(r.overall)}<br><br>${checksHtml}</td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px">${recipientsHtml}</td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px">${sendStatus}${send?.exitCode !== 0 && send?.stderr ? `<div style="font-size:10px;color:#7f1d1d;margin-top:4px;font-family:monospace">${htmlEsc(send.stderr).slice(0, 300)}</div>` : ''}</td>
</tr>`;
  }).join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc"><tr><td align="center">
<table width="900" cellpadding="0" cellspacing="0" style="max-width:900px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:24px 32px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Daily Reporting Audit</div>
<h1 style="margin:6px 0 8px;font-size:22px;font-weight:800;color:white">Reporting system health - ${htmlEsc(fmtDate)}</h1>
<div style="font-size:13px;color:#e2e8f0">${auditResults.length} reports audited &middot; ${totalPass} pass &middot; ${totalWarn} warn &middot; ${totalFail} fail &middot; ${sentCount} sent</div>
</td></tr>
<tr><td style="background:#1c1917;color:white;padding:18px 32px;font-size:14px;line-height:1.55">
${totalFail > 0
  ? `<strong style="color:#fca5a5">${totalFail} report${totalFail === 1 ? '' : 's'} failed preflight</strong> and were NOT sent. See per-report errors below.`
  : totalWarn > 0
    ? `All reports passed minimum checks. ${totalWarn} report${totalWarn === 1 ? ' has' : 's have'} non-blocking warnings (no cron, missing CB drafts yet, etc).`
    : '<strong style="color:#86efac">All reports passed all checks and were sent successfully.</strong>'}
${AUDIT_ONLY ? '<br><br><em>Audit-only run. Actual report sends were skipped.</em>' : ''}
</td></tr>
<tr><td style="padding:24px 32px">
<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Per-report status</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px;font-size:10px">REPORT</th><th align="left" style="padding:10px 12px;font-size:10px">CHECKS</th><th align="left" style="padding:10px 12px;font-size:10px">RECIPIENTS</th><th align="left" style="padding:10px 12px;font-size:10px">SEND</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2 style="color:#1a365d;font-size:17px;margin:24px 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Audit process (now part of the daily cycle)</h2>
<p style="font-size:13px;color:#1f2937;margin:0 0 8px"><strong>Every morning before sends:</strong></p>
<ol style="font-size:13px;color:#1f2937;margin:0 0 16px 18px;padding:0">
<li>This script runs as the master 8am CDT cron (Mon-Fri).</li>
<li>For each of the 6 reports it runs preflight: script exists, Mandrill auth works, OpenAI key set (where needed), Basecamp project accessible + todoset present, cron entry installed, recipient emails well-formed, CB runner state file readable.</li>
<li>If preflight passes, the actual report script is spawned and its output captured.</li>
<li>If preflight fails, the report is SKIPPED and the failure logged here.</li>
<li>This audit email is sent with per-report status + send results.</li>
</ol>
<p style="font-size:13px;color:#1f2937;margin:0 0 8px"><strong>Recipients on every regular report:</strong></p>
<ul style="font-size:13px;color:#1f2937;margin:0 0 16px 18px;padding:0">
<li>To: ali@colaberry.com</li>
<li>CC: alimuwwakkil@gmail.com (phone-accessible secondary) + ram@colaberry.com (Ram Katamaraja, CEO)</li>
</ul>
<p style="font-size:11px;color:#94a3b8;margin-top:18px">Generated by CB System Reporting Audit. Master cron 13:00 UTC Mon-Fri (8am CDT). Source: backend/src/scripts/runReportingAuditAndSend.js. To skip a category for one-off testing: pass --skip-launch-pmo / --skip-gov / --skip-clients / --skip-anthropic.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------------- Main ----------------
(async () => {
  const now = new Date();
  console.log(`[audit] start ${now.toISOString()}`);

  // Filter reports by:
  //   1. cadence (daily fires every weekday cron; weekly fires only on its dayOfWeek)
  //   2. skip flags (manual override)
  //   3. --force-all (ignore cadence)
  const active = REGISTRY
    .filter((r) => FORCE_ALL || shouldFireToday(r, now))
    .filter((r) => !process.argv.includes(r.skipFlag));
  const skippedForCadence = REGISTRY.filter((r) => !FORCE_ALL && !shouldFireToday(r, now));
  console.log(`[audit] active: ${active.map((r) => r.name).join(', ')}`);
  if (skippedForCadence.length) {
    console.log(`[audit] skipped (off-cadence today): ${skippedForCadence.map((r) => `${r.name} (${typeof r.cadence === 'object' ? `day=${r.cadence.dayOfWeek}` : r.cadence})`).join(', ')}`);
  }

  // 1. Preflight all
  const auditResults = await auditAll(active);
  console.log('[audit] preflight done:');
  for (const r of auditResults) console.log(`   ${r.name}: ${r.overall} (${r.errors.length} err, ${r.warnings.length} warn)`);

  // 2. Send reports (only if preflight passed for that report + not audit-only)
  const sendResults = [];
  for (let i = 0; i < active.length; i++) {
    const r = active[i];
    const a = auditResults[i];
    if (AUDIT_ONLY) { sendResults.push(null); continue; }
    if (a.overall === 'fail') { console.log(`[audit] skip ${r.name} - preflight failed`); sendResults.push({ exitCode: -2, stdout: '', stderr: 'preflight failed', durationMs: 0 }); continue; }
    console.log(`[audit] sending ${r.name}...`);
    const scriptAbs = path.resolve(REPO, r.scriptPath);
    const result = await runScript(r.name, scriptAbs, r.args || []);
    sendResults.push(result);
    console.log(`   exit=${result.exitCode} dur=${result.durationMs}ms`);
  }

  // 3. Render + send audit email
  const html = renderAuditEmail(now, auditResults, sendResults);
  const totalFail = auditResults.filter((r) => r.overall === 'fail').length;
  const totalWarn = auditResults.filter((r) => r.overall === 'warn').length;
  const sentCount = sendResults.filter((s) => s?.exitCode === 0).length;
  const subject = `[Reporting Audit] ${now.toISOString().slice(0, 10)} - ${totalFail ? `${totalFail} FAIL` : `${sentCount}/${active.length} sent`}${totalWarn ? ` (${totalWarn} warn)` : ''}`;
  const text = `Daily Reporting Audit ${now.toISOString().slice(0, 10)}

${active.length} reports audited.
PASS: ${auditResults.filter((r) => r.overall === 'ok').length}
WARN: ${totalWarn}
FAIL: ${totalFail}
SENT: ${sentCount}

Per-report:
${auditResults.map((r, i) => `- ${r.name}: ${r.overall}${sendResults[i] ? `, send exit=${sendResults[i].exitCode}` : ''}`).join('\n')}

Recipients on every regular report: ali@colaberry.com (to) + alimuwwakkil@gmail.com + ram@colaberry.com (cc).`;

  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const sentAudit = await transport.sendMail({
    from: '"CB System" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'],
    subject, text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log(`[audit] audit email sent: ${sentAudit.messageId}`);
  console.log(`[audit] summary: ${sentCount}/${active.length} reports sent, ${totalFail} preflight failures`);
})().catch((e) => { console.error('[audit] FATAL:', e.stack || e.message); process.exit(1); });
