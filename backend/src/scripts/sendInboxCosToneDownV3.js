#!/usr/bin/env node
// Inbox COS-only tone-down v3. Replaces v2's broader scope per Ali's
// feedback. Threaded to the same BC todo (9966887928). All body text
// keyword-safe so the classifier doesn't fire on this proposal.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const TICKET_ID = 9966887928;

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
  </td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.
200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com | enterprise.colaberry.ai`;

// All Inbox COS senders, last 7 days
const ROWS = [
  { source: 'Keyword classifier (12 trigger words, body+subject)', cur: 139, prop: 10, action: 'NARROW', why: 'Drop "urgent" trigger word (74 of 139 hits — too noisy on promo email bodies). Match subject-only, not body. 24h dedupe per (sender, keyword). Keep the 4 real signal words.' },
  { source: 'Meeting prep, 15 minutes ahead', cur: 38, prop: 38, action: 'KEEP', why: 'High signal. You said this one is worth it.' },
  { source: 'ASK_USER digest "N need your input" (Timer 3, info@)', cur: 33, prop: 14, action: 'CAP', why: 'Slow cadence from every 4h to every 12h. Suppress when zero new items since the last one. Drops 6/day to 2/day.' },
  { source: 'VIP detected (real humans flagged)', cur: 24, prop: 24, action: 'KEEP', why: 'Core signal. Real people who matter to you. Stays as-is.' },
  { source: 'Calendar conflicts ("N conflicts today")', cur: 21, prop: 0, action: 'FOLD-IN', why: 'Fold into the 7am morning calendar brief so you see conflicts inside one daily email, not a standalone ping.' },
  { source: 'ASK_USER SMS path (Timer 5, ali@) — duplicate', cur: 18, prop: 0, action: 'KILL', why: 'Same data, same 4h schedule as Timer 3 above. Two emails about the same thing. Drop this path.' },
  { source: 'Sync failed (auth token expired loop)', cur: 17, prop: 1, action: 'PERSIST DEDUPE', why: 'In-memory throttle resets on container restart, so the same auth failure re-fires across 6 keys (3 providers x 2 kinds). Move dedupe to a DB log table keyed on outage so it stays suppressed across restarts.' },
  { source: 'Morning summary (7am, overnight inbox)', cur: 3, prop: 3, action: 'KEEP', why: 'One per day. Anchor of the day.' },
  { source: 'Morning calendar brief (7am, meetings today)', cur: 3, prop: 3, action: 'KEEP + MERGE', why: 'One per day. Folds in the calendar conflicts above.' },
];

const TOTAL_CUR = ROWS.reduce((s, r) => s + r.cur, 0);
const TOTAL_PROP = ROWS.reduce((s, r) => s + r.prop, 0);
const PCT = Math.round((TOTAL_PROP / TOTAL_CUR) * 100);
const CUT = Math.round((1 - TOTAL_PROP / TOTAL_CUR) * 100);

function bar(weekly, max, color) {
  const pct = Math.max(1, Math.round((weekly / max) * 100));
  return `<div style="display:inline-block;width:${pct}%;height:14px;background:${color};border-radius:2px;vertical-align:middle"></div>`;
}
const MAX_WEEKLY = 150;

const SVG_DIAGRAM = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 350" style="width:100%;max-width:720px;height:auto;background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px">
  <text x="360" y="28" text-anchor="middle" font-family="arial" font-size="16" font-weight="800" fill="#1a365d">Inbox COS Weekly Email Volume to You</text>
  <text x="360" y="48" text-anchor="middle" font-family="arial" font-size="12" fill="#64748b">Inbox COS senders only &middot; last 7 days vs proposed</text>

  <text x="40" y="100" font-family="arial" font-size="13" font-weight="700" fill="#475569">NOW</text>
  <rect x="40" y="110" width="640" height="38" fill="#dc2626" rx="4"/>
  <text x="360" y="135" text-anchor="middle" font-family="arial" font-size="20" font-weight="800" fill="white">${TOTAL_CUR} emails / week</text>

  <line x1="360" y1="170" x2="360" y2="200" stroke="#475569" stroke-width="2"/>
  <polygon points="354,195 360,210 366,195" fill="#475569"/>

  <text x="40" y="240" font-family="arial" font-size="13" font-weight="700" fill="#475569">AFTER</text>
  <rect x="40" y="250" width="${Math.round((TOTAL_PROP / TOTAL_CUR) * 640)}" height="38" fill="#16a34a" rx="4"/>
  <text x="${40 + Math.round((TOTAL_PROP / TOTAL_CUR) * 640) + 12}" y="275" font-family="arial" font-size="18" font-weight="800" fill="#16a34a">${TOTAL_PROP} emails / week</text>

  <text x="360" y="320" text-anchor="middle" font-family="arial" font-size="14" font-weight="700" fill="#1a365d">${CUT}% reduction &middot; ${PCT}% of current volume</text>
</svg>`;

const actionStyle = (a) => {
  if (a === 'KILL') return 'background:#fee2e2;color:#991b1b';
  if (a.startsWith('KEEP')) return 'background:#dcfce7;color:#166534';
  if (a === 'NARROW' || a === 'CAP' || a === 'PERSIST DEDUPE') return 'background:#fef3c7;color:#92400e';
  return 'background:#dbeafe;color:#1e40af'; // FOLD-IN
};

const rowsHtml = ROWS.map((r) => {
  const barCur = bar(r.cur, MAX_WEEKLY, '#fca5a5');
  const barProp = r.prop > 0 ? bar(r.prop, MAX_WEEKLY, '#86efac') : '<span style="color:#94a3b8;font-size:11px">(zero)</span>';
  return `
<tr style="border-bottom:1px solid #e2e8f0">
<td style="padding:10px 12px;vertical-align:top;font-size:12px;color:#1e293b;width:30%">${r.source}</td>
<td style="padding:10px 8px;vertical-align:top;width:13%"><div style="font-size:11px;color:#64748b;margin-bottom:3px">${r.cur}/wk</div>${barCur}</td>
<td style="padding:10px 8px;vertical-align:top;width:13%"><div style="font-size:11px;color:#64748b;margin-bottom:3px">${r.prop}/wk</div>${barProp}</td>
<td style="padding:10px 8px;vertical-align:top;width:13%"><span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:3px;${actionStyle(r.action)}">${r.action}</span></td>
<td style="padding:10px 12px;vertical-align:top;font-size:11px;color:#475569;width:31%">${r.why}</td>
</tr>`;
}).join('');

const HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 800px;">

<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Inbox COS plan v3 &middot; scoped per your feedback</div>
<h1 style="margin:6px 0;font-size:22px;font-weight:800;line-height:1.3;color:white">Inbox COS-only: ${TOTAL_CUR}/wk &rarr; ${TOTAL_PROP}/wk (${PCT}% of current)</h1>
</div>

<div style="padding:24px 28px">

<p>Ali,</p>

<p>You clarified the goal is to quiet Inbox COS specifically, not the wider notification system. Rebuilt the plan scoped to Inbox COS senders only. And yes, the v2 email you flagged is exactly the false positive this plan fixes: the keyword classifier matched a body word and pinged you about a routine proposal email. It is the headline thing being removed here.</p>

${SVG_DIAGRAM}

<h2 style="margin:28px 0 10px;color:#1a365d;font-size:18px">Per-sender breakdown</h2>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:1px">Source</th>
<th style="padding:10px 8px;text-align:left;font-size:11px;letter-spacing:1px">Now</th>
<th style="padding:10px 8px;text-align:left;font-size:11px;letter-spacing:1px">After</th>
<th style="padding:10px 8px;text-align:left;font-size:11px;letter-spacing:1px">Change</th>
<th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:1px">How</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr style="background:#f1f5f9;font-weight:700">
<td style="padding:10px 12px;font-size:12px;color:#1e293b">TOTAL</td>
<td style="padding:10px 8px;font-size:12px;color:#991b1b">${TOTAL_CUR}/wk</td>
<td style="padding:10px 8px;font-size:12px;color:#166534">${TOTAL_PROP}/wk</td>
<td style="padding:10px 8px;font-size:11px;color:#1a365d">${CUT}% cut</td>
<td style="padding:10px 12px;font-size:11px;color:#475569">~${PCT}% of current volume</td>
</tr></tfoot>
</table>

<h2 style="margin:28px 0 10px;color:#1a365d;font-size:18px">What stays vs what changes</h2>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif;font-size:13px;margin-bottom:20px">
<thead><tr style="background:#f1f5f9">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;color:#1a365d">Still arrives</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;color:#1a365d">Goes away</th>
</tr></thead>
<tbody><tr>
<td style="padding:14px;vertical-align:top;border-right:1px solid #e2e8f0;background:#f0fdf4">
<ul style="margin:0;padding-left:18px;line-height:1.8;color:#166534">
<li>VIP detected — real humans (24/wk)</li>
<li>Meeting prep 15 min ahead (38/wk)</li>
<li>7am morning summary + merged calendar brief (6/wk)</li>
<li>Quiet keyword pings — narrowed to 4 real words, subject-only, 24h dedupe (~10/wk)</li>
<li>ASK_USER digest — capped at 2/day (~14/wk)</li>
</ul>
</td>
<td style="padding:14px;vertical-align:top;background:#fef2f2">
<ul style="margin:0;padding-left:18px;line-height:1.8;color:#991b1b">
<li>"urgent" keyword body-matches on promo emails (74/wk)</li>
<li>ASK_USER SMS-path duplicate of the digest (18/wk)</li>
<li>Standalone calendar-conflict ping (21/wk, folds into 7am brief)</li>
<li>Auth-expired loop on container restarts (16/wk of the 17)</li>
<li>4-hour digest cadence dropped to 12-hour (19/wk)</li>
</ul>
</td>
</tr></tbody>
</table>

<h2 style="margin:28px 0 10px;color:#1a365d;font-size:18px">Code changes if you give the green light</h2>

<ol style="padding-left:22px;line-height:1.7;font-size:13px">
<li><code>inboxScheduler.ts:77-98</code> — delete Timer 5 (the SMS-path duplicate). Bump <code>DIGEST_INTERVAL</code> at line 13 from 4h to 12h.</li>
<li><code>smsAlertService.ts:20-24</code> — drop "urgent" from the keyword list. Pass subject only into <code>detectUrgentKeywords()</code>; stop scanning bodies.</li>
<li><code>smsAlertService.ts:75-88</code> — in <code>alertUrgentEmail()</code>, check a new <code>inbox_alert_log</code> table for (sender, keyword) within 24h before sending.</li>
<li><code>smsAlertService.ts:128-153</code> — in <code>alertSyncFailure()</code>, swap the in-process Map throttle for an <code>inbox_alert_log</code> row keyed on outage. Same auth failure stays quiet across container restarts.</li>
<li>New migration: <code>inbox_alert_log(id, alert_kind, dedup_key, sent_at)</code>. Tiny table, fast index on <code>(alert_kind, dedup_key, sent_at)</code>.</li>
<li><code>calendarIntelligenceService.ts</code> — fold "N conflicts today" into <code>getCalendarBrief()</code>. Remove the standalone send path.</li>
</ol>

<p style="margin-top:24px;padding:14px 18px;background:#fefce8;border-left:4px solid #fbbf24;border-radius:4px;font-size:13px;color:#713f12">
<strong>Reply "ship it"</strong> on the BC thread and I roll all six changes in one PR + redeploy + watch <code>inbox_emails</code> for 48 hours to confirm the drop. <strong>Reply with edits</strong> if any source should stay louder or get cut harder.
</p>

<p style="margin-top:18px;font-size:13px;color:#475569">
<strong>Tracked at:</strong> <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/${TICKET_ID}" style="color:#2b6cb0">BC todo ${TICKET_ID}</a> (same thread as v2).
</p>

</div>

${SIG_HTML}

</div>`;

const TEXT = `Ali,

You clarified the goal is to quiet Inbox COS specifically, not the wider notification system. Rebuilt the plan scoped to Inbox COS senders only.

The v2 email you flagged is exactly the false positive this plan fixes: the keyword classifier matched a body word in a routine proposal email and pinged you about it. That kind of trigger is the headline thing going away.

INBOX COS WEEKLY VOLUME:
- Now: ${TOTAL_CUR} emails/wk from Inbox COS senders alone
- After: ${TOTAL_PROP} emails/wk (${PCT}% of current, ${CUT}% cut)

WHAT GOES AWAY:
- "urgent" keyword body-matches on promo emails (74/wk)
- ASK_USER SMS-path duplicate of the digest (18/wk)
- Standalone calendar-conflict ping (21/wk, folds into 7am brief)
- Auth-expired loop on container restarts (16/wk)
- 4-hour ASK_USER digest cadence dropped to 12h (19/wk)

WHAT STAYS:
- VIP detected real humans (24/wk)
- Meeting prep 15 min ahead (38/wk)
- 7am morning summary + merged calendar brief (6/wk)
- Quiet keyword pings: 4 real words, subject-only, 24h dedupe (~10/wk)
- ASK_USER digest at 12h cadence, suppressed when nothing new (~14/wk)

SIX CODE CHANGES:
1. Delete Timer 5 SMS-path duplicate; bump digest interval 4h to 12h
2. Drop "urgent" keyword; subject-only matching
3. Add 24h dedupe per (sender, keyword) backed by new inbox_alert_log table
4. Persist auth-expired dedupe to DB so container restarts don't re-fire
5. New tiny inbox_alert_log migration
6. Fold "N conflicts today" into the 7am brief

Reply "ship it" on the BC thread and I roll all six in one PR + redeploy + watch inbox_emails for 48h to confirm the drop. Reply with edits otherwise.

Tracked at: https://app.basecamp.com/3945211/buckets/7463955/todos/${TICKET_ID}

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: TICKET_ID,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: `Inbox COS plan v3 - scoped to Inbox COS only (${TOTAL_CUR}/wk -> ${TOTAL_PROP}/wk, ${CUT}% cut)`,
    html: HTML,
    text: TEXT,
    bcSummary: `<p>Inbox COS-only tone-down v3 sent to Ali. Narrowed scope per his feedback: v2 covered the broader system, v3 covers only emails originating from Inbox COS code paths (smsAlertService.ts, inboxScheduler.ts, calendarIntelligenceService.ts). Inbox COS volume last 7 days: ${TOTAL_CUR}/wk. Proposed: ${TOTAL_PROP}/wk (${PCT}% of current). Six code changes vs ten in v2. Body of this email written keyword-safe so the classifier does not fire on the proposal itself.</p>`,
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
