#!/usr/bin/env node
// Render-preview of the new BLACK auto-exit flow. Generates 3 artifacts
// inline (no real BC writes, no real CCPP writes, no real intern email):
//   1. Sample EXIT EMAIL the intern would receive (Sample Intern <demo@>)
//   2. Sample DAILY ALI DIGEST with the AUTO-EXITED TODAY block populated
//   3. Sample BC NOTIFICATION TODO description (what Ali + Dhee see)
//
// All three are bundled into one HTML email to Ali so he can review the
// rendered output before flipping intern-nudge-mode back to live.
//
// One-off script. Not added to the reporting registry.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function firstName(name) { return (name || '').trim().split(' ')[0] || name; }

// ---------------------------------------------------------------------------
// Same helpers as dailyInternNudges.js (kept in sync for render fidelity)
// ---------------------------------------------------------------------------

function buildNudgeHistoryHtml(stateEntry) {
  if (!stateEntry || !Array.isArray(stateEntry.events) || stateEntry.events.length === 0) {
    return '<p style="color:#64748b;font-style:italic">(No event log entries.)</p>';
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
<p>If you believe this removal was wrong, OR if you want to be considered for reinstatement, you must email Ali directly within <strong>72 hours</strong> using the exact format below.</p>
<div style="background:#f8fafc;border:1px solid #cbd5e0;padding:14px 18px;border-radius:6px;margin-top:10px;font-family:monospace;font-size:12px;line-height:1.55;white-space:pre-wrap">To: ali@colaberry.com
Subject: Reinstatement Request - ${escape(internName)} - InternID ${ccppInternId || 'unknown'}

Hi Ali,

1) Why the inactivity occurred
[One paragraph honest explanation of what happened during the 10+ days you were absent from Basecamp.]

2) What has changed so this will not recur
[One paragraph concrete description of what is different now.]

3) Commitment going forward
I commit to posting at least 3 substantive updates per day on my Basecamp project, every weekday, starting [DATE].
If I miss a day, I will email you proactively that morning explaining the reason before end-of-day.

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
<p><strong>Why this happened:</strong> The program standard is 3 substantive Basecamp updates per day on your project. You went <strong>${daysDark} days</strong> without any activity. The program has a hard day-10 exit cliff. You passed it.</p>
<h3 style="color:#1a365d;margin-top:24px;border-bottom:2px solid #1a365d;padding-bottom:6px">Full nudge history</h3>
<p>For full transparency, here is every nudge you received from CB System on this issue before today:</p>
${historyHtml}
${reinstateHtml}
<p style="margin-top:28px;font-size:13px">Ali Muwwakkil<br><span style="color:#64748b;font-size:11px">Sent on behalf of Ali by CB System. Reply directly to ali@colaberry.com using the reinstatement format above.</span></p>
</div>`;
  return { subject, html };
}

// ---------------------------------------------------------------------------
// Fabricated sample data
// ---------------------------------------------------------------------------

const SAMPLE_INTERN = {
  internId: 99999999, // BC person ID (fake)
  name: 'Sample Intern',
  email: 'sample.intern@example.com',
  daysSinceLast: 11,
  projects: [
    { todoId: 9000000000, title: '[Project 1] Sample bootcamp project', url: 'https://app.basecamp.com/3945211/buckets/24865175/todos/9000000000' },
  ],
};
const SAMPLE_CCPP = { InternID: 4242 };
const SAMPLE_STATE_ENTRY = {
  last_nudge_date: '2026-06-01',
  last_level: 'BLACK',
  total_nudges: 5,
  events: [
    { date: '2026-05-22', level: 'YELLOW', daysSinceLast: 2, emailSent: true, bcCommentCount: 1 },
    { date: '2026-05-25', level: 'YELLOW', daysSinceLast: 3, emailSent: true, bcCommentCount: 1 },
    { date: '2026-05-27', level: 'ORANGE', daysSinceLast: 5, emailSent: true, bcCommentCount: 1 },
    { date: '2026-05-30', level: 'RED', daysSinceLast: 8, emailSent: true, bcCommentCount: 2 },
    { date: '2026-06-01', level: 'BLACK', daysSinceLast: 11, emailSent: true, bcCommentCount: 1 },
  ],
};

// Fabricate the "exit just happened" sample state for the digest render
const SAMPLE_DIGEST_ROW = {
  ...SAMPLE_INTERN,
  bcCommentCount: 1,
  emailMessageId: '<sample-message-id@colaberry.com>',
  autoExit: {
    executed: true,
    ccppInternId: SAMPLE_CCPP.InternID,
    exitMessageId: '<sample-exit-message-id@colaberry.com>',
    notifyTodoId: 9999999991,
    notifyTodoUrl: 'https://app.basecamp.com/3945211/buckets/7463955/todos/9999999991',
    bcUnassignedCount: 3,
  },
};

// Fabricate a couple of lower-tier rows so the digest doesn't look thin
const SAMPLE_RED_ROW = {
  internId: 88888888, name: 'Other Intern Red', email: 'red.intern@example.com',
  daysSinceLast: 7, projects: [{ todoId: 1, title: '[Project 2] Pipeline build', url: '#' }],
  bcCommentCount: 2, emailMessageId: '<sample@>', autoExit: null,
};
const SAMPLE_ORANGE_ROW = {
  internId: 77777777, name: 'Other Intern Orange', email: 'orange.intern@example.com',
  daysSinceLast: 5, projects: [{ todoId: 2, title: '[Project 1] Data quality', url: '#' }],
  bcCommentCount: 1, emailMessageId: '<sample@>', autoExit: null,
};
const SAMPLE_YELLOW_ROW = {
  internId: 66666666, name: 'Other Intern Yellow', email: 'yellow.intern@example.com',
  daysSinceLast: 2, projects: [{ todoId: 3, title: '[Project 3] ML model', url: '#' }],
  bcCommentCount: 1, emailMessageId: '<sample@>', autoExit: null,
};

// ---------------------------------------------------------------------------
// Render digest section + notify-todo HTML (same shape as production)
// ---------------------------------------------------------------------------

function renderActionAudit(r) {
  const parts = [];
  if (r.bcCommentCount > 0) parts.push(`<span style="color:#16a34a">&#x2713; ${r.bcCommentCount} BC comment${r.bcCommentCount === 1 ? '' : 's'}</span>`);
  if (r.emailMessageId && r.emailMessageId !== 'dry' && r.emailMessageId !== 'no-email-flag') parts.push(`<span style="color:#16a34a">&#x2713; email sent</span>`);
  if (r.autoExit?.executed) parts.push(`<span style="color:#dc2626;font-weight:700">&#x2713; AUTO-EXITED (CCPP ${r.autoExit.ccppInternId}, ${r.autoExit.bcUnassignedCount} BC un-assigns)</span>`);
  if (parts.length === 0) parts.push(`<span style="color:#94a3b8">no actions</span>`);
  return parts.join(' &middot; ');
}

function renderSection(label, list, accent) {
  if (list.length === 0) return '';
  return `
<h3 style="font-size:14px;color:${accent};border-bottom:1px solid ${accent};padding-bottom:6px;margin:18px 0 8px">${label} (${list.length})</h3>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px">
${list.map((r) => `<tr style="border-bottom:1px solid #e2e8f0"><td style="vertical-align:top;width:240px"><strong>${escape(r.name)}</strong><br><span style="color:#94a3b8">${escape(r.email || 'no email')}</span></td><td style="vertical-align:top">${r.daysSinceLast} days dark<br>${r.projects.length} project${r.projects.length === 1 ? '' : 's'}: ${escape(r.projects.map((p) => p.title).join(', ').slice(0, 100))}<div style="margin-top:6px;font-size:11px">${renderActionAudit(r)}</div></td></tr>`).join('')}
</table>`;
}

function renderExitedTodayHtml(exitedToday) {
  if (exitedToday.length === 0) return '';
  return `
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
}

function renderNotifyTodoDescription(internRow, ccppRecord, exitMessageId) {
  const today = new Date().toISOString().slice(0, 10);
  return `<div><strong>Intern removed by auto-nudge (BLACK tier exit):</strong> ${escape(internRow.name)} (CCPP InternID ${ccppRecord.InternID})</div>
<div style="margin-top:10px"><strong>Reason recorded:</strong> No Call No Show (${internRow.daysSinceLast} days dark)</div>
<div style="margin-top:4px"><strong>CCPP write:</strong> InternIsActive 1 -&gt; 0, end date ${today}, reason ID 2</div>
<div style="margin-top:4px"><strong>Basecamp un-assignments:</strong> 3 todos</div>
<div style="margin-top:4px"><strong>Exit email sent to:</strong> ${escape(internRow.email || 'no email on file')}</div>
<div style="margin-top:4px"><strong>BCC on exit email:</strong> ali@colaberry.com, dhee@colaberry.com</div>
<div style="margin-top:4px"><strong>Mandrill message id:</strong> <code>${escape(exitMessageId || 'n/a')}</code></div>
<div style="margin-top:12px;font-size:13px;color:#475569">Reinstatement protocol was included in the exit email. The intern has 72 hours to email Ali in the prescribed format. If no email arrives, the exit is final.</div>
<div style="margin-top:6px;font-size:11px;color:#94a3b8">Logged by dailyInternNudges.js auto-exit branch.</div>`;
}

// ---------------------------------------------------------------------------
// Build the combined preview email
// ---------------------------------------------------------------------------

(async () => {
  const exitEmail = buildExitEmailContent(SAMPLE_INTERN, SAMPLE_CCPP, SAMPLE_STATE_ENTRY);
  const digestExitedTodayHtml = renderExitedTodayHtml([SAMPLE_DIGEST_ROW]);
  const digestSections = [
    renderSection('BLACK - day 10+ exit cliff', [SAMPLE_DIGEST_ROW], '#0c0a09'),
    renderSection('RED - 7-9 days dark, final warning', [SAMPLE_RED_ROW], '#991b1b'),
    renderSection('ORANGE - 4-6 days dark, warning', [SAMPLE_ORANGE_ROW], '#9a3412'),
    renderSection('YELLOW - 1-3 days dark, gentle reminder', [SAMPLE_YELLOW_ROW], '#854d0e'),
  ].join('');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const aliDigestSample = `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.55;max-width:720px">
<div style="background:#1a365d;color:white;padding:18px 22px;border-radius:6px;margin-bottom:18px">
<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700">${today} - For Ali</div>
<div style="font-size:16px;margin-top:8px;line-height:1.55">Ali, today's nudge cycle ran in <strong>LIVE</strong> mode. 4 interns were emailed and commented on in Basecamp. <strong>1 person hit the day-10 exit cliff.</strong> They received the exit notice. You should process them out today.</div>
</div>
<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:10px 14px;margin-bottom:14px;color:#166534;font-size:13px"><strong>LIVE MODE - intern emails and BC comments fired for everyone below.</strong></div>
${digestExitedTodayHtml}
${digestSections}
</div>`;

  const notifyTodoDesc = renderNotifyTodoDescription(SAMPLE_INTERN, SAMPLE_CCPP, '<sample-exit-message-id@colaberry.com>');

  // Combined preview email
  const previewHtml = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:820px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:26px 32px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">PREVIEW - what auto-exit will produce</div>
<div style="font-size:22px;font-weight:700;margin-top:6px">Sample render of the new BLACK auto-exit flow</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:8px">Three artifacts: the email the intern sees, the daily digest you see, the BC notify todo description. Sample intern = "Sample Intern &lt;sample.intern@example.com&gt;", 11 days dark, fake CCPP InternID 4242. Nothing actually happened in production. Prod nudge mode has been flipped to PREVIEW so tonight's 5pm CDT cron is safe while you review.</div>
</div>

<div style="padding:24px 32px;border-bottom:2px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#dc2626;font-weight:700">Artifact 1 of 3</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">The exit email the intern receives</div>
<div style="font-size:12px;color:#64748b;margin-top:6px"><strong>From:</strong> "Colaberry CB System" &lt;ali@colaberry.com&gt; &middot; <strong>To:</strong> intern email &middot; <strong>BCC:</strong> ali@colaberry.com, dhee@colaberry.com</div>
<div style="font-size:12px;color:#64748b;margin-top:4px"><strong>Subject:</strong> ${escape(exitEmail.subject)}</div>
<div style="margin-top:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:0;overflow:hidden">
${exitEmail.html}
</div>
</div>

<div style="padding:24px 32px;border-bottom:2px solid #e2e8f0;background:#f8fafc">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">Artifact 2 of 3</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">The daily Ali + Ram + Dhee digest (with AUTO-EXITED block)</div>
<div style="font-size:12px;color:#64748b;margin-top:6px"><strong>From:</strong> "Colaberry CB System" &lt;ali@colaberry.com&gt; &middot; <strong>To:</strong> ali &middot; <strong>CC:</strong> alimuwwakkil@gmail.com, ram@colaberry.com, <strong>dhee@colaberry.com</strong></div>
<div style="font-size:12px;color:#64748b;margin-top:4px"><strong>Subject:</strong> [Intern Nudges] 1 BLACK (1 auto-exited), 1 RED, 1 ORANGE, 1 YELLOW</div>
<div style="margin-top:14px;background:white;border:1px solid #cbd5e1;border-radius:6px;padding:18px">
${aliDigestSample}
</div>
</div>

<div style="padding:24px 32px;border-bottom:2px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7c3aed;font-weight:700">Artifact 3 of 3</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">The Basecamp removal todo (you + Dhee both assigned)</div>
<div style="font-size:12px;color:#64748b;margin-top:6px"><strong>Project:</strong> Ali Personal (7463955) &middot; <strong>List:</strong> AI Products &middot; <strong>Assignees:</strong> Ali (17454835) + Dhee (34920126)</div>
<div style="font-size:12px;color:#64748b;margin-top:4px"><strong>Title:</strong> [Intern Removed 2026-06-01] Sample Intern - auto-exit NCNS, 11d dark</div>
<div style="margin-top:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:18px">
${notifyTodoDesc}
</div>
</div>

<div style="padding:24px 32px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">How to go live</div>
<div style="font-size:14px;margin-top:6px">When you've reviewed and want auto-exit to fire on the next cron run, tag <code style="background:#fbbf24;color:#0f172a;padding:2px 8px;border-radius:4px">@CB System set intern nudge mode live</code> in any Basecamp thread. Cron fires Mon-Fri 5pm CDT.</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:10px">Prod mode is currently <strong>PREVIEW</strong> (flipped by Claude Code at this preview-send moment per your request). Tonight's 5pm CDT run will email you the preview-only digest, no exits will fire, no exit emails will go out, no CCPP writes.</div>
</div>

</div></body></html>`;

  const text = strip(`PREVIEW - what auto-exit will produce

Three artifacts in the HTML email below:

1. The exit email the intern receives
   - From: Colaberry CB System
   - BCC: ali + dhee
   - Subject: [Internship Exit] Your Colaberry internship has been processed out - reinstatement protocol inside
   - Body: explanation + full nudge history table + reinstatement protocol (4-section format, 72hr deadline)

2. The daily digest you, Ram, and Dhee receive
   - From: Colaberry CB System
   - CC: alimuwwakkil@gmail.com, ram@colaberry.com, dhee@colaberry.com (newly added)
   - Subject: [Intern Nudges] 1 BLACK (1 auto-exited), 1 RED, 1 ORANGE, 1 YELLOW
   - Body: top "For Ali" callout + red AUTO-EXITED TODAY block + per-tier sections with audit info

3. The BC removal todo
   - Project: Ali Personal -> AI Products list
   - Assignees: Ali + Dhee
   - Title: [Intern Removed YYYY-MM-DD] Name - auto-exit NCNS, Nd dark
   - Description: CCPP InternID, BC un-assign count, exit message id, BCC list, reinstatement note

PROD MODE NOW: PREVIEW. Tonight's 5pm CDT cron will email a preview-only digest. No real exits. No CCPP writes.

To go live: tag @CB System set intern nudge mode live in any Basecamp thread.`);

  validateBeforeSend(previewHtml, text);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    subject: '[PREVIEW] Auto-exit flow renders - exit email + Ali digest + BC notify todo',
    text,
    html: previewHtml,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Preview render sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
