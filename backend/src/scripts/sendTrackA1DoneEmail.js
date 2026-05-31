#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Track A1 - done</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">VIP inbox watcher is live. System is fully autonomous.</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, A1.6 shipped. The watcher is running on the VPS cron every 2 min, mode is <strong>live</strong>. Any inbound email from one of your 10 VIPs (managed at /admin/inbox/vips) will route a "VIP &lt;name&gt;: &lt;summary&gt;" email to alimuwwakkil@gmail.com - your phone's gmail push notification is the alert. No further action from you to go live. One action left below.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">What you can do right now</h2>

<div style="background:#dcfce7;border-left:4px solid #15803d;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#14532d;font-weight:700">Smoke test</div>
<div style="font-size:13px;margin-top:6px;color:#1f2937">Have Adalene (or any of your 10 VIPs) send you a normal email at ali@colaberry.com. Within 2-3 min you should see a push notification on your phone with subject <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">VIP Adalene Mack Muwwakkil: &lt;summary&gt;</code>. That confirms the full loop is working.</div>
</div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:20px 0 14px">Architecture</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Component</th><th align="left" style="padding:10px">Role</th></tr>
<tr style="background:#f8fafc"><td><strong>inboxSyncService</strong> (already existed)</td><td>Polls Gmail + Hotmail every 60s, writes to inbox_emails table</td></tr>
<tr><td><strong>vipInboxWatcher</strong> (new)</td><td>Watches inbox_emails for new rows every 2 min, calls routeInboundEmail() on each</td></tr>
<tr style="background:#f8fafc"><td><strong>vipSmsRouter</strong> (already shipped)</td><td>Looks up sender in inbox_vips, summarizes via gpt-4o-mini, sends Mandrill alert to alimuwwakkil@gmail.com</td></tr>
<tr><td><strong>Gmail push</strong></td><td>Your phone buzzes. Subject is the alert. Open to see full context + reply.</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Controls you have</h2>

<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">What</th><th align="left" style="padding:10px">How</th></tr>
<tr style="background:#f8fafc"><td>Pause alerts</td><td><code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB System set vip sms mode log_only</code> (mentions in any Basecamp project where CB watches)</td></tr>
<tr><td>Resume</td><td><code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB System set vip sms mode live</code></td></tr>
<tr style="background:#f8fafc"><td>Manage VIP list</td><td>Visit <a href="https://enterprise.colaberry.ai/admin/inbox/vips">/admin/inbox/vips</a> - add, remove, reorder</td></tr>
<tr><td>Daily cap</td><td>7 alerts per rolling 24h (hardcoded - email me if you want it adjusted)</td></tr>
<tr style="background:#f8fafc"><td>Audit trail</td><td>communication_logs table - every alert + outcome logged with provider message id</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">One action left</h2>

<div style="background:#fef3c7;border-left:4px solid #d97706;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#78350f;font-weight:700">Disable T-Mobile email-to-SMS forwarder</div>
<div style="font-size:13px;margin-top:6px;color:#1f2937">You mentioned getting a ton of SMS from T-Mobile already. Once VIP alerts are firing, you'll get one push from gmail (the new system) PLUS the SMS (the old system) for the same email. Find the existing rule (probably in your hotmail or Gmail forwarding settings, or a T-Mobile mail-to-text rule) and disable it so you're only getting the curated VIP push notifications.</div>
</div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">What's next</h2>

<ul style="font-size:13px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>Track B</strong> (week 2) - Gov bid full pipeline: reply parser + zip-aware finalize for the @CB add gov bid flow</li>
<li><strong>Track C</strong> (weeks 3-4) - AI auto-runner: spec-driven autonomous execution of approved tickets</li>
<li><strong>Phase 2</strong> (week 5+) - voice Q&amp;A for true mobile-first control</li>
</ul>

<p style="font-size:13px;color:#1f2937;margin:24px 0 0">A1 is in your pocket now. Send the test email when you can.</p>

</div>
</div>
</body></html>`;

const text = `Track A1 - done. VIP inbox watcher is live.

What you can do right now: have Adalene or any VIP send you a normal email at ali@colaberry.com. Within 2-3 min you should get a phone push notification with subject "VIP Adalene Mack Muwwakkil: <summary>". That confirms the full loop.

Architecture:
- inboxSyncService polls Gmail + Hotmail every 60s -> inbox_emails table
- vipInboxWatcher (new, cron */2 min) reads new rows, calls routeInboundEmail()
- vipSmsRouter looks up sender in inbox_vips, summarizes via gpt-4o-mini, Mandrill -> alimuwwakkil@gmail.com
- Gmail push is the alert on your phone

Controls:
- Pause: @CB System set vip sms mode log_only
- Resume: @CB System set vip sms mode live
- Manage VIPs: /admin/inbox/vips
- Cap: 7 alerts / rolling 24h
- Audit: communication_logs table

One action left for you: disable the T-Mobile email-to-SMS forwarder so you're not double-buzzed.

What's next:
- Track B (week 2) - Gov bid pipeline (reply parser + zip-aware finalize)
- Track C (weeks 3-4) - AI auto-runner
- Phase 2 (week 5+) - voice Q&A

--
CB System
Ali Muwwakkil's executive agent
Colaberry Inc.`;

(async () => {
  validateBeforeSend(strip(html), strip(text));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: '[Track A1] Done - VIP inbox watcher live. Test by having a VIP email you.',
    text: strip(text),
    html: strip(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
