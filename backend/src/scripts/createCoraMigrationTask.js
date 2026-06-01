#!/usr/bin/env node
// Create the urgent Cora migration task in AI Systems list +
// cross-link from the expense audit todo.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { getByHandle } = require('./lib/launchPmoTeam');

(async () => {
  const KES = getByHandle('kes');
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/47502609/todosets/${dock.todoset.id}/todolists.json`);
  const aiList = lists.find((l) => /AI Systems/i.test(l.name));
  if (!aiList) throw new Error('AI Systems list not found');

  const descHtml = `<div>
<span style="background:#dc2626;color:white;font-weight:700;font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:1px">URGENT - COST DEPENDENCY</span>
<span style="background:#dbeafe;color:#1e40af;font-weight:700;font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:1px;margin-left:6px">AI TASK</span>
<strong style="margin-left:10px">Owner:</strong> Kes Delele

<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 14px;margin:10px 0;border-radius:0 4px 4px 0">
<div style="font-size:11px;color:#7f1d1d;font-weight:700;letter-spacing:1px">WHY THIS IS URGENT</div>
<div style="font-size:13px;color:#1f2937;margin-top:4px">Cora (the inbox AI at support@colaberry.com) is currently the ONLY remaining production dependency on Relevance AI. Relevance AI costs Colaberry <strong>$349/month recurring</strong>. The sooner Cora is migrated to the new program data and off Relevance AI, the sooner we can cancel the Relevance AI subscription. Per Ali 2026-06-01.</div>
</div>

<h3>Objective</h3>
<p>Retrain Cora on the AI Systems Architect Accelerator class data + migrate her execution off Relevance AI to our internal Claude Code / agent infrastructure.</p>

<h3>Deliverable</h3>
<p>Cora answering support@colaberry.com inquiries about the new program (intensives, pricing, schedule, enrollment, Founding Cohort offer) using our own infrastructure - no Relevance AI calls.</p>

<h3>Definition of done</h3>
<ol>
<li>Cora runs end-to-end against test inbound emails about the AI Systems Architect Accelerator without hitting Relevance AI.</li>
<li>Kes confirms no other production system still depends on Relevance AI.</li>
<li>Ali cancels the Relevance AI subscription (logged on expense audit todo 9948510922) and the recurring $349/month is dropped.</li>
</ol>

<h3>Dependencies</h3>
<p>Curriculum content for the new class needs to exist as Q and A training data (Swati's curriculum work feeds this). Brand + pricing canon from <code>01-brand-pricing.md</code>.</p>

<h3>How to do this in Claude Code</h3>
<p>Open Claude Code + the Kes brief (kes-ai-systems.md) + brand-pricing.md. Pull the existing Cora system prompt + config from Relevance AI. Port the prompt + the support knowledge base to a local agent (gpt-4o or Claude API). Wire support@colaberry.com inbound to the new agent via the existing inbox sync infrastructure (inboxSyncService already polls every 60s).</p>

<h3>Cost link</h3>
<p>Cancelling Relevance AI saves <strong>$349/mo = ~$4,188/year</strong>. This task is the gate. Cross-referenced on the expense audit todo at <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9948510922">https://app.basecamp.com/3945211/buckets/7463955/todos/9948510922</a>.</p>

<p style="font-size:11px;color:#64748b">Created 2026-06-01 by CB System per Ali. Tag <code>@CB System</code> with the migration status and CB will update the expense audit running total when Relevance AI is cancellable.</p>
</div>`;

  const todo = await ops.createTodo({
    listId: aiList.id,
    content: '[URGENT - $349/mo] Migrate Cora (support@colaberry.com inbox AI) off Relevance AI to new class data',
    description: descHtml,
    assigneePersonIds: [KES.basecampPersonId],
    dueOn: '2026-06-17',
  });
  console.log(`\nCora todo: ${todo.id} / ${todo.app_url}`);

  const c = await ops.bcPost(`/buckets/7463955/recordings/9948510922/comments.json`, {
    content: `<div><strong>RELEVANCE AI - conditional on Cora migration (per Ali 2026-06-01):</strong></div>
<div>Relevance AI ($349/mo) still has one production dependency - <strong>Cora, the inbox AI at support@colaberry.com</strong>. Once Kes migrates Cora to the new program data + off Relevance AI, this subscription can be cancelled.</div>
<div>Tracking the migration as <a href="${todo.app_url}">[URGENT] Migrate Cora off Relevance AI</a> in the AI Systems Architect Accelerator project. Assigned to Kes. Due <strong>2026-06-17</strong>. Tagged URGENT because every week of delay costs Colaberry $87.</div>
<div style="font-size:11px;color:#64748b;margin-top:6px">When that todo closes, CB will append the $349/mo savings to the running total here.</div>`,
  });
  console.log(`expense audit comment: ${c.id}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
