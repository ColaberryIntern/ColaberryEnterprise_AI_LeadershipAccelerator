#!/usr/bin/env node
// Post a comment on Sunday's AegisFX ticket telling him to schedule a demo,
// + create Ali's 2-week follow-up.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');

const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';

(async () => {
  // Sunday's note
  const sundayComment = await ops.bcPost('/buckets/24865175/recordings/9578706321/comments.json', {
    content: `<div><span style="background:#dc2626;color:white;font-weight:700;font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:1px">URGENT - DEMO REQUIRED</span></div>
<div style="margin-top:10px;font-size:14px;color:#1f2937">Sunday,</div>
<p>Ali here. We are doing an expense audit and your AegisFX project uses the Alpha Vantage API which costs Colaberry <strong>$100/month</strong>. Without something substantial to show for it, there is no way we can continue to pay this bill every month if the project is not moving toward a real product.</p>
<p><strong>What I need from you, ASAP:</strong> schedule a demo with me of what you have built so far. Show me where you are with AegisFX, architecture, signal generation logic, backtests, current model performance, integration plans. Anything you can show in working code or chart form. Be concrete. If the project is not in a state where a demo makes sense, tell me what milestone you need to hit first and when you will hit it.</p>
<p><strong>Goal:</strong> by the end of this demo I either keep paying the Alpha Vantage bill because the project is clearly on track, or we pull the plug and reroute you to a project that uses APIs we already have.</p>
<p>Reply on this ticket with proposed demo times this week. If I do not hear back by 2026-06-08, the Alpha Vantage subscription gets cancelled and you switch projects.</p>
<div style="margin-top:10px;font-size:11px;color:#64748b">Posted on behalf of Ali by CB System per the 2026-06-01 expense audit. Cross-referenced on the expense audit todo 9948510922.</div>`,
  });
  console.log('Sunday comment:', sundayComment.id);

  const followup = await ops.createTodo({
    projectId: 7463955,
    listId: 9939449052,
    content: '[Follow-up] Sunday AegisFX demo + Alpha Vantage $100/mo cancel decision',
    description: `<div>Two-week follow-up to the 2026-06-01 expense audit conversation with Sunday.</div>
<h3>What to check</h3>
<ol>
<li>Did Sunday schedule a demo by 2026-06-08?</li>
<li>If demo happened: was AegisFX substantial enough to justify the $100/mo Alpha Vantage spend?</li>
<li>If demo did not happen: cancel Alpha Vantage immediately + reassign Sunday to a project using APIs we already pay for.</li>
</ol>
<h3>Decision tree</h3>
<ul>
<li><strong>Demo strong + clear roadmap</strong>: keep Alpha Vantage, set milestone-based renewal review.</li>
<li><strong>Demo weak or did not happen</strong>: cancel Alpha Vantage, save $100/mo ($1,200/yr), redirect Sunday.</li>
</ul>
<h3>Links</h3>
<ul>
<li>Sunday AegisFX ticket: <a href="https://app.basecamp.com/3945211/buckets/24865175/todos/9578706321">9578706321</a></li>
<li>Expense audit ticket: <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9948510922">9948510922</a></li>
</ul>
<p style="font-size:11px;color:#64748b">Created 2026-06-01 by CB System per Ali.</p>`,
    assigneePersonIds: [17454835],
    dueOn: '2026-06-15',
  });
  console.log('Follow-up:', followup.id, followup.app_url);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
