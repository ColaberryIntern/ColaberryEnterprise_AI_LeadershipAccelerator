#!/usr/bin/env node
// Create the BC ticket tree on Ali Personal for the AI_ProjectArchitect company-wide
// rollout: pilot for Karun + Kes, infrastructure work, rubric refinement cadence,
// and per-future-employee placeholders for Phase 2 + Phase 3.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955; // Ali Personal
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry AIArch Rollout', Accept: 'application/json', 'Content-Type': 'application/json' });

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

// Today is 2026-06-02 (per system reminder)
function addDays(daysFromToday) {
  const d = new Date('2026-06-02T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

const TODOS = [
  // === OVERVIEW ===
  {
    content: 'OVERVIEW: AI_ProjectArchitect company-wide rollout (Karun + Kes pilot first)',
    due_on: addDays(90),
    description: `<div><strong>Mission:</strong> roll out AI_ProjectArchitect (<a href="https://github.com/ColaberryIntern/AI_ProjectArchitect">github.com/ColaberryIntern/AI_ProjectArchitect</a>) as the canonical company-wide bridge from idea to execution. Library at <code>http://localhost:8765/library/?ws=global</code> hosts Use Cases / Skills / Agents. Items marked "Colaberry approved" auto-sync to the public company repo for every employee to consume.</div>
<div style="margin-top:8px"><strong>Pilot (Week 1):</strong> Karun (VP Business Lead) + Kes (AI Systems Architect). Both onboarded fully with per-person rubrics + skills committed to the library, all flagged Colaberry approved.</div>
<div style="margin-top:8px"><strong>Phase 2 (Days 31-60):</strong> exec team - Ali, Ram, David Lahme, JJ McBride, Sohail.</div>
<div style="margin-top:8px"><strong>Phase 3 (Days 61-90):</strong> rest of the team - Swati, Sai Tejesh, Jackie, Taiwo, Aleem, Dhee, Vinay, Angie, Rashi.</div>
<div style="margin-top:10px"><strong>Source spreadsheet:</strong> docs/ai-architect-rubrics-2026-06-02.xlsx (drafted 5 numbers + 10 skills + draft rubric per person; Ali to refine in place).</div>
<div style="margin-top:8px"><strong>Source plan:</strong> Mandrill email 9303b5d0-45bc-5845-fa32-bdc45b071d82 to Ram + Karun + Ali on 2026-06-02 mapping Alden DoRosario's playbook to our stack.</div>
<div style="margin-top:8px"><strong>Asks (open):</strong> (a) Ali to refine spreadsheet per pilot person before agent build. (b) Ram to confirm pilot pair + Earn/Learn/Bond/Save framing for the all-hands. (c) Karun + Kes to give Ali 30 min each for PRD writeup.</div>`,
  },

  // === INFRASTRUCTURE ===
  {
    content: '[Infra 1] Define "Colaberry approved" classification + auto-sync spec',
    due_on: addDays(7),
    description: `<div><strong>Goal:</strong> formal spec for what makes a Use Case, Skill, or Agent "Colaberry approved" - and the mechanism by which that flag triggers auto-publish to the company GitHub repo (AI_ProjectArchitect).</div>
<div style="margin-top:6px"><strong>Acceptance criteria:</strong></div>
<ol>
<li>Classification flag exists in the library data model (UseCase / Skill / Agent records).</li>
<li>Approval workflow defined: who can mark? (Ali, Ram, Karun for sales; Kes for tech.) What does the review look like?</li>
<li>Once flagged, an automated job (webhook or scheduled) syncs the artifact to <code>github.com/ColaberryIntern/AI_ProjectArchitect</code> under <code>library/{type}/{slug}.md</code> with appropriate metadata.</li>
<li>Sync handles updates (re-flag) + deletions (unflag).</li>
<li>Audit log: every sync event recorded with author + timestamp + artifact + commit SHA.</li>
</ol>`,
  },
  {
    content: '[Infra 2] Build the library → AI_ProjectArchitect GitHub sync',
    due_on: addDays(21),
    description: `<div><strong>Goal:</strong> ship the actual sync from the library tool (localhost:8765 today, will be hosted) to the AI_ProjectArchitect GitHub repo. Triggered when an artifact is marked Colaberry approved.</div>
<div style="margin-top:6px"><strong>Dependencies:</strong> Infra 1 (spec).</div>
<div style="margin-top:6px"><strong>Steps:</strong></div>
<ol>
<li>GitHub App with write access to ColaberryIntern/AI_ProjectArchitect.</li>
<li>Webhook on library "Colaberry approved" toggle.</li>
<li>Renderer that turns library record into a clean Markdown file with frontmatter.</li>
<li>Branch + PR strategy (auto-merge to main once review passes? require human review?).</li>
<li>CI gate: lint + smoke-test that the artifact parses.</li>
</ol>`,
  },
  {
    content: '[Infra 3] Employee onboarding runbook for AI_ProjectArchitect',
    due_on: addDays(14),
    description: `<div><strong>Goal:</strong> a clear runbook every Colaberry employee can follow to (a) clone or access the company library, (b) discover the use cases/skills/agents available to them, (c) propose new ones, (d) understand the Colaberry-approved gate.</div>
<div style="margin-top:6px"><strong>Deliverable:</strong> directives/ai-project-architect-onboarding.md + 5-minute screencast video.</div>
<div style="margin-top:6px"><strong>Includes:</strong> personas (technical / non-technical), how to slash-invoke a skill, expected etiquette in the global feed.</div>`,
  },
  {
    content: '[Infra 4] Rubric refinement weekly cadence (Ali + each DRI)',
    due_on: addDays(7),
    description: `<div><strong>Goal:</strong> establish a weekly 30-minute cadence between Ali and each pilot person (Karun, Kes) to refine the rubric, recalibrate targets, and ratify Colaberry-approved skill commits.</div>
<div style="margin-top:6px"><strong>Schedule:</strong> 4 weeks during pilot. Calendar invite from Ali to each. Then quarterly cadence post-rollout.</div>
<div style="margin-top:6px"><strong>Format:</strong> dashboard pre-fired 5 minutes before; conversation centered on the score deltas, not the data hunt.</div>`,
  },
  {
    content: '[Infra 5] Comms: Ram all-hands message (Earn/Learn/Bond/Save framing)',
    due_on: addDays(14),
    description: `<div><strong>Goal:</strong> internal announcement of the AI_ProjectArchitect rollout. Frame as opportunity (earn / learn / bond / save), not surveillance. Reduces Alden's mistake #4 risk (ignored the people side).</div>
<div style="margin-top:6px"><strong>Deliverable:</strong> 3-paragraph note from Ram to all staff. Drafted by Ali; reviewed + sent by Ram.</div>
<div style="margin-top:6px"><strong>Includes:</strong> (a) why we are doing this (productivity + portability + dignity), (b) what changes for them (their work becomes legible + portable + rated), (c) what does NOT change (jobs are not being replaced).</div>`,
  },

  // === KARUN PILOT (5 tickets) ===
  {
    content: '[Karun] Step 1 - Write Karun PRD (30-min session with Ali)',
    due_on: addDays(5),
    description: `<div><strong>Goal:</strong> formal Product Requirements Document for "karun-agent." Output: a single page covering systems Karun touches, the 5 numbers he owns, the 10-12 skills that produce those numbers, the rubric for each number.</div>
<div style="margin-top:6px"><strong>Starting point:</strong> draft in <code>docs/ai-architect-rubrics-2026-06-02.xlsx</code> rows tagged "Karun." Ali refines in place; Karun pressure-tests.</div>
<div style="margin-top:6px"><strong>Format:</strong> 30 minutes, in person or Zoom. Output committed to <code>docs/personas/karun-prd.md</code> on this repo. Once Ali signs, this also gets flagged Colaberry approved + auto-syncs to AI_ProjectArchitect.</div>`,
  },
  {
    content: '[Karun] Step 2 - Build karun-agent + /karun-dash skill',
    due_on: addDays(10),
    description: `<div><strong>Goal:</strong> Claude Code skill under <code>.claude/skills/karun-agent/</code> that reads BC + Gmail + HubSpot + Apollo + CCPP via MCP, scores Karun's 5 numbers against the PRD rubric, generates an HTML dashboard.</div>
<div style="margin-top:6px"><strong>Dependencies:</strong> Karun PRD complete (Step 1).</div>
<div style="margin-top:6px"><strong>Acceptance:</strong> running <code>/karun-dash</code> manually produces a clean dashboard within 60s. Critic loop runs over output before "ship."</div>`,
  },
  {
    content: '[Karun] Step 3 - Wire /karun-dash to fire 30 min before each 1:1',
    due_on: addDays(12),
    description: `<div><strong>Goal:</strong> calendar integration so the dashboard auto-fires 30 minutes before any 1:1 between Ali and Karun. Both inboxes get the same HTML.</div>
<div style="margin-top:6px"><strong>Acceptance:</strong> 3 consecutive 1:1s land with dashboard delivered on schedule + zero misfires.</div>
<div style="margin-top:6px"><strong>This is the 4-hour MVP from the Alden plan email. Approve this and v1 lives by EOD next day.</strong></div>`,
  },
  {
    content: '[Karun] Step 4 - 4-week pilot iteration (two 1:1s/week)',
    due_on: addDays(30),
    description: `<div><strong>Goal:</strong> run the karun-agent loop for 4 weeks. Iterate the rubric, the dashboard layout, and the skill list based on what surfaces.</div>
<div style="margin-top:6px"><strong>Cadence:</strong> two 1:1s/week (Mon + Thu). Dashboard fires 30 min prior. Weekly rubric refinement session with Ali.</div>
<div style="margin-top:6px"><strong>Output:</strong> at day 30, Karun PRD v2 + ratified skill set + lessons-learned doc.</div>`,
  },
  {
    content: '[Karun] Step 5 - 30-day retrospective + commit Colaberry-approved artifacts',
    due_on: addDays(32),
    description: `<div><strong>Goal:</strong> retrospective covering what worked, what did not, and a ratified set of Colaberry-approved skills + use cases + agents from Karun's 30 days. Items get flagged in the library + auto-sync to AI_ProjectArchitect.</div>
<div style="margin-top:6px"><strong>Output:</strong> retro doc, 5-10 Colaberry-approved library entries, updated rollout playbook for Phase 2.</div>`,
  },

  // === KES PILOT (5 tickets) ===
  {
    content: '[Kes] Step 1 - Write Kes PRD (30-min session with Ali)',
    due_on: addDays(5),
    description: `<div><strong>Goal:</strong> formal PRD for "kes-agent." Output: page covering systems Kes touches, 5 numbers (production uptime, live agent count, ship cadence, GHL/CRM coverage, MTTR), 10-12 skills, rubric per number.</div>
<div style="margin-top:6px"><strong>Starting point:</strong> Kes rows in the spreadsheet. Ali refines; Kes pressure-tests.</div>
<div style="margin-top:6px"><strong>Output:</strong> <code>docs/personas/kes-prd.md</code>, signed by Ali, flagged Colaberry approved.</div>`,
  },
  {
    content: '[Kes] Step 2 - Build kes-agent + /kes-dash skill',
    due_on: addDays(10),
    description: `<div><strong>Goal:</strong> Claude Code skill under <code>.claude/skills/kes-agent/</code> that reads BC + GitHub + production telemetry + GHL/CRM via MCP, scores Kes's 5 numbers, generates dashboard.</div>
<div style="margin-top:6px"><strong>Dependencies:</strong> Kes PRD (Step 1) + production telemetry endpoint defined.</div>
<div style="margin-top:6px"><strong>Acceptance:</strong> running <code>/kes-dash</code> manually produces dashboard within 60s w/ live uptime + agent counts.</div>`,
  },
  {
    content: '[Kes] Step 3 - Wire /kes-dash to fire 30 min before each Ali↔Kes 1:1',
    due_on: addDays(12),
    description: `<div><strong>Goal:</strong> calendar integration; dashboard fires 30 min prior to any Ali↔Kes 1:1. Both inboxes.</div>
<div style="margin-top:6px"><strong>Acceptance:</strong> 3 consecutive 1:1s land on time + zero misfires.</div>`,
  },
  {
    content: '[Kes] Step 4 - 4-week pilot iteration (two 1:1s/week)',
    due_on: addDays(30),
    description: `<div><strong>Goal:</strong> run kes-agent loop for 4 weeks. Iterate rubric + dashboard + skill list. Weekly refinement with Ali.</div>
<div style="margin-top:6px"><strong>Output day 30:</strong> Kes PRD v2 + ratified skill set + lessons-learned doc.</div>`,
  },
  {
    content: '[Kes] Step 5 - 30-day retrospective + commit Colaberry-approved artifacts',
    due_on: addDays(32),
    description: `<div><strong>Goal:</strong> retrospective + ratify Colaberry-approved skills (likely includes "voice AI integration," "inbox COS deployment," "GHL workflow design," "production incident response," etc.). Items flagged + auto-sync.</div>`,
  },

  // === PHASE 2 + PHASE 3 PLACEHOLDERS ===
  {
    content: '[Phase 2 launch] After Karun+Kes pilot success, generalize karun-agent skill to YAML-per-person',
    due_on: addDays(35),
    description: `<div><strong>Goal:</strong> replace hardcoded "karun"/"kes" with YAML config per person. <code>/person karun</code>, <code>/person david</code>, etc.</div>
<div style="margin-top:6px"><strong>Dependencies:</strong> Karun + Kes pilot retros complete.</div>
<div style="margin-top:6px"><strong>Acceptance:</strong> one shared skill can be configured for any DRI just by writing their PRD YAML.</div>`,
  },
  {
    content: '[Phase 2] Onboard exec team: Ali, Ram, David Lahme, JJ McBride, Sohail',
    due_on: addDays(60),
    description: `<div><strong>Scope:</strong> 5 PRDs, 5 agents, 5 dashboards, 5 weekly rubric refinements.</div>
<div style="margin-top:6px"><strong>Dependencies:</strong> Phase 2 launch (YAML generalization) complete.</div>
<div style="margin-top:6px"><strong>Cadence:</strong> stagger one per week. PRD session w/ Ali + person, agent build, dashboard wired, 30-day iteration.</div>
<div style="margin-top:6px"><strong>Note:</strong> Sohail may shift earlier given the July 10 launch dependency on marketing instrumentation.</div>`,
  },
  {
    content: '[Phase 2] Adopt DRI framing + $90/$10 budget envelope',
    due_on: addDays(45),
    description: `<div><strong>Goal:</strong> formalize the DRI model org-wide. Each direct report becomes a Directly Responsible Individual owning a number + a portfolio of skills (the Yohan answer from Ram\'s question).</div>
<div style="margin-top:6px"><strong>Budget side:</strong> $90 human + $10 AI infra per employee. ~$1K/mo per exec on AI tooling (OpenAI, Anthropic, MCP, share-of Mandrill/Twilio). Track quarterly.</div>`,
  },
  {
    content: '[Phase 3] Onboard rest of team: Swati, Sai Tejesh, Jackie, Taiwo, Aleem, Dhee, Vinay, Angie, Rashi',
    due_on: addDays(90),
    description: `<div><strong>Scope:</strong> 9 PRDs, 9 agents, 9 dashboards. Pair each non-technical person with an AI engineer for the first 2 weeks (Alden mistake #2).</div>
<div style="margin-top:6px"><strong>Cadence:</strong> stagger 2-3 per week starting day 60.</div>
<div style="margin-top:6px"><strong>Risk:</strong> Alden lost two types of people (anti-AI ideologues + low performers exposed by scoreboard). Earn/Learn/Bond/Save framing reduces the first; second managed on its own terms.</div>`,
  },
  {
    content: '[Phase 3] Hard rule: no 1:1 happens without dashboard fired 30 min prior',
    due_on: addDays(75),
    description: `<div><strong>Goal:</strong> turn the dashboard from a feature into a process discipline. Verbal-only 1:1s are the failure mode this whole project replaces.</div>
<div style="margin-top:6px"><strong>Enforcement:</strong> calendar integration auto-cancels 1:1 invites if dashboard cannot fire (system warns 24h prior so DRI can fix root cause).</div>`,
  },
  {
    content: '[Day 90] Retrospective: engagement, decisions/wk, time-in-meeting/wk, retention - before vs after',
    due_on: addDays(95),
    description: `<div><strong>Goal:</strong> measure the actual lift from 90 days of the new operating system. Compare 6 months before vs 90 days after on engagement scores, decision velocity, meeting time consumed, retention.</div>
<div style="margin-top:6px"><strong>Output:</strong> retro doc + decision on Phase 4 (extend to interns/instructors) + recommendation on the Tier-C "Colaberry AI Box" product evaluation.</div>`,
  },

  // === STRATEGIC / Q4 PRODUCT EVALUATION ===
  {
    content: '[Strategic / Ray\'s question] Evaluate "Colaberry AI Box" as Q4 2026 product',
    due_on: addDays(120),
    description: `<div><strong>Background:</strong> Ray\'s question from the GAI Insights talk about sovereignty boxes. Our tiered answer (A hosted, B hybrid for client engagements, C productized).</div>
<div style="margin-top:6px"><strong>Tier C bet:</strong> a "Colaberry AI Box" pre-loaded with our 5 co-op platforms (Outage IQ / Crew Capture / Member Voice / Rate Case IQ / Compliance Companion) becomes a real product for distribution co-ops whose SCADA / OMS / member data cannot leave their stack.</div>
<div style="margin-top:6px"><strong>Validation:</strong></div>
<ol>
<li>Ask Darrell (Coca-Cola, June 4) if Tier C resonates - bottling partners may need it even if Coke proper does not.</li>
<li>Ask David Lahme to test with 2-3 utility / NRECA contacts in Q3.</li>
<li>If signal is positive, one-page Tier C product spec by end of Q3 2026 for Ram + Karun review.</li>
</ol>
<div style="margin-top:6px"><strong>Decision point:</strong> end of Q3 2026 - kill or commit. Build (if commit) targets Q4 ship.</div>`,
  },
];

(async () => {
  console.log('[ai-arch-bc] resolving todoset for Ali Personal...');
  const proj = await bcGet(`/projects/${BUCKET}.json`);
  const todosetDock = (proj.dock || []).find((d) => d.name === 'todoset');
  if (!todosetDock) throw new Error('todoset dock not found');

  console.log('[ai-arch-bc] creating new todolist...');
  const list = await bcPost(`/buckets/${BUCKET}/todosets/${todosetDock.id}/todolists.json`, {
    name: 'AI_ProjectArchitect company-wide rollout (Karun + Kes pilot)',
    description: `<div><strong>Mission:</strong> roll out <a href="https://github.com/ColaberryIntern/AI_ProjectArchitect">AI_ProjectArchitect</a> as the canonical company-wide bridge from idea to execution. Library hosts Use Cases / Skills / Agents; items marked "Colaberry approved" auto-sync to the company repo for every employee to consume.</div>
<div style="margin-top:8px"><strong>Pilot (Week 1):</strong> Karun (VP Business Lead) + Kes (AI Systems Architect).</div>
<div style="margin-top:8px"><strong>Source spreadsheet:</strong> <code>docs/ai-architect-rubrics-2026-06-02.xlsx</code> - draft 5 numbers + 10 skills + draft rubric per person, Ali to refine in place.</div>
<div style="margin-top:8px"><strong>Source plan:</strong> Triad email Mandrill <code>9303b5d0-45bc-5845-fa32-bdc45b071d82</code> on 2026-06-02 mapping Alden DoRosario\'s playbook to our stack.</div>`,
  });
  console.log(`  list id: ${list.id} | ${list.app_url}`);

  const created = [];
  for (const t of TODOS) {
    console.log(`[ai-arch-bc] creating: ${t.content.slice(0, 70)}...`);
    const todo = await bcPost(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
      content: t.content,
      description: t.description,
      due_on: t.due_on,
    });
    created.push({ content: t.content, url: todo.app_url, due_on: t.due_on });
    console.log(`  -> ${todo.app_url}`);
  }

  const summary = { list_url: list.app_url, todos: created };
  fs.writeFileSync(path.resolve(__dirname, '../../../tmp/ai-arch-bc-tickets.json'), JSON.stringify(summary, null, 2));

  console.log('\n[ai-arch-bc] === DONE ===');
  console.log(`Top-level list: ${list.app_url}`);
  console.log(`${created.length} todos created.`);
  console.log(`Summary written to tmp/ai-arch-bc-tickets.json`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
