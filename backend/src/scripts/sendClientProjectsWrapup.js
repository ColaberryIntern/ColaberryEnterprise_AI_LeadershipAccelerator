#!/usr/bin/env node
// Wrap-up email after the client-projects reports go out.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:680px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Client Projects Daily - Live</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">3 client-project reports shipped + scheduled daily</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, the 3 client-project daily reports just landed in your inbox - one per project. Same shape as Gov Contracts v2 but with an LLM-generated project-goal + why-the-next-step-matters callout. The system runs every morning at 8:30am CT going forward.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">Today's findings (just emailed)</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Project</th><th align="left" style="padding:10px">Open</th><th align="left" style="padding:10px">Next human step</th></tr>
<tr style="background:#f8fafc"><td><strong>AI Pathway</strong></td><td>6</td><td><strong>Ali + Luda 9amET call</strong> - present root cause findings and proposed fix</td></tr>
<tr><td><strong>ShipCES</strong></td><td>1</td><td>No human gating action - 1 task remaining is "DAT Payload" (AI-doable)</td></tr>
<tr style="background:#f8fafc"><td><strong>LandJet</strong></td><td>0</td><td>Zero open tasks. Last MB activity ~60 days ago. <strong>Possibly stalled - consider a check-in.</strong></td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Each email has</h2>

<ul style="font-size:13px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>"For Ali - Big picture"</strong> navy block at top with the LLM-derived project goal</li>
<li><strong>NEXT STEP WAITING ON A HUMAN</strong> dark callout: task title, due-date pill, list, suggested owner, big click-through button to the Basecamp ticket, plus an LLM-derived "why this matters to the goal" line</li>
<li><strong>Full task sequence</strong> sorted by due_on ASC then created_at ASC, with row numbers, due-date pills (red OVERDUE / gold ≤7 days / gray later / black NO DUE DATE), tier pills (HUMAN / AI / EITHER), suggested owner per row</li>
<li><strong>Overdue section</strong> if any</li>
<li><strong>Recent message board</strong> activity (top 5)</li>
<li><strong>"What you can do from here"</strong> interaction block with the @CB syntax</li>
</ul>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Schedule</h2>

<p style="font-size:14px;margin:0 0 12px">Daily at <strong>8:30am CT</strong> (13:30 UTC). Lands after Gov Contracts (8am CT) so you get the procurement view first, then the 3 client-project views.</p>

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:18px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:220px;color:#475569"><strong>Open each project's report</strong></td><td style="padding:6px 0;vertical-align:top">3 emails just landed: <code>[Daily: AI Pathway]</code> / <code>[Daily: ShipCES]</code> / <code>[Daily: LandJet]</code>.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Stalled-project follow-up</strong></td><td style="padding:6px 0;vertical-align:top">LandJet has 0 open + 60 days quiet. Either close it out or open a new sprint.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Re-classify a task</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System mark &lt;task&gt; as HUMAN/AI/EITHER</code>.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Add a new project</strong></td><td style="padding:6px 0;vertical-align:top">Reply with the BC project URL and I'll add it to the daily loop.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in any Basecamp thread.</td></tr>
</table>
</div>

</div>

<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-left:3px solid #1a365d;padding-left:14px;margin:0 32px 24px;font-size:13px;color:#1a202c">
<tr><td style="padding:0">
<div style="font-weight:700;font-size:15px;color:#1a365d">CB System</div>
<div style="color:#2b6cb0;font-weight:600">Ali's executive agent</div>
<div style="color:#64748b">Colaberry Inc.</div>
</td></tr></table>

</div>
</body></html>`;

const text = `Ali, 3 client-project daily reports shipped and scheduled daily 8:30am CT.

Today's findings:
- AI Pathway: 6 open. Next human: Ali + Luda 9amET call - present root cause findings
- ShipCES: 1 open. No human gating - remaining task is AI-doable
- LandJet: 0 open. Last MB ~60 days ago. Possibly stalled - consider check-in.

Each email has: project goal (LLM-derived), next-human-step callout with click-through, full task sequence sorted by due date, overdue section if any, recent MB activity, "what you can do" block.

Schedule: daily 8:30am CT (after Gov Contracts).

To add a new project to the daily loop, reply with the BC project URL.

--
CB System
Ali's executive agent
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
    subject: '[Status] Client projects daily reports live - 3 emails shipped',
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
