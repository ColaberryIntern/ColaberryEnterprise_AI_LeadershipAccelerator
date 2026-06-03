#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Fixed · stuck-loading + steps/tools-in-workspace</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Workspace now opens fast (5s hard cap) and leads with the suggested steps + tools/skills/agents/workflows.</h1>
<div style="font-size:13px;color:#cbd5e0">Two issues compounded. The page was downloading 225 full Claude Code prompts (~700KB) on every load, AND the Decide click was doing a live Basecamp fetch with no timeout. Fixed both.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What caused the stuck-loading</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>/my-queue was 700KB+.</strong> The endpoint was returning 225 fully-rendered prompt bodies in one shot. Slim now: just the task metadata + a <code>has_suggestion</code> flag. ~30KB instead.</li>
<li><strong>Decide-click was hitting BC live with no timeout.</strong> The workspace called <code>/comments.json</code> directly on Basecamp. If BC was slow, the workspace spun forever. New behavior: one <code>/workspace</code> endpoint returns the suggestion + raw prompt + comments + decision history in a single round trip, and the BC comments fetch has a 5s hard cap — if it times out, you get the workspace with the suggestion intact + a one-line "BC comments unavailable" note instead of a spinner.</li>
<li><strong>Frontend axios call has a 10s timeout + explicit Retry button.</strong> No more infinite loading state regardless of what upstream does.</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What the workspace shows now (your direction)</h2>
<p style="font-size:14px">When you click <strong>Open workspace</strong> on any task, you see — top to bottom on the left column:</p>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Action-kind badge + one-line summary</strong> — REPLY / DECISION / MEETING / RESEARCH / NEXT ACTION, with a 1-line "what to do" headline.</li>
<li><strong>Suggested steps</strong> — numbered concrete actions tailored to the task category. Not a generic blob, the specific sequence for THIS task.</li>
<li><strong>Tools / Skills / Agents / Workflows / MCPs</strong> — each as a card with a colored kind chip (Tool / Skill / Agent / Workflow / MCP), the name, and a "why this one" explanation. Includes: sendWithBcAttach (auto-attach doctrine), CB context walker, Gmail MCP, Drive MCP, Calendar MCP for meeting tasks, BC HTML comment formatter skill for reply tasks, CCPP MSSQL for research tasks, baseline-ui skill for visual outputs, the Approval Workspace itself as a workflow, etc.</li>
<li><strong>Stop conditions</strong> — amber list of "do NOT do these without my approval" boundaries per the governance model. Different per category.</li>
<li><strong>Show raw prompt for Claude Code</strong> — secondary button. Expands the literal prompt + Copy. Use when you want to paste into a terminal session rather than decide in-place.</li>
<li><strong>Recent BC comments</strong> (4 most recent) + <strong>decision history</strong> (4 most recent) for context.</li>
</ol>
<p style="font-size:14px">Right column: same 6-button decision tree (Approve / Approve+next / Approve+skill / Revise / Reject / Escalate) + reasoning textarea + Post-to-BC checkbox.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Moving on (Phase 1.3)</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Run My Day mode</strong> — sequenced top-5 walk. Locks one task at a time, scrolls automatically, "Approve + next" cleans the queue in a tight loop.</li>
<li><strong>metrics_daily nightly rollup</strong> — Today's Pulse tile will show approvals_completed / hours_saved / approvals_avg_seconds.</li>
<li><strong>CB-managed auto-detection</strong> — replaces the default-true on every project. Auto-flag by @CB activity in last 30d.</li>
</ul>

<p style="font-size:14px;margin:18px 0 0">Refresh <a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">/admin/ops</a> and open the workspace on any task. If the structured suggestion looks wrong for a particular category (REPLY vs DECISION mis-classification, wrong tool recommended, stop conditions too strict or too loose), tell me which task + what's off and I'll tune the recipe.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - workspace fix shipped + structured suggestion lives inside the workspace now.

ROOT CAUSE OF THE STUCK-LOADING:
1. /my-queue was returning 225 fully-rendered Claude Code prompts (~700KB). Now slim ~30KB.
2. Decide-click was hitting Basecamp live with no timeout. Slow BC = infinite spin. New /workspace endpoint returns everything in one round trip, BC comments fetch has a 5s hard cap, frontend axios has 10s timeout + explicit Retry button.

WHAT THE WORKSPACE SHOWS NOW (LEFT COLUMN, top to bottom):
1. Action-kind badge (REPLY/DECISION/MEETING/RESEARCH/NEXT ACTION) + one-line "what to do" headline
2. Suggested steps - numbered, tailored to the task category
3. Tools/Skills/Agents/Workflows/MCPs - each a card with colored kind chip + name + why-this-one. Includes sendWithBcAttach, CB walker, Gmail MCP, Drive MCP, Calendar MCP, BC HTML comment formatter skill, CCPP MSSQL, baseline-ui skill, Approval Workspace workflow, etc.
4. Stop conditions - amber boundaries per the governance model. Different per category.
5. "Show raw prompt for Claude Code" - secondary, expand + copy for terminal paste
6. Recent BC comments (4) + decision history (4)

Right column unchanged: 6-button decision tree + reasoning + Post-to-BC checkbox.

PHASE 1.3 (starting next):
- Run My Day mode - sequenced top-5 walk, "Approve+next" loop
- metrics_daily nightly rollup - Today's Pulse tile lights up
- CB-managed auto-detection - replaces default-true; auto-flag by @CB activity last 30d

Refresh /admin/ops. If a particular task's structured suggestion looks wrong (wrong action kind, wrong tool, stop conditions off), tell me which one and I'll tune the recipe.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - workspace fixed: loads fast + leads with steps + tools/skills/agents/workflows',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Phase 1.2.1 fix shipped (commit <code>aef1d657</code>). Two issues addressed: <code>/my-queue</code> was 700KB+ (225 prompt bodies) -> slimmed to ~30KB by stripping prompts; new <code>GET /api/admin/ops/todos/:bc_id/workspace</code> endpoint returns the full bundle (suggestion + prompt + comments + decisions) in ONE round trip with a 5s hard cap on the BC comments fetch + a 10s axios timeout + explicit Retry on the frontend. UI rebuilt: Open Workspace button replaces the dual Run-in-Claude-Code + Decide buttons. Workspace leads with the structured suggestion - action-kind badge + one-line summary + numbered Suggested steps + Tools/Skills/Agents/Workflows/MCPs cards (each with kind chip + name + why) + Stop conditions, per Ali\'s "show steps + tools/skills/agents/workflows in the suggestion" direction. Raw prompt is still available but collapsed below as secondary. Next: Phase 1.3 - Run My Day mode + nightly metrics_daily rollup + CB-managed auto-detection.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
