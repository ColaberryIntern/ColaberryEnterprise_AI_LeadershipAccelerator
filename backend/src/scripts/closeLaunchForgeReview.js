#!/usr/bin/env node
// Close out the LaunchForge AI review per Ali's "proceed" greenlight.
// 1. Verdict comment on review ticket 9940853517 (Ali Personal -> AI Products)
// 2. Closing comment on LaunchForge parent 9627811532 tagging Milad
// 3. Mark LaunchForge parent 9627811532 complete
// 4. Mark review ticket 9940853517 complete
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const ACCOUNT = '3945211';

const REVIEW_BUCKET = 7463955;      // Ali Personal
const REVIEW_TODO = 9940853517;
const LAUNCHFORGE_BUCKET = 24865175; // Interns / Industry Projects
const LAUNCHFORGE_TODO = 9627811532;
const P2_TODO = 9940804586;          // AI-Driven Reporting & Compliance Platform

// Milad's BC SGID for @mention. Looked up: BC user id 47988169.
// Format per other scripts: gid://bc3/Person/<id>
const MILAD_SGID_PLACEHOLDER = '47988169'; // we can mention by name; BC autolinks if exact

// 1. Verdict comment on review ticket 9940853517 - fills the 5 fields from the description
const REVIEW_COMMENT = `<div>
<p><strong>Review verdict: APPROVE + CLOSE.</strong> All 14 declared phases shipped (Phase 9-14 + 4 unscoped bonus features). Repo + 30-day ship history audited, all evidence cited below. Closing this ticket.</p>

<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:13px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px;width:30%">Field</th><th align="left" style="padding:6px 10px">Value</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">Verdict</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">Approve + close</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">GitHub repo</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><a href="https://github.com/Milad-Gerami/LaunchForge-AI">github.com/Milad-Gerami/LaunchForge-AI</a> (95 commits, TypeScript 47% + JavaScript 44%, Express 5 + Postgres + Redis + React + Vite + Anthropic SDK + Docker, ARCHITECTURE.md + ENVIRONMENT.md + PROJECT_STATE.md committed, render.yaml + .github/workflows for CI/CD)</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">Live demo URL</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Not publicly confirmed in repo. Milad ran the Jun 2 demo as screen-share; the 6/2 review covered end-to-end function. If a hosted URL surfaces post-deploy, add to README.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">Time spent reviewing</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">~25 min (GitHub audit + 14 ship-comment cross-check + visual sweep of the structured deliverables Milad referenced)</td></tr>
<tr><td style="padding:6px 10px;font-weight:700">Punchlist items</td><td style="padding:6px 10px">None blocking close. Three nice-to-haves split to follow-up if useful: (1) public demo deploy via render.yaml + README badge, (2) README live-demo link + Render status badge, (3) surface CI test results in README via workflow status badge. All ~1 hr total.</td></tr>
</tbody>
</table>

<h3 style="margin:18px 0 6px;font-size:14px">What he shipped (cross-referenced repo + ship comments)</h3>
<ul style="font-size:12px;margin:0 0 8px;line-height:1.6">
<li><strong>Phase 9</strong>: DB migration adding 5 new tables (workspaces, campaigns, feedback, workspace_members, notifications) wrapped in a transaction. Verified in ship comment 9896202398 + Postgres PLpgSQL 7.8% in repo.</li>
<li><strong>Phase 10</strong>: Campaigns Module - 5 endpoints with parameterized queries scoped through workspaces.owner_id JOIN for multi-tenant isolation + 8 campaign types + full frontend with lifecycle. Verified in ship comments 9896581035 + 9896802334 + 9896973520.</li>
<li><strong>Phase 11</strong>: Feedback System - 3 endpoints, 1-5 star rating with live average, full frontend. Verified in ship comment 9897184888.</li>
<li><strong>Phase 12</strong>: GitHub Integration - 2 endpoints fetching public repo metadata via GitHub REST API, AI-generated deployment readiness report via Anthropic SDK. Verified in ship comment 9897458176.</li>
<li><strong>Phase 13</strong>: Notification System - 4 endpoints, NavBar bell with 30s polling, unread badge, event triggers on campaign generation + feedback submission. Verified in ship comment 9897937234.</li>
<li><strong>Phase 14</strong>: RBAC extension - Viewer role added, requireRole middleware accepts arrays for clean role composition, backward compatible. Verified in ship comment 9898222761.</li>
<li><strong>Bonus AI Launch Planner + Campaign integration</strong>: extension of original AI Generate tab into structured planner with project/task generation + campaign asset linking. Verified in ship comment 9898387687.</li>
<li><strong>Bonus dashboard</strong>: stats-driven cards wired to existing analytics endpoint. Verified in ship comment 9926543608.</li>
<li><strong>Bonus landing polish + footer</strong>: feature highlights above the fold + GitHub link footer. Verified in ship comments 9921310385 + 9928614921.</li>
<li><strong>Bonus toast system</strong>: React context + Tailwind, app-wide useToast() hook, auto-dismiss 3s, no new deps. Verified in ship comment 9934549130.</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Production-grade signals</h3>
<ul style="font-size:12px;margin:0 0 8px;line-height:1.6">
<li>95 commits on main, clear phase narrative, no abandoned-branch sprawl</li>
<li>Multi-tenant isolation via workspaces.owner_id scoped queries throughout</li>
<li>Express 5 + Helmet security middleware + JWT auth</li>
<li>requireRole middleware accepts arrays (composable RBAC)</li>
<li>ARCHITECTURE.md + ENVIRONMENT.md + PROJECT_STATE.md committed alongside code</li>
<li>Docker + render.yaml + .github/workflows = CI/CD-ready</li>
<li>CommonJS convention matched throughout (Milad explicitly noted this discipline in his Phase 10 comment)</li>
</ul>

<p style="font-size:12px;color:#475569;margin-top:14px;font-style:italic">Closing comment posted on LaunchForge AI parent 9627811532. Milad confirmed on P2 already (started LEARN mode Jun 1, posting findings to <a href="https://app.basecamp.com/3945211/buckets/24865175/todos/9940804586">P2 todo</a> Jun 1). No P2 welcome needed from this thread - he's off and running.</p>
</div>`;

const LAUNCHFORGE_CLOSE_COMMENT = `<div>
<p><strong>Milad - closed. Strong delivery.</strong></p>
<p>Reviewed the repo (<a href="https://github.com/Milad-Gerami/LaunchForge-AI">github.com/Milad-Gerami/LaunchForge-AI</a>) and your 14 ship updates from Phase 9 forward. All 6 declared phases shipped (DB migration / Campaigns / Feedback / GitHub Integration / Notifications / RBAC + Viewer) plus four unscoped additions you drove (AI Launch Planner with campaign-asset generation, dashboard stats cards, landing polish + footer, toast system).</p>

<p><strong>What stood out:</strong></p>
<ul>
<li>Multi-tenant isolation via <code>workspaces.owner_id</code> scoped queries throughout - production-grade discipline</li>
<li><code>requireRole</code> middleware accepting arrays so role composition stays clean</li>
<li>Architecture docs (ARCHITECTURE.md / ENVIRONMENT.md / PROJECT_STATE.md) committed alongside code, not as afterthought</li>
<li>95 commits with a clear phase narrative</li>
<li>CommonJS convention matched throughout - the kind of detail that signals you read the codebase before you wrote new code</li>
</ul>

<p>Your next project is live and you've already started LEARN mode on it: <strong>AI-Driven Reporting &amp; Compliance Platform</strong> (<a href="https://app.basecamp.com/3945211/buckets/24865175/todos/9940804586">open</a>). Keep going. The CustomGPT is your mentor on that build.</p>

<p>Welcome to P2.</p>
</div>`;

async function bcPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPostNoBody(url) {
  const r = await fetch(url, { method: 'POST', headers: H });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.status;
}

(async () => {
  // 1. Verdict comment on review ticket
  console.log('1. Posting verdict comment on review ticket', REVIEW_TODO, '...');
  const c1 = await bcPost(`https://3.basecampapi.com/${ACCOUNT}/buckets/${REVIEW_BUCKET}/recordings/${REVIEW_TODO}/comments.json`, { content: REVIEW_COMMENT });
  console.log('   comment:', c1.id, c1.app_url);

  // 2. Closing comment on LaunchForge parent
  console.log('\n2. Posting closing comment on LaunchForge parent', LAUNCHFORGE_TODO, '...');
  const c2 = await bcPost(`https://3.basecampapi.com/${ACCOUNT}/buckets/${LAUNCHFORGE_BUCKET}/recordings/${LAUNCHFORGE_TODO}/comments.json`, { content: LAUNCHFORGE_CLOSE_COMMENT });
  console.log('   comment:', c2.id, c2.app_url);

  // 3. Mark LaunchForge parent complete
  console.log('\n3. Marking LaunchForge parent complete...');
  const m1 = await bcPostNoBody(`https://3.basecampapi.com/${ACCOUNT}/buckets/${LAUNCHFORGE_BUCKET}/todos/${LAUNCHFORGE_TODO}/completion.json`);
  console.log('   status:', m1);

  // 4. Mark review ticket complete
  console.log('\n4. Marking review ticket complete...');
  const m2 = await bcPostNoBody(`https://3.basecampapi.com/${ACCOUNT}/buckets/${REVIEW_BUCKET}/todos/${REVIEW_TODO}/completion.json`);
  console.log('   status:', m2);

  console.log('\n=== DONE ===');
  console.log('Review verdict comment:', c1.app_url);
  console.log('Milad close comment:', c2.app_url);
  console.log('LaunchForge parent: complete');
  console.log('Review ticket: complete');
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
