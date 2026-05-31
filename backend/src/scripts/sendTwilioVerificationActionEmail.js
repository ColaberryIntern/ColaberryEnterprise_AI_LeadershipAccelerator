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
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Twilio - one verification step left</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">Auth works, SMS blocked until you verify the number</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, your API key works perfectly. I bought a toll-free number (+1 888 576 4480) and sent a test SMS, but US carriers now require <strong>verification BEFORE any number can send</strong> (2024 rule, no grace period). Two short forms needed in Twilio Console. ~3-5 business days then we're fully live.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">What I did with the creds you sent</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Step</th><th align="left" style="padding:10px">Result</th></tr>
<tr style="background:#f8fafc"><td>Wired API Key SID + Secret + Account SID + your phone in prod env</td><td>OK</td></tr>
<tr><td>Updated router to use HTTP Basic with API Key auth (preferred for prod)</td><td>OK</td></tr>
<tr style="background:#f8fafc"><td>Bought a 682 area-code local number</td><td>BLOCKED by US A2P 10DLC (error 30034)</td></tr>
<tr><td>Released the 682, bought a toll-free <strong>+1 (888) 576-4480</strong></td><td>BLOCKED by toll-free verification (error 30032)</td></tr>
<tr style="background:#f8fafc"><td>Persisted toll-free number in prod env</td><td>OK - ready to fire as soon as verification clears</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">What you need to do (~10 min in Twilio Console)</h2>

<div style="background:#fef3c7;border-left:4px solid #d97706;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#78350f;font-weight:700">1. Submit Toll-Free Verification</div>
<div style="font-size:13px;margin-top:6px;color:#1f2937">URL: <a href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/tollfree-verification">https://console.twilio.com/us1/develop/sms/regulatory-compliance/tollfree-verification</a><br>
Pick the number <strong>+1 (888) 576-4480</strong>, fill out:
<ul style="margin:8px 0">
<li><strong>Business legal name:</strong> Colaberry Inc.</li>
<li><strong>Business address:</strong> [your business address]</li>
<li><strong>Website:</strong> https://colaberry.com (or enterprise.colaberry.ai)</li>
<li><strong>Use case:</strong> Account Notification</li>
<li><strong>Use case description:</strong> "Internal personal account-alert system. Sends summary SMS to the business owner's mobile phone when designated VIP contacts send important emails. Recipient is the business owner; he is the sole recipient. No marketing, no opt-in flow needed since recipient = account holder."</li>
<li><strong>Sample messages (2):</strong>
<ol style="margin:4px 0">
<li>"VIP Adalene: just sent you an email about the school pickup change. Open: gmail link"</li>
<li>"VIP Mike (ShipCES): wants Q&A on the May 29 internal call decisions. Open: gmail link"</li>
</ol></li>
<li><strong>Estimated monthly volume:</strong> 200</li>
<li><strong>Opt-in workflow:</strong> "Recipient is the account holder and configures his own VIP routing list."</li>
</ul>
Approval timeline: 1-5 business days. Often same-day for clear personal-notification use cases.
</div>
</div>

<div style="background:#dbeafe;border-left:4px solid #1e40af;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1e3a8a;font-weight:700">2. (Recommended) Also start Brand Registration so 10DLC is available later</div>
<div style="font-size:13px;margin-top:6px;color:#1f2937">URL: <a href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/onboarding/customer-profile">https://console.twilio.com/us1/develop/sms/regulatory-compliance/onboarding/customer-profile</a><br>
Same data as above; this unlocks local-number SMS in the future if you ever want one. Skip if you're happy with the toll-free.</div>
</div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Once approved (auto-detected)</h2>

<ol style="font-size:13px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li>I'll re-test with a real SMS to your phone</li>
<li>Build A1.6 - the Microsoft Graph inbound poller (half-day build)</li>
<li>You flip mode to live via <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB System set vip sms mode live</code></li>
<li>Track A Phase 1 done. VIP emails route to your phone in real-time.</li>
</ol>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Anything else I need from you</h2>

<ul style="font-size:13px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>T-Mobile noise:</strong> still need you to find + disable the existing email-to-SMS forwarder so you don't get double-buzz once the new SMS goes live.</li>
<li>That's it. Once toll-free verification clears + T-Mobile forwarder is off, we're done with Track A1.</li>
</ul>

</div>
</div>
</body></html>`;

const text = `Ali, Twilio creds wired + auth works perfectly.

WHAT I DID:
- Wired API Key SID + Secret + Account SID + your phone in prod env
- Updated router for API Key auth (better than master Auth Token)
- Bought 682 local number -> BLOCKED by A2P 10DLC
- Released 682, bought toll-free +1 (888) 576-4480 -> BLOCKED by TF verification
- Persisted TF number in env

WHAT YOU NEED TO DO (~10 min in Twilio Console):
1. Submit Toll-Free Verification for +1 (888) 576-4480 at:
   https://console.twilio.com/us1/develop/sms/regulatory-compliance/tollfree-verification

   Fill the form (HTML email has the exact text to paste):
   - Business: Colaberry Inc., your address, your website
   - Use case: Account Notification
   - Description: Personal account-alert system, business owner sole recipient
   - 2 sample messages
   - Volume: 200/mo
   - Approval: 1-5 business days, often same-day

2. T-Mobile noise: find + disable the current email-to-SMS forwarder.

ONCE APPROVED:
- I retest SMS
- I build A1.6 Graph inbound poller (half-day)
- You tag @CB to flip mode live
- Track A1 done

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
    subject: '[Twilio] Auth works, SMS blocked - need toll-free verification (~10 min in console)',
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
