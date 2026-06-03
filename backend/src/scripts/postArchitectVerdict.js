#!/usr/bin/env node
// Post focused-question verdict on AI_ProjectArchitect Build Index ticket
// 9956775973. Per Standing Orders SCOPE GUARD + ASK IF UNSURE: do not
// attempt a 5-week multi-repo build in this session. Ask Ali to confirm
// the execution location before continuing.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';
const PLAN_TODO = 9956775973;

const VERDICT = `<div>
<p><strong>SCOPE GUARD triggered. Asking before executing.</strong> This ticket asks me to fully build a 5-week, multi-tenant SaaS platform in a different git repository. That is far past 2x the scope of a single session and explicitly outside this session's repo. Before I take action, I need you to confirm the execution boundary.</p>

<h3 style="margin:18px 0 6px;font-size:14px">What the ticket actually asks</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li>Target system: <strong>advisor.colaberry.ai/library/</strong></li>
<li>Build repo: <strong>github.com/ColaberryIntern/AI_ProjectArchitect</strong> (separate Python/FastAPI repo, NOT this Colaberry Enterprise AI Leadership Accelerator repo)</li>
<li>Build sequence: 5 weeks (Week 1 foundation - Infra 1 / Auth 1 / Auth 2 + Provision 2; Week 2 admin + provisioning; Week 3 data + library UX; Week 4 workflows + sync; Week 5 deploy + docs)</li>
<li>Parallel: Karun + Kes 30-day pilots, then Phase 2 exec onboarding (Day 31-60), then Phase 3 (Day 61-90), then retro</li>
<li>Description names 33 tickets total. The Basecamp parent list "AI_ProjectArchitect company-wide rollout (Karun + Kes pilot)" currently holds 15 todos visible (Karun 5-step + Kes 5-step + Phase 2 x3 + 2 overview/index); the remaining ~18 tickets referenced in the Build Index are not yet broken out as separate Basecamp todos.</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Why this is explicitly NOT a this-session task</h3>
<p style="font-size:12.5px;margin:0 0 6px">From the Build Index itself (comment 9956776017): "A Claude Code agent in the ColaberryIntern/AI_ProjectArchitect repo should be able to read this list cold and build the system end to end. The list is the contract. The repo is the canvas."</p>
<p style="font-size:12.5px;margin:0">From comment 9956813365: "The exact prompt Ali pastes into a fresh Claude Code chat opened in the AI_ProjectArchitect repo to start the buildout." (ADVISOR_CLAUDE_CODE_PROMPT.md)</p>
<p style="font-size:12.5px;margin:6px 0 0">Both of those state plainly that the intended execution environment is a Claude Code session in the OTHER repo, not this one.</p>

<h3 style="margin:18px 0 6px;font-size:14px">Repo state confirmed (audited from this session)</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li>Local clone exists at <code>c:/Users/ali_m/OneDrive/Business/Colaberry Novedea/AI Projects/AI Project Architect &amp; Build Companion/</code></li>
<li>Git remote: <code>github.com/ColaberryIntern/AI_ProjectArchitect.git</code> (confirmed)</li>
<li>Recent commits on main: my_day drill-down UI work (35131ef, 7b7fffd, 64e5790, 409b554, 9a787a1) - active work happening already</li>
<li>BUILD_INDEX.md and current_list_snapshot.json reference is on this BC todo as attachments; not yet committed to the repo</li>
<li>ADVISOR_CLAUDE_CODE_PROMPT.md (the kickoff prompt for the OTHER agent) is also a BC attachment; not in the repo</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Three options - pick one</h3>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12.5px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px;width:32%">Option</th><th align="left" style="padding:6px 10px">What it means</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><strong>A. Use the intended path</strong></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">You open a fresh Claude Code session in the AI_ProjectArchitect repo, paste the ADVISOR_CLAUDE_CODE_PROMPT.md kickoff prompt, and that agent runs the buildout from there. This session does nothing on this ticket. <strong>This is what the Build Index was written for.</strong></td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><strong>B. Cross-repo bootstrap from here</strong></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">I write to the AI_ProjectArchitect filesystem from this session (paths are accessible). I download BUILD_INDEX.md + current_list_snapshot.json + ADVISOR_CLAUDE_CODE_PROMPT.md from BC into the repo, commit them, and start on Week 1 ticket 1 (Infra 1). Slow because every action crosses repo boundaries; risky because this session has zero context on the AI_ProjectArchitect repo's existing structure (services, agents, configschemas, etc).</td></tr>
<tr><td style="padding:6px 10px"><strong>C. Coordinate-only from here</strong></td><td style="padding:6px 10px">I pull the BUILD_INDEX.md + snapshot into the AI_ProjectArchitect repo so they are committed and present, then stop. The actual build still happens via Option A in a separate session. This unblocks the OTHER agent without me building anything in the wrong context.</td></tr>
</tbody>
</table>

<h3 style="margin:18px 0 6px;font-size:14px">My recommendation</h3>
<p style="font-size:12.5px;margin:0"><strong>Option C, then Option A.</strong> I commit the spec files to the AI_ProjectArchitect repo from this session (15 minutes) so the kickoff prompt has the artifacts available. You then run Option A in a fresh Claude Code session opened in that repo. The Build Index was authored for that flow; honoring it gives the build agent clean context to work with.</p>

<h3 style="margin:18px 0 6px;font-size:14px">What I need from you to proceed</h3>
<p style="font-size:12.5px;margin:0">One-line answer: <strong>A, B, or C.</strong> If B, also confirm whether you accept the cross-repo risk + want me to start with Infra 1 specifically. If C, I commit the spec files and stop.</p>

<p style="font-size:12.5px;color:#475569;margin-top:14px;font-style:italic">Not closing this ticket - explicit close requires your call on which option. Session: CC-20260603-v7da.</p>
</div>`;

(async () => {
  const r = await fetch(`${BASE}/recordings/${PLAN_TODO}/comments.json`, {
    method: 'POST', headers: H, body: JSON.stringify({ content: VERDICT })
  });
  if (!r.ok) throw new Error(`POST -> ${r.status} ${await r.text()}`);
  const c = await r.json();
  console.log('verdict comment:', c.id, c.app_url);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
