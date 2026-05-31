#!/usr/bin/env node
// Roster reconciliation email: hand-off-ready list for the CCPP team.
//
// Produces two lists:
//   A. BC-active but NOT in CCPP active roster (with weekly activity > 0) -
//      these are people DOING work who CCPP says are not active. Either CCPP
//      is wrong (probably) or these are unauthorized workers (unlikely).
//   B. CCPP active but no Basecamp project assignment - these are interns CCPP
//      thinks are working but have no BC todo to track them. Either assign
//      them a project or exit them.
//
// For each row: name, email, project (if any), days dark (if active in BC),
// CCPP InternID (if known), suggested action.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const { buildInternActivity } = require(path.resolve(__dirname, './lib/internActivityTracker'));
const { getActiveInterns, matchAssignee, findInternByQuery, closePool } = require(path.resolve(__dirname, './lib/ccppInternRoster'));

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function htmlEscape(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

(async () => {
  const rows = await buildInternActivity({ lookbackDays: 14, includeCompleted: false });
  const roster = await getActiveInterns();

  // Set of CCPP-matched BC rows (so we know who's reconciled)
  const seenInternIds = new Set();
  const bcUnmatched = [];
  for (const r of rows) {
    const m = matchAssignee(roster, { name: r.name });
    if (m) { seenInternIds.add(m.row.InternID); }
    else if (r.totalComments > 0) {
      // Try to find a fuzzy CCPP candidate
      let fuzzy = null;
      try {
        const candidates = await findInternByQuery(r.name);
        fuzzy = candidates[0] || null;
      } catch (_e) {}
      bcUnmatched.push({ ...r, fuzzy });
    }
  }
  const ccppOnly = roster.filter((rr) => !seenInternIds.has(rr.InternID));

  console.log(`bcUnmatched (with activity) = ${bcUnmatched.length}, ccppOnly = ${ccppOnly.length}`);

  const bcRow = (r) => `
<tr style="border-bottom:1px solid #e2e8f0">
  <td style="padding:10px 12px;vertical-align:top"><strong>${htmlEscape(stripEmDashes(r.name))}</strong><br><span style="font-size:11px;color:#94a3b8">${htmlEscape(r.email || 'no email on file')}</span></td>
  <td style="padding:10px 12px;vertical-align:top;font-size:12px">${htmlEscape(stripEmDashes(r.projects.map((p) => p.title).join(', ')).slice(0, 80))}</td>
  <td style="padding:10px 12px;vertical-align:top;text-align:center"><strong>${r.totalComments}</strong> last 14d</td>
  <td style="padding:10px 12px;vertical-align:top;font-size:12px">${r.fuzzy ? `Likely match: <strong>${htmlEscape(stripEmDashes(r.fuzzy.name))}</strong> (#${r.fuzzy.InternID}, ${r.fuzzy.isActive ? 'active' : 'inactive'})` : 'No CCPP candidate found'}</td>
</tr>`;

  const ccppRow = (r) => `
<tr style="border-bottom:1px solid #e2e8f0">
  <td style="padding:10px 12px;vertical-align:top"><strong>${htmlEscape(stripEmDashes(r.name || ''))}</strong><br><span style="font-size:11px;color:#94a3b8">${htmlEscape(r.email || 'no email on file')}</span></td>
  <td style="padding:10px 12px;vertical-align:top;font-size:12px">#${r.InternID}${r.techGroup ? ` &middot; ${htmlEscape(r.techGroup)}` : ''}${r.startDate ? ` &middot; started ${shortDate(r.startDate)}` : ''}</td>
  <td style="padding:10px 12px;vertical-align:top;font-size:12px">${htmlEscape(stripEmDashes(r.basecampAlias || '(none)'))}</td>
</tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:780px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#9a3412 0%,#ea580c 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fed7aa;font-weight:700">Roster reconciliation</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">CCPP vs. Basecamp mismatch</div>
<div style="font-size:13px;color:#fef3c7;margin-top:6px">${bcUnmatched.length} actively working in BC but not in CCPP &middot; ${ccppOnly.length} in CCPP with no BC project</div>
</div>

<div style="background:#1a365d;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, your CCPP active-intern list and your Basecamp active-assignee list are out of sync. This is the full hand-off-ready picture so the CCPP team can fix the roster in one pass. List A is people doing real work who CCPP does not know about. List B is people CCPP thinks are working with no Basecamp project to back it up.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#9a3412;border-bottom:2px solid #fed7aa;padding-bottom:8px;margin:0 0 14px">A. Doing work in Basecamp, NOT in CCPP active (${bcUnmatched.length})</h2>
<div style="font-size:13px;color:#475569;margin-bottom:10px">These people posted updates in the last 14 days. Either CCPP needs to add or reactivate them, or we need to know why they have BC access without being a registered intern.</div>
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
<thead style="background:#9a3412;color:white"><tr>
<th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">PERSON</th>
<th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">BC PROJECT</th>
<th align="center" style="padding:10px 12px;font-size:11px;letter-spacing:1px">ACTIVITY</th>
<th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">LIKELY CCPP MATCH</th>
</tr></thead>
<tbody>${bcUnmatched.map(bcRow).join('')}</tbody>
</table>

<h2 style="font-size:18px;color:#9a3412;border-bottom:2px solid #fed7aa;padding-bottom:8px;margin:28px 0 14px">B. CCPP active, NO Basecamp project (${ccppOnly.length})</h2>
<div style="font-size:13px;color:#475569;margin-bottom:10px">CCPP says these interns are active. They have no project assigned in Basecamp project 24865175. Either assign them a project or exit them from CCPP.</div>
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
<thead style="background:#9a3412;color:white"><tr>
<th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">PERSON</th>
<th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">CCPP DETAILS</th>
<th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">BC ALIAS ON FILE</th>
</tr></thead>
<tbody>${ccppOnly.map(ccppRow).join('')}</tbody>
</table>

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:220px;color:#475569"><strong>Hand list A to CCPP team</strong></td><td style="padding:6px 0;vertical-align:top">Forward this email. They reconcile each name to a CCPP InternID or flag for offboarding.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Assign list B to projects</strong></td><td style="padding:6px 0;vertical-align:top">For each CCPP-active intern with no BC project: either assign them a todo in BC project 24865175, or exit them via <code style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:3px;font-size:11px">node backend/src/scripts/confirmInternExit.js --intern-id N --reason never --confirmed-by ali</code></td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Backfill BC aliases</strong></td><td style="padding:6px 0;vertical-align:top">Most CCPP rows have empty <code>InternBaseCampAlis</code>. Filling it improves auto-matching dramatically. Suggested CCPP UPDATE per row: <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px;font-size:11px">UPDATE ADF_InternshipProgram SET InternBaseCampAlis = '&lt;BC name&gt;' WHERE InternID = N</code></td></tr>
</table>
</div>

</div>
</div>
</body></html>`;

  const text = `Ali, roster reconciliation - CCPP vs Basecamp mismatch.\n\n` +
    `A. ${bcUnmatched.length} doing BC work, not in CCPP active:\n` +
    bcUnmatched.map((r) => `  - ${r.name} (${r.email || 'no email'}) - ${r.totalComments} updates last 14d - likely CCPP: ${r.fuzzy ? `#${r.fuzzy.InternID} ${r.fuzzy.name} (${r.fuzzy.isActive ? 'active' : 'inactive'})` : 'no match'}`).join('\n') +
    `\n\nB. ${ccppOnly.length} CCPP active, no BC project:\n` +
    ccppOnly.map((r) => `  - ${r.name || ''} (#${r.InternID}, ${r.email || 'no email'}) - BC alias: ${r.basecampAlias || '(none)'}`).join('\n') +
    `\n\nWorkflow:\n  - Forward this to the CCPP team to reconcile\n  - For B: assign or exit via confirmInternExit.js --reason never\n  - Backfill InternBaseCampAlis for cleaner future matching\n`;

  validateBeforeSend(stripEmDashes(html), stripEmDashes(text));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: `[Roster Reconciliation] ${bcUnmatched.length} BC-only + ${ccppOnly.length} CCPP-only need attention`,
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
  try { await closePool(); } catch (_e) {}
})().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
