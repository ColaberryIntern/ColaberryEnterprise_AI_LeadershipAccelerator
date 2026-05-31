#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Track A1 - corrected</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">Router now uses your existing Inbox VIP manager</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, good catch on the existing VIP page. I had built a parallel table - now scrapped. Router is re-pointed at the <code>inbox_vips</code> table managed at <a href="https://enterprise.colaberry.ai/admin/inbox" style="color:#fbbf24">/admin/inbox</a>. Your 10 existing VIPs (Adalene priority 1, Lakeesha CPA, Luda, Ram, Karun, etc.) are the source of truth.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">What changed</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Before</th><th align="left" style="padding:10px">Now</th></tr>
<tr style="background:#f8fafc"><td>New <code>vip_contacts</code> Postgres table (parallel)</td><td>Dropped. Router reads from existing <code>inbox_vips</code>.</td></tr>
<tr><td>@CB tools: <code>vip_add</code>, <code>vip_remove</code>, <code>vip_list</code>, <code>set_vip_sms_mode</code></td><td>Pruned to <code>vip_list</code> (read-only) + <code>set_vip_sms_mode</code>. Add/remove happens at <a href="https://enterprise.colaberry.ai/admin/inbox">/admin/inbox</a>, single source of truth.</td></tr>
<tr style="background:#f8fafc"><td>My suggested seed list of 13 names</td><td>Replaced with what you already have: 10 real VIPs already configured.</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Your current VIP list (from inbox_vips)</h2>

<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:8px">Name</th><th align="left" style="padding:8px">Email</th><th align="left" style="padding:8px">Relationship</th><th align="center" style="padding:8px">Priority</th></tr>
<tr style="background:#f8fafc"><td>Adalene Mack Muwwakkil</td><td>addie.m.mack@gmail.com</td><td>spouse</td><td align="center">1</td></tr>
<tr><td>Lakeesha Browne, CPA</td><td>keesha@lvbrownecpa.com</td><td>service_provider</td><td align="center">5</td></tr>
<tr style="background:#f8fafc"><td>Lakeesha Browne (info inbox)</td><td>info@lvbrownecpa.com</td><td>service_provider</td><td align="center">5</td></tr>
<tr><td>Lahameen Latifah Hameen</td><td>lahameen@gmail.com</td><td>family</td><td align="center">10</td></tr>
<tr style="background:#f8fafc"><td>Karun Swaroop</td><td>karun@colaberry.com</td><td>business</td><td align="center">30</td></tr>
<tr><td>Luda Kopeikina</td><td>ludakopeikina@gmail.com</td><td>business</td><td align="center">30</td></tr>
<tr style="background:#f8fafc"><td>Vivek Mukhatyar</td><td>vivmuk@gmail.com</td><td>business</td><td align="center">30</td></tr>
<tr><td>Jackie Chalk</td><td>jackie@colaberry.com</td><td>business</td><td align="center">40</td></tr>
<tr style="background:#f8fafc"><td>Sai Tejesh Kowtharapu</td><td>saitejesh@colaberry.com</td><td>business</td><td align="center">40</td></tr>
<tr><td>Ram</td><td>ram@colaberry.com</td><td>business</td><td align="center">50</td></tr>
</table>

<div style="font-size:12px;color:#64748b;margin-top:8px"><em>Lower priority = more important. Add / edit / remove at <a href="https://enterprise.colaberry.ai/admin/inbox">/admin/inbox</a>.</em></div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Router smoke test (just ran)</h2>

<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px">
<tr><td style="color:#475569;width:200px"><strong>Mode</strong></td><td><code>log_only</code> (no Twilio yet)</td></tr>
<tr><td style="color:#475569"><strong>SMS sent last 24h</strong></td><td>0 (cap 7)</td></tr>
<tr><td style="color:#475569"><strong>Lookup: Adalene</strong></td><td>matched - priority 1, spouse</td></tr>
<tr><td style="color:#475569"><strong>Lookup: random@example.com</strong></td><td>null (correctly NOT routed)</td></tr>
<tr><td style="color:#475569"><strong>Total VIPs visible to router</strong></td><td>10</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Still need from you (unchanged)</h2>

<ol style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>Find + disable the current T-Mobile SMS forwarder.</strong> Carrier email-to-SMS gateway or Outlook365 rule. Need it off before new SMS goes live so you don't get both.</li>
<li><strong>Twilio creds.</strong> Account SID + Auth Token + Twilio number + your real phone number. ~$2.65/mo at cap. Reply with the creds and I'll wire prod env.</li>
<li><strong>Once both above land</strong>, I build A1.6 (Microsoft Graph inbound poller) and flip mode to <code>live</code> via <code>@CB System set vip sms mode live</code>.</li>
</ol>

</div>
</div>
</body></html>`;

const text = `Ali, corrected: router now uses your existing inbox_vips table (managed at /admin/inbox). My parallel table is dropped.

Your 10 existing VIPs are the source of truth:
- Adalene (priority 1, spouse)
- Lakeesha + info inbox (priority 5, service_provider)
- Lahameen (10, family)
- Karun, Luda, Vivek (30, business)
- Jackie, Sai Tejesh (40, business)
- Ram (50, business)

Smoke verified: Adalene's email looks up correctly, random emails return null, count = 10.

Still need from you:
1. Disable current T-Mobile SMS forwarder
2. Twilio creds (SID, token, Twilio number, your phone)
3. Then I build A1.6 inbound poller and we flip to live.

Add / edit VIPs at https://enterprise.colaberry.ai/admin/inbox.

--
CB System
Ali Muwwakkil's executive agent
Colaberry Inc.`;

(async () => {
  validateBeforeSend(stripEmDashes(html), stripEmDashes(text));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: '[Track A1] Corrected - router now uses your existing inbox_vips',
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
