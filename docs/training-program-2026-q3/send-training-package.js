#!/usr/bin/env node
// Send Ali the training-program package: BC comment + email with 3 attachments.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, '../../backend/src/scripts/lib/mandrillPreflight'));

const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const MENTION = `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
const BUCKET = 7463955;
const TODO_ID = 9945833396;
const TODO_URL = `https://app.basecamp.com/3945211/buckets/${BUCKET}/todos/${TODO_ID}`;

const MD_PATH = path.resolve(__dirname, 'TRAINING_INTEGRATION_PLAN.md');
const HTML_PATH = path.resolve(__dirname, 'TRAINING_PROGRAM_CRITIQUE.html');
const PPT_PATH = path.resolve(__dirname, 'TRAINING_OVERVIEW.pptx');

async function bcPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'Colaberry Training', Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

const bcComment = `<div>${MENTION} <strong>Training program v1 package ready for your critique.</strong></div>
<div><br></div>
<div>I pulled the entire ChatGPT research conversation and synthesized it into three deliverables. All three are emailed to you (subject line: <strong>[Training Program] AI Systems Architect Accelerator - v1 critique package</strong>) and are also committed in the repo at <code>docs/training-program-2026-q3/</code>:</div>
<ul>
<li><strong>TRAINING_INTEGRATION_PLAN.md</strong> - the integration plan. Where every piece lands in this codebase (Project Builder backend, Anthropic Companion Course wrapper, 6 AI agents, Architect Portfolio Dashboard, GitHub integration, CCPP schema, Stripe enrollment, etc.) with owner team and ETA against the 41-day clock.</li>
<li><strong>TRAINING_PROGRAM_CRITIQUE.html</strong> - the critique-ready strategic doc. Program identity, user base, curriculum, pricing, marketing, operations, team structure, timeline, 15 open decisions called out, risk register, cost + revenue model. Designed for you to red-pen.</li>
<li><strong>TRAINING_OVERVIEW.pptx</strong> - the 10-slide team deck. For showing the website / sales / marketing / AI teams how the program works.</li>
</ul>
<div><br></div>
<div><strong>Headline:</strong> AI Systems Architect Accelerator. 12 weeks. Mon Architecture Day + Thu Build Day. 4 stackable $499 intensives or $1,497 bundle (TWC compliance). Hosted on enterprise.colaberry.com. Powered by Anthropic Partner Network. Cohort 1 classes start Mon 2026-07-27 (orientation Thu 2026-07-23).</div>
<div><br></div>
<div><strong>Hard gates I flagged:</strong></div>
<ol>
<li><strong>Jun 12</strong> - Anthropic Partner Network status secured (10-person cohort finish-line, countdown report already running).</li>
<li><strong>Jun 13</strong> - TWC compliance docs counsel-reviewed. Lego-curriculum vs. seminar-independence test needs a defensible answer.</li>
<li><strong>Jul 4</strong> - Stripe enrollment live. Can't take money on Jul 10 without it.</li>
</ol>
<div><br></div>
<div><strong>By Jun 6 (next week) I need your call on:</strong></div>
<ul>
<li>Brand name lock (recommended: "AI Systems Architect Accelerator")</li>
<li>Launch wedge persona (recommended: career changer)</li>
<li>Pricing: $79 + $149 BYO Claude vs. $99 bundled (recommended: BYO per the research)</li>
<li>Team leads: who runs Website / Marketing / Sales for the next 41 days?</li>
</ul>
<div><br></div>
<div>Full open-decision list (15 items) is in the critique HTML.</div>`;

const emailHtml = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:680px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#bfdbfe;font-weight:700">Strategic plan + critique package</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">AI Systems Architect Accelerator</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:6px">v1 - assembled from your ChatGPT research - 41 days to Jul 10 launch</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 28px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:15px;margin-top:6px">Ali, I pulled the entire ChatGPT research conversation and synthesized it into the three deliverables you asked for. All attached to this email and committed in the repo. By Jun 6 (next week) I need 4 decisions from you to keep the 41-day clock on track. The hard gates are Jun 12 (Anthropic Partner status), Jun 13 (TWC compliance), and Jul 4 (Stripe enrollment live).</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">What's attached</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">File</th><th align="left" style="padding:10px">What it is</th><th align="left" style="padding:10px">For</th></tr>
<tr style="background:#f8fafc"><td><strong>TRAINING_INTEGRATION_PLAN.md</strong></td><td>Integration plan. Where every piece lands in this codebase, owner team, ETA against the 41-day clock.</td><td>You + team leads (technical reference)</td></tr>
<tr><td><strong>TRAINING_PROGRAM_CRITIQUE.html</strong></td><td>Critique-ready strategic doc. Identity, user base, curriculum, pricing, marketing, ops, team, timeline, 15 open decisions, risk register, cost + revenue.</td><td>You (red-pen this)</td></tr>
<tr style="background:#f8fafc"><td><strong>TRAINING_OVERVIEW.pptx</strong></td><td>10-slide team deck. How the program works.</td><td>Website / Marketing / Sales / AI teams</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">What we shipped today (summary)</h2>

<ol style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li>Spun up 2 parallel research agents. Agent 1 fetched the full ChatGPT conversation and produced a ~5,000-word structured summary covering program identity, curriculum, pricing, marketing, operations, tech requirements, team structure, timeline, and 15 open decisions. Agent 2 searched all 49 Basecamp projects in the account for an existing training-program tracker and confirmed none existed.</li>
<li>Synthesized the research into <strong>TRAINING_INTEGRATION_PLAN.md</strong> mapping every component (Project Builder, Anthropic Companion Course wrapper, Anthropic Intelligence Layer L1-L3, 6 AI agents, Architect Portfolio Dashboard, GitHub integration, Build Log auto-formatter, Community MVP, Project Marketplace v1, Stripe enrollment, CCPP schema, TWC compliance docs) to a specific file path / owner team / ETA against the 41-day clock.</li>
<li>Built <strong>TRAINING_PROGRAM_CRITIQUE.html</strong> as a critique-ready document. Side-by-side option blocks for key decisions (brand name, persona, pricing model). Yellow callout boxes for open questions. Red callout boxes for risks. Black "gate" boxes for hard deadlines.</li>
<li>Generated <strong>TRAINING_OVERVIEW.pptx</strong> using pptxgenjs. Exactly 10 slides: cover / why now / who the student is / what they build / 4 teams / timeline / tech / marketing + pricing / risks / next 7 days. Brand colors, no emojis.</li>
<li>Created a new Basecamp tracking todo in <strong>Ali Personal &gt; AI Products</strong> (best fit per the agent's project survey - this is where you track cross-cutting AI initiatives you drive). Todo ID 9945833396. Assigned to you. Linked below.</li>
<li>Posted a summary comment on the Basecamp todo with the headline findings and the 4 decisions you need to lock by Jun 6.</li>
</ol>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Headline call-outs</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1c1917;color:#fbbf24"><th align="left" style="padding:10px">Hard gate</th><th align="left" style="padding:10px">Date</th><th align="left" style="padding:10px">Impact if missed</th></tr>
<tr style="background:#f8fafc"><td><strong>Anthropic Partner status secured</strong></td><td>Jun 12</td><td>"Powered by Anthropic" branding + free CCA-F cert access both at risk. Countdown report already firing daily.</td></tr>
<tr><td><strong>TWC compliance docs counsel-reviewed</strong></td><td>Jun 13</td><td>Selling a "course" without TWC approval is legal exposure. 4-intensive split needs defensible per-intensive outcomes.</td></tr>
<tr style="background:#f8fafc"><td><strong>Stripe enrollment live</strong></td><td>Jul 4</td><td>Can't take money on Jul 10.</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">What I need from you by Jun 6 (Week 0)</h2>

<ol style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>Brand name lock.</strong> I recommend "AI Systems Architect Accelerator" (the research's final pick). Alternatives listed in the HTML.</li>
<li><strong>Launch wedge persona.</strong> I recommend leading with career changers / working professionals - broadest audience for viral content, highest-margin, no B2B sales motion required.</li>
<li><strong>Pricing model.</strong> I recommend $79 + $149 BYO Claude (the research's final pick). Your earlier instinct was $99 bundled with Claude - the research explicitly rejected that. Confirm or push back.</li>
<li><strong>Team leads.</strong> Right now you're effectively running all 4 teams plus Ops. Realistic 41-day delivery needs a Website Team lead (full-time), Marketing Team lead (part-time), AI Team contract dev (full-time), and you running Sales with a part-time SDR.</li>
</ol>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Where this lives</h2>

<ul style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>Basecamp tracking todo:</strong> <a href="${TODO_URL}" style="color:#2b6cb0">${TODO_URL}</a></li>
<li><strong>Repo:</strong> <code>docs/training-program-2026-q3/</code> (committed and pushed)</li>
<li><strong>Source research:</strong> the ChatGPT conversation you sent. Full structured summary captured by the research agent.</li>
</ul>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">What you can do from here</h2>

<table cellpadding="8" cellspacing="0" border="0" style="width:100%;font-size:13px">
<tr><td style="vertical-align:top;width:200px;color:#475569"><strong>Critique the plan</strong></td><td style="vertical-align:top">Open the HTML attachment. Each open decision and risk is a place to red-pen. Reply to this email with line-by-line changes or push back on the recommendations.</td></tr>
<tr><td style="vertical-align:top;color:#475569"><strong>Show the team the deck</strong></td><td style="vertical-align:top">Open the PPTX in PowerPoint or import to Google Slides. 10 slides, presentation-ready.</td></tr>
<tr><td style="vertical-align:top;color:#475569"><strong>Move the BC ticket forward</strong></td><td style="vertical-align:top">Reply on the Basecamp todo with your locks for the 4 Jun-6 decisions, and I'll start the Week-1 build sprint.</td></tr>
<tr><td style="vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in any Basecamp thread. CB reads the thread context and acts.</td></tr>
</table>

</div>

<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-left:3px solid #1a365d;padding-left:14px;margin:0 32px 24px;font-size:13px;color:#1a202c">
<tr><td style="padding:0">
<div style="font-weight:700;font-size:15px;color:#1a365d">CB System</div>
<div style="color:#2b6cb0;font-weight:600">Ali Muwwakkil's executive agent</div>
<div style="color:#64748b">Colaberry Inc.</div>
</td></tr></table>

</div>
</body></html>`;

const emailText = `Ali, training program v1 package is ready. Three attachments + new Basecamp tracking todo.

WHAT'S ATTACHED:
1. TRAINING_INTEGRATION_PLAN.md - where every piece lands in the codebase + ETA against 41-day clock
2. TRAINING_PROGRAM_CRITIQUE.html - critique-ready strategic doc, 15 open decisions called out
3. TRAINING_OVERVIEW.pptx - 10-slide team deck

HARD GATES:
- Jun 12: Anthropic Partner Network status secured
- Jun 13: TWC compliance docs counsel-reviewed
- Jul 4: Stripe enrollment live

WHAT I NEED FROM YOU BY JUN 6 (Week 0):
1. Brand name lock (recommended: "AI Systems Architect Accelerator")
2. Launch wedge persona (recommended: career changer)
3. Pricing model: $79 + $149 BYO Claude vs $99 bundled (recommended: BYO per the research)
4. Team leads named for Website, Marketing, AI contract dev

WHERE IT LIVES:
- Basecamp tracking todo: ${TODO_URL}
- Repo: docs/training-program-2026-q3/

--
CB System
Ali Muwwakkil's executive agent
Colaberry Inc.`;

(async () => {
  // 1. Post BC comment
  console.log('Posting BC comment...');
  const bcResp = await bcPost(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: bcComment.replace(/—/g, '-').replace(/–/g, '-'),
  });
  console.log('BC comment posted:', bcResp.id);

  // 2. Verify attachments exist
  for (const p of [MD_PATH, HTML_PATH, PPT_PATH]) {
    const s = fs.statSync(p);
    console.log(`  attachment ${path.basename(p)} (${(s.size/1024).toFixed(1)}KB)`);
  }

  // 3. Email
  console.log('Sending email...');
  const htmlClean = emailHtml.replace(/—/g, '-').replace(/–/g, '-');
  const textClean = emailText.replace(/—/g, '-').replace(/–/g, '-');
  validateBeforeSend(htmlClean, textClean);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: '[Training Program] AI Systems Architect Accelerator - v1 critique package',
    text: textClean,
    html: htmlClean,
    attachments: [
      { filename: 'TRAINING_INTEGRATION_PLAN.md', path: MD_PATH },
      { filename: 'TRAINING_PROGRAM_CRITIQUE.html', path: HTML_PATH },
      { filename: 'TRAINING_OVERVIEW.pptx', path: PPT_PATH },
    ],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Email sent:', r.messageId);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
