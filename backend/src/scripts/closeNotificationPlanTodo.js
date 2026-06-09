#!/usr/bin/env node
// Close BC todo 9942071243 (Plan: 4-channel notification system v4-v6) per
// Ali's "default all questions and move forward" greenlight. Lock defaults,
// reality-check status (what's already shipped vs what's left), split the
// genuinely-unbuilt remaining work (voice tier, P4 retrospective) into
// their own focused execution todos so the planning thread can close.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || '';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';
const PLAN_TODO_ID = 9942071243;
// Ali Personal -> AI Products list (target for the 2 follow-up todos).
const AI_PRODUCTS_LIST_ID = 9939449052;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const ALI_ID = 17454835;

const PLAN_COMMENT = `<div>
<p><strong>Defaults locked + status reality-checked. Closing this planning todo.</strong></p>

<p><strong>1. Defaults (your "default all questions and move forward" greenlight):</strong></p>
<ul>
<li><strong>P0 voice $ threshold</strong>: $1,000 on incoming/outgoing payments</li>
<li><strong>P1 SMS allowlist</strong>: Ram, Karun, Luda, Lakeesha, Sai Tejesh, Jackie, Vivek + <strong>Que (added)</strong></li>
<li><strong>Quiet hours</strong>: 10 PM &ndash; 6 AM CT</li>
<li><strong>Session-changelog delivery</strong>: email to all 3 inboxes + Basecamp comment on a meta tracking todo</li>
<li><strong>SMS target</strong>: 6825975784@tmomail.net (already in prod env as INBOX_COS_SMS_TO)</li>
<li><strong>Build phase 1</strong>: greenlit (but see status note below — most of phase 1 is already shipped under a different rail)</li>
</ul>

<p><strong>2. Reality check &mdash; what's actually shipped vs the v4-v6 plan:</strong></p>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:13px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:8px">Component</th><th align="left">Status</th></tr></thead>
<tbody>
<tr><td>Cory daily brief at 6:45 AM CT</td><td style="color:#14532d"><strong>LIVE</strong> (commit 8b9e441d)</td></tr>
<tr style="background:#f8fafc"><td>Inbound CB-System dispatcher (Pattern H-1, */3 min cron)</td><td style="color:#14532d"><strong>LIVE</strong> (prod crontab, scripts/ops-engine/inbound-dispatcher.js)</td></tr>
<tr><td>Backlog enforcer (Pattern H-2, */4 hr cron)</td><td style="color:#14532d"><strong>LIVE</strong> (prod crontab, scripts/ops-engine/backlog-enforcer.js)</td></tr>
<tr style="background:#f8fafc"><td>Decisions-owed digest (Mon/Wed/Fri 9 AM CT)</td><td style="color:#14532d"><strong>LIVE</strong> (prod crontab, sendAliDecisionsOwedDigest.js)</td></tr>
<tr><td>P3 auto-archive (newsletter/marketing silent)</td><td style="color:#14532d"><strong>SHIPPED today</strong> via Inbox Manager Phase 1 (commit 31ae5092)</td></tr>
<tr style="background:#f8fafc"><td>Per-session HTML changelog generator</td><td style="color:#78350f">Tool exists (scripts/generateSessionChangelog.js), discipline ongoing</td></tr>
<tr><td>SMS router with P0/P1/P2/P3 tier (T-Mobile gateway)</td><td style="color:#7f1d1d"><strong>DEPRECATED 2026-06-01</strong> &mdash; you killed the tmomail rail because it duplicated the VIP alerts. Replacement: Mandrill &rarr; Gmail push (smsAlertService.ts repurposed). The 4-tier intent is preserved on the new rail.</td></tr>
<tr style="background:#f8fafc"><td>Voice tier (Synthflow)</td><td style="color:#78350f">Wiring exists (synthflowWebhookController.ts + env keys + agent registry). Build not done. <strong>Split to follow-up todo</strong> (see below) so you can greenlight the call cadence before any robot dials your phone.</td></tr>
<tr><td>P4 daily 24h retrospective</td><td style="color:#78350f">Not built. <strong>Split to follow-up todo</strong> &mdash; recommend BC comment on a meta tracking todo, NOT another email (you already get 9 daily reports; a 10th adds noise).</td></tr>
</tbody>
</table>

<p style="margin-top:14px"><strong>3. Two follow-up todos opened to track the genuinely-unbuilt work:</strong></p>
<ul>
<li>Voice tier (Synthflow) &mdash; pilot or defer? Needs your call on the trigger AND-conditions before any robot dial</li>
<li>P4 daily 24h retrospective &mdash; build as BC comment on meta tracking todo (proposed delivery)</li>
</ul>

<p><strong>Closing this thread.</strong> Planning is complete; execution is now split across the focused todos above + the live crons. Session: CC-20260603-v7da.</p>
</div>`;

(async () => {
  // 1) Post the plan-close comment on the existing planning todo
  const c1 = await fetch(`${BASE}/recordings/${PLAN_TODO_ID}/comments.json`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ content: PLAN_COMMENT }),
  });
  if (!c1.ok) throw new Error(`Plan comment POST -> ${c1.status} ${await c1.text()}`);
  const planComment = await c1.json();
  console.log('Plan comment:', planComment.id, planComment.app_url);

  // 2) Create follow-up todo: Voice tier
  const voiceContent = 'Voice tier (Synthflow) - pilot or defer?';
  const voiceDesc = `<div>
<p><strong>Origin:</strong> spun out of planning todo #${PLAN_TODO_ID} (4-channel notification system v4-v6). Ali greenlit "default + move forward" 2026-06-03; planning closed; this is the focused execution todo for the voice piece.</p>
<p><strong>What's already wired:</strong></p>
<ul>
<li>Synthflow API key + 2 agent IDs in prod env</li>
<li>backend/src/controllers/synthflowWebhookController.ts handles inbound webhooks</li>
<li>Reuses the same voice agent infrastructure that runs campaign calls</li>
</ul>
<p><strong>What's NOT wired:</strong> the trigger logic that decides when to fire an outbound robot call to Ali. v4 plan defaults:</p>
<ul>
<li>Any 2 of: P0 tag explicit / from Ram or Karun / contains "urgent" or "call me" or "now"</li>
<li>Financial transaction > $1,000</li>
<li>Production outage detected</li>
<li>Calendar event starting in next 5 min unacknowledged</li>
</ul>
<p><strong>Why this is a separate todo:</strong> per the autonomy rules, enabling a new outbound voice channel needs Ali's explicit greenlight on cadence first. False-positive robot calls are highly disruptive; better to under-fire than over-fire.</p>
<p><strong>Decision Ali owes:</strong> "pilot this week" / "defer to Q3" / "tighter triggers - only X and Y". 1-line answers fine.</p>
</div>`;
  const t1 = await fetch(`${BASE}/todolists/${AI_PRODUCTS_LIST_ID}/todos.json`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ content: voiceContent, description: voiceDesc, assignee_ids: [ALI_ID] }),
  });
  if (!t1.ok) throw new Error(`Voice todo POST -> ${t1.status} ${await t1.text()}`);
  const voiceTodo = await t1.json();
  console.log('Voice tier todo:', voiceTodo.id, voiceTodo.app_url);

  // 3) Create follow-up todo: P4 daily retrospective
  const p4Content = 'P4 daily 24h retrospective - build as BC comment on meta todo (proposed)';
  const p4Desc = `<div>
<p><strong>Origin:</strong> spun out of planning todo #${PLAN_TODO_ID} (4-channel notification system v4-v6). Ali greenlit "default + move forward" 2026-06-03; planning closed; this is the focused execution todo for the P4 retrospective piece.</p>
<p><strong>Proposed delivery:</strong> Basecamp comment on a meta tracking todo "[Tracking] Daily retrospective" inside Ali Personal -> AI Products, NOT another email. Reasoning: Ali already receives 9 scheduled daily reports (Cory 6:45a, Ali Personal Decisions 8a, Gov Contracts 9a, Launch PMO 10a, Anthropic 11a, Intern Nudges 12p, AI Pathway 1p, ShipCES 2p, LandJet 3p). A 10th daily email at 6p would add noise. A BC comment on a meta todo gets the same content into Ali's flow without adding to inbox volume + threads it for retrospective scanning.</p>
<p><strong>Source:</strong> last 24h of email landed across ali@colaberry.com + alimuwwakkil@gmail.com + ali_muwwakkil@hotmail.com (now flowing through Gmail forward).</p>
<p><strong>Buckets:</strong> decisions you missed / blockers detected / questions awaiting your answer / VIP touches / theme of the day.</p>
<p><strong>Cadence:</strong> 6 PM CT daily (23:00 UTC).</p>
<p><strong>Decision Ali owes:</strong> "build as BC comment" (default) / "build as email after all" / "defer". Approve and CB ships v1 next session.</p>
</div>`;
  const t2 = await fetch(`${BASE}/todolists/${AI_PRODUCTS_LIST_ID}/todos.json`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ content: p4Content, description: p4Desc, assignee_ids: [ALI_ID] }),
  });
  if (!t2.ok) throw new Error(`P4 todo POST -> ${t2.status} ${await t2.text()}`);
  const p4Todo = await t2.json();
  console.log('P4 retrospective todo:', p4Todo.id, p4Todo.app_url);

  // 4) Mark the planning todo complete
  const m = await fetch(`${BASE}/todos/${PLAN_TODO_ID}/completion.json`, {
    method: 'POST', headers: H,
  });
  if (!m.ok) throw new Error(`Plan todo completion POST -> ${m.status} ${await m.text()}`);
  console.log('Plan todo', PLAN_TODO_ID, 'marked complete');

  console.log('---');
  console.log('SUMMARY');
  console.log('  Planning todo closed:', PLAN_TODO_ID);
  console.log('  Plan comment:', planComment.app_url);
  console.log('  Voice tier follow-up:', voiceTodo.app_url);
  console.log('  P4 retrospective follow-up:', p4Todo.app_url);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
