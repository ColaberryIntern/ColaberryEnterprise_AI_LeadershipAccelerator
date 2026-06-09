#!/usr/bin/env node
// Phase 1.2 (Approval Workspace) live on prod.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Phase 1.2 LIVE · Approval Workspace</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Every task in your queue is now decidable in-place. Decision writes back to Basecamp as a comment + saves to the audit trail.</h1>
<div style="font-size:13px;color:#cbd5e0">"Decide" button on each task expands a workspace showing the recent BC comments + a 6-option decision tree. "Approve + next" auto-advances to the next item.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">How to use it</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li>Open <a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">/admin/ops</a>, pick a project tab.</li>
<li>On any task, click the green <strong>Decide</strong> button (next to "Run in Claude Code").</li>
<li>Left pane shows the last 6 Basecamp comments (plaintext) + your decision history on this todo. Right pane has a reasoning textarea + 6 decision buttons.</li>
<li>Pick one:
<ul style="padding-left:18px;margin-top:6px">
<li><strong>Approve</strong> — green light, done.</li>
<li><strong>Approve + next</strong> — green light + auto-jumps to the next task in your queue (the run-my-day flow).</li>
<li><strong>Approve + skill</strong> — green light + flags this for skill extraction (Phase 2 will harvest these into reusable Claude Code skills).</li>
<li><strong>Revise</strong> — send back with notes.</li>
<li><strong>Reject</strong> — kill it.</li>
<li><strong>Escalate</strong> — needs a meeting.</li>
</ul>
</li>
<li>Reasoning is optional. "Post to Basecamp" checkbox is on by default — uncheck if you want the decision recorded but not visible on BC.</li>
<li>"Decisions today" tile in the header counts your decisions today (rolling).</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What lands when you click Approve</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li>One row inserted into <code>ops_approval_queue</code> (audit trail with decided_at, decision, decided_by, urgency_snapshot, optional reasoning).</li>
<li>If "Post to Basecamp" is on: a structured BC comment appears on the originating todo with a color-coded decision card + your reasoning if you filled it in. The team / the agent loop / future you can see the call.</li>
<li>The task tile in your UI gets an OK-green border + faded opacity so you know it's done in this session. (Refresh removes it from the open queue once Phase 1.3 wires "hide decided" toggle.)</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">The "Approve + next" loop</h2>
<p style="font-size:14px">The fastest way to clear the queue: open the top item, decide, the workspace auto-collapses and the next high-priority task's workspace opens with its BC context pre-loaded. Smooth-scrolls to position. Designed so you can sweep 20 decisions in 10 minutes without ever leaving the page.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What is next (Phase 1.3)</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Run My Day mode</strong> — sequenced top-5 view that locks one task at a time, scrolls automatically through the day's most-urgent. Skill-extraction harvest from the "Approve + skill" decisions.</li>
<li><strong>metrics_daily nightly rollup</strong> — Today's Pulse tile (currently the System Health collapse) will light up with hours_saved / approvals_avg_seconds / approvals_completed.</li>
<li><strong>CB-managed auto-detection</strong> — replaces the default-true on every project. Auto-flag projects that have @CB activity in the last 30 days; the others fall off the page so you don't have to dim them manually.</li>
<li><strong>Hide decided</strong> toggle — keep your queue clean as you sweep.</li>
</ul>

<p style="font-size:14px;margin:18px 0 0">Test the decision flow on one low-stakes task. If anything in the workspace feels off (BC comment thread too short, decision buttons in the wrong order, BC write-back format wrong) tell me before I move on to Run My Day.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - Phase 1.2 (Approval Workspace) live on prod.

Every task in /admin/ops is now decidable in-place. The "Decide" button (green, next to "Run in Claude Code") expands a two-column workspace: LEFT shows the last 6 BC comments + your decision history on the todo; RIGHT has a reasoning textarea + 6 decision buttons.

DECISIONS:
- Approve - done
- Approve + next - done + auto-jump to next task (run-my-day flow)
- Approve + skill - done + flag for skill extraction (Phase 2)
- Revise - send back with notes
- Reject - kill it
- Escalate - needs a meeting

WHAT LANDS PER DECISION:
1. Row in ops_approval_queue (audit trail)
2. Color-coded BC comment on the originating todo (if "Post to Basecamp" is checked, default ON)
3. Task tile gets a green border + fade in your UI

THE APPROVE+NEXT LOOP: open top item, decide, workspace auto-collapses, next high-priority task's workspace opens with its BC context pre-loaded + smooth-scrolls. Designed for sweeping 20 decisions in 10 minutes.

DECISIONS TODAY TILE: in the header, counts your decisions today (rolling, filtered to your admin email).

WHAT IS NEXT (Phase 1.3):
1. Run My Day mode (sequenced top-5 walk + skill harvest)
2. metrics_daily nightly rollup (lights up Today's Pulse)
3. CB-managed auto-detection (replaces default-true; auto-flag by @CB activity in last 30d)
4. Hide-decided toggle

Test the flow on one low-stakes task. If anything feels off (comment thread length, button order, BC writeback format) tell me before I move on.

/admin/ops

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - Approval Workspace live (Decide button on every task, BC writeback, Approve+next walk)',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Phase 1.2 deployed (commit <code>80949738</code>). Every task in <code>/admin/ops</code> is now decidable in-place via a green "Decide" button that expands an inline two-column workspace: LEFT = last 6 BC comments + decision history on the todo, RIGHT = reasoning textarea + "Post to Basecamp" checkbox + 6-button decision tree (Approve / Approve+next / Approve+skill / Revise / Reject / Escalate). Each decision lands as a row in <code>ops_approval_queue</code> (audit trail) AND a color-coded structured BC comment on the originating todo (if checkbox on). "Approve+next" auto-advances + smooth-scrolls. Header now shows a "Decisions today" rolling tile. Decided tasks get an OK-green border in-session. Next: Run My Day sequenced mode + nightly metrics_daily rollup + CB-managed auto-detection + hide-decided toggle.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
