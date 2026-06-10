#!/usr/bin/env node
/* eslint-disable */
/**
 * dailyInterviewPrepNudges.js
 *
 * Student-facing interview-prep nudge engine. Mirrors the intern engine's safety
 * model (preview-vs-live mode, per-entity state, idempotency) but sends ONE
 * combined email per PERSON, not one per interview — the de-dup Ali asked for.
 *
 * Person de-dup (lib/interviewPrepPeople): the same human can hold several IPBC
 * accounts (one email -> multiple StudentUserIDs, verified in CCPP) and usually
 * has multiple active interviews. We group by canonical email, collect every
 * address they use, and send a single combined note to all of them, once.
 *
 * Communication de-dup with the report: in PREVIEW the engine sends NOTHING
 * (no student emails, no Ali digest) — the daily Interview Prep REPORT already
 * shows Ali the nudge plan, so a second preview email would duplicate it. The
 * engine only emails when LIVE: it sends students their combined nudge and then
 * sends Ali a one-line confirmation of what went out.
 *
 * MODE (default preview, fail-safe): tmp/ops-engine/interview-prep-nudge-mode.txt
 *
 * Run (on the VPS):
 *   node backend/src/scripts/dailyInterviewPrepNudges.js --dry   # plan only, write artifact, no sends, no state change
 *   node backend/src/scripts/dailyInterviewPrepNudges.js         # respects mode (preview = no-op; live = send + confirm)
 *   node backend/src/scripts/dailyInterviewPrepNudges.js --force # ignore the "already sent today" guard (live only)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { classify } = require('./lib/interviewPrepData');
const { buildCombined } = require('./lib/interviewPrepNudges');
const { resolveEmails, groupByPerson } = require('./lib/interviewPrepPeople');

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const argFix = process.argv.find((a) => a.startsWith('--fixture='));
const FIXTURE = argFix ? argFix.slice('--fixture='.length) : null;

const MODE_FILE = path.resolve(__dirname, '../../../tmp/ops-engine/interview-prep-nudge-mode.txt');
const STATE_FILE = path.resolve(__dirname, '../../../tmp/ops-engine/interview-prep-nudge-state.json');
const DIGEST_TO = ['ali@colaberry.com'];
const DIGEST_CC = ['alimuwwakkil@gmail.com'];

function readMode() {
  try { return fs.readFileSync(MODE_FILE, 'utf-8').trim().toLowerCase() === 'live' ? 'live' : 'preview'; }
  catch { return 'preview'; }
}
function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return {}; } }
function writeState(s) { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function todayCT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function loadRows() {
  if (FIXTURE) {
    const r = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), FIXTURE), 'utf-8'));
    return Array.isArray(r) ? r : (r.recordset || []);
  }
  const sql = require(path.resolve(__dirname, '../../../node_modules/mssql'));
  const cfg = {
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 120000,
  };
  await sql.connect(cfg);
  try { return (await sql.query(`SELECT * FROM vw_ColaberryInterviewPreparation_UpcomingInterviews ORDER BY NoofDays ASC`)).recordset; }
  finally { await sql.close(); }
}

function transport() {
  const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
}

// Build the per-person plan (used by both preview logging and live sending).
async function buildPlan() {
  const rows = await loadRows();
  const data = classify(rows, new Date());
  const active = data.rows.filter((r) => r.stage !== 'COMPLETE');
  const emailMap = await resolveEmails(active.map((r) => r.candidateId));
  const persons = groupByPerson(active, emailMap);
  const plan = [];
  for (const p of persons) {
    const combined = buildCombined(p);
    if (!combined) continue;
    plan.push({ person: p, combined });
  }
  return { plan, totalPersons: persons.length };
}

async function main() {
  const mode = readMode();
  const today = todayCT();
  console.log(`[InterviewPrepNudges] mode=${mode} dry=${DRY} force=${FORCE} fixture=${FIXTURE || '(live)'}`);
  const { plan } = await buildPlan();

  // de-dup summary
  const totalInterviews = plan.reduce((s, x) => s + x.combined.count, 0);
  console.log(`[InterviewPrepNudges] ${plan.length} person-email(s) cover ${totalInterviews} interview-beat(s) (combined to avoid duplicates)`);

  if (DRY) {
    const outDir = path.resolve(__dirname, '../../../docs/reports');
    fs.mkdirSync(outDir, { recursive: true });
    const p = path.join(outDir, `interview-prep-nudges-plan-${today}.html`);
    fs.writeFileSync(p, planHtml(mode, plan, today));
    console.log(`[InterviewPrepNudges] --dry: wrote plan ${p}; ${plan.length} person email(s) would ${mode === 'live' ? 'send' : 'be suppressed (preview)'}`);
    return;
  }

  if (mode !== 'live') {
    // PREVIEW: the daily report already shows Ali this plan. Sending anything
    // here would duplicate it, so the engine is a deliberate no-op in preview.
    console.log(`[InterviewPrepNudges] preview mode: no emails sent (report carries the plan). ${plan.length} person email(s) queued for when mode flips to live.`);
    return;
  }

  // LIVE: send each person ONE combined email to all their addresses, idempotently.
  const state = readState();
  const sent = [];
  for (const { person, combined } of plan) {
    const tos = person.emails.length ? person.emails : [];
    if (!tos.length) { console.warn(`[InterviewPrepNudges] no email for ${person.name}; skipped`); continue; }
    const prev = state[person.key];
    if (!FORCE && prev && prev.lastBeatSig === combined.beatSig && prev.lastDate === today) continue;
    await sendStudent(tos, combined);
    sent.push({ name: person.name, to: tos, beats: combined.beats, subject: combined.subject });
    state[person.key] = { lastBeatSig: combined.beatSig, lastDate: today, sentTo: tos, name: person.name };
  }
  writeState(state);
  if (sent.length) await sendConfirmation(sent, today);
  console.log(`[InterviewPrepNudges] LIVE: sent ${sent.length} combined person email(s)`);
}

async function sendStudent(tos, combined) {
  const html = combined.html.replace(/—/g, '-').replace(/–/g, '-');
  const text = combined.text.replace(/—/g, '-').replace(/–/g, '-');
  const r = await transport().sendMail({
    from: '"Colaberry IPBC" <ali@colaberry.com>', to: tos.join(', '), replyTo: 'ali@colaberry.com',
    subject: combined.subject.replace(/—/g, '-'), html, text, headers: { 'X-MC-Track': 'opens,clicks' },
  });
  console.log(`[InterviewPrepNudges] sent -> ${tos.join(', ')} [${combined.beats.join(',')}] (${r.messageId})`);
}

async function sendConfirmation(sent, today) {
  const rows = sent.map((s) => `<tr style="border-bottom:1px solid #e5e7eb;">
    <td style="padding:6px 9px;font-size:13px;"><b>${esc(s.name)}</b></td>
    <td style="padding:6px 9px;font-size:12px;">${esc(s.to.join(', '))}</td>
    <td style="padding:6px 9px;font-size:12px;text-align:center;">${esc(s.beats.join(', '))}</td>
    <td style="padding:6px 9px;font-size:12px;color:#374151;">${esc(s.subject)}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:760px;">
    <h2 style="color:#0f1729;">Interview Prep Nudges - LIVE: ${sent.length} student email(s) sent ${today}</h2>
    <p style="color:#6b7280;font-size:13px;">One combined email per student (de-duplicated across their interviews + accounts).</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-collapse:collapse;">
      <tr style="background:#f4f6fa;"><td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Student</td>
      <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Sent to</td>
      <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;text-align:center;">Beats</td>
      <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Subject</td></tr>${rows}</table></div>`.replace(/—/g, '-');
  const r = await transport().sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>', to: DIGEST_TO.join(', '), cc: DIGEST_CC.join(', '),
    subject: `[Interview Prep Nudges] LIVE - ${sent.length} student email(s) sent`,
    html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), headers: { 'X-MC-Track': 'none' },
  });
  console.log(`[InterviewPrepNudges] confirmation -> Ali (${r.messageId})`);
}

// preview artifact (dry only) — shows what WOULD go out, de-duplicated
function planHtml(mode, plan, today) {
  const rows = plan.map((x) => `<tr style="border-bottom:1px solid #e5e7eb;">
    <td style="padding:7px 9px;font-size:13px;"><b>${esc(x.person.name)}</b><br><span style="color:#6b7280;font-size:11px;">${x.combined.count} interview(s) combined into 1 email</span></td>
    <td style="padding:7px 9px;font-size:12px;">${x.person.emails.length ? esc(x.person.emails.join(', ')) : '<span style="color:#b91c1c;">unresolved (preview)</span>'}</td>
    <td style="padding:7px 9px;font-size:12px;text-align:center;">${esc(x.combined.beats.join(', '))}</td>
    <td style="padding:7px 9px;font-size:12px;color:#374151;">${esc(x.combined.subject)}</td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:780px;">
    <h2 style="color:#0f1729;">Interview Prep Nudge Plan (${mode.toUpperCase()}) - ${today}</h2>
    <p style="color:#6b7280;font-size:13px;">${plan.length} person email(s), de-duplicated: one combined message per student across all their interviews and accounts. ${mode === 'preview' ? 'PREVIEW: nothing is sent; the daily report shows Ali this plan.' : 'LIVE: each student receives their one combined email.'}</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-collapse:collapse;">
      <tr style="background:#f4f6fa;"><td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Student</td>
      <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Combined recipients</td>
      <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;text-align:center;">Beats</td>
      <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Subject</td></tr>${rows}</table></div>`;
}

main().catch((e) => { console.error('[InterviewPrepNudges] FATAL', e); process.exit(1); });
module.exports = { buildPlan };
