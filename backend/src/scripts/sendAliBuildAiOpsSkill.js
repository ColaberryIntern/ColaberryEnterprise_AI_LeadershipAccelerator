#!/usr/bin/env node
// Email Ali the new build-ai-ops-command-center skill .md file.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const SKILL_PATH = path.join(REPO, '.claude/skills/build-ai-ops-command-center/SKILL.md');
const skillBody = fs.readFileSync(SKILL_PATH);

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#0b1220 0%,#1d3a8a 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">New skill · portable recipe</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">build-ai-ops-command-center.md attached. Drop into any new project's .claude/skills/ and Claude Code will replicate the build.</h1>
<div style="font-size:13px;color:#cbd5e0">Synthesized from the BC ticket history (9953889114, 11 phase emails), the actual build (8 services + 7 models + 12 endpoints), the architecture brief, the overnight plan, and the walkthrough doc. Captures the doctrine, schema, phase order, pitfalls we hit, and adaptation table for non-Basecamp trackers.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What's in the skill</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>When to invoke</strong> — concrete signals from the client/operator that say "this fits"</li>
<li><strong>Six-principle doctrine</strong> — deterministic over LLM, human-decides-agent-executes, idempotent sync, mandatory freshness filter, etc.</li>
<li><strong>The 6-layer stack diagram</strong> (Data → Sync → Agents → Intelligence → Workflow → Presentation)</li>
<li><strong>The 6-table minimum schema</strong> with field names that map directly to what we shipped (rename per source tracker)</li>
<li><strong>7-phase build order</strong>: Phase 0 (foundation) → 1 (priority engine v0) → 1.1 (scope-narrow + structured suggestion) → 1.2 (approval workspace + write-back) → 1.3 (Run My Day + metrics) → 1.4 (polish + freshness + auto-detect) → 2-light (skills) → 3-light (brand compliance) → 4-light (automation) → polish</li>
<li><strong>Adaptation table</strong>: how to swap Basecamp out for Linear / Jira / Asana / ClickUp (sync endpoints, comment endpoints, user lookup, "assigned to me" filter, JWT vs API key)</li>
<li><strong>Honest deferrals</strong>: LLM scoring, autonomous outbound, source auto-archive, cross-operator queues — explicitly do-NOT-ship in Phase 0-4-light</li>
<li><strong>Pitfalls we hit</strong> (priceless for the next build):
<ul style="margin-top:4px">
<li>Bot vs operator user_id (the JWT payload was the CB System service account, not you — cost a half-hour of "why is the queue empty")</li>
<li>OOM on Sequelize hydrated models — use raw SELECT + UPDATE + bulkCreate</li>
<li>700KB /my-queue payload from embedded prompts — slim down + lazy-load via /workspace</li>
<li>5-second hard timeout on upstream comments fetch via Promise.race</li>
<li>useRef pattern for keyboard shortcuts (avoid the react-hooks/exhaustive-deps eslint-disable that breaks prod builds)</li>
<li>Stale zombies blow up scoring — the 2018 "Proof of Education" ticket teaching moment</li>
</ul>
</li>
</ul>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">How to use it</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li>Drop the attached <code>SKILL.md</code> into the new project's <code>.claude/skills/build-ai-ops-command-center/SKILL.md</code></li>
<li>Add the project's source-tracker API token to a single env var (e.g. <code>LINEAR_API_KEY</code> or <code>JIRA_API_TOKEN</code>)</li>
<li>Tell Claude Code: <code>/build-ai-ops-command-center</code></li>
<li>The skill will start at Phase 0 and stop between phases for operator approval (unless you explicitly authorize an autonomous overnight run like the one we did last night)</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Sources synthesized</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li>BC ticket 9953889114 — the AI_ProjectArchitect Overview todo where every phase email landed</li>
<li>11 phase emails sent during the build: architecture brief → Phase 0 progress → Phase 0 deployed → mirror live → Phase 1 v0 → Phase 1.1 → Phase 1.2 → Phase 1.2.1 → Phase 1.3 → Phase 1.3.1 → overnight report</li>
<li>The architecture brief HTML at <code>docs/ai-ops-command-center-architecture-2026-06-02.html</code></li>
<li>The overnight plan at <code>docs/ai-ops-overnight-plan-2026-06-02.md</code></li>
<li>The actual shipped code: 8 services (basecampClient, bcSyncService, priorityEngineService, runMyDayPromptService, approvalService, metricsDailyService, automationRulesService, brandComplianceService), 7 models (OpsBcProject, OpsBcTodo, OpsAiAssessment, OpsApprovalQueueItem, OpsMetricsDaily, OpsSkill + the planned OpsAutomationRule which is raw SQL not a Sequelize model), 12 endpoints under <code>/api/admin/ops/*</code></li>
<li>The PROGRESS.md entries for the project — every commit, every verification, every honest deferral logged</li>
</ul>

<p style="font-size:14px;margin:18px 0 0">The skill stands alone — a fresh Claude Code session can pick it up cold and run with it. If you want a second skill for the OPERATING side (how to use /admin/ops day-to-day as the CEO), tell me which project that's for and I'll write that one too.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali — skill ready. Session CC-20260602-9q4r continuing into 2026-06-03.
</div>

</div></body></html>`;

const TEXT = `Ali - build-ai-ops-command-center.md skill attached. Portable recipe for replicating the AI Ops Command Center build in any new project.

What's in the skill:
- When to invoke / when NOT to
- Six-principle doctrine (deterministic > LLM, human decides + agent executes, etc.)
- 6-layer stack diagram
- 6-table minimum schema (Phase 0 ships these)
- 7-phase build order: Phase 0 (foundation) -> 1 (priority engine v0) -> 1.1 (scope-narrow + structured suggestion) -> 1.2 (approval workspace + write-back) -> 1.3 (Run My Day + metrics) -> 1.4 (polish + freshness + auto-detect) -> 2-light (skills) -> 3-light (brand compliance) -> 4-light (automation) -> polish
- Adaptation table: Basecamp -> Linear / Jira / Asana / ClickUp (sync endpoints, comment endpoints, user lookup, "assigned to me" filter)
- Honest deferrals (do NOT ship): LLM scoring, autonomous outbound, source auto-archive, cross-operator queues
- Pitfalls we hit live during the build (each one saved hours for the next operator):
  - Bot vs operator user_id (JWT payload was the CB System service account, not you)
  - OOM on Sequelize hydrated models -> raw SELECT + UPDATE + bulkCreate
  - 700KB /my-queue payload -> slim down + lazy-load via /workspace
  - 5-second Promise.race timeout on upstream comments
  - useRef pattern for keyboard shortcuts (avoid eslint-disable that breaks prod builds)
  - Stale zombies blow up scoring (2018 ticket teaching moment)

How to use:
1. Drop attached SKILL.md into new project's .claude/skills/build-ai-ops-command-center/
2. Add source-tracker API token to single env var
3. Tell Claude Code: /build-ai-ops-command-center

Synthesized from BC ticket 9953889114 (11 phase emails), the architecture brief, the overnight plan, the walkthrough doc, the shipped code (8 services + 7 models + 12 endpoints), and PROGRESS.md entries.

Skill is self-contained - a fresh Claude Code session can pick it up cold.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - build-ai-ops-command-center skill .md (portable recipe for next project)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'build-ai-ops-command-center-SKILL.md', content: skillBody, contentType: 'text/markdown' },
    ],
    vaultAttachments: [
      { filename: 'build-ai-ops-command-center-SKILL.md', content: skillBody, contentType: 'text/markdown', vaultDescription: 'Portable Claude Code skill — recipe for replicating the AI Ops Command Center build on a different project (Basecamp, Linear, Jira, Asana, ClickUp). Synthesized from BC ticket 9953889114 + 11 phase emails + shipped code + PROGRESS.md.' },
    ],
    bcSummary: '<p>Packaged the AI Ops Command Center build as a reusable Claude Code skill. The <code>SKILL.md</code> captures: 6-principle doctrine, 6-layer stack, 6-table minimum schema, 7-phase build order (Phase 0 through 4-light + polish), adaptation table for non-Basecamp trackers (Linear / Jira / Asana / ClickUp), honest deferrals, and every pitfall we hit live during the build (bot vs operator user_id, OOM on Sequelize hydration, 700KB payload, Promise.race timeout, useRef pattern, stale zombies). Drop into any new project as <code>.claude/skills/build-ai-ops-command-center/SKILL.md</code> and run <code>/build-ai-ops-command-center</code> to replicate. Synthesized from this BC ticket (9953889114, 11 phase emails), the architecture brief HTML, the overnight plan, the walkthrough doc, the 8 services + 7 models + 12 endpoints shipped, and the project\'s PROGRESS.md entries.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
  console.log('Vault uploads:', r.vaultUploads?.length);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
