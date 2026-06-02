#!/usr/bin/env node
// Email Ali visual story v2 — the Basecamp loop with Akiwam scenarios + personal BC + skill extraction.
// Attaches HTML standalone, BCC's the other inboxes, attaches to BC overview ticket per memory rule.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const REPO = path.resolve(__dirname, '../../..');
const STORY_HTML = path.join(REPO, 'docs/ai-architect-rollout-story-v2-basecamp-loop-2026-06-02-standalone.html');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const EMAIL = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#0f172a 0%,#14532d 100%);color:white;padding:24px 28px;border-radius:8px;text-align:center">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin:0 auto 10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Visual story v2 - the Basecamp loop</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Basecamp is the work queue. Claude Code is the agent. The loop closes every time.</h1>
<div style="font-size:13px;color:#cbd5e0">Akiwam working alongside BC, with the two scenarios you described - the landing page polish + the Jen scheduling - drawn step-by-step. Plus the personal-Basecamp concept + the skill extraction pipeline. HTML attached.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What's in this doc</h2>

<ol style="font-size:14px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>Chapter 1 - The 3 roles.</strong> Human (Akiwam) + AI (her Claude Code) + Ticket (her BC project) - 3 cards showing the actors in every workflow.</li>
<li><strong>Chapter 2 - The loop diagram.</strong> 6 steps drawn as a clock: Task arrives → Alert fires → Akiwam invokes → Claude executes → Posted back → Skill candidate. The whole architecture in one image.</li>
<li><strong>Chapter 3 - Scenario 1: AI verification (your landing page example).</strong> Full step-by-step. AI drafts raw text, Akiwam tells her Claude Code "format like our standard utility pre-read, finalize as PDF," Claude pulls the template + logo + tile, renders, gate fires before posting, comment lands on the BC ticket. Skill candidate auto-tagged.</li>
<li><strong>Chapter 4 - Scenario 2: Jen scheduling (your second example).</strong> Same step-by-step rhythm. Akiwam says "schedule 30-min deep-dive, pick 3 slots in next 2 days, email Jen." Claude reads BC, checks calendar, drafts email, gate fires, Akiwam approves, email sent. Jen replies hours later, Claude detects, gets approval, sends calendar invite, logs to BC. <strong>And then — the key punchline — the workflow auto-tags as /schedule-deep-dive for everyone else.</strong></li>
<li><strong>Chapter 5 - Personal Basecamp projects.</strong> 4 person cards (Karun, Kes, Akiwam, Obi) with each one's ticket list. Explains why this is the durable trace — when a person leaves, their work history + skills stay. This is the operational expression of Yohan's "skills are the org" answer from the Alden talk.</li>
<li><strong>Chapter 6 - Skill extraction pipeline.</strong> 4-stage flow: completed ticket → auto-tag as candidate → Ali weekly review → Colaberry approved + library. Math: 2 candidates/person/week + 50% approval rate = ~50 skills in 90 days.</li>
<li><strong>Chapter 7 - Your Friday afternoon.</strong> The dashboard you actually see. 5 skill candidates this week with APPROVE / REVIEW / REJECT buttons. 30-min job.</li>
<li><strong>Closing.</strong> One paragraph compressing the architecture. If a person can repeat it, they understand it.</li>
</ol>

<div style="margin-top:20px;padding:16px 20px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>The key insight you articulated</strong> that I had not stated explicitly: <em>completed tickets become skill candidates</em>. Every workflow is a free training-data point. The org becomes its own training set. After 90 days of running this way, the library is rich enough that new hires get productive on day 1 by just slash-invoking the inherited skills.
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">How this relates to visual story v1</h2>
<p style="font-size:14px;color:#1f2937;margin:0 0 12px">v1 (sent earlier, attached to the rollout overview ticket) was about <strong>permissions + governance</strong> - who can do what, what gates fire, where you appear. This v2 is about <strong>operational rhythm</strong> - what a typical workday actually looks like, how a one-time task becomes a permanent skill. Together they describe the whole system.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What I need from you</h2>
<div style="background:#fef2f2;border-left:5px solid #c1272d;padding:16px 20px;font-size:13px;color:#7f1d1d;border-radius:0 6px 6px 0">
<ol style="margin:0;padding-left:20px;line-height:1.8">
<li><strong>Do the 2 scenarios match what you imagined?</strong> If the rhythm in Scenario 1 (landing page) or Scenario 2 (Jen) is wrong, tell me and I redraw it.</li>
<li><strong>Is the "Personal Basecamp" idea right?</strong> I have 4 people with separate personal projects. Should it instead be sub-todolists on Ali Personal? Or a different shape?</li>
<li><strong>The skill auto-tag step.</strong> I drew it as automatic - Claude detects "this is a repeatable pattern" + saves the template. That assumes Claude can identify pattern repeatability. If you want this to be human-driven (Akiwam decides "yes turn this into a skill" at the end of each ticket), tell me and I rework Chapter 6.</li>
<li><strong>Friday weekly review (Chapter 7).</strong> I have it as a 30-min batch. Could also be daily, or just-in-time. Your call on cadence.</li>
<li><strong>Want a Chapter 8 on how a Colaberry-approved skill actually syncs to all 4 employees' machines?</strong> The mechanics of "skill auto-syncs overnight." Currently glossed over.</li>
</ol>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Reply with anything that does not land. I refactor the doc, not just answer the question. Per the operating doctrine, this HTML + a summary of what I shipped is also being attached to the AI_ProjectArchitect rollout overview ticket on Ali Personal - so it lives there durably even if this email gets auto-trashed by your inbox filter again.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = strip(`Ali - visual story v2 attached.

WHAT'S IN IT:
- Chapter 1: 3 roles (Akiwam human, her Claude Code, her BC project).
- Chapter 2: The loop diagram (6 steps drawn as a clock).
- Chapter 3: Scenario 1 - your landing page example, step by step.
- Chapter 4: Scenario 2 - your Jen scheduling example, step by step. Key punchline: workflow auto-tags as /schedule-deep-dive for everyone.
- Chapter 5: Personal Basecamp projects (4 person cards). The durable trace.
- Chapter 6: Skill extraction pipeline. 4 stages. Math: ~50 skills in 90 days.
- Chapter 7: Your Friday weekly review (30-min dashboard).
- Closing: one paragraph compressing the architecture.

KEY INSIGHT YOU ARTICULATED THAT I HAD NOT EXPLICITLY: completed tickets become skill candidates. Every workflow is a training-data point. After 90 days the library is rich enough that new hires get productive day 1 by inheriting the slash skills.

RELATIONSHIP TO V1: v1 was about permissions + governance (who can do what). v2 is about operational rhythm (typical workday + how one-time task becomes permanent skill). Together they describe the whole system.

QUESTIONS FOR YOU:
1. Do the 2 scenarios match what you imagined?
2. Personal Basecamp - separate projects per person, or sub-todolists on Ali Personal?
3. Skill auto-tag - automatic, or human-driven (Akiwam decides at end of ticket)?
4. Weekly review cadence (Friday 30-min vs daily vs just-in-time)?
5. Want a Chapter 8 on the skill sync mechanics?

Per memory rule: this doc + summary is being attached to the rollout overview BC ticket too, so it lives there durably even if this email gets auto-trashed.

Ali`);

(async () => {
  validateBeforeSend(strip(EMAIL), TEXT);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ali - visual story v2: the Basecamp loop (Akiwam scenarios + personal BC + skill extraction)',
    text: TEXT, html: strip(EMAIL),
    attachments: [
      { filename: 'ai-architect-rollout-story-v2-basecamp-loop.html', content: fs.readFileSync(STORY_HTML), contentType: 'text/html' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
