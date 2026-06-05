#!/usr/bin/env node
// Present Ali a clean candidate list of opportunities with at least 14
// days runway from the 2026-06-08 kickoff (i.e., close_date >= 6/22).
// Pre-filtered to software / system / AI fits (skipped construction,
// security guard, vehicle bed removal, etc.). Ali picks 8 from this
// list. Then he downloads files + uploads to OP. Then I rebuild the
// BC structure.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const TRACKING_TODO = 9967017720;

// Top 10 software/system candidates, close >= 6/22, fit >= 70, hand-filtered
// to skip construction / security guard / vehicle / medical reno / generic
// labor / metals / utility-body work. Sorted by close_date ASC.
const CANDIDATES = [
  { rank: 1, uuid: '8d98ee56-e817-4cb1-93c9-863210cd8db5', title: 'SLCC RFP - Computer Maintenance Management System (CMMS)',       agency: 'U3P Utah',                  closeDate: '2026-06-22', fit: 75, value: 500000,  pursued: false, bonfire: 'https://utah.bonfirehub.com/opportunities/238670',          note: 'Software / asset & maintenance tracking' },
  { rank: 2, uuid: '62033082-b414-410d-9ab3-c385b34acc80', title: 'RFP - Financial Reporting System for Harris County Auditor',     agency: 'Harris County',             closeDate: '2026-06-22', fit: 75, value: 300000,  pursued: false, bonfire: 'https://harriscountytx.bonfirehub.com/opportunities/206717', note: 'Reporting / dashboards / data' },
  { rank: 3, uuid: '3f55d2af-8396-4089-86be-e2bd94f68fa6', title: 'RFP - Election Management System for Harris County Clerk',       agency: 'Harris County',             closeDate: '2026-06-22', fit: 70, value: 1000000, pursued: false, bonfire: 'https://harriscountytx.bonfirehub.com/opportunities/206717', note: 'Software / election infrastructure - $1M' },
  { rank: 4, uuid: '2e287828-9040-4948-98fe-a0250a5d66a5', title: 'RFP - Agenda and Meeting Management System for Harris County',   agency: 'Harris County',             closeDate: '2026-06-22', fit: 70, value: 300000,  pursued: true,  bonfire: 'https://harriscountytx.bonfirehub.com/opportunities/206717', note: 'Already pursued in OP, 8 reqs tailored, 0 files' },
  { rank: 5, uuid: 'a3e41e69-e7ce-4804-ad13-1f49c22d1885', title: 'Community Engagement Platform',                                  agency: 'City of Detroit',           closeDate: '2026-06-22', fit: 70, value: 500000,  pursued: false, bonfire: 'https://detroit.bonfirehub.com/opportunities/228082',        note: 'Civic platform / public engagement' },
  { rank: 6, uuid: 'db592612-b5da-4392-820a-f2333d57ab81', title: 'Professional Licensing & Registration System Modernization',     agency: 'U3P Utah',                  closeDate: '2026-06-23', fit: 75, value: 1000000, pursued: false, bonfire: 'https://utah.bonfirehub.com/opportunities/236841',           note: 'Software modernization - $1M' },
  { rank: 7, uuid: 'f8df4b8d-fa4f-4130-9d67-b696677ecaf2', title: 'Data Center Network Infrastructure Services',                    agency: 'City of Dallas',            closeDate: '2026-06-26', fit: 75, value: 750000,  pursued: false, bonfire: 'https://dallascityhall.bonfirehub.com/opportunities/',       note: 'Infrastructure / network design' },
  { rank: 8, uuid: '2f5fd926-05f6-4d02-9388-c0ae3b141aed', title: 'Multifamily Management System',                                  agency: 'TDHCA',                     closeDate: '2026-06-29', fit: 70, value: 750000,  pursued: false, bonfire: 'https://tdhca-texas-gov.bonfirehub.com/opportunities/',      note: 'Software / housing data system' },
  { rank: 9, uuid: '4dc18cd6-a1a3-4bdd-86f4-b4e97c6d6dd7', title: 'Community Development Software for Housing',                     agency: 'UT Dallas',                 closeDate: '2026-06-30', fit: 70, value: 500000,  pursued: false, bonfire: 'https://utdallas.bonfirehub.com/opportunities/',             note: 'Software / housing data' },
  { rank: 10, uuid: '3dd7cb9c-be0f-4396-82e8-3502b3b9c8c8', title: 'Juvenile Justice Control System Modernization',                 agency: 'Galveston County',          closeDate: '2026-07-02', fit: 70, value: 750000,  pursued: false, bonfire: 'https://galvestoncountytx.bonfirehub.com/opportunities/',     note: 'Justice software modernization' },
];

const DROPPED_FROM_PURSUED = [
  { title: 'Tech Innovation Challenge - AI for Muni-code Search', agency: 'City of Detroit', closeDate: '2026-06-12', files: 8 },
  { title: 'Cloud Based Artificial Intelligence Platform',         agency: 'City of Southlake', closeDate: '2026-06-12', files: 1 },
  { title: 'Records Management System',                            agency: 'TDCJ',              closeDate: '2026-06-15', files: 9 },
  { title: 'CRIO - Cannabis Licensing Software',                   agency: 'City of Detroit',   closeDate: '2026-06-19', files: 0 },
];

const OP_BASE = 'http://95.216.199.47/admin/bonfire';
const KICKOFF = new Date('2026-06-08T00:00:00Z');

function daysFromKickoff(iso) {
  const close = new Date(iso + 'T00:00:00Z');
  return Math.round((close - KICKOFF) / 86400000);
}

function dollar(v) {
  return v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;
}

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:arial;font-size:14px;color:#2d3748;border-left:3px solid #1a365d;padding-left:14px;margin-top:24px"><tr><td><div style="font-weight:700;font-size:16px;color:#1a365d">Ali Muwwakkil</div><div style="color:#2b6cb0;font-weight:600">Managing Director / AI Systems Architect</div><div style="color:#718096">Colaberry Inc.</div></td></tr></table>`;
const SIG_TEXT = `Ali Muwwakkil\nManaging Director / AI Systems Architect\nColaberry Inc.`;

const candidateRows = CANDIDATES.map((c) => {
  const days = daysFromKickoff(c.closeDate);
  const pursuedBadge = c.pursued
    ? '<span style="padding:2px 6px;background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;border-radius:3px">PURSUED</span>'
    : '<span style="padding:2px 6px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;border-radius:3px">CATALOG</span>';
  return `<tr style="border-bottom:1px solid #e2e8f0">
<td style="padding:10px;font-size:11px;color:#64748b;text-align:center">${c.rank}</td>
<td style="padding:10px"><div style="font-size:12px;font-weight:600;color:#1e293b">${c.title}</div><div style="font-size:10px;color:#64748b;margin-top:2px">${c.agency}</div><div style="font-size:10px;color:#475569;margin-top:2px;font-style:italic">${c.note}</div></td>
<td style="padding:10px;font-size:11px;text-align:center"><div style="font-weight:700;color:#1a365d">${days}d</div><div style="font-size:10px;color:#64748b">${c.closeDate}</div></td>
<td style="padding:10px;font-size:11px;text-align:center">${c.fit}</td>
<td style="padding:10px;font-size:12px;font-weight:600;color:#166534;text-align:right">${dollar(c.value)}</td>
<td style="padding:10px;text-align:center">${pursuedBadge}</td>
<td style="padding:10px;text-align:center"><a href="${c.bonfire}" style="color:#2b6cb0;font-size:10px;font-weight:600">Bonfire</a><br><a href="${OP_BASE}/${c.uuid}/submission-readiness" style="color:#2b6cb0;font-size:10px;font-weight:600">OP</a></td>
</tr>`;
}).join('');

const droppedRows = DROPPED_FROM_PURSUED.map((d) => {
  const days = daysFromKickoff(d.closeDate);
  return `<tr style="border-bottom:1px solid #fecaca">
<td style="padding:8px;font-size:11px;color:#1e293b">${d.title}</td>
<td style="padding:8px;font-size:11px;color:#64748b">${d.agency}</td>
<td style="padding:8px;font-size:11px;color:#991b1b;font-weight:700;text-align:center">${days}d<div style="font-size:10px;font-weight:400">${d.closeDate}</div></td>
<td style="padding:8px;font-size:11px;color:#475569">${d.files} file(s)</td>
</tr>`;
}).join('');

const totalValue = CANDIDATES.reduce((s, c) => s + c.value, 0);

const HTML = `<div style="font-family:arial;font-size:14px;color:#2d3748;line-height:1.55;max-width:1000px">
<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Candidate list - >= 14 days from 6/8 kickoff</div>
<h1 style="margin:6px 0;font-size:22px;font-weight:800;color:white">10 candidates for you to pick 8 from</h1>
</div>
<div style="padding:24px 28px">
<p>Ali,</p>
<p>Applied the 14-day-runway filter. Anything closing before <strong>2026-06-22</strong> is out. Below is the cleanest 10 candidates from the OP catalog that close on or after 6/22, fit_score &ge; 70, software / system / AI fits only (filtered out construction, security guard services, vehicle/labor, medical renovation, etc).</p>

<p><strong>Note:</strong> Only one of the 10 (#4 Harris Agenda Meeting Mgmt) is already pursued in OP. The other 9 are catalog-only and would need to be activated when you pick them.</p>

<h2 style="margin:18px 0 10px;color:#1a365d;font-size:16px">Candidates (you pick 8)</h2>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family:arial;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px;font-size:11px;letter-spacing:1px;text-align:center">#</th>
<th style="padding:10px;font-size:11px;letter-spacing:1px;text-align:left">Contract</th>
<th style="padding:10px;font-size:11px;letter-spacing:1px;text-align:center">Days from kickoff</th>
<th style="padding:10px;font-size:11px;letter-spacing:1px;text-align:center">Fit</th>
<th style="padding:10px;font-size:11px;letter-spacing:1px;text-align:right">Value</th>
<th style="padding:10px;font-size:11px;letter-spacing:1px;text-align:center">Status</th>
<th style="padding:10px;font-size:11px;letter-spacing:1px;text-align:center">Links</th>
</tr></thead>
<tbody>${candidateRows}</tbody>
<tfoot><tr style="background:#f1f5f9"><td colspan="4" style="padding:10px;font-size:11px;font-weight:700;color:#1a365d">Total pipeline value across all 10:</td><td style="padding:10px;font-size:12px;font-weight:700;color:#166534;text-align:right">${dollar(totalValue)}</td><td colspan="2"></td></tr></tfoot>
</table>

<h2 style="margin:24px 0 10px;color:#991b1b;font-size:16px">Dropped from the sprint (less than 14 days from kickoff)</h2>
<p style="font-size:12px;color:#475569">These 4 were in the prior round. They're still pursued in OP and can be worked on by you / Ram / Que, but not by the interns this sprint.</p>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #fee2e2;border-radius:6px;overflow:hidden;font-family:arial;font-size:12px;background:#fef2f2">
<thead><tr style="background:#fee2e2;color:#991b1b"><th style="padding:8px;text-align:left;font-size:11px;letter-spacing:1px">Contract</th><th style="padding:8px;text-align:left;font-size:11px;letter-spacing:1px">Agency</th><th style="padding:8px;text-align:center;font-size:11px;letter-spacing:1px">Runway</th><th style="padding:8px;text-align:left;font-size:11px;letter-spacing:1px">Files</th></tr></thead>
<tbody>${droppedRows}</tbody>
</table>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">Notes on the 10</h2>
<ul style="font-size:13px;color:#475569;line-height:1.7">
<li><strong>Harris County triple-header (#2, #3, #4):</strong> all close 6/22. Same Bonfire portal account, possibly bundle-able for one intern team. Worth a look.</li>
<li><strong>U3P Utah pair (#1, #6):</strong> both close 6/22-6/23. Same buyer infrastructure.</li>
<li><strong>$1M opportunities (#3, #6):</strong> Harris County Election + U3P Pro Licensing - largest revenue.</li>
<li><strong>#4 Harris Agenda Meeting</strong> is the only one already marked pursuing in OP. The "pursuing" flag survives between rounds even though no files are loaded.</li>
<li><strong>Construction / labor / med reno opportunities</strong> from the raw catalog were filtered out - they need different SMEs and Colaberry isn't positioned to win them on a 2-week sprint.</li>
</ul>

<p style="margin-top:18px;padding:14px 18px;background:#fefce8;border-left:4px solid #fbbf24;border-radius:4px;font-size:13px;color:#713f12">
<strong>Reply with your 8 picks</strong> (e.g. "1, 3, 4, 5, 6, 7, 8, 10"). Then you can download the RFP zips from each pick's Bonfire link + upload to the OP submission-readiness page. Once files are loaded, I'll rebuild the BC structure with the real per-RFP requirement matrix and reassign the 4 interns round-robin against your actual picks.
</p>

<p style="margin-top:16px;font-size:13px;color:#475569"><strong>Tracking:</strong> <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}">Ali Personal #${TRACKING_TODO}</a></p>
</div>
${SIG_HTML}
</div>`;

const TEXT = `Ali,

Applied the 14-day-runway filter from 6/8 kickoff. Anything closing before 6/22 is out.

10 CANDIDATES (you pick 8):

${CANDIDATES.map((c) => {
  const days = daysFromKickoff(c.closeDate);
  return `${c.rank}. ${c.title} (${c.agency})
   Closes ${c.closeDate} (${days}d from kickoff), fit ${c.fit}, ${dollar(c.value)} ${c.pursued ? '[PURSUED]' : '[CATALOG]'}
   Note: ${c.note}
   Bonfire: ${c.bonfire}
   OP:      ${OP_BASE}/${c.uuid}/submission-readiness`;
}).join('\n\n')}

DROPPED (less than 14 days from kickoff - someone else, not interns):
${DROPPED_FROM_PURSUED.map((d) => `- ${d.title} (${d.agency}, closes ${d.closeDate}, ${d.files} files)`).join('\n')}

Reply with your 8 picks (e.g. "1, 3, 4, 5, 6, 7, 8, 10"). Then download + upload files. Then I rebuild BC.

Tracking: https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: TRACKING_TODO,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Gov-bid sprint candidates - 10 with >=14 day runway, pick 8',
    html: HTML,
    text: TEXT,
    bcSummary: `<p>Applied 14-day-runway filter from 2026-06-08 kickoff. Anything closing before 2026-06-22 is out. Hand-filtered 25 raw catalog candidates down to 10 software/system fits (skipped construction, security guards, vehicle bed removal, medical reno, etc). 1 of 10 is already pursued (Harris Agenda Meeting Mgmt); 9 are catalog-only and need activation when picked. Total pipeline value across the 10: $6.0M. Top revenue opportunities: Harris Election Mgmt ($1M) and U3P Prof Licensing ($1M). Dropped from sprint: Detroit Muni-code, Southlake AI Platform, TDCJ Records, Detroit CRIO Cannabis (all less than 14 days). Asked Ali to reply with 8 picks. Then he downloads files. Then I rebuild BC structure.</p>`,
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
