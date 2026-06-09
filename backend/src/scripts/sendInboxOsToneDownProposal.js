#!/usr/bin/env node
// Inbox OS tone-down v2 proposal email to Ali. Sends HTML with an SVG
// before/after diagram + per-source cut/consolidate/keep breakdown.
// Attaches to a new Ali Personal BC todo so the approval is tracked.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));

const BC_ACCOUNT = 3945211;
const ALI_PERSONAL_PROJECT = 7463955;
const ALI_PERSONAL_TODOLIST = 9939449052;
const ALI_USER_ID = 17454835;

const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};

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

// Volume bar — relative widths from the 7-day audit
function bar(weekly, max, color) {
  const pct = Math.max(1, Math.round((weekly / max) * 100));
  return `<div style="display:inline-block;width:${pct}%;height:14px;background:${color};border-radius:2px;vertical-align:middle"></div>`;
}

const MAX_WEEKLY = 320;

const ROWS = [
  { source: 'Mandrill webhook alert (broken webhook self-spam)', cur: 231, prop: 0, action: 'KILL', why: 'Fix the broken webhook OR mute the Mandrill account alarm. This is the webhook breaking + alerting that the webhook is breaking + alerting that the alert is breaking. Pure self-spam.' },
  { source: 'System Health "1 critical" (same issue, no dedup)', cur: 300, prop: 5, action: 'DEDUP', why: 'Same critical re-fires every cron tick. Add `(critical_id, day)` idempotency key. One email per critical per day max.' },
  { source: 'InboxCOS URGENT keyword classifier', cur: 161, prop: 25, action: 'NARROW + DEDUP', why: 'Narrow 12 keywords → 5 (urgent, asap, emergency, deadline, action required). Subject-only match (not body). 24h dedupe per (sender, keyword). Kills promo/coupon false positives.' },
  { source: 'Daily project dashboards (8 separate emails × 5 days)', cur: 80, prop: 5, action: 'CONSOLIDATE', why: 'One "Daily Ops" email per weekday at 9 AM CT. Collapsible per-project sections inside. You currently get 8 staggered hourly emails from 8 AM-3 PM CT.' },
  { source: 'CC alimuwwakkil@gmail.com on every report', cur: 80, prop: 0, action: 'STRIP', why: 'Reports already go to ali@colaberry.com. The Gmail CC doubles inbox volume. Pick one mailbox. (Gmail mobile push for VIP-only stays.)' },
  { source: 'Cory daily + P4 retro + Decisions Owed + Admin Digest', cur: 30, prop: 5, action: 'MERGE', why: 'Four end-of-day digests overlap. Keep Cory only (warmest, most personal). Kill the other three.' },
  { source: 'InboxCOS double-fire (digest + SMS alert, same 4h)', cur: 25, prop: 0, action: 'DEDUP', why: 'Drop the SMS-alert email (Timer 5). The 4h digest (Timer 3) already covers it.' },
  { source: 'Inbox COS sync failed (auth expired loop)', cur: 17, prop: 1, action: 'DEDUP', why: 'Same auth-expired re-fires every tick. Emit once, suppress until resolved.' },
  { source: 'Duplicate ExecutiveAwarenessMorningDigest', cur: 7, prop: 0, action: 'KILL', why: 'Same schedule as DailyExecutiveBriefing — sends the same content twice at 6:45 AM CT.' },
  { source: '[Reporting Audit] self-audit email', cur: 5, prop: 0, action: 'KILL', why: 'Log to portal instead of emailing. "An email reporting that an email was sent" is meta-noise.' },
  { source: 'Twilio error alarm (external account)', cur: 42, prop: 0, action: 'MUTE', why: 'Mute on the Twilio side. Errors show up in admin observability already.' },
  { source: 'VIP Inbox Watcher (signal-rich, real humans)', cur: 10, prop: 10, action: 'KEEP', why: 'High signal. These are real VIPs flagged for you.' },
  { source: 'Calendar conflicts + 15-min meeting prep', cur: 22, prop: 22, action: 'KEEP', why: 'Operational. Low volume. High value.' },
  { source: 'Weekly digests (5 weekly briefings)', cur: 5, prop: 5, action: 'KEEP', why: 'Weekly is the right cadence for cross-system roll-ups.' },
  { source: 'Cory end-of-day briefing', cur: 12, prop: 5, action: 'KEEP (1/wkday)', why: 'Personal-tone end-of-day briefing. Keep at 1 per weekday; today it sends ~2/day in places.' },
  { source: 'Opportunity Pulse + ad-hoc triggers', cur: 8, prop: 8, action: 'KEEP', why: 'Trigger-based and signal-rich.' },
];

const TOTAL_CUR = ROWS.reduce((s, r) => s + r.cur, 0);
const TOTAL_PROP = ROWS.reduce((s, r) => s + r.prop, 0);

const SVG_DIAGRAM = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 380" style="width:100%;max-width:720px;height:auto;background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px">
  <text x="360" y="28" text-anchor="middle" font-family="arial" font-size="16" font-weight="800" fill="#1a365d">Inbox OS Weekly Email Volume to Ali</text>
  <text x="360" y="48" text-anchor="middle" font-family="arial" font-size="12" fill="#64748b">Last 7 days (prod inbox_emails table) vs. proposed</text>

  <!-- Now bar -->
  <text x="40" y="100" font-family="arial" font-size="13" font-weight="700" fill="#475569">NOW</text>
  <rect x="40" y="110" width="640" height="38" fill="#dc2626" rx="4"/>
  <text x="360" y="135" text-anchor="middle" font-family="arial" font-size="20" font-weight="800" fill="white">${TOTAL_CUR} emails / week</text>

  <!-- Arrow -->
  <line x1="360" y1="170" x2="360" y2="200" stroke="#475569" stroke-width="2"/>
  <polygon points="354,195 360,210 366,195" fill="#475569"/>

  <!-- After bar -->
  <text x="40" y="240" font-family="arial" font-size="13" font-weight="700" fill="#475569">AFTER</text>
  <rect x="40" y="250" width="${Math.round((TOTAL_PROP / TOTAL_CUR) * 640)}" height="38" fill="#16a34a" rx="4"/>
  <text x="${40 + Math.round((TOTAL_PROP / TOTAL_CUR) * 640) + 12}" y="275" font-family="arial" font-size="18" font-weight="800" fill="#16a34a">${TOTAL_PROP} emails / week</text>

  <!-- Reduction callout -->
  <text x="360" y="335" text-anchor="middle" font-family="arial" font-size="14" font-weight="700" fill="#1a365d">${Math.round((1 - TOTAL_PROP / TOTAL_CUR) * 100)}% reduction &middot; ${TOTAL_CUR - TOTAL_PROP} fewer emails per week</text>
  <text x="360" y="355" text-anchor="middle" font-family="arial" font-size="11" fill="#64748b">Volume cut to ${Math.round((TOTAL_PROP / TOTAL_CUR) * 100)}% of current. Target was ~10%.</text>
</svg>`;

const actionStyle = (a) => {
  if (a.startsWith('KILL') || a === 'MUTE') return 'background:#fee2e2;color:#991b1b';
  if (a.startsWith('KEEP')) return 'background:#dcfce7;color:#166534';
  if (a === 'STRIP' || a === 'DEDUP' || a === 'NARROW + DEDUP') return 'background:#fef3c7;color:#92400e';
  return 'background:#dbeafe;color:#1e40af'; // CONSOLIDATE, MERGE
};

const rowsHtml = ROWS.map((r) => {
  const barCur = bar(r.cur, MAX_WEEKLY, '#fca5a5');
  const barProp = r.prop > 0 ? bar(r.prop, MAX_WEEKLY, '#86efac') : '<span style="color:#94a3b8;font-size:11px">(none)</span>';
  return `
<tr style="border-bottom:1px solid #e2e8f0">
<td style="padding:10px 12px;vertical-align:top;font-size:12px;color:#1e293b;width:34%">${r.source}</td>
<td style="padding:10px 8px;vertical-align:top;width:14%"><div style="font-size:11px;color:#64748b;margin-bottom:3px">${r.cur}/wk</div>${barCur}</td>
<td style="padding:10px 8px;vertical-align:top;width:14%"><div style="font-size:11px;color:#64748b;margin-bottom:3px">${r.prop}/wk</div>${barProp}</td>
<td style="padding:10px 8px;vertical-align:top;width:11%"><span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:3px;${actionStyle(r.action)}">${r.action}</span></td>
<td style="padding:10px 12px;vertical-align:top;font-size:11px;color:#475569;width:27%">${r.why}</td>
</tr>`;
}).join('');

const HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 800px;">

<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Inbox OS Tone-Down v2 - For Your Review</div>
<h1 style="margin:6px 0;font-size:22px;font-weight:800;line-height:1.3;color:white">Cut automated email volume from ${TOTAL_CUR}/wk to ${TOTAL_PROP}/wk (~${Math.round((TOTAL_PROP / TOTAL_CUR) * 100)}%)</h1>
</div>

<div style="padding:24px 28px">

<p>Ali,</p>

<p>You asked for a ~10% volume on Inbox OS automated emails. I audited the last 7 days of inbound to your three mailboxes (ali@colaberry.com + alimuwwakkil@gmail.com + Ali_Muwwakkil@hotmail.com) against the actual <code>inbox_emails</code> table in prod. Here's what the numbers look like and what I'd change.</p>

${SVG_DIAGRAM}

<h2 style="margin:28px 0 10px;color:#1a365d;font-size:18px">The big four (these alone = ${231+300+161+80} of ${TOTAL_CUR}/wk = ${Math.round(((231+300+161+80)/TOTAL_CUR)*100)}% of the noise)</h2>

<ol style="padding-left:22px;line-height:1.7">
<li><strong>Mandrill webhook alert loop - 231/wk.</strong> The Mandrill webhook is broken. Mandrill keeps alerting us about the broken webhook. Fix the webhook OR mute the alarm. Either way, this drops to 0.</li>
<li><strong>System Health "1 critical" - 300/wk.</strong> The same critical issue re-fires every cron tick because we never wrote an idempotency check. Add a <code>(critical_id, day)</code> dedupe. ~300/wk -&gt; ~5/wk.</li>
<li><strong>URGENT keyword classifier - 161/wk.</strong> Triggers on 12 keywords in email bodies. "Final notice", "last chance" promo emails trip it. Narrow to 5 keywords, subject-only, 24h dedupe. ~161/wk -&gt; ~25/wk.</li>
<li><strong>8 staggered daily project dashboards - 80/wk.</strong> 8 reports x 5 weekdays. Consolidate into <strong>one "Daily Ops" email</strong> at 9 AM CT with collapsible per-project sections. ~80/wk -&gt; ~5/wk.</li>
</ol>

<h2 style="margin:28px 0 10px;color:#1a365d;font-size:18px">Full per-source breakdown</h2>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:1px">Source</th>
<th style="padding:10px 8px;text-align:left;font-size:11px;letter-spacing:1px">Now</th>
<th style="padding:10px 8px;text-align:left;font-size:11px;letter-spacing:1px">After</th>
<th style="padding:10px 8px;text-align:left;font-size:11px;letter-spacing:1px">Action</th>
<th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:1px">Why</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr style="background:#f1f5f9;font-weight:700">
<td style="padding:10px 12px;font-size:12px;color:#1e293b">TOTAL</td>
<td style="padding:10px 8px;font-size:12px;color:#991b1b">${TOTAL_CUR}/wk</td>
<td style="padding:10px 8px;font-size:12px;color:#166534">${TOTAL_PROP}/wk</td>
<td style="padding:10px 8px;font-size:11px;color:#1a365d">${Math.round((1 - TOTAL_PROP / TOTAL_CUR) * 100)}% cut</td>
<td style="padding:10px 12px;font-size:11px;color:#475569">~${Math.round((TOTAL_PROP / TOTAL_CUR) * 100)}% of current volume</td>
</tr></tfoot>
</table>

<h2 style="margin:28px 0 10px;color:#1a365d;font-size:18px">What stays vs. what changes</h2>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif;font-size:13px;margin-bottom:20px">
<thead><tr style="background:#f1f5f9">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;color:#1a365d">What you'll still see daily</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;color:#1a365d">What disappears</th>
</tr></thead>
<tbody><tr>
<td style="padding:14px;vertical-align:top;border-right:1px solid #e2e8f0;background:#f0fdf4">
<ul style="margin:0;padding-left:18px;line-height:1.8;color:#166534">
<li>1 Cory morning briefing ("here's what's on your plate")</li>
<li>1 "Daily Ops" roll-up (was 8 project emails)</li>
<li>Real VIP messages (humans, hand-flagged)</li>
<li>15-min meeting prep + calendar conflicts</li>
<li>Triggered alerts only when actually critical (with dedup)</li>
</ul>
</td>
<td style="padding:14px;vertical-align:top;background:#fef2f2">
<ul style="margin:0;padding-left:18px;line-height:1.8;color:#991b1b">
<li>Mandrill webhook self-spam (231/wk)</li>
<li>Duplicate system-health alerts (300/wk)</li>
<li>Promo-email URGENT false positives (~135/wk)</li>
<li>7 of 8 separate project dashboards (consolidated)</li>
<li>CC to your Gmail on every report (~80/wk)</li>
<li>The "an email was sent" audit email</li>
<li>Twilio account alarms (mute in Twilio)</li>
</ul>
</td>
</tr></tbody>
</table>

<h2 style="margin:28px 0 10px;color:#1a365d;font-size:18px">Code changes I'll make if you approve</h2>

<ol style="padding-left:22px;line-height:1.7;font-size:13px">
<li>Add idempotency key <code>(critical_id, date)</code> in <code>systemHealthAgent.ts</code> alert path. Same critical = 1 email per day max.</li>
<li>Add 24h dedupe in <code>smsAlertService.ts</code> URGENT classifier. Narrow keyword list. Subject-only match.</li>
<li>Strip <code>alimuwwakkil@gmail.com</code> from <code>STANDARD_RECIPIENTS</code> in <code>reportingRegistry.js:18</code>.</li>
<li>Build a new <code>runDailyOpsRollup.js</code> that calls each project's report generator inline and ships ONE email at 9 AM CT. Disable the 8 individual scripts via <code>skipFlag</code>. Existing scripts stay runnable on demand.</li>
<li>Drop <code>ExecutiveAwarenessMorningDigest</code> cron registration in <code>aiOpsScheduler.ts</code> (duplicate of <code>DailyExecutiveBriefing</code>).</li>
<li>Replace <code>[Reporting Audit]</code> email with a portal log entry.</li>
<li>Drop <code>InboxCOS</code> Timer 5 SMS-alert email (Timer 3 digest covers it).</li>
<li>Add suppression on auth-expired notice (one email per outage, not per cron tick).</li>
<li>Investigate the broken Mandrill webhook root-cause OR mute the Mandrill alarm.</li>
<li>Mute Twilio account email alarms (Twilio console, not code).</li>
</ol>

<p style="margin-top:24px;padding:14px 18px;background:#fefce8;border-left:4px solid #fbbf24;border-radius:4px;font-size:13px;color:#713f12">
<strong>Reply <code>approve</code></strong> and I'll ship all 10 changes in one PR + redeploy + verify the volume drops in the inbox table for 48 hours. <strong>Reply with edits</strong> if any specific source should stay at full freq or be cut harder.
</p>

<p style="margin-top:18px;font-size:13px;color:#475569">
<strong>Tracked at:</strong> Ali Personal BC todo (created with this email — link below in the BC comment).
</p>

</div>

${SIG_HTML}

</div>`;

const TEXT = `Ali,

You asked for ~10% volume on Inbox OS automated emails. I audited the last 7 days of inbound across your 3 mailboxes against the prod inbox_emails table.

CURRENT VOLUME: ${TOTAL_CUR} automated emails/wk
PROPOSED VOLUME: ${TOTAL_PROP} emails/wk (${Math.round((TOTAL_PROP / TOTAL_CUR) * 100)}% of current, ${Math.round((1 - TOTAL_PROP / TOTAL_CUR) * 100)}% reduction)

THE BIG FOUR (${231+300+161+80}/wk = ${Math.round(((231+300+161+80)/TOTAL_CUR)*100)}% of the noise):
1. Mandrill webhook alert loop: 231/wk -> 0. Fix webhook OR mute alarm.
2. System Health "1 critical" no-dedup: 300/wk -> 5/wk. Add (critical_id, day) key.
3. URGENT keyword classifier hits promos: 161/wk -> 25/wk. Narrow keywords, subject-only, 24h dedupe.
4. 8 staggered daily project dashboards: 80/wk -> 5/wk. Consolidate to one "Daily Ops" email.

PLUS:
- Strip cc:alimuwwakkil@gmail.com from STANDARD_RECIPIENTS (80/wk -> 0)
- Drop duplicate ExecutiveAwarenessMorningDigest (same schedule as DailyExecutiveBriefing)
- Dedup inbox auth-expired notice (17/wk -> 1)
- Drop InboxCOS double-fire SMS alert
- Kill [Reporting Audit] self-audit email
- Mute Twilio account alarms

WHAT YOU'LL STILL SEE:
- Cory morning briefing (1/wkday)
- New "Daily Ops" roll-up (1/wkday) replacing 8 separate dashboards
- Real VIP messages (humans)
- 15-min meeting prep + calendar conflicts
- Triggered alerts only when actually critical (with dedup)

Reply "approve" and I ship all 10 changes in one PR + redeploy + verify the volume drops in the inbox table for 48 hours.

${SIG_TEXT}`;

(async () => {
  // Create the BC todo for tracking the approval first
  const todoRes = await axios.post(
    `https://3.basecampapi.com/${BC_ACCOUNT}/buckets/${ALI_PERSONAL_PROJECT}/todolists/${ALI_PERSONAL_TODOLIST}/todos.json`,
    {
      content: 'Inbox OS tone-down v2: cut automated email volume from ~1,090/wk to ~120/wk (~11%)',
      description: 'Proposal sent to Ali for approval. Audit of last 7 days + per-source cut/consolidate/keep plan + 10 specific code changes. Awaiting approve/edits reply.',
      due_on: '2026-06-07',
      assignee_ids: [ALI_USER_ID],
    },
    { headers: BC_HEADERS }
  );
  const ticketId = todoRes.data.id;
  console.log('Created BC todo:', todoRes.data.app_url);

  const r = await sendWithBcAttach({
    ticketId,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: `Inbox OS tone-down v2 for your approval - cut from ${TOTAL_CUR}/wk to ${TOTAL_PROP}/wk (~${Math.round((TOTAL_PROP / TOTAL_CUR) * 100)}%)`,
    html: HTML,
    text: TEXT,
    bcSummary: `<p>Inbox OS tone-down v2 proposal sent to Ali for approval. Audit found ${TOTAL_CUR} automated emails/wk hitting his 3 mailboxes; proposal cuts to ${TOTAL_PROP}/wk (~${Math.round((TOTAL_PROP / TOTAL_CUR) * 100)}% of current). The big four sources accounting for ${231+300+161+80}/wk are Mandrill webhook self-spam, un-deduped system-health critical, URGENT keyword false positives on promo emails, and 8 staggered daily project dashboards. Plan includes 10 specific code changes across systemHealthAgent.ts, smsAlertService.ts, reportingRegistry.js, aiOpsScheduler.ts + a new runDailyOpsRollup.js consolidating 8 dashboards into 1. Ali replies "approve" to ship; replies with edits to adjust.</p>`,
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
