#!/usr/bin/env node
// Email Ali the visual story document explaining how the AI_ProjectArchitect
// rollout works across Karun, Kes, Akiwam, Obi - with diagrams, scenarios,
// security layers, governance model, and the special Bonfire-track for interns.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const REPO = path.resolve(__dirname, '../../..');
const STORY_HTML_PATH = path.join(REPO, 'docs/ai-architect-rollout-story-2026-06-02-standalone.html');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const EMAIL = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:740px;margin:0 auto;background:white">

<div style="padding:22px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#0f172a 0%,#1a365d 60%,#7c2d12 100%);color:white;padding:28px 32px;border-radius:10px;text-align:center">
<img src="cid:logo" alt="Colaberry" style="height:32px;display:block;margin:0 auto 12px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">The visual story you asked for</div>
<h1 style="margin:8px 0 6px;font-size:24px;font-weight:800;line-height:1.3">Four people, one Claude Code, one canonical skill library. Where you appear in the loop, where you don't.</h1>
<div style="font-size:13px;color:#cbd5e0">HTML attached. Download + open in browser - it's built to be read offline like a Sunday-afternoon brief, not skimmed in inbox preview.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What's in the doc</h2>

<ol style="font-size:14px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>Chapter 1 - The cast.</strong> Karun, Kes, Akiwam, Obi as 4 distinct cards. Each shows their scope, what they can touch, what they can't. Pilots (Karun + Kes) get the gold border; interns (Akiwam + Obi) get the green border. The contrast is the point - their permission shapes are very different.</li>
<li><strong>Chapter 2 - The architecture.</strong> Stacked layer diagram: Identity → Tool → Source-of-truth (the AI_ProjectArchitect GitHub repo) → Approval gates → External systems. Each layer color-coded; arrows top-to-bottom. You can hold the picture in one glance.</li>
<li><strong>Chapter 3 - Four security layers.</strong> Identity / Authorization / Approval gates / Audit. Why we stack four instead of relying on one. Each layer in a card; defense in depth.</li>
<li><strong>Chapter 4 - The governance decision tree.</strong> Seven scenarios drawn flat. Each one is a question - which gate fires? AUTO (green) / Employee confirms (gold) / Escalate to Ali (red). The page maps "where do I appear" at a glance.</li>
<li><strong>Chapter 5 - Six scenarios.</strong> Little stories of actual workdays. Karun preps for a 1:1, Kes ships a hotfix, Akiwam discovers a Bonfire RFP, Karun hands off a gov opp to Akiwam + Obi, Akiwam tries to submit a bid (and the system stops her). Each scene drawn step-by-step with timestamps, the gate prompts in yellow, the audit trail in green. The rhythm of who-appears-when is what you should pay attention to.</li>
<li><strong>Chapter 6 - The Bonfire / gov-contracts track.</strong> The specific carve-out you asked about. What Akiwam + Obi can do, what they can't (hard tool-layer denials, not just gate prompts), and why. The knife-edge surface.</li>
<li><strong>Chapter 7 - What you see.</strong> Three panels: daily Cory digest (7 AM), real-time escalation pages (only when needed), weekly skill-PR review queue (30 min). Nothing else.</li>
<li><strong>Closing.</strong> One paragraph you can repeat to anyone who asks. The whole architecture compressed.</li>
</ol>

<div style="margin-top:20px;padding:16px 20px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>How I would read it:</strong> open the attached HTML in Chrome, scroll once top-to-bottom, then re-read just the 6 scenarios (Chapter 5). The scenarios are where the architecture stops being abstract. Each one shows you exactly where you appear, where you don't, and why.
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Direct answers to your three questions</h2>

<div style="background:#0f172a;color:white;padding:18px 22px;border-radius:8px;margin-bottom:14px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q1 - How does control work?</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">Three stacked gates. Default permission prompt on every tool call. Hooks for high-risk actions (sends, deploys, deletes) require typed reason + "yes." Plan mode for big tasks produces a written plan before any tool fires. Translation: <strong>read = silent, write = ask employee, external + irreversible = escalate to Ali</strong>. See Chapter 4 for the full decision tree.</div>
</div>

<div style="background:#0f172a;color:white;padding:18px 22px;border-radius:8px;margin-bottom:14px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q2 - When do you check in vs not?</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">You appear in three places only. (a) Daily 7 AM Cory digest (counts + decisions + anomalies). (b) Real-time escalation pages when an irreversible external action is queued (target: less than 2/week steady-state). (c) Weekly 30-min skill PR review queue. Everywhere else the system runs without you. See Chapter 7.</div>
</div>

<div style="background:#0f172a;color:white;padding:18px 22px;border-radius:8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q3 - How does Bonfire-only / gov-contracts security work for the interns?</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">Akiwam + Obi get a sandboxed surface. They CAN read both Bonfire accounts, triage opportunities, generate fit-score cards, draft text, post BC comments, tag Vinay. They CANNOT submit a bid (hard escalation to Vinay + you), send any external email (tool-layer denial), modify the capability statement (read-only), or touch customer data. The intern accelerates Vinay; the intern does not replace Vinay. See Chapter 6 + Scenarios 4, 5, 6.</div>
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What's NOT in the doc (and why)</h2>
<ul style="font-size:13px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>The bootstrap script for each employee's laptop</strong> - that is a 2-hour build that comes after you green-light the architecture. Mentioned in Chapter 2 but not drafted.</li>
<li><strong>The exact hook code</strong> - the hooks are described conceptually. The TypeScript that intercepts tool calls is a half-day build per gate.</li>
<li><strong>Specific skill files</strong> - the doc shows <code>/karun-dash</code> and <code>/bonfire-discovery</code> in scenarios. The actual skill files are in the BC tickets (Karun pilot Step 2, Kes pilot Step 2). Not yet written.</li>
<li><strong>The pricing of the $90/$10 ratio per employee</strong> - that lives in the Alden upgrade plan ticket. Phase 2 work.</li>
</ul>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What I need back from you</h2>
<div style="background:#fef2f2;border-left:5px solid #c1272d;padding:16px 20px;font-size:13px;color:#7f1d1d;border-radius:0 6px 6px 0">
<ol style="margin:0;padding-left:20px;line-height:1.8">
<li><strong>Does the architecture make sense?</strong> If any chapter does not land, tell me which and I refactor.</li>
<li><strong>Are the 6 scenarios realistic?</strong> Especially #4 (Akiwam Bonfire discovery) and #6 (Akiwam blocked bid submission). Tell me if the rhythm is wrong.</li>
<li><strong>Is the Bonfire carve-out tight enough?</strong> I made it read-only for interns + hard tool-layer denials on submission/email. Tighter? Looser? Different shape?</li>
<li><strong>Does your "where do I appear" set (Chapter 7) feel right?</strong> Daily digest + escalation pages + weekly skill review queue. Add or subtract?</li>
<li><strong>Want to add a Chapter 8 on the bootstrap mechanics</strong> - how each employee actually gets set up on their laptop, what it costs in time, what the runbook looks like? Currently deferred.</li>
</ol>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Reply with anything that does not land. I refactor the doc, not just answer the question.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = strip(`Ali - the visual story you asked for is in the attached HTML.

CONTENTS:
- Chapter 1: The cast (4 cards - Karun, Kes, Akiwam, Obi - pilot vs intern visually distinct)
- Chapter 2: Architecture (5-layer stacked diagram from Identity through External systems)
- Chapter 3: 4 security layers (Identity / Authorization / Approval gates / Audit - defense in depth)
- Chapter 4: Governance decision tree (7 scenarios mapped to AUTO/CONFIRM/ESCALATE)
- Chapter 5: 6 scenarios with timestamps + dialogue + gate prompts in yellow + audit in green
- Chapter 6: The Bonfire / gov-contracts track - what Akiwam+Obi can/cannot do + why
- Chapter 7: What you (Ali) actually see - daily digest, escalation pages, weekly skill PR queue
- Closing paragraph you can repeat to anyone

HOW TO READ: open the HTML in Chrome, scroll top-to-bottom once, then re-read just Chapter 5 (the 6 scenarios). The scenarios are where it stops being abstract.

DIRECT ANSWERS TO YOUR 3 QUESTIONS:

Q1 - How does control work?
Three stacked gates: default permission prompt + hooks for high-risk actions + plan mode for big tasks. Translation: read = silent, write = ask employee, external + irreversible = escalate to Ali.

Q2 - When do you check in vs not?
3 places only: (a) Daily 7 AM Cory digest, (b) Real-time escalation pages (< 2/week steady-state), (c) Weekly 30-min skill PR review queue. Everywhere else runs without you.

Q3 - Bonfire / gov-contracts security for interns?
Akiwam + Obi sandboxed. CAN read both Bonfire accounts, triage opps, generate fit cards, draft text, post BC comments. CANNOT submit bids (hard escalation), send external email (tool denial), edit capability statement (read-only), touch customer data. Interns accelerate Vinay, do not replace Vinay.

WHAT IS NOT IN THE DOC: bootstrap script (2-hour build, deferred), exact hook code (half-day per gate), specific skill files (in BC tickets), $90/$10 budget pricing (Phase 2).

WHAT I NEED BACK:
1. Does the architecture make sense?
2. Are the 6 scenarios realistic?
3. Is the Bonfire carve-out tight enough?
4. Does Chapter 7 (where you appear) feel right?
5. Add a Chapter 8 on bootstrap mechanics?

Reply with anything that does not land. I refactor the doc, not just answer.

Ali`);

(async () => {
  validateBeforeSend(EMAIL, TEXT);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ali - the visual story of how the rollout works (4 people, 6 scenarios, security + governance explained)',
    text: TEXT, html: EMAIL,
    attachments: [
      { filename: 'ai-architect-rollout-story-2026-06-02-standalone.html', content: fs.readFileSync(STORY_HTML_PATH), contentType: 'text/html' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
