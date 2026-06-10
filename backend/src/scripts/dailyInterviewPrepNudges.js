#!/usr/bin/env node
/* eslint-disable */
/**
 * dailyInterviewPrepNudges.js
 *
 * Student-facing interview-prep nudge engine. Mirrors the intern nudge engine's
 * safety model (preview-vs-live mode switch, per-entity state, idempotency, an
 * always-on digest to Ali) but for IPBC logged interviews.
 *
 * What it does each run:
 *   1. Pull active interviews from CCPP (vw_ColaberryInterviewPreparation_UpcomingInterviews)
 *   2. Classify each (lib/interviewPrepData) and pick today's nudge beat (lib/interviewPrepNudges)
 *   3. Resolve the student email (CandidateID -> vw_SyncIPBCUsers.email)
 *   4. PREVIEW (default): send NOTHING to students; email Ali a digest of what WOULD fire
 *      LIVE: email each student their beat, then email Ali the same digest marked LIVE
 *   5. Record per-interview state so a given beat is sent at most once
 *
 * MODE (default preview, fail-safe):
 *   tmp/ops-engine/interview-prep-nudge-mode.txt  -> 'preview' | 'live'
 *   Flip from Basecamp via @CB System (see the handler) or edit the file on the VPS.
 *
 * Idempotency: state keyed on LogInterviewID; we store last beat + date and skip
 * if the same beat already fired today. A new beat fires only when the student
 * advances a funnel stage or the timeline crosses a threshold (day-of / +1 / overdue).
 *
 * Run (on the VPS):
 *   node backend/src/scripts/dailyInterviewPrepNudges.js --dry      # classify + digest preview, no sends at all
 *   node backend/src/scripts/dailyInterviewPrepNudges.js            # respects mode file (preview default)
 *   node backend/src/scripts/dailyInterviewPrepNudges.js --fixture=tmp/interview-prep/fixture-upcoming.json --dry
 *   node backend/src/scripts/dailyInterviewPrepNudges.js --force    # ignore "already sent today" guard
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { classify } = require('./lib/interviewPrepData');
const { build } = require('./lib/interviewPrepNudges');

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const argFix = process.argv.find((a) => a.startsWith('--fixture='));
const FIXTURE = argFix ? argFix.slice('--fixture='.length) : null;

const MODE_FILE = path.resolve(__dirname, '../../../tmp/ops-engine/interview-prep-nudge-mode.txt');
const STATE_FILE = path.resolve(__dirname, '../../../tmp/ops-engine/interview-prep-nudge-state.json');
const DIGEST_TO = ['ali@colaberry.com'];
const DIGEST_CC = ['alimuwwakkil@gmail.com'];

function readMode() {
  try {
    const m = fs.readFileSync(MODE_FILE, 'utf-8').trim().toLowerCase();
    return m === 'live' ? 'live' : 'preview';
  } catch { return 'preview'; }
}
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return {}; }
}
function writeState(s) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function todayCT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function loadRows() {
  if (FIXTURE) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), FIXTURE), 'utf-8'));
    return Array.isArray(raw) ? raw : (raw.recordset || []);
  }
  const sql = require(path.resolve(__dirname, '../../../node_modules/mssql'));
  const cfg = {
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 120000,
  };
  await sql.connect(cfg);
  try {
    return (await sql.query(`SELECT * FROM vw_ColaberryInterviewPreparation_UpcomingInterviews ORDER BY NoofDays ASC`)).recordset;
  } finally { await sql.close(); }
}

// CandidateID -> student email (verified CandidateID == vw_SyncIPBCUsers.StudentUserID)
async function resolveEmails(candidateIds) {
  const map = {};
  const ids = Array.from(new Set(candidateIds.filter((n) => n > 0)));
  if (!ids.length || FIXTURE) {
    // In fixture mode we can still resolve via the live directory if creds exist;
    // otherwise leave unresolved (preview digest will mark it).
    if (FIXTURE && !process.env.MSSQL_HOST) return map;
  }
  if (!ids.length) return map;
  const sql = require(path.resolve(__dirname, '../../../node_modules/mssql'));
  const cfg = {
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 60000,
  };
  await sql.connect(cfg);
  try {
    const q = `SELECT StudentUserID, email FROM vw_SyncIPBCUsers WHERE StudentUserID IN (${ids.join(',')})`;
    (await sql.query(q)).recordset.forEach((r) => { if (r.email) map[r.StudentUserID] = String(r.email).trim(); });
  } finally { await sql.close(); }
  return map;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function digestHtml(mode, fired, skipped, runAt) {
  const badge = mode === 'live'
    ? `<span style="background:#047857;color:#fff;font-weight:700;padding:3px 10px;border-radius:4px;">LIVE</span>`
    : `<span style="background:#b45309;color:#fff;font-weight:700;padding:3px 10px;border-radius:4px;">PREVIEW (no student emails sent)</span>`;
  const row = (f) => `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 9px;font-size:13px;"><b>${esc(f.student)}</b><br><span style="color:#6b7280;font-size:11px;">${esc(f.company)} &middot; ${esc(f.jobTitle)}</span></td>
      <td style="padding:7px 9px;font-size:12px;text-align:center;">${esc(f.beat)}</td>
      <td style="padding:7px 9px;font-size:12px;text-align:center;">${f.days < 0 ? Math.abs(f.days) + 'd ago' : f.days === 0 ? 'today' : 'in ' + f.days + 'd'}</td>
      <td style="padding:7px 9px;font-size:12px;">${f.email ? esc(f.email) : '<span style="color:#b91c1c;">unresolved</span>'}</td>
      <td style="padding:7px 9px;font-size:12px;color:#374151;">${esc(f.subject)}</td>
    </tr>`;
  const firedRows = fired.length ? fired.map(row).join('')
    : `<tr><td colspan="5" style="padding:10px;color:#6b7280;">No beats to fire today.</td></tr>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:760px;">
    <h2 style="color:#0f1729;">Interview Prep Nudges &mdash; ${mode === 'live' ? 'sent' : 'would send'} ${fired.length} ${badge}</h2>
    <p style="color:#6b7280;font-size:13px;">${runAt.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT. ${mode === 'preview' ? 'Mode is PREVIEW: nothing was emailed to students. To go live: @CB System set interview nudge mode live (or edit tmp/ops-engine/interview-prep-nudge-mode.txt).' : 'Mode is LIVE: the emails below were sent to students.'}</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-collapse:collapse;">
      <tr style="background:#f4f6fa;">
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Student / Target</td>
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;text-align:center;">Beat</td>
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;text-align:center;">Timing</td>
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Student email</td>
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:#6b7280;">Subject</td>
      </tr>
      ${firedRows}
    </table>
    <p style="color:#9ca3af;font-size:11px;margin-top:10px;">${skipped} interview(s) skipped (already nudged today, no beat due, or off-runway). Beats: kickoff, practice, book_mentor, final_polish, day_of, congrats_survey, survey_reminder.</p>
  </div>`;
}

async function main() {
  const mode = readMode();
  const runAt = new Date();
  const today = todayCT();
  console.log(`[InterviewPrepNudges] mode=${mode} dry=${DRY} force=${FORCE} fixture=${FIXTURE || '(live)'}`);

  const rows = await loadRows();
  const data = classify(rows, runAt);
  const state = readState();

  const candidates = data.rows.filter((r) => r.stage !== 'COMPLETE');
  const emailMap = await resolveEmails(candidates.map((r) => r.candidateId));

  const fired = [];
  let skipped = 0;

  for (const r of candidates) {
    const nudge = build(r);
    if (!nudge) { skipped++; continue; }
    const key = String(r.id);
    const prev = state[key];
    if (!FORCE && prev && prev.lastBeat === nudge.beat && prev.lastDate === today) { skipped++; continue; }

    const email = emailMap[r.candidateId] || '';
    const record = {
      student: r.student, company: r.company, jobTitle: r.jobTitle, days: r.days,
      beat: nudge.beat, subject: nudge.subject, email,
    };

    if (mode === 'live' && !DRY && email) {
      await sendStudent(email, nudge);
      record.sent = true;
    }
    fired.push(record);
    state[key] = { lastBeat: nudge.beat, lastDate: today, stage: r.stage, days: r.days, student: r.student, sent: !!record.sent };
  }

  // digest to Ali (always, even in preview / dry)
  const html = digestHtml(mode, fired, skipped, runAt).replace(/—/g, '-').replace(/–/g, '-');
  if (!DRY) {
    await sendDigest(html, mode, fired.length);
    writeState(state);
  } else {
    const outDir = path.resolve(__dirname, '../../../docs/reports');
    fs.mkdirSync(outDir, { recursive: true });
    const p = path.join(outDir, `interview-prep-nudges-digest-${today}.html`);
    fs.writeFileSync(p, html);
    console.log(`[InterviewPrepNudges] --dry: wrote digest ${p}; would fire ${fired.length}, skipped ${skipped}`);
  }
  console.log(`[InterviewPrepNudges] mode=${mode} fired=${fired.length} skipped=${skipped}`);
}

function transport() {
  const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
}
async function sendStudent(to, nudge) {
  const html = nudge.html.replace(/—/g, '-').replace(/–/g, '-');
  const text = nudge.text.replace(/—/g, '-').replace(/–/g, '-');
  const r = await transport().sendMail({
    from: '"Colaberry IPBC" <ali@colaberry.com>', to, replyTo: 'ali@colaberry.com',
    subject: nudge.subject.replace(/—/g, '-'), html, text,
    headers: { 'X-MC-Track': 'opens,clicks' },
  });
  console.log(`[InterviewPrepNudges] sent ${nudge.beat} -> ${to} (${r.messageId})`);
}
async function sendDigest(html, mode, n) {
  const r = await transport().sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>', to: DIGEST_TO.join(', '), cc: DIGEST_CC.join(', '),
    subject: `[Interview Prep Nudges] ${mode.toUpperCase()} - ${n} ${mode === 'live' ? 'sent' : 'queued'}`,
    html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    headers: { 'X-MC-Track': 'none' },
  });
  console.log(`[InterviewPrepNudges] digest -> Ali (${r.messageId})`);
}

main().catch((e) => { console.error('[InterviewPrepNudges] FATAL', e); process.exit(1); });
