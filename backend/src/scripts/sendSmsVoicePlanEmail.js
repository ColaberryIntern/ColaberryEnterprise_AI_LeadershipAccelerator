#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const PLAN_PATH = path.resolve(__dirname, '../../../docs/sms-voice-alerting/PLAN.md');

const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Plan - SMS + Voice alerting</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">VIP-list SMS + Critical-alert Voice with Q&amp;A</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, you said this isn't priority - so I drafted the full plan + scoped the work, did not build today. Attached as a PLAN.md. 3 phases, ~3 weeks total. Phase 1 (VIP SMS) is the highest-value piece and could ship in a focused 1-week sprint that immediately kills the T-Mobile noise. I need 6 answers from you before kicking it off.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">What I found</h2>

<ul style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>Voice:</strong> Synthflow API integration already exists for Cory health alerts. <code>adminAlertPhone</code> env var. <code>communication_logs</code> table tracks each call's duration / answered / voicemail / end reason.</li>
<li><strong>SMS:</strong> NO dedicated outbound SMS in the codebase (no Twilio, no SignalWire). Your current T-Mobile SMS noise is likely a carrier email-to-SMS gateway (e.g., your-number@tmomail.net) - need to find and disable that as part of Phase 1.</li>
<li><strong>Inbound email:</strong> Mandrill inbound webhook + Inbox COS importance classifier already in place. Easy to hook for VIP-sender detection.</li>
</ul>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">3-phase build</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Phase</th><th align="left" style="padding:10px">Scope</th><th align="left" style="padding:10px">Time</th></tr>
<tr style="background:#f8fafc"><td><strong>1. VIP SMS routing</strong></td><td>vip_contacts table, Mandrill inbound webhook hook, gpt-4o-mini summarizer, Twilio integration ($2.65/mo at cap), cap enforcement (7/day), <code>@CB vip add</code> tool, disable existing T-Mobile forwarding</td><td>~1 week</td></tr>
<tr><td><strong>2. Voice Q&amp;A</strong></td><td>Synthflow agent build with CCPP + BC + email retrieval, critical-alert trigger registration, cap enforcement (3/day), <code>@CB trigger_critical_alert</code> tool</td><td>~2 weeks</td></tr>
<tr style="background:#f8fafc"><td><strong>3. Polish</strong></td><td>notifications_deferred table, daily 6am suppressed-alert digest, <code>@CB mute_sms</code> tool, admin UI at /admin/notifications</td><td>~3 days</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">6 questions I need answered before I start</h2>

<ol style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>VIP seed list:</strong> can you send 10-20 names + emails? Or want me to scan your last 90 days of inbound and suggest a draft list for you to edit?</li>
<li><strong>What's currently sending T-Mobile SMS?</strong> Likely a carrier email-to-SMS gateway or Outlook mobile rule. We need to disable it before turning on the new pipeline.</li>
<li><strong>Critical-alert sources:</strong> CCPP / Basecamp / email is the headline. Anything else (Mandrill failures, external monitoring like Pingdom, etc.)?</li>
<li><strong>Voice Q&amp;A scope:</strong> today calls are one-way (system → you). Bidirectional Q&amp;A with retrieval is a meaningful build. Confirm Phase 2 priority - or defer if Phase 1 alone solves enough.</li>
<li><strong>Cap overflow:</strong> when you hit 7 SMS / 3 voice / day, should I drop silently + log, or escalate to "we tried to reach you but you've hit your daily cap" via email?</li>
<li><strong>Daily 6am digest:</strong> new email, or fold into the existing Cory daily briefing?</li>
</ol>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">My recommendation</h2>

<p style="font-size:14px;margin:0 0 12px">Phase 1 alone would <strong>immediately kill the redundant T-Mobile noise</strong> and give you actionable VIP alerts. That's the highest-leverage piece. Phase 2 (voice Q&amp;A) is real engineering but pays off less than Phase 1. Suggest:</p>

<ol style="font-size:14px;line-height:1.7;margin:0 0 16px 18px;padding:0">
<li>Answer the 6 questions above.</li>
<li>I kick off Phase 1 next session, ship in ~1 week.</li>
<li>Decide on Phase 2 after Phase 1 is live and you can feel whether the SMS layer is enough.</li>
</ol>

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">Attachment</div>
<div style="font-size:13px"><strong>PLAN.md</strong> - full plan with table schema, API design, cap implementation, cost estimate, phase-by-phase breakdown. ~5KB.</div>
</div>

</div>
</div>
</body></html>`;

const text = `Ali, plan for SMS + Voice alerting attached. No build today - you said no priority.

WHAT I FOUND:
- Voice: Synthflow already integrated (used by Cory health alerts)
- SMS: NO Twilio in codebase. Your current T-Mobile noise is likely a carrier email-to-SMS gateway.
- Inbound email + importance classifier already wired (easy hook for VIP detection)

3-PHASE BUILD:
1. VIP SMS routing (~1 week, ~$2.65/mo at cap) - highest leverage
2. Voice Q&A with Synthflow + retrieval (~2 weeks)
3. Polish + admin UI (~3 days)

6 QUESTIONS I NEED ANSWERED:
1. VIP seed list (10-20 names+emails) - send me yours or want me to draft from your last 90 days?
2. Where is current T-Mobile SMS coming from? Carrier gateway?
3. Critical-alert sources beyond CCPP/BC/email?
4. Voice Q&A priority (bidirectional with retrieval is a real build)
5. Cap overflow: drop silently or send "we tried" email?
6. Daily 6am suppressed-alert digest - new email or fold into Cory?

RECOMMENDATION: Phase 1 next session, decide on Phase 2 after Phase 1 is live.

Plan attached as PLAN.md.

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
    subject: '[Plan] SMS + Voice alerting - VIP-list SMS + Critical-alert Voice with Q&A',
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    attachments: [{ filename: 'PLAN.md', path: PLAN_PATH }],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
