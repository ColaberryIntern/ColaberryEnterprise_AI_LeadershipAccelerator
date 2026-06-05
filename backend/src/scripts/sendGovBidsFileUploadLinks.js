#!/usr/bin/env node
// Send Ali the 8 Bonfire download + Opportunity Pulse upload URLs for
// the gov-bid intern sprint so he can pull RFP files from Bonfire and
// load them into OP. Once OP has the actual requirements, I re-run
// assignGovBidsToInterns.js to populate each intern's task list from
// the real RFP content (not just metadata).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const TRACKING_TODO = 9967017720; // Ali Personal tracking todo from earlier

const PICKS = [
  { intern: 'OBI',      title: 'Tech Innovation Challenge - AI for Muni-code Search',         uuid: '7011f5af-a0c6-45fb-8684-a6432c19cf54', bonfire: 'https://detroit.bonfirehub.com/opportunities/237106',         files: 8, status: 'READY (files loaded)' },
  { intern: 'samrawit', title: 'Records Management System',                                   uuid: 'cf2f3de4-cb2b-4eb0-85d5-7494cc6693d0', bonfire: 'https://tdcj.bonfirehub.com/opportunities/234405',           files: 9, status: 'READY (files loaded)' },
  { intern: 'Akiwam',   title: 'Cloud Based AI Platform for City of Southlake',               uuid: '4cdb1199-9315-43b2-8c5d-58f0d4781eaa', bonfire: 'https://southlake.bonfirehub.com/opportunities/235973',      files: 1, status: 'PARTIAL (1 of N loaded)' },
  { intern: 'Omolola',  title: 'MD30 Mobile Road Sensor',                                     uuid: '302f2a2e-29ce-4041-b21d-ea5f7f8e206b', bonfire: 'https://txdot.bonfirehub.com/opportunities/237694',          files: 0, status: 'NEEDS DOWNLOAD + UPLOAD' },
  { intern: 'Akiwam',   title: 'SLCC CMMS - Computer Maintenance Management System',          uuid: '8d98ee56-e817-4cb1-93c9-863210cd8db5', bonfire: 'https://utah.bonfirehub.com/opportunities/238670',           files: 0, status: 'NEEDS DOWNLOAD + UPLOAD' },
  { intern: 'OBI',      title: 'Professional Licensing and Registration System (Utah U3P)',   uuid: 'db592612-b5da-4392-820a-f2333d57ab81', bonfire: 'https://utah.bonfirehub.com/opportunities/236841',           files: 0, status: 'NEEDS DOWNLOAD + UPLOAD' },
  { intern: 'Omolola',  title: "Election Management System - Harris County Clerk's Office",   uuid: '3f55d2af-8396-4089-86be-e2bd94f68fa6', bonfire: 'https://harriscountytx.bonfirehub.com/opportunities/206717',  files: 0, status: 'NEEDS DOWNLOAD + UPLOAD' },
  { intern: 'samrawit', title: 'CRIO - Cannabis Licensing Software (Detroit)',                uuid: 'bf44f141-2a24-447d-8ec9-d86758768c97', bonfire: 'https://detroit.bonfirehub.com/opportunities/228082',        files: 0, status: 'NEEDS DOWNLOAD + UPLOAD' },
];

const OP_BASE = 'http://95.216.199.47/admin/bonfire';

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:arial;font-size:14px;color:#2d3748;border-left:3px solid #1a365d;padding-left:14px;margin-top:24px"><tr><td><div style="font-weight:700;font-size:16px;color:#1a365d">Ali Muwwakkil</div><div style="color:#2b6cb0;font-weight:600">Managing Director / AI Systems Architect</div><div style="color:#718096">Colaberry Inc.</div></td></tr></table>`;
const SIG_TEXT = `Ali Muwwakkil\nManaging Director / AI Systems Architect\nColaberry Inc.`;

const READY_COUNT = PICKS.filter(p => p.files >= 5).length;
const NEEDS_COUNT = PICKS.filter(p => p.files === 0).length;
const PARTIAL_COUNT = PICKS.filter(p => p.files > 0 && p.files < 5).length;

function statusBg(s) {
  if (s.startsWith('READY')) return '#dcfce7';
  if (s.startsWith('PARTIAL')) return '#fef3c7';
  return '#fee2e2';
}
function statusText(s) {
  if (s.startsWith('READY')) return '#166534';
  if (s.startsWith('PARTIAL')) return '#92400e';
  return '#991b1b';
}

const rowsHtml = PICKS.map((p, i) => `
<tr style="border-bottom:1px solid #e2e8f0">
  <td style="padding:10px 8px;font-size:11px;color:#64748b">${i + 1}</td>
  <td style="padding:10px 10px;font-weight:600;color:#1e293b;font-size:12px">${p.title}</td>
  <td style="padding:10px 10px;font-size:12px;color:#475569">${p.intern}</td>
  <td style="padding:10px 10px;font-size:11px"><span style="padding:3px 8px;border-radius:3px;font-weight:700;background:${statusBg(p.status)};color:${statusText(p.status)}">${p.status}</span></td>
  <td style="padding:10px 10px;font-size:11px;color:#1e293b">${p.files} file(s) loaded</td>
  <td style="padding:10px 10px"><a href="${p.bonfire}" style="color:#2b6cb0;font-size:11px;font-weight:600">Download from Bonfire ${'↗'}</a></td>
  <td style="padding:10px 10px"><a href="${OP_BASE}/${p.uuid}/submission-readiness" style="color:#2b6cb0;font-size:11px;font-weight:600">Upload to OP ${'↗'}</a></td>
</tr>`).join('');

const HTML = `<div style="font-family:arial;font-size:14px;color:#2d3748;line-height:1.55;max-width:1000px">
<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Gov Contracts intern sprint - file load step</div>
<h1 style="margin:6px 0;font-size:22px;font-weight:800;color:white">Bonfire downloads + OP uploads needed before I rebuild the task lists</h1>
</div>
<div style="padding:24px 28px">
<p>Ali,</p>
<p>You called it - the first round used only the OP metadata (title, agency, fit, close date), not the real RFP requirements. Here's the current file state across the 8 picks and the upload links so you can pull from Bonfire and load to OP.</p>

<div style="display:flex;gap:12px;margin:18px 0">
  <div style="flex:1;background:#dcfce7;border-left:4px solid #16a34a;padding:12px 14px;border-radius:4px"><div style="font-size:11px;letter-spacing:2px;color:#166534;font-weight:700">READY NOW</div><div style="font-size:24px;font-weight:800;color:#166534">${READY_COUNT}</div><div style="font-size:11px;color:#166534">files already in OP</div></div>
  <div style="flex:1;background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:4px"><div style="font-size:11px;letter-spacing:2px;color:#92400e;font-weight:700">PARTIAL</div><div style="font-size:24px;font-weight:800;color:#92400e">${PARTIAL_COUNT}</div><div style="font-size:11px;color:#92400e">some files, may need more</div></div>
  <div style="flex:1;background:#fee2e2;border-left:4px solid #dc2626;padding:12px 14px;border-radius:4px"><div style="font-size:11px;letter-spacing:2px;color:#991b1b;font-weight:700">EMPTY</div><div style="font-size:24px;font-weight:800;color:#991b1b">${NEEDS_COUNT}</div><div style="font-size:11px;color:#991b1b">need download + upload</div></div>
</div>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family:arial;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
  <th style="padding:10px 8px;text-align:left;font-size:11px;letter-spacing:1px">#</th>
  <th style="padding:10px 10px;text-align:left;font-size:11px;letter-spacing:1px">Opportunity</th>
  <th style="padding:10px 10px;text-align:left;font-size:11px;letter-spacing:1px">Intern</th>
  <th style="padding:10px 10px;text-align:left;font-size:11px;letter-spacing:1px">Status</th>
  <th style="padding:10px 10px;text-align:left;font-size:11px;letter-spacing:1px">Files</th>
  <th style="padding:10px 10px;text-align:left;font-size:11px;letter-spacing:1px">1. Download</th>
  <th style="padding:10px 10px;text-align:left;font-size:11px;letter-spacing:1px">2. Upload</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
</table>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">Workflow</h2>
<ol style="font-size:13px;color:#475569;line-height:1.7">
<li>Click <strong>Download from Bonfire</strong>. Sign in with the right Bonfire account (Que joint or Colaberry-only per the routing rule). Grab the RFP zip + any related attachments.</li>
<li>Click <strong>Upload to OP</strong>. Drop the files into the submission-readiness page. OP parses them + extracts requirements automatically.</li>
<li>When all 8 (or as many as you've finished) are loaded, ping me. I'll rerun <code>assignGovBidsToInterns.js</code> which now reads the parsed requirements and replaces the generic 14-task template with the actual per-RFP requirement matrix (Functional / Technical / Compliance breakdown sized to that specific RFP).</li>
</ol>

<h2 style="margin:20px 0 10px;color:#1a365d;font-size:16px">Priority order for downloads</h2>
<p style="font-size:13px;color:#475569">The Week 1 closes (6/12-15) get loaded first so the interns hit Monday with real content. Order:</p>
<ol style="font-size:13px;color:#475569;line-height:1.7">
<li><strong>Southlake AI Platform</strong> (close 6/12, Akiwam) - 1 file loaded, needs the rest</li>
<li><strong>TxDOT MD30 Sensor</strong> (close 6/12, Omolola) - empty</li>
<li><strong>TDCJ Records Management</strong> (close 6/15, samrawit) - 9 files already loaded, may be complete</li>
<li><strong>Detroit Muni-code</strong> (close 6/12, OBI) - 8 files loaded, may be complete</li>
<li>Week 2 closes (Detroit CRIO 6/19, Harris County 6/22, SLCC 6/22, U3P Licensing 6/23) - can be loaded Monday-Tuesday since their interns have a longer runway</li>
</ol>

<p style="margin-top:20px;padding:14px 18px;background:#fefce8;border-left:4px solid #fbbf24;border-radius:4px;font-size:13px;color:#713f12">
<strong>Once you've loaded files</strong>, reply "rerun" (or just ping me) and I'll pull the parsed requirements from <code>opportunity_attachments.parsed_text</code> + the OP enrichment fields + replace each intern's 14-task generic list with the actual RFP requirement breakdown.
</p>

<p style="margin-top:16px;font-size:13px;color:#475569"><strong>Tracking BC todo:</strong> <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}">Ali Personal #${TRACKING_TODO}</a></p>
</div>
${SIG_HTML}
</div>`;

const TEXT = `Ali,

You called it - first round used only OP metadata, not real RFP requirements. Here's the 8 picks with current file state and the download+upload links:

CURRENT FILE STATE: ${READY_COUNT} ready, ${PARTIAL_COUNT} partial, ${NEEDS_COUNT} empty.

${PICKS.map((p, i) => `${i + 1}. ${p.title} (${p.intern}) - ${p.status} - ${p.files} file(s)
   Download: ${p.bonfire}
   Upload:   ${OP_BASE}/${p.uuid}/submission-readiness
`).join('\n')}

WORKFLOW:
1. Click "Download from Bonfire" - sign in with right Bonfire account, grab RFP zip + attachments
2. Click "Upload to OP" - drop files in submission-readiness page, OP parses + extracts requirements
3. Reply "rerun" when done. I'll replace each intern's 14-task generic list with the actual per-RFP requirement matrix.

PRIORITY (Week 1 closes first):
- Southlake (6/12, partial)
- TxDOT MD30 (6/12, empty)
- Then Week 2 can be loaded Mon-Tue

Tracking: https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: TRACKING_TODO,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Gov Contracts intern sprint - Bonfire download + OP upload links (file step)',
    html: HTML,
    text: TEXT,
    bcSummary: `<p>File-load step for Gov Contracts intern sprint. Sent Ali the 8 Bonfire download URLs + OP upload URLs (submission-readiness pages) so he can pull RFP zips from Bonfire and load them into Opportunity Pulse. Current file state: ${READY_COUNT} ready (Detroit Muni-code 8 files, TDCJ Records 9 files), ${PARTIAL_COUNT} partial (Southlake 1 file), ${NEEDS_COUNT} empty (TxDOT MD30, U3P Licensing, Harris County Election, SLCC CMMS, Detroit CRIO). Once Ali loads files, rerun assignGovBidsToInterns.js to replace the generic 14-task template with the actual per-RFP requirement breakdown extracted from opportunity_attachments.parsed_text.</p>`,
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
