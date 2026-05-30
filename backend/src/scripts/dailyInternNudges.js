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

const BUCKET = parseInt(process.env.INTERN_REPORT_BUCKET || '24865175', 10);
const BC_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;
const H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };

const STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/intern-nudge-state.json');
const REPO_ROOT = path.resolve(__dirname, '../../..');

const DRY = process.argv.includes('--dry');
const NO_COMMENT = process.argv.includes('--no-comment');
const NO_EMAIL = process.argv.includes('--no-email');
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
  if (row.level === 'YELLOW') {
    const bc = `<div>${fn} The standard is 3 updates per day and your last activity was ${days} day${days === 1 ? '' : 's'} ago. Please add today's updates before end of day.</div>`;
    const text = `${fn},\n\nThe program standard is 3 updates per day on your project. Your last activity in Basecamp was ${days} day${days === 1 ? '' : 's'} ago and you have ${row.todayCount} update${row.todayCount === 1 ? '' : 's'} today.\n\nPlease add your remaining ${todayShortfall} update${todayShortfall === 1 ? '' : 's'} before end of day.\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;
    return {
      bcHtml: bc,
      emailSubject: `[Reminder] Your project needs 3 updates today (${row.todayCount}/${row.dailyTarget} so far)`,
      emailHtml: `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55"><div>${fn},</div><div><br></div><div>The program standard is <strong>3 updates per day</strong> on your project. Your last activity in Basecamp was <strong>${days} day${days === 1 ? '' : 's'} ago</strong> and you have ${row.todayCount} update${row.todayCount === 1 ? '' : 's'} today.</div><div><br></div><div>Please add your remaining ${todayShortfall} update${todayShortfall === 1 ? '' : 's'} before end of day.</div><div><br></div><div>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.</div></div>`,
      emailText: text,
    };
  }
  if (row.level === 'ORANGE') {
    const bc = `<div>${fn} You are at ${days} days without activity. Per the program standard (3 updates/day), this is putting your seat at risk. Please post an update today and reply with anything blocking you.</div>`;
    const text = `${fn},\n\nYou are at ${days} days without any Basecamp activity. The program standard is 3 updates per day on your project. At this point your seat is at risk.\n\nPlease post an update today. If something is blocking you, reply to this email and explain what you need.\n\nIf no activity by day 10 you will be processed out of the internship.\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;
    return {
      bcHtml: bc,
      emailSubject: `[Warning] ${days} days without activity - your internship spot is at risk`,
      emailHtml: `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55"><div>${fn},</div><div><br></div><div>You are at <strong>${days} days without any Basecamp activity</strong>. The program standard is 3 updates per day on your project. At this point your seat is at risk.</div><div><br></div><div>Please post an update today. If something is blocking you, reply to this email and explain what you need.</div><div><br></div><div><strong>If no activity by day 10 you will be processed out of the internship.</strong></div><div><br></div><div>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.</div></div>`,
      emailText: text,
    };
  }
  if (row.level === 'RED') {
    const bc = `<div>${fn} This is a formal warning. ${days} days without an update violates the program's 3 updates/day standard. At day 10 (${10 - days} day${10 - days === 1 ? '' : 's'} from now) you will be removed from the internship. Please reply today with either an update or a written reason.</div>`;
    const text = `${fn},\n\nThis is a formal warning. You are at ${days} days without any Basecamp activity, in violation of the program's 3 updates per day standard.\n\nAt day 10 (${10 - days} day${10 - days === 1 ? '' : 's'} from now) your seat will be processed out of the internship, with a "No Call No Show" reason recorded.\n\nPlease respond today with either:\n  1. An update posted to your Basecamp project, OR\n  2. A written reason for the gap (reply to this email).\n\nSilence will be treated as voluntary exit.\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;
    return {
      bcHtml: bc,
      emailSubject: `[FORMAL WARNING] ${days} days dark - day 10 removal in ${10 - days} day${10 - days === 1 ? '' : 's'}`,
      emailHtml: `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55"><div>${fn},</div><div><br></div><div><strong>This is a formal warning.</strong> You are at <strong>${days} days without any Basecamp activity</strong>, in violation of the program's 3 updates per day standard.</div><div><br></div><div>At day 10 (<strong>${10 - days} day${10 - days === 1 ? '' : 's'} from now</strong>) your seat will be processed out of the internship, with a "No Call No Show" reason recorded.</div><div><br></div><div>Please respond today with either:</div><ol><li>An update posted to your Basecamp project, OR</li><li>A written reason for the gap (reply to this email)</li></ol><div><strong>Silence will be treated as voluntary exit.</strong></div><div><br></div><div>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.</div></div>`,
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

async function sendEmail({ to, subject, html, text, replyTo, bypassNoEmail = false }) {
  if (DRY) return { messageId: 'dry' };
  if (NO_EMAIL && !bypassNoEmail) return { messageId: 'no-email-flag' };
  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  return await transport.sendMail({
    from: '"Colaberry CB System" <ali@colaberry.com>',
    to, replyTo: replyTo || 'ali@colaberry.com',
    subject, html, text,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
}

async function sendAliDigest(allSent) {
  // Send Ali a digest of what fired today, regardless of NO_EMAIL/NO_COMMENT
  // flags (those gate INTERN-facing comms; Ali still needs visibility).
  if (NO_ALI_DIGEST || DRY) return;
  const total = Object.values(allSent).reduce((s, arr) => s + arr.length, 0);
  if (total === 0) return; // nothing to report

  const previewMode = NO_EMAIL || NO_COMMENT;
  const modeBadge = previewMode
    ? '<div style="background:#fef3c7;border-left:4px solid #d97706;padding:10px 14px;margin-bottom:14px;color:#92400e;font-size:13px"><strong>PREVIEW MODE:</strong> No intern-facing emails or Basecamp comments were sent. This digest shows what WOULD have gone out under live mode. To enable live nudges, edit the crontab and remove the <code>--no-comment --no-email --force</code> flags from the dailyInternNudges line.</div>'
    : '<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:10px 14px;margin-bottom:14px;color:#166534;font-size:13px"><strong>LIVE MODE:</strong> CB System emailed and commented in Basecamp on every YELLOW+ intern below.</div>';

  const renderSection = (label, list, accent) => list.length === 0 ? '' : `
<h3 style="font-size:14px;color:${accent};border-bottom:1px solid ${accent};padding-bottom:6px;margin:18px 0 8px">${label} (${list.length})</h3>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px">
${list.map((r) => `<tr style="border-bottom:1px solid #e2e8f0"><td style="vertical-align:top;width:240px"><strong>${r.name}</strong><br><span style="color:#94a3b8">${r.email || 'no email'}</span></td><td style="vertical-align:top">${r.daysSinceLast} days dark<br>${r.projects.length} project${r.projects.length === 1 ? '' : 's'}: ${r.projects.map((p) => p.title).join(', ').slice(0, 100)}</td></tr>`).join('')}
</table>`;

  const html = `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55;max-width:720px">
${modeBadge}
<div style="font-size:16px;font-weight:700;color:#1a365d">Intern Nudge Cycle - ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
<div style="color:#64748b">${total} interns ${previewMode ? 'would have been' : 'were'} nudged today.</div>
${renderSection('BLACK - day 10+ exit cliff', allSent.BLACK, '#0c0a09')}
${renderSection('RED - 7-9 days dark, final warning', allSent.RED, '#991b1b')}
${renderSection('ORANGE - 4-6 days dark, warning', allSent.ORANGE, '#9a3412')}
${renderSection('YELLOW - 1-3 days dark, gentle reminder', allSent.YELLOW, '#854d0e')}
${allSent.BLACK.length > 0 ? `<div style="margin-top:24px;padding:14px;background:#1c1917;color:white;border-radius:6px"><div style="font-weight:700;margin-bottom:8px">PROCESS THESE OUT TODAY (${allSent.BLACK.length}):</div><ol style="margin:0;padding-left:18px;font-family:monospace;font-size:12px;line-height:1.8">${allSent.BLACK.map((r) => `<li>${r.name}: tag <code style="background:#374151;padding:2px 4px">@CB exit intern ${r.name} reason=nochow</code> in any Basecamp thread for the InternID + CLI</li>`).join('')}</ol></div>` : ''}
</div>`;

  const text = `Intern Nudge Cycle - ${new Date().toLocaleDateString()}\n${previewMode ? '[PREVIEW MODE - no intern-facing comms sent]' : '[LIVE MODE]'}\nTotal: ${total} interns ${previewMode ? 'would have been' : 'were'} nudged.\n\nBLACK (${allSent.BLACK.length}):\n${allSent.BLACK.map((r) => `  ${r.name} - ${r.daysSinceLast} days dark - ${r.email || 'no email'}`).join('\n')}\n\nRED (${allSent.RED.length}):\n${allSent.RED.map((r) => `  ${r.name} - ${r.daysSinceLast} days - ${r.email || 'no email'}`).join('\n')}\n\nORANGE (${allSent.ORANGE.length}):\n${allSent.ORANGE.map((r) => `  ${r.name} - ${r.daysSinceLast} days`).join('\n')}\n\nYELLOW (${allSent.YELLOW.length}):\n${allSent.YELLOW.map((r) => `  ${r.name} - ${r.daysSinceLast} days`).join('\n')}\n`;
  try {
    await sendEmail({
      to: 'ali@colaberry.com',
      subject: `[Intern Nudges]${previewMode ? ' [PREVIEW]' : ''} ${allSent.BLACK.length} BLACK, ${allSent.RED.length} RED, ${allSent.ORANGE.length} ORANGE, ${allSent.YELLOW.length} YELLOW`,
      html, text,
      bypassNoEmail: true,
    });
    console.log('[intern-nudges] Ali digest sent');
  } catch (e) {
    console.error('[intern-nudges] Ali digest failed:', e.message);
  }
}

(async () => {
  console.log(`[intern-nudges] start ${new Date().toISOString()}, dry=${DRY}, force=${FORCE}`);
  const state = loadState();
  const today = todayKey();

  const rows = await buildInternActivity({ lookbackDays: 14, includeCompleted: false });
  console.log(`[intern-nudges] tracked ${rows.length} interns`);

  const needNudge = rows.filter((r) => ['YELLOW', 'ORANGE', 'RED', 'BLACK'].includes(r.level));
  console.log(`[intern-nudges] candidates: ${needNudge.length}`);

  const sent = { YELLOW: [], ORANGE: [], RED: [], BLACK: [] };
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
    // Basecamp comment (public trail). Email only if we have one.
    try {
      if (!NO_COMMENT) {
        const bcResult = await postBcComment(r, nudge.bcHtml);
        console.log(`  ${r.level} ${r.name}: BC posted on ${bcResult.filter((b) => b.ok).length}/${bcResult.length} todos`);
      }
    } catch (e) {
      console.error(`  ${r.level} ${r.name}: BC post failed: ${e.message}`);
    }
    if (r.email && !NO_EMAIL) {
      try {
        const er = await sendEmail({ to: r.email, subject: nudge.emailSubject, html: nudge.emailHtml, text: nudge.emailText });
        console.log(`  ${r.level} ${r.name}: emailed (${er.messageId})`);
      } catch (e) {
        console.error(`  ${r.level} ${r.name}: email failed: ${e.message}`);
      }
    }
    sent[r.level].push(r);
    state[r.internId] = {
      last_nudge_date: today,
      last_level: r.level,
      total_nudges: (prev?.total_nudges || 0) + 1,
      consecutive_dark_at_nudge: r.daysSinceLast,
    };
  }

  saveState(state);

  // Ali digest of all nudges fired today (or would have fired in preview mode)
  await sendAliDigest(sent);

  console.log(`[intern-nudges] done. sent=Y${sent.YELLOW.length}/O${sent.ORANGE.length}/R${sent.RED.length}/B${sent.BLACK.length}, skipped=${skipped.length}`);
  if (skipped.length) for (const s of skipped) console.log(`  skip: ${s.name} - ${s.reason}`);
})().catch(e => { console.error('[intern-nudges] FATAL:', e.stack || e.message); process.exit(1); });
