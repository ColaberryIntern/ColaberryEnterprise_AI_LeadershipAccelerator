#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const PLAN_PATH = path.resolve(__dirname, '../../../docs/3-track-build-plan/BUILD_PLAN.md');

const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">3-Track Build Plan</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">SMS+Voice / Gov pipeline / AI auto-runner</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, full build + test plan for all 3 attached. 7 weeks total if we run them sequenced. Each track ships independently and is testable in isolation. <strong>Track A Phase 1 (VIP SMS) lands at end of week 1</strong> and immediately kills the T-Mobile noise - that's the headline win.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">The 3 tracks</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">Track</th><th align="left" style="padding:10px">Headline</th><th align="center" style="padding:10px">First ship</th><th align="left" style="padding:10px">Cost/mo</th></tr>
<tr style="background:#f8fafc"><td><strong>A</strong></td><td>VIP SMS routing + Voice Q&amp;A</td><td>Week 1 (Phase 1)</td><td>~$3 SMS + Synthflow (already paid)</td></tr>
<tr><td><strong>B</strong></td><td>@CB add-bid full pipeline (Opp Pulse + reply parser + zip-aware finalize)</td><td>Week 2</td><td>$0</td></tr>
<tr style="background:#f8fafc"><td><strong>C</strong></td><td>AI auto-runner (executes AI-tier tasks before pinging you)</td><td>Week 4</td><td>OpenAI tokens ~$10-30</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Recommended sequence</h2>

<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="center" style="padding:8px;width:60px">Week</th><th align="left" style="padding:8px">Track / phase</th><th align="left" style="padding:8px">Why this order</th></tr>
<tr style="background:#f8fafc"><td align="center"><strong>1</strong></td><td>A1 VIP SMS</td><td>Independent. Immediate noise reduction.</td></tr>
<tr><td align="center"><strong>2</strong></td><td>B2 + B3 reply parser + zip finalize</td><td>Builds on dispatcher fix from this session. Bids in 1 round-trip.</td></tr>
<tr style="background:#f8fafc"><td align="center"><strong>3-4</strong></td><td>C1 + C2 executor framework + cron (dry-run)</td><td>Biggest unknowns. Week of dry-run before live writes.</td></tr>
<tr><td align="center"><strong>5</strong></td><td>A2 Voice Q&amp;A</td><td>Reasonable build. Decoupled from C.</td></tr>
<tr style="background:#f8fafc"><td align="center"><strong>5-6</strong></td><td>B4 + B1 auto-pull from OP</td><td>Polish. Self-serve more.</td></tr>
<tr><td align="center"><strong>6</strong></td><td>C3 human review queue</td><td>Risk control on top of cron.</td></tr>
<tr style="background:#f8fafc"><td align="center"><strong>7</strong></td><td>A3 polish + admin UI</td><td>Final.</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Decisions needed to kick off</h2>

<p style="font-size:14px;margin:0 0 12px">Two paths:</p>

<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#166534;font-weight:700">Path 1 - Fast (recommended)</div>
<div style="font-size:13px;margin-top:6px;color:#14532d">Reply <strong>"go with recommended defaults"</strong> and I kick off Track A Phase 1 next session. I'll use my recommended answers (human-review queue for Track C, manual-paste for Track B). You can still override any specific default by replying with the override.</div>
</div>

<div style="background:#fef9c3;border-left:4px solid #ca8a04;padding:14px 18px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#854d0e;font-weight:700">Path 2 - Detailed</div>
<div style="font-size:13px;margin-top:6px;color:#713f12">Reply to the 12 open questions in the attached plan (6 for Track A from the earlier email, 3 each for B and C). Slower but lets you tune each track.</div>
</div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">What's in the plan doc</h2>

<ul style="font-size:13px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li>Per-track build steps (8 sub-steps each on average) with concrete deliverables per row</li>
<li>Test strategy per step (unit tests / smoke tests / E2E)</li>
<li>Risk register with mitigations</li>
<li>Open questions called out so nothing surprises you mid-build</li>
</ul>

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:220px;color:#475569"><strong>Greenlight all 3</strong></td><td style="padding:6px 0;vertical-align:top">Reply "go with recommended defaults" - I start Track A Phase 1 in the next session.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Greenlight one track only</strong></td><td style="padding:6px 0;vertical-align:top">Reply "go on track A only" (or B or C) - I run that single track now and queue the others.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Tune the plan</strong></td><td style="padding:6px 0;vertical-align:top">Reply with overrides on specific tracks/phases.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Re-sequence</strong></td><td style="padding:6px 0;vertical-align:top">Want C first instead of A? Reply with the new order, I'll adjust.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in any Basecamp thread.</td></tr>
</table>
</div>

</div>
</div>
</body></html>`;

const text = `Ali, 3-track build + test plan attached as BUILD_PLAN.md.

Three tracks:
- A: VIP SMS routing + Voice Q&A (ships A1 week 1)
- B: @CB add-bid full pipeline (week 2)
- C: AI auto-runner (week 4)

Recommended sequence: A1 → B → C1+C2 → A2 → B4+C3 → A3.
Total: 7 weeks if sequenced. Each track ships independently.

Two paths to kick off:
1. FAST: reply "go with recommended defaults" - I start Track A Phase 1 next session.
2. DETAILED: answer the 12 open questions in the plan.

What you can do:
- Greenlight all 3 with defaults: "go with recommended defaults"
- One track only: "go on track A only" (or B or C)
- Override specific items: reply with the override
- Re-sequence: tell me the new order

Plan attached as BUILD_PLAN.md.

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
    subject: '[Plan] 3-Track Build - SMS+Voice / Gov pipeline / AI auto-runner',
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    attachments: [{ filename: 'BUILD_PLAN.md', path: PLAN_PATH }],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
