#!/usr/bin/env node
// Email Ali: David ad trigger is live on prod cron. How it works, safety
// gates, kill switch, escalation path.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#0f172a 0%,#14532d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Auto-trigger live</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">David ad trigger is running on prod cron. Every 5 minutes. Awake.</h1>
<div style="font-size:13px;color:#cbd5e0">Next time David replies on the RE Magazine thread, the system catches it within 5 min, applies his edits, renders V5, sends him the reply, and posts to the BC ticket - all without you. If anything's uncertain, it escalates to you instead of guessing.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">How the trigger flow runs (top to bottom)</h2>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px;margin-top:10px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:40px">#</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Step</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>1</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Cron fires on prod every 5 min. Reads <code>tmp/david-ad-trigger-state.json</code> for the last-processed message marker.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>2</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Pulls Gmail thread <code>19e89a52879d4a32</code> via OAuth. Filters for messages from dlahme@. If the latest is the same as the marker, exits silently.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>3</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">New message found. Logs to <code>docs/coop-ad-trigger-log.md</code> with David's verbatim body.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>4</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Sends David's note + the current M4 HTML region to OpenAI GPT-4o. Asks for a JSON edit plan: each edit has intent + exact find string + replace string + confidence 0-1.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>5</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Safety check #1: if ANY edit has confidence &lt; 0.7, abort + escalate to you. No file change, no reply to David.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>6</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Safety check #2: applies each edit as exact string find/replace. If any find string is not in the file (or matches multiple times), abort + escalate. The file only mutates if 100% of edits apply cleanly.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>7</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">All edits applied. Bumps version number (V4 -&gt; V5). Re-renders PDF + captures M4 thumbnail + inlines standalone HTML.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>8</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Safety check #3: if render fails (Playwright crash, broken HTML), rolls back the HTML file + escalates to you.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>9</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Renders OK. Sends David a reply email mirroring the V4 pattern - changelog table + visual + PDF + HTML attached. BCC you and your other inboxes.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>10</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">Posts a comment on the <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9955562788">RE Magazine ad BC ticket</a> with: David's verbatim note, the OpenAI plan, the edit results, the new version number, the Mandrill ID. Per your operating doctrine.</td></tr>
<tr><td style="padding:10px 14px"><strong>11</strong></td><td style="padding:10px 14px">Updates the marker file. Next cron tick will see "no new David reply" and exit silently. Idempotent.</td></tr>
</tbody>
</table>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">The 3 safety gates (everything below this line aborts to you, not David)</h2>
<div style="background:#fef2f2;border-left:5px solid #c1272d;padding:16px 20px;font-size:13px;color:#7f1d1d;border-radius:0 6px 6px 0">
<ol style="margin:0;padding-left:20px;line-height:1.8">
<li><strong>Low-confidence edit:</strong> if OpenAI marks any edit below 0.7 confidence, the whole batch aborts.</li>
<li><strong>Find-string fail:</strong> if a find string is not in the current HTML (or matches multiple places, ambiguous), abort.</li>
<li><strong>Render fail:</strong> if PDF render or thumbnail capture crashes (likely malformed HTML), abort + rollback the file change.</li>
</ol>
<div style="margin-top:10px"><strong>On any abort, you get an escalation email</strong> showing David's note, the proposed plan, the failure reason, and explicit instruction to open the source HTML, apply manually, then re-run with <code>--replay</code>.</div>
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Kill switch</h2>
<div style="background:#0f172a;color:white;padding:18px 22px;border-radius:8px;font-size:13px">
<div style="color:#cbd5e0;margin-bottom:6px">If at any point you want to stop the trigger - because David is in a delicate negotiation, because you want to handle the next reply manually, because something feels off:</div>
<pre style="background:#1e293b;color:#fbbf24;padding:10px 14px;border-radius:4px;font-family:'Courier New',monospace;font-size:12px;margin:0;overflow-x:auto">ssh root@95.216.199.47 "touch /opt/colaberry-accelerator/tmp/david-trigger-killed.flag"</pre>
<div style="color:#cbd5e0;margin-top:6px">Next cron tick reads the flag, exits silently, leaves nothing in your inbox. To re-enable:</div>
<pre style="background:#1e293b;color:#fbbf24;padding:10px 14px;border-radius:4px;font-family:'Courier New',monospace;font-size:12px;margin:8px 0 0;overflow-x:auto">ssh root@95.216.199.47 "rm /opt/colaberry-accelerator/tmp/david-trigger-killed.flag"</pre>
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Where everything lives</h2>
<ul style="font-size:13px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>Script:</strong> <code>backend/src/scripts/processDavidAdReply.js</code></li>
<li><strong>Marker file:</strong> <code>tmp/david-ad-trigger-state.json</code></li>
<li><strong>Log file:</strong> <code>/var/log/david-ad-trigger.log</code> on prod (every cron tick appends)</li>
<li><strong>Source HTML:</strong> <code>docs/coop-ad-mockups-2026-06-02.html</code> (the trigger mutates this in place)</li>
<li><strong>Standalone HTML:</strong> <code>docs/coop-ad-mockups-2026-06-02-standalone.html</code> (re-inlined on every iteration)</li>
<li><strong>BC ticket:</strong> <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9955562788">RE Magazine July ad - David Lahme list</a></li>
<li><strong>Cron entry:</strong> <code>*/5 * * * *</code> on prod root crontab</li>
</ul>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Honest limitations to know about</h2>
<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:16px 20px;font-size:13px;color:#78350f;border-radius:0 6px 6px 0">
<ul style="margin:0;padding-left:20px;line-height:1.7">
<li><strong>Strategic questions get flagged as ambiguities, not auto-answered.</strong> When David asks "should we combine Rate Case + Compliance?" the system surfaces that to you in the BC comment and the reply - it does not pick.</li>
<li><strong>The trigger only edits Mockup 4.</strong> If David starts talking about M1/M3 in his next reply, the OpenAI prompt is scoped to M4 - other mockups will likely get flagged as ambiguities. Tell me if you want me to expand scope.</li>
<li><strong>Auto-applied ROI numbers are still placeholders.</strong> The trigger does not invent or update numerical claims. If David adds new stats, those become low-confidence edits and escalate.</li>
<li><strong>One cycle = one David reply.</strong> If David sends two emails in rapid succession, the second one waits for the next cron tick (max 5 min lag).</li>
</ul>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Trigger is hot. If David replies in the next hour, you should see one of two things in your inbox: a "V5 sent to David" notification via BCC, or an escalation email asking for your judgment. If it goes badly, hit the kill switch above and tell me what went wrong - I will tighten the gates.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = strip(`Ali - David ad trigger is live on prod cron. Every 5 min.

FLOW:
1. Cron fires every 5 min. Reads marker file.
2. Pulls Gmail thread 19e89a52879d4a32. Filters for dlahme@. If latest = marker, exits silently.
3. New message: logs verbatim to docs/coop-ad-trigger-log.md.
4. Sends David's note + M4 HTML region to OpenAI GPT-4o. Gets JSON edit plan.
5. SAFETY GATE 1: any edit confidence <0.7 -> abort + escalate to you.
6. SAFETY GATE 2: any find string not in file (or ambiguous) -> abort + escalate.
7. All clean: bumps version (V4->V5), renders PDF + thumb + inlines standalone.
8. SAFETY GATE 3: render fails -> rollback file + escalate.
9. Render OK: sends David reply (changelog + visual + PDF + HTML), BCCs you.
10. Posts BC ticket comment with full audit (David's note, plan, results, Mandrill id).
11. Updates marker. Next tick exits silently. Idempotent.

KILL SWITCH:
ssh root@95.216.199.47 "touch /opt/colaberry-accelerator/tmp/david-trigger-killed.flag"
To re-enable: rm that flag.

WHERE THINGS LIVE:
- Script: backend/src/scripts/processDavidAdReply.js
- Marker: tmp/david-ad-trigger-state.json
- Log: /var/log/david-ad-trigger.log on prod
- HTML: docs/coop-ad-mockups-2026-06-02.html
- BC ticket: https://app.basecamp.com/3945211/buckets/7463955/todos/9955562788

LIMITATIONS:
- Strategic questions (combine RC+CC?) -> flagged as ambiguity, NOT auto-answered.
- Scope is Mockup 4 only. If David edits M1/M3/M5, those flag as ambiguities.
- ROI numerical claims are not invented or updated.
- One reply per cron tick. If 2 emails arrive together, second waits ~5 min.

If David replies in the next hour, you'll see either a V5 notification via BCC, or an escalation asking for your judgment.

Ali`);

(async () => {
  validateBeforeSend(strip(HTML), TEXT);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ali - David ad auto-trigger is live (prod cron, 5-min poll, 3 safety gates, kill switch documented)',
    text: TEXT, html: strip(HTML),
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
