#!/usr/bin/env node
// Create a BC ticket on Ali Personal for the Alden-playbook 90-day upgrade plan.
// One new todolist "AI Management Upgrade (Alden playbook)" + a parent overview
// todo + Phase 1 / 2 / 3 child todos with due dates.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955; // Ali Personal
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Alden Upgrade', Accept: 'application/json', 'Content-Type': 'application/json', ...extra });

async function bcGet(p) {
  const r = await fetch(`${BASE}${p}`, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function bcPost(p, body) {
  const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Compute due dates: today is 2026-06-02, phase 1 ends +30, phase 2 ends +60, phase 3 ends +90
function addDays(daysFromToday) {
  const d = new Date('2026-06-02T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

(async () => {
  console.log('[alden-bc] resolving todoset for Ali Personal...');
  const proj = await bcGet(`/projects/${BUCKET}.json`);
  const todosetDock = (proj.dock || []).find((d) => d.name === 'todoset');
  if (!todosetDock) throw new Error('todoset dock not found on Ali Personal');
  const todoset = await bcGet(`/buckets/${BUCKET}/todosets/${todosetDock.id}.json`);
  const todolistsUrl = todoset.todolists_url.replace(`${BASE}`, '');
  console.log(`  todoset id: ${todosetDock.id}, todolists endpoint: ${todolistsUrl}`);

  console.log('[alden-bc] creating new todolist...');
  const list = await bcPost(`/buckets/${BUCKET}/todosets/${todosetDock.id}/todolists.json`, {
    name: 'AI Management Upgrade - Alden Playbook 90-day Plan',
    description: `<div><strong>Source:</strong> GAI Insights Daily AI News &amp; Learning Lab - Alden DoRosario (CustomGPT). <a href="https://www.youtube.com/watch?v=mV1SAo5BRgo">Full talk (48:39)</a>.</div>
<div style="margin-top:8px"><strong>Origin email (Triad thread):</strong> Mandrill <code>9303b5d0-45bc-5845-fa32-bdc45b071d82@colaberry.com</code> sent 2026-06-02 to Ram + Karun + Ali with the full 90-day plan, side-by-side scorecard vs Alden's pillars, and the 2 audience questions Ram flagged (Ray on AI sovereignty boxes + Yohan on skills-based org).</div>
<div style="margin-top:8px"><strong>Current state:</strong> we are ~60% of the way to Alden's stack. Legibility + skills-in-GitHub are nearly there. Per-person agent + rubric + DRI framing are the wedge. Plan threads Ray's "where AI lives" + Yohan's "what AI knows" through three phases.</div>`,
  });
  console.log(`  list id: ${list.id} | ${list.app_url}`);

  // Parent overview todo
  console.log('[alden-bc] creating parent overview todo...');
  const overview = await bcPost(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
    content: 'OVERVIEW: 90-day upgrade plan + 2 questions analysis',
    description: `<div><strong>Goal:</strong> move from "one big agent + aggregate dashboards" to "per-person agent + per-meeting dashboard + skill-based DRI portfolio." Adapted from Alden DoRosario's CustomGPT playbook for our ~30-person scale.</div>
<div style="margin-top:10px"><strong>Side-by-side scorecard (current vs Alden):</strong></div>
<ul>
<li>Legibility: 75% (BC walker, per-account dossiers, Gmail OAuth, CCPP). Missing Slack/HubSpot/Apollo/Calendar piping.</li>
<li>Pre-meeting dashboard: 30% (aggregate Cory + briefings exist; per-meeting per-person dashboards do not).</li>
<li>Per-person agent: 0%. Cory is org-wide. No karun-agent / david-agent yet.</li>
<li>Rubric (FICO-for-work): 25% (sub-domain only: intern tracker, Openclaw quality gate, ShipCES).</li>
<li>Verification loops: 60% (Coverage Check, Watchdog, circuit breakers). Missing critic-loop on LLM artifacts.</li>
<li>Skills in GitHub: 80% (already in backend/src/scripts/ + scripts/ops-engine/ + .claude/skills/).</li>
<li>$90/$10 ratio: 10%. Not a budget line yet.</li>
<li>DRI model: 65%. Leaders already DRI-shaped, not formally framed.</li>
<li>Earn / Learn / Bond / Save: 5%. Not adopted.</li>
</ul>
<div style="margin-top:10px"><strong>The 2 questions Ram flagged:</strong></div>
<ul>
<li><strong>Ray (~43:00):</strong> AI sovereignty boxes. Our answer = tiered. Tier A hosted (today). Tier B hybrid for client engagements (Coca-Cola, IOU utilities, Patriot match Darrell's cloud-only requirement). Tier C = potential Q4 product: "Colaberry AI Box" pre-loaded with the 5 co-op platforms.</li>
<li><strong>Yohan (~47:18):</strong> skills-based org. Our answer = explicitly frame our ~100 existing skills in repo as the org structure. Each DRI owns a number AND a portfolio of skills. When Karun's PRD gets written, we list 12 skills that produce his 5 numbers - those skills outlast him.</li>
</ul>
<div style="margin-top:10px"><strong>Asks (open in triad email):</strong></div>
<ul>
<li><strong>Ram:</strong> pick pilot person (I proposed Karun). Optionally drafted all-hands Earn/Learn/Bond/Save message.</li>
<li><strong>Karun:</strong> if pilot, give Ali 30 min to write the karun-PRD (systems, 5 numbers, 12 skills, rubric).</li>
<li><strong>Ali:</strong> approve 4-hour pre-meeting dashboard build for Karun (Phase 1 step 3). v1 by EOD next day after approval.</li>
</ul>`,
  });
  console.log(`  overview todo: ${overview.app_url}`);

  // Phase 1
  console.log('[alden-bc] creating Phase 1 todo...');
  const phase1 = await bcPost(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
    content: 'Phase 1 (Days 1-30): Pilot per-person agent for Karun',
    description: `<div><strong>Cost:</strong> low. <strong>Risk:</strong> low. <strong>Due:</strong> ${addDays(30)}.</div>
<ol>
<li>Write Karun's PRD on paper. One page. Systems touched (HubSpot, Gmail, BC, CCPP), 5 numbers owned (active accounts, weighted pipeline, conversion to demo, demo-to-pilot, win rate), rubric per number, 12 skills that produce those numbers.</li>
<li>Build <code>karun-agent</code> as a Claude Code skill under <code>.claude/skills/karun-agent/</code>. Reads BC + Gmail + HubSpot + CCPP via MCP, scores each of the 5 numbers, generates dashboard HTML.</li>
<li><strong>(4-hour MVP - the one Ali needs to approve):</strong> wire <code>/karun-dash</code> to fire automatically 30 min before each 1:1. Reuse calendar integration. Dashboard lands in both Karun's and Ali's inbox.</li>
<li>Add critic-loop pass on the dashboard before send. Reuse Openclaw circuit breaker / Skool quality gate patterns.</li>
<li>Run 4 weeks. Two 1:1s/week. Iterate the rubric based on Karun's pushback.</li>
</ol>
<div style="margin-top:8px"><strong>Why Karun first:</strong> most data-pipeable work (HubSpot lives there), already in lockstep on Coca-Cola, 6 weeks of conversation history for warm-start.</div>`,
    due_on: addDays(30),
    assignee_ids: [],
  });
  console.log(`  Phase 1 todo: ${phase1.app_url}`);

  // Phase 2
  console.log('[alden-bc] creating Phase 2 todo...');
  const phase2 = await bcPost(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
    content: 'Phase 2 (Days 31-60): Ladder to the exec team',
    description: `<div><strong>Cost:</strong> medium. <strong>Risk:</strong> low-medium. <strong>Due:</strong> ${addDays(60)}.</div>
<ol>
<li>Generalize karun-agent skill. Replace hardcoded "Karun"/HubSpot with YAML config per person: <code>/person karun</code>, <code>/person david</code>, etc.</li>
<li>Stand up agents for David Lahme + JJ McBride + Dhee + Swati. Each PRD ~1 hr after the pattern is set.</li>
<li>Adopt DRI framing explicitly. Each is now a Directly Responsible Individual. 5 numbers + 12-skill portfolio per person become public to that domain.</li>
<li>Adopt Earn / Learn / Bond / Save framework for internal communication. Single all-hands intro from Ram so it lands as opportunity not surveillance.</li>
<li>Set up $90/$10 budget envelope as real line item (~$1K/mo per exec on AI infra: OpenAI, Anthropic, MCP, share-of Mandrill + Twilio). Quarterly track.</li>
</ol>
<div style="margin-top:8px"><strong>Why exec team second:</strong> all volunteered for the AI bet. Lowest people-side risk before touching interns + non-tech employees.</div>`,
    due_on: addDays(60),
    assignee_ids: [],
  });
  console.log(`  Phase 2 todo: ${phase2.app_url}`);

  // Phase 3
  console.log('[alden-bc] creating Phase 3 todo...');
  const phase3 = await bcPost(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
    content: 'Phase 3 (Days 61-90): Roll out to interns, instructors, TAs, marketing',
    description: `<div><strong>Cost:</strong> medium. <strong>Risk:</strong> medium-high. <strong>Due:</strong> ${addDays(90)}.</div>
<ol>
<li>Apply framework to interns, instructors, TAs, marketing. Pair each non-technical person with an AI engineer for first 2 weeks (Alden's mistake #2).</li>
<li>For interns specifically: existing tracker already has weekly Strong/Light/Inactive scoring. Upgrade to FICO-for-work - explicit rubric, public score, weekly delta.</li>
<li>Ship per-person Vault dossier for every direct report (extend the per-sales-rep-account pattern). Each person's dossier becomes warm-start context for their agent.</li>
<li>Hard rule: no 1:1 happens unless the dashboard fired 30 min prior. Verbal-only 1:1s are the failure mode we are replacing.</li>
<li>Day-90 retrospective. Compare engagement, decisions/week, time-in-meeting/week, retention, before vs after.</li>
</ol>
<div style="margin-top:8px"><strong>Risk to flag now:</strong> Alden lost two types of people - anti-AI ideologues + low performers exposed by scoreboard. Be ready for both. Earn/Learn/Bond/Save reduces the first; the second is managed on its own terms.</div>`,
    due_on: addDays(90),
    assignee_ids: [],
  });
  console.log(`  Phase 3 todo: ${phase3.app_url}`);

  // Tier B/C product question (separate sub-todo from Ray's question)
  console.log('[alden-bc] creating Tier C product evaluation todo...');
  const tierC = await bcPost(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
    content: '[Strategic] Evaluate "Colaberry AI Box" as a Q4 2026 product (Ray\'s question)',
    description: `<div>Ray's question on the talk: should companies run AI on their own physical box for sovereignty? We answered "tiered" - hosted (Tier A) + hybrid for client engagements (Tier B) + a potential productized "Colaberry AI Box" (Tier C).</div>
<div style="margin-top:8px"><strong>The Tier C bet:</strong> a "Colaberry AI Box" pre-loaded with our 5 co-op platforms (Outage IQ / Crew Capture / Member Voice / Rate Case IQ / Compliance Companion - the same 5 in this week's RE Magazine ad) becomes a real productized offering for distribution co-ops who cannot send their SCADA / member / OMS data to public cloud.</div>
<div style="margin-top:8px"><strong>Validation steps:</strong></div>
<ol>
<li>Ask Darrell (Coca-Cola, June 4) if Tier C interests him - even though Coke is cloud-only, the bottling partners may not be.</li>
<li>Ask David Lahme to test the "AI Box" framing with 2-3 of his utility / NRECA contacts in Q3.</li>
<li>If signal is positive, write a one-page Tier C product spec by end of Q3 2026 for Ram + Karun review.</li>
</ol>
<div style="margin-top:8px"><strong>Decision point:</strong> by end of Q3 2026, kill or commit. Build (if commit) targets Q4 ship.</div>`,
    due_on: addDays(120),
    assignee_ids: [],
  });
  console.log(`  Tier C todo: ${tierC.app_url}`);

  console.log('\n[alden-bc] === DONE ===');
  console.log(`Top-level list: ${list.app_url}`);
  console.log(`Overview todo:  ${overview.app_url}`);
  console.log(`Phase 1 todo:   ${phase1.app_url}`);
  console.log(`Phase 2 todo:   ${phase2.app_url}`);
  console.log(`Phase 3 todo:   ${phase3.app_url}`);
  console.log(`Tier C todo:    ${tierC.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
