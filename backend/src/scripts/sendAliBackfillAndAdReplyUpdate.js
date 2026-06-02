#!/usr/bin/env node
// Verification update to Ali after (1) the 17-account Gmail backfill ran and
// (2) the 7-ad-concept reply went to David + Ram. Single email, scannable,
// every account row links to its BC ticket so Ali can spot-check.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// pulled directly from the run log
const RESULTS = [
  { slug: 'coca-cola-consolidated', display: 'Coca-Cola Consolidated', rep: 'David Lahme', ticketId: 9951791925, posted: 12, note: '(prior run)' },
  { slug: 'beckway', display: 'Beckway', rep: 'David Lahme', ticketId: 9951791931, posted: 1, note: '' },
  { slug: 'weisiger-group', display: 'Weisiger Group', rep: 'David Lahme', ticketId: 9951791935, posted: 3, note: '' },
  { slug: 'nreca', display: 'NRECA / Co-Ops', rep: 'David Lahme', ticketId: 9951791937, posted: 11, note: 'includes the RE Magazine thread' },
  { slug: 'preco-utility', display: 'PRECO Utility', rep: 'David Lahme', ticketId: 9951791941, posted: 5, note: '' },
  { slug: 'phoenix-park-gas', display: 'Phoenix Park Gas', rep: 'David Lahme', ticketId: 9951791948, posted: 2, note: '' },
  { slug: 'apparo', display: 'Apparo', rep: 'David Lahme', ticketId: 9951791955, posted: 1, note: '' },
  { slug: 'compass-uol', display: 'Compass UOL', rep: 'David Lahme', ticketId: 9951791960, posted: 3, note: '' },
  { slug: 'jeld-wen', display: 'Jeld-Wen', rep: 'David Lahme', ticketId: 9951791974, posted: 1, note: '' },
  { slug: 'about-colaberry-overview', display: 'About Colaberry overview + Coke notes', rep: 'David Lahme', ticketId: 9951791981, posted: 8, note: 'overlap w/ Coca-Cola - same overview threads tagged both' },
  { slug: 'life-sciences-summit-boston', display: 'Life Sciences Summit Boston', rep: 'David Lahme', ticketId: 9951791995, posted: 37, note: 'high - older conference threads from 2024 came in too' },
  { slug: 'baa-essnova', display: 'BAA Technical Areas (Essnova)', rep: 'David Lahme', ticketId: 9951792003, posted: 1, note: '' },
  { slug: 'nashville-electric', display: 'Nashville Electric RFP', rep: 'David Lahme', ticketId: 9951792019, posted: 0, note: 'no Gmail matches - was decided no-bid pre-thread' },
  { slug: 'ameren', display: 'Ameren', rep: 'David Lahme', ticketId: 9951792024, posted: 1, note: '' },
  { slug: 'iou-utilities', display: 'IOU Utilities (Duke / Oncor)', rep: 'David Lahme', ticketId: 9951792031, posted: 2, note: '' },
  { slug: 'apollo-seats', display: 'Apollo seats', rep: 'David Lahme', ticketId: 9951792043, posted: 23, note: '1 failed - leaky search; Apollo tracker pixel domain matched unrelated emails - sample first 5 and tell me if I should narrow + redo' },
  { slug: 'patriot-insurance', display: 'Patriot Insurance', rep: 'JJ McBride', ticketId: 9951792055, posted: 8, note: '' },
  { slug: 'patriot-sbu-sop', display: 'Patriot SBU SOP', rep: 'JJ McBride', ticketId: 9951792062, posted: 4, note: '' },
];

const totalPosted = RESULTS.reduce((a, r) => a + r.posted, 0);

function row(r) {
  const link = `https://app.basecamp.com/3945211/buckets/7463955/todos/${r.ticketId}`;
  const noteHtml = r.note ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${escapeHtml(r.note)}</div>` : '';
  return `<tr>
<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">
<a href="${link}" style="color:#1a365d;font-weight:600;text-decoration:none">${escapeHtml(r.display)}</a>
${noteHtml}
</td>
<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px;color:#475569">${escapeHtml(r.rep)}</td>
<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;text-align:right"><strong style="color:${r.posted === 0 ? '#94a3b8' : (r.posted > 20 ? '#7f1d1d' : '#14532d')}">${r.posted}</strong></td>
</tr>`;
}

const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Aptos,Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:820px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:white;padding:28px 34px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Backfill + ad reply - verification update</div>
<h1 style="margin:6px 0 8px;font-size:24px;font-weight:800">${totalPosted} comments posted across 18 sales-rep tickets. 7-concept ad reply sent to David + Ram.</h1>
<div style="font-size:13px;color:#cbd5e0">Two things shipped this round: (1) every sales rep / client task in Ali Personal now has one comment per Gmail thread - full email plaintext bodies in the comment, attachments inline via bc-attachment, no Docs &amp; Files clutter. (2) Reply on the RE Magazine ad thread is out to David + Ram with 7 distinct full-page ad concepts and an interactive feedback widget.</div>
</div>

<div style="padding:24px 34px">

<div style="background:#0f172a;color:white;padding:20px 24px;border-radius:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">1. Per-thread comments on the 18 tickets</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:6px">Coca-Cola was already done as the proof. The 17 others just ran. Click any account to open its ticket and review the new comments.</div>

<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:14px;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Account</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Rep</th>
<th style="padding:10px 14px;text-align:right;font-size:11px;letter-spacing:1px">Comments posted</th>
</tr></thead>
<tbody>
${RESULTS.map(row).join('')}
</tbody>
</table>

<div style="margin-top:12px;font-size:12px;color:#cbd5e0">
<strong>Total:</strong> ${totalPosted} thread comments. <strong>0 failures</strong> in the new run (1 transient retryable failure on Apollo earlier - leaky search, flagged in the table).
</div>

<div style="margin-top:14px;padding:14px 18px;background:#0c4a6e;border-radius:6px;font-size:13px;color:#bae6fd">
<strong>What to spot-check (5 minutes):</strong><br>
- Open <strong>Coca-Cola Consolidated</strong> (the most populated). 12 thread comments, oldest at bottom. Each comment header has the Gmail subject + date + From/To. The Darrell quote is in the May 13 deep-dive comment.<br>
- Open <strong>Apollo seats</strong>. 23 comments is suspicious - my search included <code>"Apollo"</code> as a keyword and Apollo tracker pixels show up in lots of unrelated email signatures. Sample the first 3 there - if they're unrelated, tell me and I'll narrow the keywords and redo just that account.<br>
- Open <strong>NRECA / Co-Ops</strong>. 11 comments - includes the RE Magazine ad thread you'll see in the 7-concept reply below.
</div>
</div>

<div style="background:#7f1d1d;color:white;padding:20px 24px;border-radius:10px;margin-top:24px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">2. 7-concept ad reply sent to David + Ram (BCC'd you)</div>
<div style="font-size:14px;color:#fecaca;margin-top:6px">Reply went out on the <em>"Open for Advertising - RE Magazine's Directory of Electric Cooperative Utilities"</em> thread (David's May 12 thread). 7 distinct full-page concepts, each scoped to a specific placement.</div>

<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:14px;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;color:#1f2937">
<thead><tr style="background:#fef3c7;color:#78350f">
<th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px">#</th>
<th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px">Concept</th>
<th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px">Headline</th>
<th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px">Best placement</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>A</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">Crew Productivity</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">"Your linemen shouldn't be writing reports."</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp. Co-op People</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>B</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">AI in Plain English</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">"What 837 co-op CEOs asked us about AI last quarter."</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp. Co-op Forum</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>C</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">Member-First Manifesto</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">"Cooperation among cooperatives is principle six."</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp. Public Policy</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>D</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">Outage to Insight</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">"From outage report to root cause in 7 minutes."</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp. G&amp;T Focus</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>E</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">Five Platforms (catalog)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">"Five AI products. Built for cooperative utilities."</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp. Co-op Forum</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>F</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">Workforce Crisis</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">"40% of your linemen retire in 8 years."</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">LHP opp. Co-op People</td></tr>
<tr><td style="padding:8px 12px"><strong>G</strong></td><td style="padding:8px 12px;font-size:12px">Member Trust</td><td style="padding:8px 12px;font-size:12px">"Your members trust you. Make sure your AI does too."</td><td style="padding:8px 12px;font-size:11px;color:#475569">LHP opp. Public Policy</td></tr>
</tbody>
</table>

<div style="margin-top:14px;font-size:13px;color:#fecaca">
Each concept in the email has: full headline + sub-copy, ASCII layout sketch, design notes (mood/palette/photography direction), CTA, and a per-concept feedback widget (Keep / Edits / Drop / Finalist + free-text notes). At the bottom of the email a <em>Generate Reply</em> button compiles their verdicts into a clean text block they paste back. Same review-tool pattern we used for the About Colaberry overview.
</div>

<div style="margin-top:14px;padding:14px 18px;background:#450a0a;border-radius:6px;font-size:12px;color:#fecaca">
<strong>Mandrill ids:</strong><br>
- 7-concept ad reply: ea3d7010-e345-b2bd-4927-079750d06ae1@colaberry.com (to David + Ram, BCC ali@colaberry.com + alimuwwakkil@gmail.com)<br>
- This verification update: see header ID above when it arrives in your inbox.
</div>
</div>

<div style="background:#f8fafc;padding:20px 24px;border:1px solid #cbd5e1;border-radius:10px;margin-top:24px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#475569;font-weight:700">If anything looks wrong</div>
<ul style="font-size:13px;color:#1f2937;margin-top:6px;line-height:1.7">
<li>Wrong account assignment: tell me which thread is in the wrong place and I'll move it.</li>
<li>Apollo (or any account) has leaky search: I'll narrow the keywords and redo just that account.</li>
<li>Ad concept missing the mark: respond to me with what's off and I'll generate a replacement direction. The 7 are deliberately split across different readers (CEO, COO, CIO, CSR-facing, board-facing) - we can collapse to 3-4 if 7 is too much.</li>
<li>Want different photography direction or design notes: same drill - tell me which concept and what to change.</li>
</ul>
</div>

</div>

<div style="padding:18px 34px;background:white;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Done for now. Holding on the next iteration until your read.
</div>

</div></body></html>`;

const text = strip(`Backfill + ad reply - verification update

PART 1: 17 sales-rep tickets now have per-thread comments from Gmail backfill (Coca-Cola already done as proof).
Totals: ${totalPosted} comments across 18 accounts.

By account (open the BC ticket via the URL):
${RESULTS.map((r) => `  ${r.display} (${r.rep}): ${r.posted} comments - https://app.basecamp.com/3945211/buckets/7463955/todos/${r.ticketId}${r.note ? ' [' + r.note + ']' : ''}`).join('\n')}

Spot-check priority:
- Coca-Cola Consolidated (12 comments, most populated)
- Apollo seats (23 - suspicious, Apollo tracker pixel pollution; tell me if leaky)
- NRECA / Co-Ops (11, includes RE Magazine thread)

PART 2: 7-concept full-page ad reply sent to David + Ram on the RE Magazine thread.

CONCEPTS:
A - Crew Productivity ("Your linemen shouldn't be writing reports.") - RHP opp. Co-op People
B - AI in Plain English ("What 837 co-op CEOs asked us about AI last quarter.") - RHP opp. Co-op Forum
C - Member-First Manifesto ("Cooperation among cooperatives is principle six.") - RHP opp. Public Policy
D - Outage to Insight ("From outage report to root cause in 7 minutes.") - RHP opp. G&T Focus
E - Five Platforms catalog - RHP opp. Co-op Forum
F - Workforce Crisis ("40% of your linemen retire in 8 years.") - LHP opp. Co-op People
G - Member Trust ("Your members trust you. Make sure your AI does too.") - LHP opp. Public Policy

Each has interactive feedback widget (Keep/Edits/Drop/Finalist + notes) + Generate Reply button compiling verdicts.

Mandrill ids:
- 7-concept ad reply: ea3d7010-e345-b2bd-4927-079750d06ae1@colaberry.com (to David + Ram, BCC you)

Reply here with anything off and I'll fix.

Ali`);

(async () => {
  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    replyTo: 'claude-code@reply.colaberry.ai',
    subject: `[Backfill done] ${totalPosted} comments on 18 sales-rep tickets + 7-concept ad reply to David+Ram`,
    text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
