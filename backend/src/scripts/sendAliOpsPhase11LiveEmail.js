#!/usr/bin/env node
// Phase 1.1 live: Ali's actual triage feed + per-task Claude Code prompt.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:800px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Phase 1.1 LIVE · Your triage feed across CB-managed projects</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">293 of your open todos across 21 projects, sorted by urgency, with a Run-in-Claude-Code prompt on every high-priority one.</h1>
<div style="font-size:13px;color:#cbd5e0">Filter narrowed to <strong>only todos assigned to you</strong> + <strong>only CB-managed projects</strong>. Page leads with the queue now; system stats moved to a collapsed footer toggle.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What changed on /admin/ops</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Scope narrowed to you</strong> — Ali Muwwakkil at <code>ali@colaberry.com</code> (BC id 17454835). The prior hardcoded ID was the bot service account (CB System / vishnu@), not you, which is why the first cut showed zero — fixed in commit <code>8901e99f</code>.</li>
<li><strong>Project tabs at the top</strong> — every CB-managed project with your open count + red count. Double-click a tab to dim a project (toggles <code>is_cb_managed=false</code>); "All projects" tab aggregates.</li>
<li><strong>Body restructured to Project &rarr; Todolist &rarr; Task</strong> — same hierarchy the client reports use (ShipCES, etc.). Tasks sorted by urgency within each todolist.</li>
<li><strong>Per task: score badge + category chip + Claude Code prompt</strong>. Tasks at urgency &gt;=40 get a "Run in Claude Code" button that expands a code block with a templated prompt + a Copy button (writes to clipboard).</li>
<li>System Health + Triage Breakdown collapsed into a footer toggle so the page leads with the actual work.</li>
</ul>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Your top 10 projects right now</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px">Project</th>
<th style="padding:10px 14px;text-align:right;font-size:11px;width:80px">Open</th>
<th style="padding:10px 14px;text-align:right;font-size:11px;width:80px">Red</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Data Analytics Sales Team</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">64</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">55</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Ali Personal</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">49</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">11</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Management Team</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">46</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">40</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">AI Systems Architect Accelerator</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">39</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">3</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Anthropic Partner Network - 10-Person Onboarding</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">18</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">0</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">TWC</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">17</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">13</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">ShipCES - Autonomous Brokerage</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">15</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">1</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Marketing Team</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">11</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">4</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Dev Team</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">10</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">5</td></tr>
<tr><td style="padding:8px 12px">Data Project</td><td style="padding:8px 12px;text-align:right;font-weight:700">5</td><td style="padding:8px 12px;text-align:right;color:#7f1d1d;font-weight:700">2</td></tr>
</tbody>
</table>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What the Run-in-Claude-Code prompt looks like (worked example)</h2>
<p style="font-size:14px">When you click "Run in Claude Code" on a task, you get a templated prompt that the agent can act on. The template adapts based on the task type (reply / decision / research / meeting / default). Sample (truncated):</p>
<pre style="background:#0b1220;color:#cbd5e1;border:1px solid #1d2a44;border-radius:6px;padding:14px;font-size:11.5px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;word-break:break-word">
# Run-my-day task: &lt;task title&gt;

## Task context
- Project: Data Analytics Sales Team
- Todolist: Active Leads
- BC ticket: https://app.basecamp.com/3945211/buckets/...
- BC todo id: 9956...
- Urgency: 85/100 · human_required · OVERDUE by 3 day(s)
- Last updated: 2026-05-28T14:22:00.000Z

## What you (Claude Code) have access to in this repo
- Basecamp 3 API via BASECAMP_ACCESS_TOKEN (env)
- backend/src/scripts/lib/sendWithBcAttach.js - REQUIRED outbound email path
- scripts/ops-engine/cb-context-walker.js - pulls full BC ticket context
- Gmail MCP, Drive MCP, Calendar MCP
- Mandrill SMTP for outbound from ali@colaberry.com

## What I want you to do
1. Pull the full thread context via the CB walker
2. Identify the most recent inbound message that needs a reply
3. Draft a reply in my voice (concise, no em-dashes, plain text for campaigns / HTML for 1:1)
4. Send via sendWithBcAttach with ticketId: &lt;bc_id&gt; so the email lands as a comment
5. Post a one-line summary of what you sent

## Auto-attach contract
- Every outbound email must use sendWithBcAttach with ticketId: &lt;bc_id&gt;
- Em-dashes are auto-stripped
- Any produced doc gets uploaded to BC Vault under "CB Context Dossiers"

## Stop conditions
- Stop and wait if the action sends externally without my explicit Approve
- Stop and escalate if the task touches money / contracts / hiring

Start now.
</pre>
<p style="font-size:13px;color:#475569;margin-top:6px;font-style:italic">The "What I want you to do" section changes per category — for decision tasks it tells the agent to summarize options + wait; for research tasks it tells the agent to produce a Vault doc; for meetings it uses the Calendar MCP.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Two flags worth your read</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>50 projects flagged CB-managed.</strong> The sync defaults everything to <code>is_cb_managed=true</code> on first insert; some of those 50 are likely old / inactive. Double-click any project tab on /admin/ops to dim it (sets the flag to false); it will stop appearing in your queue until you re-enable it. Phase 1.2 should auto-determine by "has @CB activity in last 30 days".</li>
<li><strong>Data Analytics Sales Team at 64 open / 55 red is the suspicious one.</strong> Either that team has 55 genuinely urgent items on you, or the scoring is over-firing on stale/overdue admin tasks where the urgency signal is real but the action signal is low. Worth a 30-second spot check before I tune the rules — open one of the red ones and tell me if it feels right.</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What is next (per your "move on to the next portion")</h2>
<p style="font-size:14px">The remaining Phase 1 surfaces from the brief:</p>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Approval workspace</strong> — per-todo decision panel: artifact preview, 4-branch decision (Approve / Approve+Continue / Revise / Reject), writes back to BC as a comment.</li>
<li><strong>Run My Day mode</strong> — sequenced "next 5 tasks" pulled from your top urgency, each with its prompt ready to fire.</li>
<li><strong>metrics_daily nightly rollup</strong> — Today's Pulse tile lights up with approvals_completed / hours_saved.</li>
<li><strong>CB-managed auto-detection</strong> (the flag in #1 above).</li>
</ol>
<p style="font-size:14px;margin:18px 0 0">Going to start on the Approval workspace next unless you redirect. Reach the page at <a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">enterprise.colaberry.ai/admin/ops</a> — log in with admin_token first.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - Phase 1.1 live. Your triage feed across CB-managed projects.

293 active todos assigned to you across 21 projects. 225 will get Claude Code prompts (urgency >=40). 141 red (>=70). 0 backend restarts.

WHAT CHANGED ON /admin/ops:
- Scope narrowed to ONLY your todos in ONLY CB-managed projects (was showing all, useless)
- Hardcoded ID was the bot service account (CB System / vishnu@). Real Ali is BC id 17454835 (ali@colaberry.com / Managing Director). Fix in 8901e99f.
- Project tabs at the top with per-project open + red counts. Double-click to dim a project. "All projects" aggregates.
- Body restructured to Project -> Todolist -> Task (same hierarchy as ShipCES + other client reports).
- Per task: score badge + category chip + a "Run in Claude Code" button that expands a templated prompt with Copy button.
- System Health + Triage Breakdown collapsed into a footer toggle. Page leads with your queue.

TOP 10 PROJECTS:
- Data Analytics Sales Team: 64 open / 55 red
- Ali Personal: 49 / 11
- Management Team: 46 / 40
- AI Systems Architect Accelerator: 39 / 3
- Anthropic Partner Network 10-Person Onboarding: 18 / 0
- TWC: 17 / 13
- ShipCES - Autonomous Brokerage: 15 / 1
- Marketing Team: 11 / 4
- Dev Team: 10 / 5
- Data Project: 5 / 2

THE PROMPT TEMPLATE adapts per task type:
- reply tasks: walker + draft + sendWithBcAttach
- decision tasks: walker + summarize options + wait for Approve
- research tasks: walker + Vault doc + email back
- meeting tasks: walker + Calendar MCP suggest_time + invite
- default: walker + propose action + wait

Each prompt declares what you have access to (sendWithBcAttach, CB walker, Gmail/Drive/Calendar MCP, Mandrill), enforces the auto-attach contract, and includes stop conditions per the governance model.

TWO FLAGS WORTH YOUR READ:
1. 50 projects defaulted to CB-managed=true on first insert. Some are likely old/inactive. Double-click tab to dim. Phase 1.2 should auto-determine by "has @CB activity last 30d".
2. Data Analytics Sales Team at 64/55 (86% red) is suspicious. Spot check one before I tune rules.

WHAT IS NEXT (per your "move on"):
1. Approval workspace (4-branch decision panel + BC write-back)
2. Run My Day mode (sequenced next-5)
3. metrics_daily nightly rollup
4. CB-managed auto-detection

Starting on the Approval workspace next unless you redirect.

enterprise.colaberry.ai/admin/ops

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - /admin/ops is now YOUR queue (293 todos, 21 projects, Run-in-Claude-Code prompts on 225 of them)',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Phase 1.1 deployed (commit <code>8901e99f</code> + <code>f811493a</code>). <code>/admin/ops</code> is now scoped to Ali\'s assigned todos in CB-managed BC projects: 293 active across 21 projects, 225 high-priority (>=40 urgency) with templated Claude Code prompts, 141 red (>=70). Body restructured to Project -> Todolist -> Task hierarchy (same shape as ShipCES client reports). Project tab nav at top with open+red counts per project; double-click dims a project. Each high-priority task carries a "Run in Claude Code" button that expands a templated prompt block + copy-to-clipboard. Two open flags surfaced in body: (1) 50 projects defaulted to CB-managed=true and need triage, (2) Data Analytics Sales Team at 64/55 (86% red) is scoring-quirk-suspect. Next surface: Approval workspace + Run My Day + metrics_daily rollup + CB-managed auto-detection.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
