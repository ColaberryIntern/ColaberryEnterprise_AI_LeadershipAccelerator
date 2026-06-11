#!/usr/bin/env node
/**
 * Create the "Student Platform Build" todolist in the AI Systems Architect
 * Accelerator project (Basecamp 47502609), derived from STUDENT_PLATFORM_BUILD_SPEC.md.
 *
 * Structure: one todolist -> a group per epic (+ Decisions + Design groups).
 * KES builds, ALEEM design is approval-gated, ALI signs off each piece.
 *
 * Every todo carries a DETAILED description (what / build notes / done means /
 * reference). The 3 source docs are uploaded to the project Vault so the build
 * system (Kes + Claude Code) can open exactly what it is building.
 *
 * Dates are STAGGERED and all complete by the 2026-07-13 start date.
 *
 * Idempotent UPSERT (list/group by name, todo by content; refreshes assignee +
 * due_on + description on re-run). Vault upload dedups by filename.
 *
 * Run (where CCPP creds resolve a live token):
 *   BASECAMP_ACCESS_TOKEN= node backend/src/scripts/setupStudentPlatformBacklog.js
 *   add --dry-run to preview.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { LAUNCH, getByHandle } = require('./lib/launchPmoTeam');
const ops = require('./lib/launchPmoOps');

let getBasecampToken = null;
try { ({ getBasecampToken } = require('./lib/basecampToken')); } catch { /* optional locally */ }

const DRY = process.argv.includes('--dry-run');
const LIST_NAME = 'Student Platform Build';

// owners
const KES = ['kes'], ALEEM = ['aleem'], ALI = ['ali'], ALI_ALEEM = ['ali', 'aleem'], KES_CB = ['kes', 'cb'], SWATI_CB = ['swati', 'cb'];

// Phase due dates - ALL complete by the 2026-07-13 start date, staggered across
// the runway: decisions -> design -> builds staggered epic by epic -> sign-offs.
const D = {
  decide: '2026-06-15',
  design: '2026-06-19',
  presDesign: '2026-07-06',
  appr: '2026-06-23',
  e1: '2026-06-26', e1ok: '2026-06-29',
  e2: '2026-06-30', e2ok: '2026-07-01',
  e3: '2026-07-02', e3ok: '2026-07-03',
  e4core: '2026-07-06', e4mid: '2026-07-08', e4pres: '2026-07-09', e4ok: '2026-07-09',
  e5a: '2026-07-08', e5b: '2026-07-09', e5ok: '2026-07-10',
  curr: '2026-07-10',
};

// Source docs (uploaded to the project Vault; also in repo docs/training-program-2026-q3/).
const DOC_DIR = path.resolve(__dirname, '../../../docs/training-program-2026-q3');
const DOCS = [
  { file: 'STUDENT_PLATFORM_BUILD_SPEC.md', desc: 'Master build spec: vision, architecture, 4-system functionality checklist (Skool/Basecamp/Anthropic/ours), epics, rules.' },
  { file: 'STUDENT_PLATFORM_BLUEPRINT.html', desc: 'Visual blueprint: Mermaid diagrams (4-system fusion, student journey, data model) + checklist tables.' },
  { file: 'STUDENT_PLATFORM_STRATEGY.md', desc: 'Convergence strategy: what to reuse vs build, the student CB-System, artifact tiers.' },
];
const DOCS_REF = 'Docs are in this project Vault (CB Context Dossiers) and in the repo at <code>docs/training-program-2026-q3/</code>: STUDENT_PLATFORM_BUILD_SPEC.md, STUDENT_PLATFORM_BLUEPRINT.html, STUDENT_PLATFORM_STRATEGY.md. Open the spec first.';

// Detailed description builder: What / Build notes / Done means / Reference.
function dsc(o) {
  const parts = [];
  if (o.what) parts.push(`<p><strong>What:</strong> ${o.what}</p>`);
  if (o.build) parts.push(`<p><strong>Build notes (precise):</strong> ${o.build}</p>`);
  if (o.done) parts.push(`<p><strong>Done means:</strong> ${o.done}</p>`);
  parts.push(`<p><strong>Reference:</strong> ${o.ref ? o.ref + '. ' : ''}${DOCS_REF}</p>`);
  parts.push(`<p><strong>Rules:</strong> adhere to CLAUDE.md - idempotency, failure-first (timeouts/retries), typed contracts (tsc green), tests (happy+failure+boundary), per-student data isolation, PROGRESS.md.</p>`);
  return `<div>${parts.join('')}</div>`;
}

const GROUPS = [
  {
    name: 'Decisions (Ali) - unblock the build',
    todos: [
      { c: 'DECISION: Week 4 Prompt Engineering source (build original / fold into Week 3 / Claude 101)', who: ALI, due: D.decide,
        what: 'No Anthropic Skilljar course exists for prompt engineering. Pick the path so the Week 4 lab + course can be built.', ref: 'BUILD_SPEC Section 4 + Section 12', done: 'A decision is recorded and the Curriculum Week 4 task is updated accordingly.' },
      { c: 'DECISION: How Skilljar is delivered on enterprise.colaberry.com (deep-link / SSO / embed)', who: ALI, due: D.decide,
        what: 'Skilljar is Anthropic\'s hosted LMS. Decide deep-link vs SSO vs embed vs Partner content access. This GATES Epic 3.', ref: 'BUILD_SPEC Section 6.C + Section 12', done: 'Delivery method chosen so Kes can implement the LMS link.' },
      { c: 'DECISION: Realtime presence (who is online) in the launch build, or P2?', who: ALI, due: D.decide,
        what: 'Presence needs a websocket layer (the long pole). Confirm whether it must ship by 7/13 or can follow.', ref: 'BUILD_SPEC Section 6.A + Section 8', done: 'Scope decision recorded; Epic 4 presence task scheduled accordingly.' },
      { c: 'DECISION: Gamification depth at launch (points+levels now, or full leaderboards/unlocks)', who: ALI, due: D.decide,
        what: 'Skool\'s killer feature. Decide how much ships by launch.', ref: 'BUILD_SPEC Section 6.A', done: 'Depth decided so Epic 4 gamification scope is fixed.' },
      { c: 'DECISION: Re-confirm native community given the timeline', who: ALI, due: D.decide,
        what: 'Locked native (all synced). Re-confirm vs an interim Skool given launch pressure.', ref: 'STRATEGY Decisions; BUILD_SPEC Section 6.A', done: 'Confirmed native, or interim plan chosen.' },
    ],
  },
  {
    name: 'Design (Aleem) - mockups, Ali approves each',
    todos: [
      { c: 'Design: Student home / Command Center dashboard', who: ALEEM, due: D.design,
        what: 'The most important screen: Today\'s One Priority + next-action queue + AI Architect Readiness score + current-week status + build-log feed.', build: 'Extends existing CoryHome.tsx. Enterprise executive tone (baseline-ui).', ref: 'BUILD_SPEC Section 9 #1', done: 'Figma mockup approved by Aleem + Ali.' },
      { c: 'Design: Project builder flow (idea -> 10 questions -> requirements -> tasks)', who: ALEEM, due: D.design,
        what: 'The wizard a student uses to turn a raw idea into a requirements doc + task list.', build: 'Extends ProjectDnaWizard.tsx.', ref: 'BUILD_SPEC Section 9 #2 + Section 5', done: 'Mockup approved.' },
      { c: 'Design: Community feed + post composer (Skool-style)', who: ALEEM, due: D.design,
        what: 'Single central feed: post card, composer, categories, comment thread, like.', ref: 'BUILD_SPEC Section 6.A + Section 9 #3', done: 'Mockup approved.' },
      { c: 'Design: Member profile + leaderboard + level badge', who: ALEEM, due: D.design,
        what: 'Gamification visual language: profile, points, levels (themed "Architect" tiers), 7/30/all-time leaderboard, level badge.', ref: 'BUILD_SPEC Section 6.A + Section 9 #4', done: 'Mockup approved.' },
      { c: 'Design: Classroom / week view (course + lab + quiz + NotebookLM video)', who: ALEEM, due: D.design,
        what: 'One week page combining the Anthropic course, the lab, the quiz, and the NotebookLM video.', ref: 'BUILD_SPEC Section 9 #5', done: 'Mockup approved.' },
      { c: 'Design: Portfolio page (Tier-A build + Tier-B showcase, shareable)', who: ALEEM, due: D.design,
        what: 'Public, shareable portfolio: structured build artifacts + flexible showcase artifacts + readiness score.', ref: 'BUILD_SPEC Section 6 (artifacts) + Section 9 #6', done: 'Mockup approved.' },
      { c: 'Design: Live preview embed', who: ALEEM, due: D.design,
        what: 'How the running student app ({slug}.preview.colaberry.ai) appears inside the portal.', ref: 'BUILD_SPEC Section 9 #7', done: 'Mockup approved.' },
      { c: 'Design: Design-system extension for community + gamification (on baseline-ui)', who: ALEEM, due: D.design,
        what: 'Tokens + components for the community + gamification surfaces, on top of the existing baseline-ui system.', ref: 'BUILD_SPEC Section 9 #9; baseline-ui skill', done: 'Component/token set approved.' },
      { c: 'Design (P2): Presence / who-is-online + chat UI', who: ALEEM, due: D.presDesign,
        what: 'Online indicators + peer chat UI (the realtime layer).', ref: 'BUILD_SPEC Section 9 #8', done: 'Mockup approved.' },
      { c: 'APPROVE (Ali + Aleem): sign off design system + key screens before build', who: ALI_ALEEM, due: D.appr,
        what: 'Design approval gate. The build epics that need design are blocked until this is checked.', done: 'Ali and Aleem have approved the design system + the key screens.' },
    ],
  },
  {
    name: 'Epic 1 - Project Builder [Kes]',
    todos: [
      { c: 'Build: Port advisor brain (idea + 10 questions + requirements), Claude-targeted', who: KES, due: D.e1,
        what: 'Port the advisor pipeline (idea intake -> ~10-question enhancement -> requirements generation) into the portal, targeting Claude (not OpenAI).', build: 'Source: the advisor repo (AI Project Architect, MCP-free): idea_intake.py -> profile_generator.py -> feature_discovery -> requirements_writer.py. Reimplement as a portal service in backend/src/services. Do NOT fork the Python app.', ref: 'BUILD_SPEC Section 5 + 6.D; STRATEGY Section 1', done: 'A portal service turns a raw idea into a structured requirements doc, Claude-backed, with unit tests.' },
      { c: 'Build: Wire ProjectDnaWizard -> requirements -> native student tasks', who: KES, due: D.e1,
        what: 'Connect the existing project-DNA wizard through the new brain to generate requirements and create native student tasks.', build: 'Reuse ProjectDnaWizard.tsx, projectService.createNewProjectForEnrollment, requirementsGenerationService, RequirementsMap. Create native TaskList/Tasks from the requirement clusters.', ref: 'BUILD_SPEC Section 5; STRATEGY Section 2', done: 'Adding a project produces requirements + a task list end to end.' },
      { c: 'Build: GitHub connect + ingest loop (push -> requirement VERIFIED)', who: KES, due: D.e1,
        what: 'Student connects a GitHub repo; pushes are ingested and flip requirement states to VERIFIED. This is the no-MCP path.', build: 'Reuse githubService.ts, GitHubConnection.ts, requirementsEngine.ts (4-state UNMAPPED->...->VERIFIED).', ref: 'BUILD_SPEC Section 6.D', done: 'A push to the connected repo updates requirement states with evidence; tested.' },
      { c: 'GATE: Project builder flow design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr,
        what: 'Design gate - blocks the build tasks in this epic until the project-builder flow mockup is approved.', done: 'Design approved.' },
      { c: 'APPROVE (Ali): sign off Project Builder', who: ALI, due: D.e1ok,
        what: 'Ali reviews the working project-builder end to end and signs off.', done: 'Ali has signed off Epic 1.' },
    ],
  },
  {
    name: 'Epic 2 - Student CB-System [Kes]',
    todos: [
      { c: 'Build: StudentTask model + studentOpsRoutes (adapt services/ops/*)', who: KES, due: D.e2,
        what: 'Give each student the employee AI-Ops operating model natively: project -> tasks -> next action.', build: 'Adapt services/ops/* (priorityEngineService, approvalService, automationRulesService, metricsDailyService) to a StudentTask source. DISCARD bcSyncService + basecampClient (students create tasks natively). Add routes/portal/studentOpsRoutes.ts mirroring opsRoutes.ts (/my-queue, /run-my-day, /decisions, /metrics/today).', ref: 'BUILD_SPEC Section 5 + 6.B/6.D; STRATEGY Section 3', done: 'Student tasks are scored + surfaced; routes return the queue; tested.' },
      { c: 'Build: Priority engine + approval workspace + Run My Day on CoryHome', who: KES, due: D.e2,
        what: 'Mount the prioritized queue + approval workspace + Run My Day walk on the student home.', build: 'Reuse the priority engine + ApprovalWorkspace component + Run My Day from AiOpsCommandCenter.tsx; mount on CoryHome.tsx.', ref: 'STRATEGY Section 3', done: 'Student sees Today\'s One Priority + can walk their queue.' },
      { c: 'Build: Per-task Claude Code prompt generator (project/GitHub resources)', who: KES, due: D.e2,
        what: 'For each task, generate the exact Claude Code prompt to do it, scoped to the student\'s project + repo.', build: 'Adapt runMyDayPromptService.ts: strip Basecamp tools, add project GitHub + assignment docs + curriculum as resources.', ref: 'STRATEGY Section 3', done: 'Each task shows a copyable Claude Code prompt; tested.' },
      { c: 'GATE: Student command center design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr, what: 'Design gate for the command-center surface.', done: 'Design approved.' },
      { c: 'APPROVE (Ali): sign off Student CB-System', who: ALI, due: D.e2ok, what: 'Ali reviews and signs off the student CB-System.', done: 'Ali has signed off Epic 2.' },
    ],
  },
  {
    name: 'Epic 3 - Anthropic / LMS link [Kes]',
    todos: [
      { c: 'Build: Implement Skilljar delivery (deep-link / SSO / embed) on enterprise.colaberry.com', who: KES, due: D.e3,
        what: 'Deliver the per-week Anthropic course inside the portal using the method Ali chose.', build: 'Depends on the Decisions group. Implement the chosen deep-link/SSO/embed.', ref: 'BUILD_SPEC Section 6.C + Section 12', done: 'A student can launch the week\'s Anthropic course from the portal.' },
      { c: 'Build: Per-week course wiring (Appendix A) + progress mirror into portal', who: KES, due: D.e3,
        what: 'Wire each week to its specific Skilljar course and mirror progress into the portal dashboard.', build: 'Map per Appendix A: W1 Claude Code 101, W2 Intro to agent skills, W3 Building with the Claude API, W5 Intro to MCP, W6 MCP Advanced Topics, W7 Intro to subagents, W8 Claude Code in Action, W12 CCA-F. W4/9/10/11 are Colaberry-original.', ref: 'BUILD_SPEC Appendix A', done: 'Each week links its course; progress is mirrored.' },
      { c: 'Build: Quiz (5q warmup + 10q post) + survey engine per week', who: KES, due: D.e3,
        what: 'Per-week assessment: 5-question warmup + 10-question post quiz + feedback survey.', build: 'Content comes from Swati/CB (Curriculum list). Build the engine + storage; deterministic scoring.', ref: 'BUILD_SPEC Section 3 + 6.C', done: 'Quizzes + surveys load per week and record results; tested.' },
      { c: 'Build: CCA-F certification link (Week 12)', who: KES, due: D.e3,
        what: 'Link the Claude Certified Architect - Foundations exam in Week 12.', build: 'https://claudecertifications.com/claude-certified-architect/exam-guide', ref: 'BUILD_SPEC Appendix A', done: 'Week 12 links the CCA-F exam.' },
      { c: 'APPROVE (Ali): sign off Anthropic / LMS link', who: ALI, due: D.e3ok, what: 'Ali reviews + signs off the LMS link.', done: 'Ali has signed off Epic 3.' },
    ],
  },
  {
    name: 'Epic 4 - Community + Gamification [Kes + Aleem]',
    todos: [
      { c: 'Build: Community data model (Post / Comment / Like / Member / Leaderboard / Event)', who: KES, due: D.e4core,
        what: 'The schema behind the Skool-style community.', build: 'See the data model in BUILD_SPEC Section 7 + BLUEPRINT Section 4. Per-student isolation; typed.', ref: 'BUILD_SPEC Section 6.A + 7', done: 'Models + migrations exist with tests.' },
      { c: 'Build: Feed + composer + categories + pinned + @mentions', who: KES, due: D.e4core,
        what: 'Single central feed with rich posts, categories, pinned posts, @mentions.', ref: 'BUILD_SPEC Section 6.A (Skool)', done: 'Students can post, filter by category, pin, mention; tested.' },
      { c: 'Build: Threaded comments + likes; profiles + member directory', who: KES, due: D.e4core,
        what: 'Threaded comments, likes (the points currency), member profiles + directory.', ref: 'BUILD_SPEC Section 6.A', done: 'Comments/likes/profiles work; likes feed points.' },
      { c: 'Build: Gamification (points -> levels -> leaderboards -> level-gated unlocks)', who: KES, due: D.e4mid,
        what: 'Skool\'s killer feature: 1 like = 1 point, levels, 7/30/all-time leaderboards, level-gated content unlocks.', build: 'Deterministic point/level calc (pure function + tests).', ref: 'BUILD_SPEC Section 6.A', done: 'Points/levels/leaderboards live; content unlocks by level.' },
      { c: 'Build: Calendar / events + notifications (in-app/email) + digest', who: KES, due: D.e4mid,
        what: 'Community calendar (Mon/Thu sessions, Open Houses) + multi-channel notifications + digest.', ref: 'BUILD_SPEC Section 6.A', done: 'Events + notifications + digest work; tested.' },
      { c: 'Build: Build-log -> social drafter (#Colaberry stream)', who: KES, due: D.e4mid,
        what: 'Weekly auto-draft of a "building in public" post about the student\'s product; they post it with #Colaberry.', build: 'See TRAINING_INTEGRATION_PLAN Section 3.7 (build-log engine).', ref: 'BUILD_SPEC Section 5 (social)', done: 'Weekly draft generated per student; optional one-click post.' },
      { c: 'Build (P2): Realtime presence (who is online) + peer chat (websockets)', who: KES, due: D.e4pres,
        what: 'The long pole: realtime online indicators + peer chat.', build: 'New websocket layer (none exists today). Gated by the Ali presence decision.', ref: 'BUILD_SPEC Section 6.A + 8', done: 'Presence + chat work in realtime; tested.' },
      { c: 'GATE: Community + profile/leaderboard design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr, what: 'Design gate for the community + gamification surfaces.', done: 'Design approved.' },
      { c: 'APPROVE (Ali): sign off Community + Gamification', who: ALI, due: D.e4ok, what: 'Ali reviews + signs off the community + gamification.', done: 'Ali has signed off Epic 4.' },
    ],
  },
  {
    name: 'Epic 5 - Portfolio + Artifacts [Kes + CB]',
    todos: [
      { c: 'Build: Tier-A build-artifact slots (per 12-week Lego model)', who: KES, due: D.e5a,
        what: 'Structured, gradeable build-artifact slots, one per the 12-week Lego model.', build: 'Reuse/extend portfolioGenerationService.ts.', ref: 'BUILD_SPEC Section 5 (artifacts) + 6.D', done: 'Each week\'s build artifact has a slot in the portfolio.' },
      { c: 'Build: Tier-B showcase-artifact slots + AI drafting (demo / explainer / podcast / PPT / infographic)', who: KES_CB, due: D.e5b,
        what: 'Flexible showcase-artifact slots the system scaffolds; AI drafts each.', ref: 'BUILD_SPEC Section 5', done: 'Showcase slots exist; AI can draft each artifact type.' },
      { c: 'Build: Public shareable portfolio + readiness score wiring', who: KES, due: D.e5b,
        what: 'A public, shareable portfolio page wired to the AI Architect Readiness score.', ref: 'BUILD_SPEC Section 6.D', done: 'Portfolio is shareable + shows readiness; tested.' },
      { c: 'GATE: Portfolio page design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr, what: 'Design gate for the portfolio page.', done: 'Design approved.' },
      { c: 'APPROVE (Ali): sign off Portfolio + Artifacts', who: ALI, due: D.e5ok, what: 'Ali reviews + signs off the portfolio.', done: 'Ali has signed off Epic 5.' },
    ],
  },
  {
    name: 'Epic 6 - Curriculum content [Swati + CB] (tracked on Curriculum list)',
    todos: [
      { c: 'Curriculum content (12 weeks x 5 items) is tracked on the Curriculum list', who: SWATI_CB, due: D.curr,
        what: 'The per-week curriculum content build (Anthropic mapped / lab+artifact / assessment / NotebookLM / sign-off) is tracked on the separate Curriculum list (Basecamp 9946468992), staggered before launch.', ref: 'BUILD_SPEC Section 3 + Appendix A', done: 'All 12 weeks signed off on the Curriculum list.' },
    ],
  },
];

function idsFor(handles) {
  return handles.map((h) => getByHandle(h)).filter((x) => x && x.basecampPersonId).map((x) => x.basecampPersonId);
}
function labelFor(handles) {
  return handles.map((h) => { const x = getByHandle(h); return x ? x.displayName : h; }).join(' + ');
}

async function main() {
  console.log(`=== Student Platform Build backlog -> project ${LAUNCH.projectId} ===`);
  const totalTodos = GROUPS.reduce((n, g) => n + g.todos.length, 0);
  console.log(`${GROUPS.length} groups, ${totalTodos} todos (staggered, all due <= 2026-07-13)\n`);
  for (const g of GROUPS) {
    console.log(g.name);
    for (const t of g.todos) console.log(`   - [${labelFor(t.who)}] ${t.c}  (due ${t.due})`);
  }

  let haveToken = !!process.env.BASECAMP_ACCESS_TOKEN;
  if (!haveToken && getBasecampToken) {
    try { process.env.BASECAMP_ACCESS_TOKEN = await getBasecampToken(); haveToken = !!process.env.BASECAMP_ACCESS_TOKEN; } catch { haveToken = false; }
  }
  if (!haveToken) {
    if (DRY) { console.log('\n[dry-run] no token locally - printed plan from data only.'); return; }
    throw new Error('BASECAMP_ACCESS_TOKEN could not be resolved.');
  }
  if (DRY) { console.log('\n[dry-run] no token-gated writes performed by request.'); return; }

  // Upload the source docs to the project Vault so the build system can open them.
  console.log('\n-- Vault upload (source docs)');
  for (const doc of DOCS) {
    try {
      const content = fs.readFileSync(path.join(DOC_DIR, doc.file));
      const up = await ops.uploadToVault({ projectId: LAUNCH.projectId, filename: doc.file, content, description: doc.desc });
      console.log(`   ${doc.file} -> vault id ${up.id || 'ok'}`);
    } catch (e) { console.log(`   skipped ${doc.file}: ${e.message}`); }
  }

  const list = await ops.createTodolist({ projectId: LAUNCH.projectId, name: LIST_NAME, description: `<div><h3>Student Platform Build</h3><p>Kes builds; Aleem design is approval-gated; Ali signs off each piece. Staggered, all complete by the 2026-07-13 start date. ${DOCS_REF}</p></div>` });
  console.log(`\nList: "${list.name}" (id ${list.id})`);

  let groupsN = 0, todosN = 0;
  for (const g of GROUPS) {
    const group = await ops.createTodoGroup({ projectId: LAUNCH.projectId, listId: list.id, name: g.name });
    groupsN += 1;
    const existing = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${group.id}/todos.json`);
    const byContent = new Map((existing || []).map((t) => [t.content, t]));
    // Trash any stale todo in this group whose content is no longer desired
    // (e.g. a task that was reworded), so re-runs never leave orphans.
    const desired = new Set(g.todos.map((t) => t.c));
    for (const [content, todo] of byContent) {
      if (!desired.has(content)) { await ops.trashTodo({ projectId: LAUNCH.projectId, recordingId: todo.id }); console.log(`   trashed stale: "${content}"`); }
    }
    for (const t of g.todos) {
      const assignee = idsFor(t.who);
      const description = dsc(t);
      const match = byContent.get(t.c);
      if (match) {
        await ops.updateTodo({ todoId: match.id, patch: { description, due_on: t.due, assignee_ids: assignee } });
      } else {
        await ops.createTodo({ projectId: LAUNCH.projectId, listId: group.id, content: t.c, description, assigneePersonIds: assignee, dueOn: t.due });
      }
      todosN += 1;
    }
    console.log(`  group "${g.name}" -> ${g.todos.length} todos`);
  }
  console.log(`\nDone. ${groupsN} groups, ${todosN} todos reconciled on list ${list.id}.`);
}

main().catch((e) => { console.error('setupStudentPlatformBacklog failed:', (e && e.message) || e); process.exit(1); });
