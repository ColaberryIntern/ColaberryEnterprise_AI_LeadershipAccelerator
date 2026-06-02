#!/usr/bin/env node
// Send Ali the AI Ops Command Center architecture brief via sendWithBcAttach.
// Lands on AI_ProjectArchitect rollout overview ticket per memory rule.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const STORY_HTML = path.join(REPO, 'docs/ai-ops-command-center-architecture-2026-06-02-standalone.html');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const EMAIL_HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#0f172a 0%,#1a365d 50%,#7c2d12 100%);color:white;padding:28px 32px;border-radius:10px;text-align:center">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin:0 auto 12px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">AI Operations Command Center · Architecture Brief</div>
<h1 style="margin:8px 0 6px;font-size:24px;font-weight:800;line-height:1.3">15 deliverables. One mental model. Two-week MVP that delivers 80% of the value.</h1>
<div style="font-size:13px;color:#cbd5e0">The full architecture document is attached (81 KB standalone HTML, opens in any browser, all images embedded). No code yet, per your instruction. Four decisions needed before Phase 0 starts.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What is in the doc (1080px wide, ~15 sections)</h2>
<ol style="font-size:14px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>Prelude:</strong> reframe — this is the operating system that sits on top of BC, not a tool.</li>
<li><strong>Part I System Architecture:</strong> 6-layer stack diagram (Data → Sync → Agents → Intelligence → Workflow → Presentation), each layer color-coded, strict top-to-bottom dependency.</li>
<li><strong>Part II Database Schema:</strong> 12-table Postgres design — mirrors of BC entities + intelligence tables + the approval queue + skill candidates + automations + metrics.</li>
<li><strong>Part III Agent Architecture:</strong> 8 agents in 3 model tiers (Haiku cheap, GPT-4o-mini mid, Claude Opus heavy). Typed I/O, cost ceilings, no inter-agent calls.</li>
<li><strong>Part IV UI Wireframes:</strong> three screens — Command Center 3-column, Waiting on Human panel (the most important screen), Run-My-Day modal.</li>
<li><strong>Part V Basecamp Integration:</strong> pull-pull-pull (every 2 min + webhooks) + narrow push-back. BC stays canonical.</li>
<li><strong>Part VI GitHub Skill Architecture:</strong> Markdown files + YAML frontmatter. Approval workflow committed to AI_ProjectArchitect repo.</li>
<li><strong>Part VII Approval Workflow:</strong> one decision tree with 4 branches (auto-run / employee confirms / Ali queue / escalate) and 5 outcomes per approval.</li>
<li><strong>Part VIII Automation Engine:</strong> trigger → condition → actions data model. The David ad auto-trigger I shipped today is the canonical example.</li>
<li><strong>Part IX API Specs:</strong> REST endpoints + SSE event stream. No GraphQL.</li>
<li><strong>Part X Phased Implementation:</strong> 6 phases over 10 weeks. Each with explicit exit criteria.</li>
<li><strong>Part XI MVP Scope:</strong> the lean 5-component, 2-week cut. <strong>Test:</strong> "Can Ali handle the daily approval queue from one screen in under 15 minutes?"</li>
<li><strong>Part XII Enterprise Scope:</strong> Phase 5 capabilities for when the team scales past 30.</li>
<li><strong>Part XIII Risks:</strong> 6 risks (over-automation, cost spiral, BC drift, approval fatigue, hallucinated skills, false-positive brand flags) each with specific mitigation.</li>
<li><strong>Part XIV Cost Optimization:</strong> tiered models + caching + batching + per-day caps. Target: <strong>$3.6K-5.4K/month at full Phase 5 scale</strong> (inside Alden's $90/$10 ratio).</li>
<li><strong>Part XV The 80/20 recommendation:</strong> if I could only build one thing — the Waiting on Human panel + rule-based Priority Engine. No LLM yet. Two weeks. Delivers 80% of the value.</li>
</ol>

<div style="margin-top:20px;padding:16px 20px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>The 80/20 cut in one paragraph:</strong> mirror BC, rule-score each open todo for urgency, sort them in one panel with one-click approve. On approve: post a BC comment + mark complete + advance to the next item. No LLM, no Brand Agent, no Skill Extraction yet. Two weeks of work. Ali's day: open the panel at 7am, 8 items sorted by urgency, 14 minutes later the queue is clear. Day 7 metric tells us if it is working.
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Four decisions I need from you before I start coding</h2>

<div style="background:#fef2f2;border-left:5px solid #c1272d;padding:16px 20px;font-size:13px;color:#7f1d1d;border-radius:0 6px 6px 0">
<ol style="margin:0;padding-left:20px;line-height:1.8">
<li><strong>Ratify the MVP scope (Part XI).</strong> 5 components, "one panel under 15 min" test. Add or subtract before I start.</li>
<li><strong>Confirm the tech stack.</strong> React + Tailwind frontend, Node + Express backend, Postgres, SSE for real-time. Matches existing stack so we ship inside the existing deployment pipeline.</li>
<li><strong>Approve the LLM tier strategy + budget cap.</strong> Tier 1 Haiku, Tier 2 GPT-4o-mini, Tier 3 Claude Opus. Per-day cap $200 MVP / $500 Phase 5. Adjust if needed.</li>
<li><strong>Approve me starting Phase 0.</strong> If yes today, MVP demo by 2026-06-16.</li>
</ol>
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What I am NOT asking you to decide right now</h2>
<ul style="font-size:13px;color:#1f2937;padding-left:22px;line-height:1.7">
<li>Naming, file structure, framework choices inside the lanes — those are autonomous per CLAUDE.md.</li>
<li>The Brand rubric content — that comes after the Brand Agent ships and we have artifacts to score.</li>
<li>The Chief of Staff prompt — that comes in Phase 5.</li>
<li>The mobile app design — that comes after MVP proves the desktop panel works.</li>
</ul>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Reply with edits to any section, ratification of the four asks, or just "go" if you want me to start Phase 0 tomorrow. Per operating doctrine the architecture brief HTML is also attached to the AI_ProjectArchitect Overview ticket - durable record even if this email gets auto-trashed.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const EMAIL_TEXT = `Ali - AI Ops Command Center architecture brief attached (81 KB standalone HTML).

WHAT'S IN IT (15 sections):
1. Prelude: this is the OS, not a tool.
2. Part I System Architecture: 6-layer stack diagram, top to bottom, strict layering.
3. Part II Database Schema: 12-table Postgres design.
4. Part III Agent Architecture: 8 agents, 3 model tiers, typed I/O.
5. Part IV UI Wireframes: 3 screens (Command Center + Waiting on Human + Run My Day).
6. Part V BC Integration: pull-pull-pull + narrow push-back.
7. Part VI GitHub Skill Architecture: YAML frontmatter Markdown files.
8. Part VII Approval Workflow: 4-branch decision tree.
9. Part VIII Automation Engine: trigger -> condition -> actions.
10. Part IX API Specs: REST + SSE.
11. Part X Phased Plan: 6 phases over 10 weeks with exit criteria.
12. Part XI MVP Scope: 5 components, 2 weeks. Test: "queue clear in under 15 min."
13. Part XII Enterprise Scope: Phase 5 at 30+ users.
14. Part XIII Risks: 6 risks + mitigations.
15. Part XIV Cost Optimization: $3.6K-5.4K/mo at full scale.
16. Part XV The 80/20: Waiting on Human panel + rule-based Priority Engine. No LLM yet. 2 weeks. 80% of value.

4 DECISIONS I NEED:
1. Ratify the MVP scope (Part XI).
2. Confirm the tech stack (React + Node + Postgres + SSE).
3. Approve LLM tier strategy + budget cap ($200/day MVP, $500/day Phase 5).
4. Approve me starting Phase 0. If yes today, MVP demo by 2026-06-16.

WHAT I AM NOT ASKING YOU TO DECIDE: naming, file structure, framework details, Brand rubric content, Chief of Staff prompt, mobile design.

Reply with edits, ratification, or "go." Per memory rule the doc is also attached to AI_ProjectArchitect Overview ticket as durable record.

Ali`;

const bcSummary = `<div style="font-size:13px;color:#475569">AI Operations Command Center architecture brief drafted in response to Ali's "Principal Product Architect" mission. 15 deliverables covering system architecture, DB schema, agent design, UI wireframes, BC integration, GitHub skill architecture, approval workflow, automation engine, API specs, phased implementation, MVP scope, enterprise scope, risks, cost optimization, and the lean 80/20 cut.</div>
<div style="margin-top:10px;font-size:13px;color:#475569"><strong>80/20 recommendation:</strong> 2-week MVP = Waiting on Human panel + rule-based Priority Engine. No LLM yet. Test: "Ali clears daily approval queue from one screen in under 15 min." If yes, earn Phase 2.</div>
<div style="margin-top:10px;font-size:13px;color:#475569"><strong>4 decisions Ali needs to make:</strong> ratify MVP scope, confirm tech stack, approve LLM tier + budget cap, approve Phase 0 start. If approved today, MVP demo by 2026-06-16.</div>
<div style="margin-top:10px;font-size:13px;color:#475569"><strong>Cost envelope:</strong> $3.6K-5.4K/mo at full Phase 5 scale (17 users, 23+ automations, ~50K agent calls/day). Inside Alden's $90/$10 ratio.</div>`;

(async () => {
  const result = await sendWithBcAttach({
    ticketId: 9953889114, // AI_ProjectArchitect rollout Overview
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - AI Ops Command Center architecture brief (15 deliverables, 2-week MVP, 4 decisions needed)',
    html: EMAIL_HTML,
    text: EMAIL_TEXT,
    attachments: [
      { filename: 'ai-ops-command-center-architecture.html', content: fs.readFileSync(STORY_HTML), contentType: 'text/html' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    vaultAttachments: [
      {
        filename: 'ai-ops-command-center-architecture-2026-06-02.html',
        content: fs.readFileSync(STORY_HTML),
        contentType: 'text/html',
        vaultDescription: 'AI Operations Command Center architecture brief - 15 deliverables. The Principal Product Architect / Staff Engineer cut. No code begins until architecture is approved per CLAUDE.md doctrine.',
      },
    ],
    bcSummary,
  });
  console.log('Mandrill:', result.mandrillId);
  console.log('BC comment:', result.commentUrl);
  console.log('Vault uploads:', result.vaultUploads.map((u) => u.vaultUrl).join('\n  '));
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
