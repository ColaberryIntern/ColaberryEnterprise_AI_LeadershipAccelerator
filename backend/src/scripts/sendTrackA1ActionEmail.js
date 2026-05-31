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
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Track A Phase 1 - Foundation shipped</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">VIP SMS router live in log_only mode + 4 @CB tools</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, kicked off Track A Phase 1 per "recommended path." Foundation is shipped + tested. <strong>3 things you need to action</strong> before SMS starts firing for real.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">What's built</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Component</th><th align="left" style="padding:10px">Status</th></tr>
<tr style="background:#f8fafc"><td><code>vip_contacts</code> Postgres table</td><td>Created + indexed (lookup by email or domain)</td></tr>
<tr><td><code>backend/src/scripts/lib/vipSmsRouter.js</code></td><td>Router: looks up VIP, summarizes with gpt-4o-mini, sends SMS via Twilio REST, logs to <code>communication_logs</code> for cap tracking. Currently in <strong>log_only</strong> mode (no Twilio yet).</td></tr>
<tr style="background:#f8fafc"><td>Cap enforcement</td><td>7 SMS / 24h, 3 voice / 24h. Reads from <code>communication_logs</code>. Over-cap notifications log to deferred (next-day digest).</td></tr>
<tr><td>4 new @CB tools</td><td><code>vip_add</code> / <code>vip_remove</code> / <code>vip_list</code> / <code>set_vip_sms_mode</code> - all wired and tested. (Smoke: I added "Mike Reynolds &lt;mike@shipces.com&gt; priority 2" via @CB and verified it landed in the table.)</td></tr>
<tr style="background:#f8fafc"><td>Mode toggle</td><td>File at <code>tmp/ops-engine/vip-sms-mode.txt</code>. Defaults to <code>log_only</code>. Flip via <code>@CB set vip sms mode live</code> after Twilio is provisioned.</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">3 things you need to do</h2>

<div style="background:#fee2e2;border-left:4px solid #dc2626;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7f1d1d;font-weight:700">1. Find + disable T-Mobile SMS forwarder</div>
<div style="font-size:13px;margin-top:6px;color:#1f2937">The current T-Mobile noise is most likely from a carrier email-to-SMS gateway forwarder (your colaberry email forwards to your number@tmomail.net) or an Outlook365 mobile rule. Find it and turn it off. If you can't find it, give me read access to your Outlook rules and I'll locate it.</div>
</div>

<div style="background:#fef3c7;border-left:4px solid #d97706;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#78350f;font-weight:700">2. Provision Twilio (account + phone number + API creds)</div>
<div style="font-size:13px;margin-top:6px;color:#1f2937">Sign up at twilio.com, buy a US number (~$1/mo), get the Account SID + Auth Token. Send me those + your real phone number for ALI_PHONE_NUMBER and I'll wire the prod env. <strong>Expected cost at cap: $2.65/mo total.</strong> Once env vars land, flip mode via <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB System set vip sms mode live</code>.</div>
</div>

<div style="background:#dbeafe;border-left:4px solid #1e40af;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1e3a8a;font-weight:700">3. Review my suggested VIP seed list below</div>
<div style="font-size:13px;margin-top:6px;color:#1f2937">I drafted these from your codebase + recent project activity. <strong>I have not added them yet</strong> - tell me which to enable (or add others) and I'll wire them via <code>@CB vip add</code> in batch.</div>
</div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Suggested VIP seed list (review + tell me which to add)</h2>

<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:8px">Name / role</th><th align="left" style="padding:8px">Email (if known)</th><th align="left" style="padding:8px">Priority</th><th align="left" style="padding:8px">Topic tags</th></tr>
<tr style="background:#f8fafc"><td>Ram (Anthropic Partner cohort, exec)</td><td>?</td><td>1</td><td>internal-exec, anthropic</td></tr>
<tr><td>Karun Swaroop (Anthropic Partner cohort, exec)</td><td>?</td><td>1</td><td>internal-exec, anthropic</td></tr>
<tr style="background:#f8fafc"><td>Mike Reynolds (ShipCES, already added)</td><td>mike@shipces.com</td><td>2 (added)</td><td>client, shipces</td></tr>
<tr><td>Brett (ShipCES)</td><td>?</td><td>2</td><td>client, shipces</td></tr>
<tr style="background:#f8fafc"><td>Jen (ShipCES)</td><td>?</td><td>2</td><td>client, shipces</td></tr>
<tr><td>Luda (AI Pathway client)</td><td>?</td><td>2</td><td>client, aipathway</td></tr>
<tr style="background:#f8fafc"><td>Halyna (AI Pathway, recent rerun)</td><td>?</td><td>3</td><td>client, aipathway</td></tr>
<tr><td>Ryan (LandJet)</td><td>?</td><td>3</td><td>client, landjet</td></tr>
<tr style="background:#f8fafc"><td>Que (joint Bonfire bid partner)</td><td>?</td><td>2</td><td>partner, gov-bids</td></tr>
<tr><td>Lakeesha (CPA)</td><td>?</td><td>2</td><td>personal, financial</td></tr>
<tr style="background:#f8fafc"><td>Adalene (family / personal)</td><td>?</td><td>1</td><td>personal, family</td></tr>
<tr><td>Anthropic Partner contacts</td><td>partners@anthropic.com domain</td><td>2</td><td>anthropic, partner</td></tr>
<tr style="background:#f8fafc"><td>colaberry.com domain (all internal)</td><td>colaberry.com (as domain)</td><td>4</td><td>internal</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Still left in Track A Phase 1 (after you action above)</h2>

<ul style="font-size:13px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>A1.6 - Inbound email trigger.</strong> The Mandrill webhook is outbound-only. I'll wire a Microsoft Graph poller (using the existing Inbox COS infrastructure) that scans new emails to ali@colaberry.com every 1-2 min and calls <code>routeInboundEmail()</code>. This is the last build piece before live SMS works end-to-end. ~half-day build after Twilio is provisioned.</li>
<li><strong>A1.2 - Gmail forwarding setup.</strong> When SMS fires, the body links to a gmail message at alimuwwakkil@gmail.com. I'll set up the forwarder so the link actually resolves to the right message.</li>
</ul>

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do right now</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:240px;color:#475569"><strong>Add a VIP via @CB</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System vip add &lt;name&gt; &lt;email&gt; priority &lt;1-10&gt;</code> in any Basecamp thread.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>List current VIPs</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System vip list</code>.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Reply with VIP picks</strong></td><td style="padding:6px 0;vertical-align:top">Send me the names + emails you want me to add and I'll batch-add via @CB.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Twilio credentials</strong></td><td style="padding:6px 0;vertical-align:top">Reply with Account SID, Auth Token, Twilio Number, your phone number. I'll wire them and we go live.</td></tr>
</table>
</div>

</div>
</div>
</body></html>`;

const text = `Ali, Track A Phase 1 foundation shipped.

WHAT'S BUILT:
- vip_contacts Postgres table
- vipSmsRouter (lookup -> LLM summarize -> Twilio send -> log)
- Cap enforcement (7 SMS / 3 voice per 24h)
- 4 @CB tools: vip_add, vip_remove, vip_list, set_vip_sms_mode
- Currently in log_only mode (no Twilio yet)

3 THINGS YOU NEED TO DO:
1. Find + disable current T-Mobile SMS forwarder (likely a carrier email-to-SMS gateway or Outlook365 rule)
2. Provision Twilio (~$2.65/mo at cap). Send me SID, token, Twilio number, your phone number.
3. Review the suggested VIP seed list (in the HTML email) and tell me which to add.

STILL BUILD AFTER YOU ACTION:
- A1.6 Inbound email trigger (Graph poller -> routeInboundEmail). Half-day build.
- A1.2 Gmail forwarder for SMS deep-links.

WHAT YOU CAN DO NOW:
- Add VIP: @CB System vip add <name> <email> priority <1-10>
- List: @CB System vip list
- Reply with VIP picks
- Reply with Twilio creds when ready

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
    subject: '[Track A1] VIP SMS router shipped - 3 actions needed from you',
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
