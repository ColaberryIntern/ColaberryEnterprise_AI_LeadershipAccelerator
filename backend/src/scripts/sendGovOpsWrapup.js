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
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Gov Contracts Reset - Complete</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">5 scrapped, 5 new placeholders + 3 new systems live</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, the Gov Contracts reset is complete: 5 LIKELY-SCRAP bids trashed, 5 placeholder slots ready for new opportunities, plus 3 new systems wired so this process maintains itself going forward.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">What shipped</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Action</th><th align="left" style="padding:10px">Result</th></tr>
<tr style="background:#f8fafc"><td><strong>Scrapped 5 LIKELY-SCRAP bids</strong></td><td>Harris County, SLCC, TDCJ, Southlake, Detroit. All trashed via BC API (recoverable from trash for 30 days if needed).</td></tr>
<tr><td><strong>Created 5 placeholder bids</strong></td><td>"[NEW SLOT] Bid 1-5 - awaiting Opportunity Pulse selection." Each has the standard 14-task template with HUMAN/AI tier and due dates distributed backward from 2026-07-15 (45-day default window). Replace with real opportunities by tagging <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB add gov bid &lt;title&gt; deadline &lt;date&gt;</code>.</td></tr>
<tr style="background:#f8fafc"><td><strong>Fixed @CB dispatcher silence</strong></td><td>Root cause: <code>/buckets/&lt;id&gt;/events.json</code> returns 404 for every bucket with this token. Switched dispatcher to a watched-buckets + comment-poll strategy across 8 active buckets. Verified by your two AI Pathway tags - CB replied to both.</td></tr>
<tr><td><strong>New: Your-Turn Notifier</strong></td><td>Polls Gov Contracts every 5 min. When a task is completed, checks the bid's next task. If next is HUMAN, fires an immediate "your turn" email. If next is AI (when auto-runner exists), goes silent. Matches your "only bug me when it's my move" rule.</td></tr>
<tr style="background:#f8fafc"><td><strong>New: @CB tools wired</strong></td><td><code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB scrap gov bid &lt;name&gt;</code> and <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB add gov bid &lt;title&gt; deadline &lt;date&gt;</code>. CB resolves to one bid by substring match; errors if ambiguous.</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">How the process works now</h2>

<ol style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li>Daily 8am CT - <strong>Gov Contracts Daily Report</strong> with feasibility scores + sequenced tasks (already live)</li>
<li>Every 5 min - <strong>Your-Turn Notifier</strong> watches for task completions. Fires "[Your Turn]" email only when it's actually your move.</li>
<li>You complete a task in Basecamp → if next is AI, system stays silent (future auto-runner will execute it). If next is human, [Your Turn] email lands in your inbox immediately.</li>
<li>You want to add a bid: tag <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB add gov bid &lt;title&gt; deadline &lt;YYYY-MM-DD&gt;</code> anywhere.</li>
<li>You want to scrap one: tag <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB scrap gov bid &lt;name&gt;</code>.</li>
</ol>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Still in your court</h2>

<ul style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>Populate the 5 placeholders</strong> - either edit them in BC with real opportunity names + deadlines, or scrap each and re-add with the @CB tool now that it's wired.</li>
<li><strong>AI auto-runner</strong> is still in the backlog. When that lands, the "always stuck on human" promise becomes fully autonomous. Today, the Your-Turn-Notifier handles the email side; future cron handles the execute side.</li>
</ul>

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:220px;color:#475569"><strong>Add a real bid</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB System add gov bid &lt;title&gt; deadline 2026-07-XX agency &lt;name&gt;</code> in any Basecamp thread.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Test the @CB fix</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB System hello</code> anywhere. It should reply within 3 min.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Test the Your-Turn-Notifier</strong></td><td style="padding:6px 0;vertical-align:top">Complete any task in Gov Contracts. Within 5 min you'll get an email IF the next task is human-tier.</td></tr>
</table>
</div>

</div>
</div>
</body></html>`;

const text = `Ali, Gov Contracts reset complete.

WHAT SHIPPED:
- Scrapped 5 LIKELY-SCRAP bids (Harris County, SLCC, TDCJ, Southlake, Detroit)
- Created 5 placeholders with the standard 14-task template + due dates working backward from 2026-07-15
- Fixed @CB dispatcher (events.json was 404'ing - now uses watched-buckets poll). Your AI Pathway tags got replies.
- New: Your-Turn-Notifier (cron */5 min). Fires "your turn" email only when control passes to you.
- New @CB tools: 'scrap gov bid <name>' and 'add gov bid <title> deadline <date>'.

HOW IT WORKS:
1. Daily 8am - Gov Contracts daily report with feasibility scores
2. Every 5 min - Turn watcher fires "[Your Turn]" only when next task is human-tier
3. Tag @CB to add/scrap bids
4. AI auto-runner still in backlog - that's when "always stuck on human" becomes fully autonomous

STILL IN YOUR COURT:
- Populate the 5 placeholders with real opportunities
- AI auto-runner (next sprint)

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
    subject: '[Gov Contracts] Reset complete - 5 scrapped, 5 placeholders, 3 new systems live',
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
