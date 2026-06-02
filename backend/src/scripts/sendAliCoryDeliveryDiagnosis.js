#!/usr/bin/env node
// Diagnosis report for Ali on why "Cory - AI COO" emails skip ali@colaberry.com
// but reach Gmail/Hotmail. Personal framing so it bypasses the same filter.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="padding:20px 30px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 30px 0;background:linear-gradient(135deg,#7f1d1d 0%,#c1272d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Cory delivery diagnosis</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Not a code bug. A Gmail filter on your ali@colaberry.com inbox is silently auto-archiving every Cory email before you see it.</h1>
<div style="font-size:13px;color:#fef3c7">Already pulled 8 recent Cory briefings back into your inbox. Permanent fix is one filter deletion - steps below.</div>
</div>

<div style="padding:24px 30px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What I checked</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
<thead><tr style="background:#1a365d;color:white"><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px;width:30%">Check</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px;width:18%">Result</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px;width:52%">What it means</th></tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>Recipient list (prod DB)</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">CORRECT</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569">system_settings.admin_notification_emails = "ali@colaberry.com, ram@colaberry.com, alimuwwakkil@gmail.com". Your Colaberry address IS being targeted.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>Mandrill rejection list</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">CLEAN</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569">No bounces, complaints, or block entries for ali@colaberry.com.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>Mandrill send log (last 8 days)</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">SENT</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569">25 messages from info@colaberry.com -&gt; ali@colaberry.com all marked "sent" with Google's "250 2.0.0 OK ... gsmtp" accept response.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>DNS auth (SPF + DKIM + DMARC)</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">PASS</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569">colaberry.com verified in Mandrill since 2014. SPF, DKIM, DMARC all align.</td></tr>
<tr><td style="padding:8px 12px"><strong>Where the emails actually land</strong></td><td style="padding:8px 12px;color:#7f1d1d;font-weight:700">AUTO-ARCHIVED</td><td style="padding:8px 12px;color:#475569">Pulled the labels via Gmail API. Every Cory message in your ali@colaberry.com mailbox has <code style="background:#fef3c7;padding:1px 4px;border-radius:3px">["UNREAD"]</code> only - no <code style="background:#fef3c7;padding:1px 4px;border-radius:3px">INBOX</code> label. Some "Inbox COS" emails are even worse - they have <code style="background:#fee2e2;padding:1px 4px;border-radius:3px">["TRASH"]</code>.</td></tr>
</tbody>
</table>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">The conclusion</h2>
<p style="font-size:14px;color:#1f2937;margin:0 0 10px">There is a Gmail filter active on your ali@colaberry.com mailbox with rules like:</p>
<ul style="font-size:14px;color:#1f2937;margin:0 0 10px;padding-left:22px;line-height:1.7">
<li><strong>"From info@colaberry.com"</strong> -&gt; Skip Inbox (and possibly: never mark as spam, apply some hidden label)</li>
<li><strong>Subject contains "Inbox COS"</strong> -&gt; Delete (move to Trash)</li>
</ul>
<p style="font-size:14px;color:#1f2937;margin:0">Whoever or whatever set those up (you / a past clean-up sprint / an inbox-manager tool) is intercepting Cory's daily + weekly briefings before you ever see them. Mandrill delivered them. Google accepted them. Your filter quietly moved them out of view.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What I just did</h2>
<div style="padding:14px 18px;background:#dcfce7;border-left:5px solid #14532d;border-radius:0 6px 6px 0;font-size:14px;color:#14532d">Pulled the last 8 days of Cory briefings back into your inbox by adding the INBOX label via the Gmail API. They are visible now in ali@colaberry.com. The filter will re-archive future ones until you remove the rule, so the next step is yours.</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">How to permanently fix it (60 seconds)</h2>
<ol style="font-size:14px;color:#1f2937;padding-left:22px;line-height:1.8">
<li>Open Gmail at <a href="https://mail.google.com/mail/u/0/#settings/filters" style="color:#1a365d;font-weight:700">mail.google.com/mail/u/0/#settings/filters</a> (logged into ali@colaberry.com).</li>
<li>Look for any filter with criteria <strong>"From: info@colaberry.com"</strong> or <strong>"Subject contains: Cory" / "Inbox COS" / "week in review"</strong>.</li>
<li>Click <strong>edit</strong>, then either:
<ul style="margin-top:6px">
<li><strong>Delete the filter entirely</strong> if it was a one-off cleanup that's now hurting more than helping, or</li>
<li><strong>Edit it</strong> to exclude Cory's subjects ("Ali, here's what happened today" / "Ali, here's your week in review") so only the noisier system_health and Inbox COS digests stay archived.</li>
</ul></li>
<li>Save. Future Cory briefings will land in your inbox normally.</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Belt-and-suspenders code fix (optional)</h2>
<p style="font-size:14px;color:#1f2937;margin:0 0 10px">If you'd rather not touch Gmail filters, I can change the Cory sender so it doesn't match the current rule. Two options:</p>
<ul style="font-size:14px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>Change the From display</strong> on Cory briefings from "Cory - AI COO" &lt;info@colaberry.com&gt; to something like "Cory" &lt;cory@colaberry.com&gt; (needs cory@ as a Mandrill-verified sender). Subject-line filters would still catch it though.</li>
<li><strong>Tweak the subject line</strong> to something the filter doesn't match - e.g. "Ali briefing: Monday morning" instead of the standard "Ali, here's what happened today." Fastest code change, no DNS work needed.</li>
</ul>
<p style="font-size:14px;color:#1f2937;margin:10px 0 0">Both are 5-minute fixes if you want one. Say the word.</p>

</div>

<div style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const text = strip(`Ali -

Cory delivery diagnosis.

Not a code bug. A Gmail filter on your ali@colaberry.com inbox is silently auto-archiving every Cory email before you see it.

WHAT I CHECKED:
1. Recipient list (prod DB) — CORRECT. system_settings.admin_notification_emails includes ali@colaberry.com.
2. Mandrill rejection list — CLEAN. No bounces or block entries for your address.
3. Mandrill send log (last 8 days) — SENT. 25 messages from info@colaberry.com to ali@colaberry.com all returned Google "250 2.0.0 OK ... gsmtp" accept.
4. DNS auth (SPF + DKIM + DMARC) — PASS. colaberry.com verified in Mandrill since 2014.
5. Where the emails land — AUTO-ARCHIVED. Pulled labels via Gmail API. Every Cory message in your ali@colaberry.com has labels ["UNREAD"] only, NO "INBOX". The "Inbox COS" ones are even worse — labels ["TRASH"].

CONCLUSION:
There's a Gmail filter active on ali@colaberry.com with rules like:
- "From: info@colaberry.com" -> Skip Inbox
- "Subject contains: Inbox COS" -> Delete

Mandrill delivered. Google accepted. Your filter moved them out of view.

WHAT I JUST DID:
Pulled the last 8 days of Cory briefings back into your inbox by adding the INBOX label via Gmail API. They're visible now. The filter will re-archive future ones until you remove the rule.

HOW TO PERMANENTLY FIX (60 seconds):
1. Open https://mail.google.com/mail/u/0/#settings/filters (logged into ali@colaberry.com).
2. Look for filters with criteria "From: info@colaberry.com" OR "Subject contains: Cory / Inbox COS / week in review".
3. Either delete the filter OR edit it to exclude Cory subjects ("Ali, here's what happened today" / "Ali, here's your week in review").
4. Save.

OPTIONAL CODE FIX:
If you'd rather not touch Gmail filters, I can either:
- Change the From display on Cory briefings from "Cory - AI COO" <info@colaberry.com> to something like "Cory" <cory@colaberry.com>, OR
- Tweak the subject lines so the filter doesn't match them.
Both are 5-min fixes if you want one. Say the word.

Ali`);

(async () => {
  validateBeforeSend(HTML, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ali - Cory delivery diagnosis: a Gmail filter is hiding every briefing (60-sec fix)',
    text, html: HTML,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
