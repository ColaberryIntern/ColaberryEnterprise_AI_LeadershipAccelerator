#!/usr/bin/env node
// Daily Intern Nudges (replaces Jackie's manual reminder routine).
//
// For every Basecamp intern at YELLOW or worse, posts a per-level reminder
// AS A COMMENT on their project todo (matching Jackie's pattern) AND emails
// them. Voice = CB System (signed). For BLACK level, ALSO emails Ali a
// consolidated digest of who hit the exit cliff today + the exact CLI
// commands to process them out.
//
// Flags:
//   --dry            do not post or email anything; print what would happen
//   --no-comment     skip Basecamp comments (email only)
//   --no-email       skip emails (Basecamp only)
//   --no-ali-digest  skip the day-end Ali summary
//   --force          ignore state file (re-nudge even if already nudged today)
//
// State: tmp/ops-engine/intern-nudge-state.json
//   {intern_id: {last_nudge_date: "YYYY-MM-DD", last_level: "RED", total_nudges: 7}}
//
// Schedule: Mon-Fri 22:00 UTC (= 5pm CT DST / 4pm CT standard).

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const { buildInternActivity } = require(path.resolve(__dirname, './lib/internActivityTracker'));
const { readMode } = require(path.resolve(__dirname, './lib/internNudgeMode'));
const { findInternByQuery } = require(path.resolve(__dirname, './lib/ccppInternRoster'));
const { executeExit } = require(path.resolve(__dirname, './lib/internExit'));
const recorder = require(path.resolve(__dirname, './lib/reportRunRecorder'));

// Auto-exit recipients per Ali 2026-06-01.
const ALI_BC_ID = 17454835;
const DHEE_BC_ID = 34920126;
const ALI_EMAIL = 'ali@colaberry.com';
const DHEE_EMAIL = 'dhee@colaberry.com';
const ALI_PERSONAL_BUCKET = 7463955;
const ALI_PERSONAL_AI_PRODUCTS_LIST = 9939449052;

const BUCKET = parseInt(process.env.INTERN_REPORT_BUCKET || '24865175', 10);
const BC_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;
const H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };

const STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/intern-nudge-state.json');
const REPO_ROOT = path.resolve(__dirname, '../../..');

const DRY = process.argv.includes('--dry');
// Mode file is the source of truth. CLI flags can ALSO suppress, but the file
// can only suppress (mode=preview always wins). This lets Ali flip live/preview
// via @CB without editing the crontab.
const NUDGE_MODE = readMode();
const PREVIEW_MODE = NUDGE_MODE === 'preview';
const NO_COMMENT = PREVIEW_MODE || process.argv.includes('--no-comment');
const NO_EMAIL = PREVIEW_MODE || process.argv.includes('--no-email');
const NO_ALI_DIGEST = process.argv.includes('--no-ali-digest');
const FORCE = process.argv.includes('--force');

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function todayKey() { return new Date().toISOString().slice(0, 10); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}
function saveState(s) {
  if (DRY) return;
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

async function bcPost(p, body) {
  if (DRY || NO_COMMENT) return { id: 'dry-or-no-comment' };
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// ---- Nudge content (mirrors Jackie's tone, escalates per level) ----

function firstName(name) { return (name || '').trim().split(' ')[0] || name; }

function nudgeFor(row) {
  // returns { bcHtml, emailSubject, emailHtml, emailText }
  const fn = firstName(row.name);
  const days = row.daysSinceLast;
  const projects = row.projects.map((p) => p.title).join(', ');
  const todayShortfall = Math.max(0, row.dailyTarget - row.todayCount);
  // New-intern welcome variant — they're inside the 30-day grace period
  // (see GRACE_PERIOD_DAYS in lib/internActivityTracker.js). Use a non-punitive
  // tone, no "days dark" framing (their daysSinceLast is usually null), no email.
  if (row.isNewIntern) {
    const sinceLine = row.daysSinceJoined != null
      ? `You started ${row.daysSinceJoined} day${row.daysSinceJoined === 1 ? '' : 's'} ago. `
      : '';
    const bc = `<div>${fn} Welcome aboard. ${sinceLine}When you are ready, post your first Basecamp update on your project. The program standard is 3 substantive updates per week - looking forward to seeing your first one.</div>`;
    return {
      bcHtml: bc,
      // Welcome nudges never email — the gentle BC comment is enough during onboarding.
      emailSubject: null,
      emailHtml: null,
      emailText: null,
    };
  }
  if (row.level === 'YELLOW') {
    const bc = `<div>${fn} You have gone ${days} day${days === 1 ? '' : 's'} without Basecamp activity. The program standard is 3 substantive updates per week. Please post today to stay on pace.</div>`;
    const text = `${fn},\n\nYou have gone ${days} day${days === 1 ? '' : 's'} without Basecamp activity. The program standard is 3 substantive updates per week on your project. Please post today to stay on pace.\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;
    return {
      bcHtml: bc,
      emailSubject: `[Reminder] ${days} day${days === 1 ? '' : 's'} without Basecamp activity - stay on the 3/week pace`,
      emailHtml: `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55"><div>${fn},</div><div><br></div><div>You have gone <strong>${days} day${days === 1 ? '' : 's'} without Basecamp activity</strong>. The program standard is <strong>3 substantive updates per week</strong> on your project. Please post today to stay on pace.</div><div><br></div><div>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.</div></div>`,
      emailText: text,
    };
  }
  if (row.level === 'ORANGE') {
    const bc = `<div>${fn} You are at ${days} days without activity. Per the program standard (3 updates per week), this is putting your seat at risk. Please post an update today and reply with anything blocking you.</div>`;
    const text = `${fn},\n\nYou are at ${days} days without any Basecamp activity. The program standard is 3 substantive updates per week on your project. At this point your seat is at risk.\n\nPlease post an update today. If something is blocking you, reply to this email and explain what you need.\n\nIf no activity by day 10 you will be processed out of the internship.\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;
    return {
      bcHtml: bc,
      emailSubject: `[Warning] ${days} days without activity - your internship spot is at risk`,
      emailHtml: `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55"><div>${fn},</div><div><br></div><div>You are at <strong>${days} days without any Basecamp activity</strong>. The program standard is <strong>3 substantive updates per week</strong> on your project. At this point your seat is at risk.</div><div><br></div><div>Please post an update today. If something is blocking you, reply to this email and explain what you need.</div><div><br></div><div><strong>If no activity by day 10 you will be processed out of the internship.</strong></div><div><br></div><div>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.</div></div>`,
      emailText: text,
    };
  }
  if (row.level === 'RED') {
    const bc = `<div>${fn} This is a formal warning. ${days} days without an update violates the program's 3-updates-per-week standard. At day 10 (${10 - days} day${10 - days === 1 ? '' : 's'} from now) you will be removed from the internship. Please reply today with either an update or a written reason.</div>`;
    const text = `${fn},\n\nThis is a formal warning. You are at ${days} days without any Basecamp activity, in violation of the program's 3-updates-per-week standard.\n\nAt day 10 (${10 - days} day${10 - days === 1 ? '' : 's'} from now) your seat will be processed out of the internship, with a "No Call No Show" reason recorded.\n\nPlease respond today with either:\n  1. An update posted to your Basecamp project, OR\n  2. A written reason for the gap (reply to this email).\n\nSilence will be treated as voluntary exit.\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;
    return {
      bcHtml: bc,
      emailSubject: `[FORMAL WARNING] ${days} days dark - day 10 removal in ${10 - days} day${10 - days === 1 ? '' : 's'}`,
      emailHtml: `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55"><div>${fn},</div><div><br></div><div><strong>This is a formal warning.</strong> You are at <strong>${days} days without any Basecamp activity</strong>, in violation of the program's 3-updates-per-week standard.</div><div><br></div><div>At day 10 (<strong>${10 - days} day${10 - days === 1 ? '' : 's'} from now</strong>) your seat will be processed out of the internship, with a "No Call No Show" reason recorded.</div><div><br></div><div>Please respond today with either:</div><ol><li>An update posted to your Basecamp project, OR</li><li>A written reason for the gap (reply to this email)</li></ol><div><strong>Silence will be treated as voluntary exit.</strong></div><div><br></div><div>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.</div></div>`,
      emailText: text,
    };
  }
  // BLACK
  const bc = `<div>${fn} You hit ${days} days without any activity, past the program's day-10 cliff. Your seat is being processed out today, reason "No Call No Show". If you want to contest this, reply with a written explanation within 24 hours.</div>`;
  const text = `${fn},\n\nYou hit ${days} days without any Basecamp activity, past the program's day-10 cliff.\n\nYour seat in the Colaberry internship program is being processed out today. The reason recorded will be: "No Call No Show".\n\nIf you want to contest this, reply to this email within 24 hours with a written explanation.\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;
  return {
    bcHtml: bc,
    emailSubject: `[EXIT NOTICE] Your Colaberry internship is being processed out (${days} days dark)`,
    emailHtml: `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55"><div>${fn},</div><div><br></div><div>You hit <strong>${days} days without any Basecamp activity</strong>, past the program's day-10 cliff.</div><div><br></div><div>Your seat in the Colaberry internship program is being processed out today. The reason recorded will be: <strong>"No Call No Show"</strong>.</div><div><br></div><div>If you want to contest this, reply to this email within <strong>24 hours</strong> with a written explanation.</div><div><br></div><div>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.</div></div>`,
    emailText: text,
  };
}

async function postBcComment(row, html) {
  // Post to each of their assigned todos (so the public trail is visible
  // wherever the intern works).
  const results = [];
  for (const p of row.projects.slice(0, 3)) { // cap at 3 to avoid spam
    try {
      const r = await bcPost(`/recordings/${p.todoId}/comments.json`, { content: html });
      results.push({ todoId: p.todoId, ok: true, commentId: r.id });
    } catch (e) {
      results.push({ todoId: p.todoId, ok: false, error: e.message });
    }
  }
  return results;
}

async function sendEmail({ to, cc, bcc, subject, html, text, replyTo, bypassNoEmail = false }) {
  if (DRY) return { messageId: 'dry' };
  if (NO_EMAIL && !bypassNoEmail) return { messageId: 'no-email-flag' };
  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  return await transport.sendMail({
    from: '"Colaberry CB System" <ali@colaberry.com>',
    to, cc, bcc, replyTo: replyTo || 'ali@colaberry.com',
    subject, html, text,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
}

function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// --- Auto-exit at BLACK: helpers --------------------------------------------

function buildNudgeHistoryHtml(stateEntry) {
  if (!stateEntry || !Array.isArray(stateEntry.events) || stateEntry.events.length === 0) {
    return '<p style="color:#64748b;font-style:italic">(No event log entries - this intern was nudged before the audit log was added 2026-06-01. The system has been sending you the standard escalation sequence at YELLOW/ORANGE/RED/BLACK over the past 14 days.)</p>';
  }
  const rows = stateEntry.events.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:8px 10px;font-family:monospace;font-size:12px">${escape(e.date)}</td>
      <td style="padding:8px 10px;font-weight:700;color:${
        e.level === 'BLACK' ? '#0c0a09' : e.level === 'RED' ? '#991b1b' :
        e.level === 'ORANGE' ? '#9a3412' : e.level === 'YELLOW' ? '#854d0e' : '#475569'
      }">${escape(e.level)}</td>
      <td style="padding:8px 10px;font-size:12px;color:#475569">${e.daysSinceLast == null ? '?' : e.daysSinceLast} days dark</td>
      <td style="padding:8px 10px;font-size:12px;color:#475569">${e.emailSent ? '&#x2713; email' : ''}${e.bcCommentCount ? ` &middot; ${e.bcCommentCount} BC comment${e.bcCommentCount === 1 ? '' : 's'}` : ''}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;margin-top:8px">
    <thead><tr style="background:#1a365d;color:white">
      <th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">DATE</th>
      <th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">LEVEL</th>
      <th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">DAYS DARK</th>
      <th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">ACTION</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function reinstatementProtocolHtml(internName, ccppInternId) {
  return `
<h3 style="color:#1a365d;margin-top:24px;border-bottom:2px solid #1a365d;padding-bottom:6px">Reinstatement protocol</h3>
<p>If you believe this removal was wrong, OR if you want to be considered for reinstatement, you must email Ali directly within <strong>72 hours</strong> using the exact format below. This protocol exists so Ali can evaluate the request quickly and consistently.</p>

<div style="background:#f8fafc;border:1px solid #cbd5e0;padding:14px 18px;border-radius:6px;margin-top:10px;font-family:monospace;font-size:12px;line-height:1.55;white-space:pre-wrap">To: ali@colaberry.com
Subject: Reinstatement Request - ${escape(internName)} - InternID ${ccppInternId || 'unknown'}

Hi Ali,

1) Why the inactivity occurred
[One paragraph honest explanation of what happened during the 10+ days you were absent from Basecamp.]

2) What has changed so this will not recur
[One paragraph concrete description of what is different now.]

3) Commitment going forward
I commit to posting at least 3 substantive updates per week on my Basecamp project, starting [DATE].
If I miss a week, I will email you proactively that week explaining the reason.

4) Acknowledgment
I understand that a second exit will be final and I will not be eligible for further reinstatement.

[Your full name]
[Today's date]</div>

<p style="margin-top:14px"><strong>What happens next:</strong></p>
<ul>
<li>Ali receives your reinstatement request and reviews the four sections above.</li>
<li>If approved: your CCPP record is reactivated and you are re-assigned to your project todos in Basecamp within 1 business day.</li>
<li>If denied: you receive an email confirming the decision and the file is closed.</li>
<li>If you do not email Ali in the prescribed format within 72 hours, the exit is final and the file is closed automatically.</li>
</ul>`;
}

function buildExitEmailContent(internRow, ccppRecord, stateEntry) {
  const fn = firstName(internRow.name);
  const daysDark = internRow.daysSinceLast;
  const today = new Date().toISOString().slice(0, 10);
  const subject = `[Internship Exit] Your Colaberry internship has been processed out - reinstatement protocol inside`;
  const historyHtml = buildNudgeHistoryHtml(stateEntry);
  const reinstateHtml = reinstatementProtocolHtml(internRow.name, ccppRecord?.InternID);

  const html = `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55;max-width:720px;margin:0 auto;padding:24px">
<div style="background:#1c1917;color:white;padding:18px 22px;border-radius:6px;margin-bottom:18px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Colaberry Internship - Exit Notice</div>
<div style="font-size:18px;font-weight:700;margin-top:4px">${escape(internRow.name)}</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">Date: ${today} &middot; Reason: No Call No Show</div>
</div>

<p>${escape(fn)},</p>

<p>Your seat in the Colaberry internship program has been processed out today. The reason recorded in our system is <strong>"No Call No Show"</strong>.</p>

<p><strong>Why this happened:</strong> The program standard is 3 substantive Basecamp updates per week on your project. You went <strong>${daysDark} days</strong> without any activity. The program has a hard day-10 exit cliff. You passed it.</p>

<h3 style="color:#1a365d;margin-top:24px;border-bottom:2px solid #1a365d;padding-bottom:6px">Full nudge history</h3>
<p>For full transparency, here is every nudge you received from CB System on this issue before today:</p>
${historyHtml}

${reinstateHtml}

<p style="margin-top:28px;font-size:13px">Ali Muwwakkil<br><span style="color:#64748b;font-size:11px">Sent on behalf of Ali by CB System. Reply directly to ali@colaberry.com using the reinstatement format above.</span></p>
</div>`;

  const historyText = (stateEntry?.events || []).map((e) => `  ${e.date}  ${e.level}  ${e.daysSinceLast == null ? '?' : e.daysSinceLast}d dark${e.emailSent ? '  email sent' : ''}${e.bcCommentCount ? `  ${e.bcCommentCount} BC comments` : ''}`).join('\n') || '  (No event log entries - this intern was nudged before the audit log was added 2026-06-01.)';

  const text = stripEmDashes(`${fn},

Your seat in the Colaberry internship program has been processed out today. The reason recorded is "No Call No Show".

Why: The program standard is 3 substantive Basecamp updates per week. You went ${daysDark} days without any activity. The program has a hard day-10 exit cliff. You passed it.

Full nudge history:
${historyText}

REINSTATEMENT PROTOCOL
Email ali@colaberry.com within 72 hours using the exact subject and structure below:

  Subject: Reinstatement Request - ${internRow.name} - InternID ${ccppRecord?.InternID || 'unknown'}

  Hi Ali,

  1) Why the inactivity occurred
     [One paragraph honest explanation.]

  2) What has changed so this will not recur
     [One paragraph concrete description.]

  3) Commitment going forward
     I commit to 3 substantive updates per week on my Basecamp project, starting [DATE].
     If I miss a week, I will email you proactively that week explaining the reason.

  4) Acknowledgment
     I understand that a second exit will be final and I will not be eligible for further reinstatement.

  [Your full name]
  [Today's date]

What happens next:
- Ali reviews the four sections above
- If approved: CCPP record reactivated, you are re-assigned to project todos within 1 business day
- If denied: you receive a confirmation email and the file is closed
- If no email arrives within 72 hours: the exit is final and the file is closed automatically

Ali Muwwakkil
Sent on behalf of Ali by CB System.`);

  return { subject, html, text };
}

async function notifyAliDheeOfExit(internRow, ccppRecord, exitResult, exitMessageId) {
  if (DRY) return null;
  const today = new Date().toISOString().slice(0, 10);
  const bcUnassignCount = (exitResult.basecampUnassignments || []).length;
  const description = `<div><strong>Intern removed by auto-nudge (BLACK tier exit):</strong> ${escape(internRow.name)} (CCPP InternID ${ccppRecord.InternID})</div>
<div style="margin-top:10px"><strong>Reason recorded:</strong> No Call No Show (${internRow.daysSinceLast} days dark)</div>
<div style="margin-top:4px"><strong>CCPP write:</strong> InternIsActive 1 -&gt; 0, end date ${today}, reason ID 2</div>
<div style="margin-top:4px"><strong>Basecamp un-assignments:</strong> ${bcUnassignCount} todo${bcUnassignCount === 1 ? '' : 's'}</div>
<div style="margin-top:4px"><strong>Exit email sent to:</strong> ${escape(internRow.email || 'no email on file')}</div>
<div style="margin-top:4px"><strong>BCC on exit email:</strong> ali@colaberry.com, dhee@colaberry.com</div>
<div style="margin-top:4px"><strong>Mandrill message id:</strong> <code>${escape(exitMessageId || 'n/a')}</code></div>
<div style="margin-top:12px;font-size:13px;color:#475569">Reinstatement protocol was included in the exit email. The intern has 72 hours to email Ali in the prescribed format. If no email arrives, the exit is final.</div>
<div style="margin-top:6px;font-size:11px;color:#94a3b8">Logged by dailyInternNudges.js auto-exit branch.</div>`;

  try {
    const r = await fetch(`https://3.basecampapi.com/3945211/buckets/${ALI_PERSONAL_BUCKET}/todolists/${ALI_PERSONAL_AI_PRODUCTS_LIST}/todos.json`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        content: `[Intern Removed ${today}] ${internRow.name} - auto-exit NCNS, ${internRow.daysSinceLast}d dark`,
        description,
        assignee_ids: [ALI_BC_ID, DHEE_BC_ID],
      }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return await r.json();
  } catch (e) {
    console.error('  notifyAliDheeOfExit failed:', e.message);
    return null;
  }
}

async function sendAliDigest(allSent) {
  // Send Ali a digest of what fired today, regardless of NO_EMAIL/NO_COMMENT
  // flags (those gate INTERN-facing comms; Ali still needs visibility).
  if (NO_ALI_DIGEST || DRY) return;
  // Count only actually-nudged buckets toward `total` — UNKNOWN isn't a nudge,
  // it's a "tracker can't measure them" flag.
  const NUDGED_BUCKETS = ['NEW', 'YELLOW', 'ORANGE', 'RED', 'BLACK'];
  const total = NUDGED_BUCKETS.reduce((s, k) => s + ((allSent[k] || []).length), 0);
  if (total === 0 && (allSent.UNKNOWN || []).length === 0) return; // nothing to report

  const previewMode = PREVIEW_MODE;
  const black = allSent.BLACK.length;
  const red = allSent.RED.length;
  const orange = allSent.ORANGE.length;
  const yellow = allSent.YELLOW.length;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Personal opener — every report leads with "Ali," and a 1-2 sentence exec
  // summary so it doesn't read as boilerplate (spam filters + skim-reading both
  // get a clear signal that this is FOR Ali).
  const previewHeadline = previewMode
    ? `today's nudge cycle is in <strong>PREVIEW</strong> mode, so nothing went out to interns. If it had been live, ${total} people would have been emailed and commented on in Basecamp.`
    : `today's nudge cycle ran in <strong>LIVE</strong> mode. ${total} interns were emailed and commented on in Basecamp.`;
  const blackCallout = black > 0
    ? `<strong>${black} ${black === 1 ? 'person hit' : 'people hit'} the day-10 exit cliff.</strong> ${previewMode ? 'They would have received an exit notice.' : 'They received the exit notice.'} You should process them out today.`
    : `No-one hit the day-10 exit cliff today.`;
  const personalOpener = `<div style="background:#1a365d;color:white;padding:18px 22px;border-radius:6px;margin-bottom:18px">
<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700">${today} - For Ali</div>
<div style="font-size:16px;margin-top:8px;line-height:1.55">Ali, ${previewHeadline} ${blackCallout}</div>
</div>`;

  // Interaction syntax block — exactly what Ali can type, from where.
  const interactionBlock = `<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:18px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:200px;color:#475569"><strong>${previewMode ? 'Enable live nudges' : 'Pause nudges'}</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System set intern nudge mode ${previewMode ? 'live' : 'preview'}</code> in any Basecamp thread. Next 5pm CT run will ${previewMode ? 'fire for real' : 'go back to preview'}.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Preview an exit</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System exit intern &lt;name&gt; reason=nochow</code>. CB will reply with the CCPP InternID + the exact CLI command.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Process exits (BLACK)</strong></td><td style="padding:6px 0;vertical-align:top">For each BLACK person: tag @CB above to get the InternID, then run <code style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:3px;font-size:11px">node backend/src/scripts/confirmInternExit.js --intern-id N --reason nochow --confirmed-by ali</code> on the VPS.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in a Basecamp thread. CB will read the thread context and act.</td></tr>
</table>
</div>`;

  const modeBadge = previewMode
    ? `<div style="background:#fef3c7;border-left:4px solid #d97706;padding:10px 14px;margin-bottom:14px;color:#92400e;font-size:13px"><strong>PREVIEW MODE - no intern-facing comms went out.</strong> The mode is read from <code>tmp/ops-engine/intern-nudge-mode.txt</code>. To flip to live, see the "What you can do" box below.</div>`
    : `<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:10px 14px;margin-bottom:14px;color:#166534;font-size:13px"><strong>LIVE MODE - intern emails and BC comments fired for everyone below.</strong></div>`;

  const renderActionAudit = (r) => {
    const parts = [];
    if (r.bcCommentCount > 0) parts.push(`<span style="color:#16a34a">&#x2713; ${r.bcCommentCount} BC comment${r.bcCommentCount === 1 ? '' : 's'}</span>`);
    if (r.emailMessageId && r.emailMessageId !== 'dry' && r.emailMessageId !== 'no-email-flag') parts.push(`<span style="color:#16a34a">&#x2713; email sent</span>`);
    if (r.autoExit?.executed) parts.push(`<span style="color:#dc2626;font-weight:700">&#x2713; AUTO-EXITED (CCPP ${r.autoExit.ccppInternId}, ${r.autoExit.bcUnassignedCount} BC un-assigns)</span>`);
    if (r.autoExit && !r.autoExit.executed) parts.push(`<span style="color:#dc2626">&#x26A0; auto-exit failed: ${r.autoExit.error}</span>`);
    if (parts.length === 0) parts.push(`<span style="color:#94a3b8">no actions (preview or no email)</span>`);
    return parts.join(' &middot; ');
  };

  const renderSection = (label, list, accent) => list.length === 0 ? '' : `
<h3 style="font-size:14px;color:${accent};border-bottom:1px solid ${accent};padding-bottom:6px;margin:18px 0 8px">${label} (${list.length})</h3>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px">
${list.map((r) => `<tr style="border-bottom:1px solid #e2e8f0"><td style="vertical-align:top;width:240px"><strong>${escape(r.name)}</strong><br><span style="color:#94a3b8">${escape(r.email || 'no email')}</span></td><td style="vertical-align:top">${r.daysSinceLast} days dark<br>${r.projects.length} project${r.projects.length === 1 ? '' : 's'}: ${escape(r.projects.map((p) => p.title).join(', ').slice(0, 100))}<div style="margin-top:6px;font-size:11px">${renderActionAudit(r)}</div></td></tr>`).join('')}
</table>`;

  const exitedToday = allSent.BLACK.filter((r) => r.autoExit?.executed);
  const exitedTodayHtml = exitedToday.length === 0 ? '' : `
<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px 20px;margin-top:14px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700">&#x26A0; AUTO-EXITED TODAY (${exitedToday.length})</div>
<div style="font-size:13px;color:#7f1d1d;margin-top:6px">Per the 2026-06-01 policy, BLACK-tier interns (10+ days dark) are now auto-exited as part of the nudge cycle. The following ${exitedToday.length === 1 ? 'person was' : 'people were'} processed out today. Each got the exit email with their nudge history + reinstatement protocol (BCC ali + dhee). A tracking todo was created in Ali Personal assigned to Ali + Dhee.</div>
<table cellpadding="6" cellspacing="0" style="margin-top:10px;width:100%;font-size:12px;border-collapse:collapse">
${exitedToday.map((r) => `<tr style="border-bottom:1px solid #fecaca">
<td style="padding:8px 10px;vertical-align:top;width:240px"><strong>${escape(r.name)}</strong><br><span style="color:#7f1d1d">${escape(r.email || 'no email')}</span></td>
<td style="padding:8px 10px;vertical-align:top">CCPP InternID <strong>${r.autoExit.ccppInternId}</strong> &middot; ${r.daysSinceLast}d dark &middot; ${r.autoExit.bcUnassignedCount} BC un-assigns<br><span style="font-size:11px;color:#475569">${r.autoExit.notifyTodoUrl ? `<a href="${r.autoExit.notifyTodoUrl}" style="color:#7f1d1d">Open removal todo &rarr;</a>` : 'notify-todo create failed'}</span></td>
</tr>`).join('')}
</table>
</div>`;

  const newSectionLabel = 'NEW - grace period (< 30 days since first assignment)';
  const unknownList = allSent.UNKNOWN || [];
  const unknownSectionHtml = unknownList.length === 0 ? '' : `
<h3 style="font-size:14px;color:#6b7280;border-bottom:1px solid #6b7280;padding-bottom:6px;margin:18px 0 8px">UNKNOWN - tracker could not measure activity (${unknownList.length})</h3>
<div style="font-size:12px;color:#475569;margin-bottom:8px">These interns are assigned to BC todos in the program but have <strong>zero comments under their BC account</strong> in the 14d lookback. The tracker skipped them (no nudge sent). They may be active off-Basecamp (meetings, Google Docs) or commenting under a different account — worth a manual check before assuming they're inactive.</div>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px">
${unknownList.map((r) => `<tr style="border-bottom:1px solid #e2e8f0"><td style="vertical-align:top;width:240px"><strong>${escape(r.name)}</strong><br><span style="color:#94a3b8">${escape(r.email || 'no email')}</span></td><td style="vertical-align:top">BC ${r.internId} &middot; ${r.projects.length} project${r.projects.length === 1 ? '' : 's'}: ${escape(r.projects.map((p) => p.title).join(', ').slice(0, 100))}</td></tr>`).join('')}
</table>`;
  const html = `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55;max-width:720px">
${personalOpener}
${modeBadge}
${exitedTodayHtml}
${renderSection('BLACK - day 10+ exit cliff', allSent.BLACK, '#0c0a09')}
${renderSection('RED - 7-9 days dark, final warning', allSent.RED, '#991b1b')}
${renderSection('ORANGE - 4-6 days dark, warning', allSent.ORANGE, '#9a3412')}
${renderSection('YELLOW - 1-3 days dark, gentle reminder', allSent.YELLOW, '#854d0e')}
${renderSection(newSectionLabel, allSent.NEW || [], '#0369a1')}
${unknownSectionHtml}
${interactionBlock}
</div>`;

  const blackTextLine = black > 0
    ? `${black} ${black === 1 ? 'person' : 'people'} hit the day-10 exit cliff today. ${previewMode ? 'They would have received exit notices.' : 'They received exit notices.'} Process them out today.`
    : 'No-one hit the day-10 exit cliff today.';
  const newList = allSent.NEW || [];
  const text = `Ali, ${previewMode ? `today's nudge cycle is in PREVIEW mode (nothing went out). ${total} interns would have been emailed and BC-commented.` : `today's nudge cycle ran LIVE. ${total} interns were emailed and BC-commented.`} ${blackTextLine}\n\n${previewMode ? '[PREVIEW MODE - no intern-facing comms sent]\n' : '[LIVE MODE]\n'}\nBLACK (${allSent.BLACK.length}):\n${allSent.BLACK.map((r) => `  ${r.name} - ${r.daysSinceLast} days dark - ${r.email || 'no email'}`).join('\n')}\n\nRED (${allSent.RED.length}):\n${allSent.RED.map((r) => `  ${r.name} - ${r.daysSinceLast} days - ${r.email || 'no email'}`).join('\n')}\n\nORANGE (${allSent.ORANGE.length}):\n${allSent.ORANGE.map((r) => `  ${r.name} - ${r.daysSinceLast} days`).join('\n')}\n\nYELLOW (${allSent.YELLOW.length}):\n${allSent.YELLOW.map((r) => `  ${r.name} - ${r.daysSinceLast} days`).join('\n')}\n\nNEW - grace period (${newList.length}):\n${newList.map((r) => `  ${r.name} - ${r.daysSinceJoined == null ? '?' : r.daysSinceJoined}d since first assignment - welcome nudge only`).join('\n')}\n\n--- What you can do from here ---\n${previewMode ? 'Enable live nudges:' : 'Pause nudges:'}       tag @CB System set intern nudge mode ${previewMode ? 'live' : 'preview'}\nPreview an exit:           tag @CB System exit intern <name> reason=nochow\nProcess a BLACK exit:      run on VPS: node backend/src/scripts/confirmInternExit.js --intern-id N --reason nochow --confirmed-by ali\nAsk CB anything:           tag @CB System <anything>\n`;
  try {
    await sendEmail({
      to: 'ali@colaberry.com',
      cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com', DHEE_EMAIL],
      subject: `[Intern Nudges]${previewMode ? ' [PREVIEW]' : ''} ${allSent.BLACK.length} BLACK${exitedToday.length ? ` (${exitedToday.length} auto-exited)` : ''}, ${allSent.RED.length} RED, ${allSent.ORANGE.length} ORANGE, ${allSent.YELLOW.length} YELLOW, ${(allSent.NEW || []).length} NEW`,
      html: stripEmDashes(html),
      text: stripEmDashes(text),
      bypassNoEmail: true,
    });
    console.log('[intern-nudges] Ali digest sent');
  } catch (e) {
    console.error('[intern-nudges] Ali digest failed:', e.message);
  }
}

(async () => {
  console.log(`[intern-nudges] start ${new Date().toISOString()}, dry=${DRY}, mode=${NUDGE_MODE}, force=${FORCE}`);
  const runRecord = await recorder.start('Daily Intern Nudges (Preview Mode)');
  const messageIds = [];
  const recipientsSent = [];
  let runStatus = 'success';
  let runError = null;
  try {
  const state = loadState();
  const today = todayKey();

  const rows = await buildInternActivity({ lookbackDays: 14, includeCompleted: false });
  console.log(`[intern-nudges] tracked ${rows.length} interns`);

  // UNKNOWN = tracker could not measure activity (lastActivityAt is null). Skip
  // entirely — no email, no BC comment, no exit. Log a digest line so Ali knows
  // who fell through. Prevents the Isaac/Harpreet/Kalkidan/Sarbjit false-BLACK
  // pattern where a person with off-Basecamp activity gets exit-noticed.
  const unknown = rows.filter((r) => r.level === 'UNKNOWN');
  if (unknown.length) {
    console.log(`[intern-nudges] UNKNOWN (no measurable activity, skipped): ${unknown.length}`);
    for (const u of unknown) console.log(`  skip-unknown: ${u.name} (${u.email || 'no email'}) BC ${u.internId}`);
  }
  const needNudge = rows.filter((r) => ['YELLOW', 'ORANGE', 'RED', 'BLACK'].includes(r.level));
  console.log(`[intern-nudges] candidates: ${needNudge.length}`);

  // NEW = grace-period interns whose level was capped at YELLOW; tracked
  // separately from regular YELLOW so the Ali digest can show "this person
  // is brand new" rather than "this person is 1-3 days dark".
  const sent = { NEW: [], YELLOW: [], ORANGE: [], RED: [], BLACK: [] };
  const skipped = [];

  for (const r of needNudge) {
    const prev = state[r.internId];
    if (!FORCE && prev && prev.last_nudge_date === today) {
      skipped.push({ name: r.name, reason: `already nudged today at ${prev.last_level}` });
      continue;
    }
    if (!r.email) {
      skipped.push({ name: r.name, reason: 'no email on file (can only post BC comment)' });
    }
    const nudge = nudgeFor(r);
    // Track per-intern actions for this run, both for state.events and the Ali digest audit.
    let bcCommentCount = 0;
    let emailMessageId = null;
    let autoExit = null; // { executed, ccppInternId, exitMessageId, notifyTodoId, bcUnassignedCount, error? }

    // Basecamp comment (public trail). Email only if we have one.
    try {
      if (!NO_COMMENT) {
        const bcResult = await postBcComment(r, nudge.bcHtml);
        bcCommentCount = bcResult.filter((b) => b.ok).length;
        console.log(`  ${r.level} ${r.name}: BC posted on ${bcCommentCount}/${bcResult.length} todos`);
      }
    } catch (e) {
      console.error(`  ${r.level} ${r.name}: BC post failed: ${e.message}`);
    }
    // Tier-gated email escalation: only ORANGE / RED / BLACK send email.
    // YELLOW (and new-intern welcome) are BC-comment-only — the gentle nudge
    // stays in the public BC trail without pinging the intern's inbox. This
    // matches Ali's 2026-06-08 directive: "nudge tags should be tagged on
    // Basecamp - if it is more serious the messaging to email."
    const TIER_SENDS_EMAIL = { YELLOW: false, ORANGE: true, RED: true, BLACK: true };
    const shouldEmail = r.email && !NO_EMAIL && !r.isNewIntern && TIER_SENDS_EMAIL[r.level] && nudge.emailSubject;
    if (shouldEmail) {
      try {
        const er = await sendEmail({ to: r.email, subject: nudge.emailSubject, html: nudge.emailHtml, text: nudge.emailText });
        emailMessageId = er.messageId;
        console.log(`  ${r.level} ${r.name}: emailed (${er.messageId})`);
      } catch (e) {
        console.error(`  ${r.level} ${r.name}: email failed: ${e.message}`);
      }
    } else if (r.email && !NO_EMAIL && (r.isNewIntern || !TIER_SENDS_EMAIL[r.level])) {
      console.log(`  ${r.level} ${r.name}: skipping email (${r.isNewIntern ? 'new intern grace period' : 'tier is BC-only'})`);
    }

    // BLACK auto-exit per Ali 2026-06-01. Live mode only. Requires an email
    // to send the exit notice. CCPP lookup by name; falls back to email match
    // among the candidates. If the lookup ambiguates or fails, skip auto-exit
    // and log for manual cleanup - never auto-exit the wrong person.
    //
    // Belt-and-suspenders: never auto-exit a new intern even if their level
    // somehow reached BLACK. The level cap in internActivityTracker should
    // already prevent this, but the extra guard is cheap insurance against
    // a future tracker bug exiting someone in week 1.
    if (r.level === 'BLACK' && !PREVIEW_MODE && !DRY && r.email && !r.isNewIntern) {
      try {
        const candidates = await findInternByQuery(r.name);
        // SAFETY: only auto-exit on an exact email match between the Basecamp
        // intern row and the CCPP candidate. No email-match -> skip and log.
        // Picking candidates[0] without email confirmation is the kind of write
        // that exits the wrong person.
        let ccpp = null;
        if (Array.isArray(candidates) && candidates.length > 0 && r.email) {
          ccpp = candidates.find((c) => c.email && c.email.toLowerCase() === r.email.toLowerCase()) || null;
        }
        if (!ccpp || !ccpp.InternID) {
          console.error(`  BLACK ${r.name}: no CCPP candidate matched by email "${r.email}". Skipping auto-exit. Manual cleanup needed via confirmInternExit.js.`);
          autoExit = { executed: false, error: 'no-email-match-in-ccpp' };
        } else {
          console.log(`  BLACK ${r.name}: executing auto-exit (CCPP InternID ${ccpp.InternID})...`);
          const exitResult = await executeExit({ internId: ccpp.InternID, reasonKey: 'nochow', confirmedBy: 'auto-cb-nudge' });
          const stateEntry = state[r.internId]; // events history from prior runs
          const exitEmail = buildExitEmailContent(r, ccpp, stateEntry);
          const exitMsg = await sendEmail({
            to: r.email,
            bcc: [ALI_EMAIL, DHEE_EMAIL],
            subject: exitEmail.subject,
            html: exitEmail.html,
            text: exitEmail.text,
            bypassNoEmail: true,
          });
          const notifyTodo = await notifyAliDheeOfExit(r, ccpp, exitResult, exitMsg.messageId);
          autoExit = {
            executed: true,
            ccppInternId: ccpp.InternID,
            exitMessageId: exitMsg.messageId,
            notifyTodoId: notifyTodo?.id || null,
            notifyTodoUrl: notifyTodo?.app_url || null,
            bcUnassignedCount: (exitResult.basecampUnassignments || []).length,
          };
          console.log(`  BLACK ${r.name}: auto-exit complete. Message ${exitMsg.messageId}, notify todo ${notifyTodo?.id || 'fail'}, BC unassigns ${autoExit.bcUnassignedCount}`);
        }
      } catch (e) {
        console.error(`  BLACK ${r.name}: auto-exit FAILED: ${e.message}`);
        autoExit = { executed: false, error: e.message };
      }
    }

    const bucket = r.isNewIntern ? 'NEW' : r.level;
    sent[bucket].push({ ...r, bcCommentCount, emailMessageId, autoExit });
    const eventEntry = { date: today, level: r.level, daysSinceLast: r.daysSinceLast, emailSent: !!emailMessageId, emailMessageId, bcCommentCount, autoExit };
    state[r.internId] = {
      last_nudge_date: today,
      last_level: r.level,
      total_nudges: (prev?.total_nudges || 0) + 1,
      consecutive_dark_at_nudge: r.daysSinceLast,
      events: [...(prev?.events || []), eventEntry].slice(-50), // keep last 50 events per intern
    };
  }

  saveState(state);

  // Ali digest of all nudges fired today (or would have fired in preview mode)
  sent.UNKNOWN = unknown;
  await sendAliDigest(sent);

  console.log(`[intern-nudges] done. sent=Y${sent.YELLOW.length}/O${sent.ORANGE.length}/R${sent.RED.length}/B${sent.BLACK.length}, skipped=${skipped.length}`);
  if (skipped.length) for (const s of skipped) console.log(`  skip: ${s.name} - ${s.reason}`);
  recipientsSent.push('ali@colaberry.com');
  } catch (e) {
    runStatus = 'failure';
    runError = e.message;
    console.error('[intern-nudges] FATAL:', e.stack || e.message);
    await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent, error: runError });
    process.exit(1);
  }
  await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent });
})();
