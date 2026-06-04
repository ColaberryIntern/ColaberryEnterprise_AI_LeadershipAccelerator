#!/usr/bin/env node
// Post focused-question verdict on HubSpot replacement BC todo 9859064184
// per Standing Orders ASK IF UNSURE. Cannot review the 11-row spec doc
// without access to the file; gh CLI returns 404 on every org variant
// tried for github.com/colaberry/colaberry-training-migration.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7482752';
const TODO = 9859064184;

const QUESTION = `<div>
<p><strong>ASK IF UNSURE - need spec access before approve/feedback.</strong> The Standing Orders rubric requires the COMPLETENESS + INTERN SUCCESS TEST gates to pass; I cannot honor those without reading the actual 11-capability spec doc. Posting the access gap + 3 ways to unblock me.</p>

<h3 style="margin:18px 0 6px;font-size:14px">What I have</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li>Tejesh comment 2026-05-19 referencing <code>docs/phase-3-replacement-features.md</code> in repo <code>github.com/colaberry/colaberry-training-migration</code></li>
<li>Summary from that comment: 11 capability spec rows with Build / Integrate / Skip recommendations, recommended stack (Resend / PostHog / Cal.com / Metabase or custom Next.js / instantly.ai), $12K-$15K/yr saved vs HubSpot Marketing Hub, 4-phase rollout plan (3a Foundation 2 wk, 3b Communications 2 wk, 3c Analytics 2 wk, 3d Wind-down ongoing)</li>
<li>Dependencies stated: awaiting Sohail's 6 answers + enterprise.colaberry.ai Lead API spec</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">What I tried</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li><code>WebFetch https://raw.githubusercontent.com/colaberry/colaberry-training-migration/main/docs/phase-3-replacement-features.md</code> -> 404</li>
<li><code>gh api repos/colaberry/colaberry-training-migration/contents/docs/phase-3-replacement-features.md</code> -> 404</li>
<li><code>gh repo view</code> against owners <code>Colaberry</code>, <code>colaberry</code>, <code>ColaberryAI</code>, <code>ColaberryInc</code>, <code>ColaberryIntern</code> -> all 404</li>
<li>Local clone search across AI Projects directory -> no match</li>
</ul>
<p style="font-size:12.5px;margin:0 0 8px">The gh CLI here is authed as <code>ColaberryIntern</code>; it has access to repos like <code>ColaberryIntern/AI_ProjectArchitect</code> + <code>ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator</code> but not the training-migration repo Tejesh referenced. Either the owner string is different or the repo is private to a different identity.</p>

<h3 style="margin:18px 0 6px;font-size:14px">Three ways to unblock - pick one</h3>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12.5px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px;width:32%">Option</th><th align="left" style="padding:6px 10px">What it means</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><strong>A. Send the correct repo URL</strong></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Paste the actual owner/repo on this todo and I refetch + review same-session. Fastest if the repo is just under a different owner string.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><strong>B. Attach the spec doc on this todo</strong></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Tejesh exports <code>docs/phase-3-replacement-features.md</code> as a Basecamp attachment on this todo and I review from the BC API.</td></tr>
<tr><td style="padding:6px 10px"><strong>C. Reroute approval</strong></td><td style="padding:6px 10px">If review by you specifically is not required, Sohail (whose 6 answers are a dependency) is the closer fit. Reassign + I close this without review.</td></tr>
</tbody>
</table>

<h3 style="margin:18px 0 6px;font-size:14px">What I could approve right now WITHOUT the spec doc</h3>
<p style="font-size:12.5px;margin:0">Directional read on the summary alone (read this as a non-binding gut check, not the review the deliverable asks for):</p>
<ul style="font-size:12.5px;margin:6px 0 0;line-height:1.6">
<li>Resend at $20/mo vs HubSpot Marketing Hub Pro $890/mo is a clean swap (~$10K/yr savings on email alone). API-grade deliverability + transactional + marketing in one pipe. Approve directionally.</li>
<li>PostHog for analytics with joins to Lead + Contact tables is the right shape - self-hostable, privacy-respecting, identity stitching matches our data model. Approve directionally.</li>
<li>Cal.com for meetings + Metabase for dashboards are both safe default-better-than-HubSpot picks. Approve directionally.</li>
<li>instantly.ai for cold outreach is a stronger inboxing tool than HubSpot sequences. Approve directionally.</li>
<li>4-phase rollout (3a Foundation -> 3b Comms -> 3c Analytics -> 3d Wind-down) is the right dependency order; Lead API + Contact import has to land before Comms can fire.</li>
<li>Dependency call-out (Sohail's 6 answers + Lead API spec) is honest and accurate.</li>
</ul>

<p style="font-size:12.5px;color:#475569;margin-top:14px;font-style:italic">Not closing this todo - explicit approval requires reading the 11 spec rows + verifying each Build / Integrate / Skip call has concrete done-criteria. Pick A, B, or C and I move. Session: CC-20260603-v7da.</p>
</div>`;

(async () => {
  const r = await fetch(`${BASE}/recordings/${TODO}/comments.json`, {
    method: 'POST', headers: H, body: JSON.stringify({ content: QUESTION }),
  });
  if (!r.ok) throw new Error(`POST -> ${r.status} ${await r.text()}`);
  const c = await r.json();
  console.log('focused-question comment:', c.id, c.app_url);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
