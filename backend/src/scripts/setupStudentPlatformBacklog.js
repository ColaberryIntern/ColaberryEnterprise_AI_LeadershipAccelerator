#!/usr/bin/env node
/**
 * Create the "Student Platform Build" todolist in the AI Systems Architect
 * Accelerator project (Basecamp 47502609), derived from STUDENT_PLATFORM_BUILD_SPEC.md.
 *
 * Structure: one todolist -> a group per epic (+ Decisions + Design groups).
 * Set up so KES builds, ALEEM's design is approval-gated, and ALI signs off each
 * piece (an "APPROVE (Ali)" todo per epic, "APPROVE (Ali + Aleem)" on design).
 *
 * Idempotent UPSERT: list by name, groups by name, todos by content within a
 * group (refreshes assignee + due_on on re-run). Safe to re-run.
 *
 * Run (where CCPP creds resolve a live token):
 *   BASECAMP_ACCESS_TOKEN= node backend/src/scripts/setupStudentPlatformBacklog.js
 *   add --dry-run to preview.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { LAUNCH, getByHandle } = require('./lib/launchPmoTeam');
const ops = require('./lib/launchPmoOps');

let getBasecampToken = null;
try { ({ getBasecampToken } = require('./lib/basecampToken')); } catch { /* optional locally */ }

const DRY = process.argv.includes('--dry-run');
const LIST_NAME = 'Student Platform Build';

// owners
const KES = ['kes'], ALEEM = ['aleem'], ALI = ['ali'], ALI_ALEEM = ['ali', 'aleem'], KES_CB = ['kes', 'cb'], SWATI_CB = ['swati', 'cb'];
// phase due dates
const D = {
  decide: '2026-06-18',   // Ali decisions that unblock the build
  design: '2026-06-25',   // Aleem mockups
  appr: '2026-06-29',     // design approval gates (Ali + Aleem)
  p0: '2026-07-10',       // launch-critical build (before 7/13)
  p0ok: '2026-07-13',     // Ali sign-off of P0 pieces
  p1: '2026-08-14',       // during-cohort build
  p2: '2026-09-25',       // post-cohort / v1.1
};

function p(html) { return `<div>${html}</div>`; }

const LIST_DESC = p(
  '<h3>Student Platform Build</h3>' +
  '<p>Build plan for the student-facing platform (Skool + Basecamp + Anthropic + our platform, fused). ' +
  'Source: <strong>STUDENT_PLATFORM_BUILD_SPEC.md</strong> + <strong>STUDENT_PLATFORM_BLUEPRINT.html</strong>. ' +
  '<strong>Kes</strong> builds; <strong>Aleem</strong> design is approval-gated; <strong>Ali</strong> signs off each piece. ' +
  'Curriculum content is tracked on the separate Curriculum list.</p>'
);

const GROUPS = [
  {
    name: 'Decisions (Ali) - unblock the build',
    todos: [
      { c: 'DECISION: Week 4 Prompt Engineering source (build original / fold into Week 3 / Claude 101)', who: ALI, due: D.decide, d: 'No Anthropic course exists for prompt engineering. Pick the path so the Week 4 lab + course can be built.' },
      { c: 'DECISION: How Skilljar is delivered on enterprise.colaberry.com (deep-link / SSO / embed)', who: ALI, due: D.decide, d: 'Skilljar is Anthropic hosted LMS. This GATES Epic 3 (LMS link).' },
      { c: 'DECISION: Realtime presence (who is online) in the launch build, or P2?', who: ALI, due: D.decide, d: 'Presence needs a websocket layer (the long pole). Default is P2/post-launch.' },
      { c: 'DECISION: Gamification depth at launch (points+levels in P1, or pull into P0 for day-one engagement)', who: ALI, due: D.decide, d: '' },
      { c: 'DECISION: Re-confirm native community given the timeline', who: ALI, due: D.decide, d: 'Locked native (all synced); re-confirm vs interim Skool given launch pressure.' },
    ],
  },
  {
    name: 'Design (Aleem) - mockups, Ali approves each',
    todos: [
      { c: 'Design: Student home / Command Center dashboard', who: ALEEM, due: D.design, d: 'Most important screen: Today’s one priority + queue + readiness + week status + build-log feed.' },
      { c: 'Design: Project builder flow (idea -> 10 questions -> requirements -> tasks)', who: ALEEM, due: D.design, d: '' },
      { c: 'Design: Community feed + post composer (Skool-style)', who: ALEEM, due: D.design, d: '' },
      { c: 'Design: Member profile + leaderboard + level badge', who: ALEEM, due: D.design, d: 'Gamification visual language ("Architect" levels).' },
      { c: 'Design: Classroom / week view (course + lab + quiz + NotebookLM video)', who: ALEEM, due: D.design, d: '' },
      { c: 'Design: Portfolio page (Tier-A build + Tier-B showcase, shareable)', who: ALEEM, due: D.design, d: '' },
      { c: 'Design: Live preview embed', who: ALEEM, due: D.design, d: 'How the running student app appears in-portal.' },
      { c: 'Design (P2): Presence / who-is-online + chat UI', who: ALEEM, due: D.p2, d: '' },
      { c: 'Design: Design-system extension for community + gamification (on baseline-ui)', who: ALEEM, due: D.design, d: 'Enterprise executive tone: clean, calm, authoritative.' },
      { c: 'APPROVE (Ali + Aleem): sign off design system + key screens before build', who: ALI_ALEEM, due: D.appr, d: 'Design approval gate. Build epics that need design are blocked until this is checked.' },
    ],
  },
  {
    name: 'Epic 1 - Project Builder [Kes]',
    todos: [
      { c: 'Build: Port advisor brain (idea + 10 questions + requirements), Claude-targeted', who: KES, due: D.p0, d: 'Port from advisor repo (MCP-free): idea_intake -> profile/feature enhancement -> requirements_writer. Target Claude, not OpenAI.' },
      { c: 'Build: Wire ProjectDnaWizard -> requirements -> native student tasks', who: KES, due: D.p0, d: 'Reuse ProjectDnaWizard + requirementsGenerationService; create native student TaskList/Tasks from RequirementsMap.' },
      { c: 'Build: GitHub connect + ingest loop (push -> requirement VERIFIED)', who: KES, due: D.p0, d: 'Reuse githubService. This IS the no-MCP path.' },
      { c: 'GATE: Project builder flow design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr, d: 'Blocks the build tasks in this epic.' },
      { c: 'APPROVE (Ali): sign off Project Builder', who: ALI, due: D.p0ok, d: '' },
    ],
  },
  {
    name: 'Epic 2 - Student CB-System [Kes]',
    todos: [
      { c: 'Build: StudentTask model + studentOpsRoutes (adapt services/ops/*)', who: KES, due: D.p0, d: 'Reuse the employee AI Ops engine; discard the Basecamp-sync layer (students create tasks natively).' },
      { c: 'Build: Priority engine + approval workspace + Run My Day on CoryHome', who: KES, due: D.p0, d: 'Mount on existing CoryHome (Today’s One Priority + queue).' },
      { c: 'Build: Per-task Claude Code prompt generator (project/GitHub resources)', who: KES, due: D.p0, d: '"Your one next action + the Claude Code prompt for it."' },
      { c: 'GATE: Student command center design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr, d: '' },
      { c: 'APPROVE (Ali): sign off Student CB-System', who: ALI, due: D.p0ok, d: '' },
    ],
  },
  {
    name: 'Epic 3 - Anthropic / LMS link [Kes]',
    todos: [
      { c: 'Build: Implement Skilljar delivery (deep-link / SSO / embed) on enterprise.colaberry.com', who: KES, due: D.p0, d: 'Depends on Ali decision (Decisions group).' },
      { c: 'Build: Per-week course wiring (Appendix A) + progress mirror into portal', who: KES, due: D.p0, d: 'W1 Claude Code 101, W2 Agent Skills, W3 Claude API, W5 Intro MCP, W6 MCP Advanced, W7 Subagents, W8 Claude Code in Action, W12 CCA-F.' },
      { c: 'Build: Quiz (5q warmup + 10q post) + survey engine per week', who: KES, due: D.p0, d: 'Content from Swati/CB (Curriculum list).' },
      { c: 'Build: CCA-F certification link (Week 12)', who: KES, due: D.p1, d: 'claudecertifications.com.' },
      { c: 'APPROVE (Ali): sign off Anthropic / LMS link', who: ALI, due: D.p0ok, d: '' },
    ],
  },
  {
    name: 'Epic 4 - Community + Gamification [Kes + Aleem]',
    todos: [
      { c: 'Build: Community data model (Post / Comment / Like / Member / Leaderboard / Event)', who: KES, due: D.p0, d: '' },
      { c: 'Build: Feed + composer + categories + pinned + @mentions', who: KES, due: D.p0, d: '' },
      { c: 'Build: Threaded comments + likes; profiles + member directory', who: KES, due: D.p0, d: '' },
      { c: 'Build: Gamification (points -> levels -> leaderboards -> level-gated unlocks)', who: KES, due: D.p1, d: 'Skool killer feature. 7/30/all-time leaderboards.' },
      { c: 'Build: Calendar / events + notifications (in-app/email) + digest', who: KES, due: D.p1, d: '' },
      { c: 'Build: Build-log -> social drafter (#Colaberry stream)', who: KES, due: D.p1, d: 'Weekly optional student post about their build.' },
      { c: 'Build (P2): Realtime presence (who is online) + peer chat (websockets)', who: KES, due: D.p2, d: 'The long pole; gated by Ali decision.' },
      { c: 'GATE: Community + profile/leaderboard design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr, d: '' },
      { c: 'APPROVE (Ali): sign off Community + Gamification', who: ALI, due: D.p1, d: '' },
    ],
  },
  {
    name: 'Epic 5 - Portfolio + Artifacts [Kes + CB]',
    todos: [
      { c: 'Build: Tier-A build-artifact slots (per 12-week Lego model)', who: KES, due: D.p0, d: 'Structured, gradeable build artifacts.' },
      { c: 'Build: Tier-B showcase-artifact slots + AI drafting (demo / explainer / podcast / PPT / infographic)', who: KES_CB, due: D.p1, d: 'Flexible per project; AI drafts each.' },
      { c: 'Build: Public shareable portfolio + readiness score wiring', who: KES, due: D.p1, d: '' },
      { c: 'GATE: Portfolio page design approved (Aleem + Ali)', who: ALI_ALEEM, due: D.appr, d: '' },
      { c: 'APPROVE (Ali): sign off Portfolio + Artifacts', who: ALI, due: D.p1, d: '' },
    ],
  },
  {
    name: 'Epic 6 - Curriculum content [Swati + CB] (tracked on Curriculum list)',
    todos: [
      { c: 'Curriculum content (12 weeks x 5 items) is tracked on the Curriculum list', who: SWATI_CB, due: D.p0, d: 'See the Curriculum list (Basecamp 9946468992): Anthropic mapped / lab+artifact / assessment / NotebookLM / sign-off, staggered before launch.' },
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
  console.log(`${GROUPS.length} groups, ${totalTodos} todos\n`);
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

  const list = await ops.createTodolist({ projectId: LAUNCH.projectId, name: LIST_NAME, description: LIST_DESC });
  console.log(`\nList: "${list.name}" (id ${list.id})`);

  let groupsN = 0, todosN = 0;
  for (const g of GROUPS) {
    const group = await ops.createTodoGroup({ projectId: LAUNCH.projectId, listId: list.id, name: g.name });
    groupsN += 1;
    const existing = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${group.id}/todos.json`);
    const byContent = new Map((existing || []).map((t) => [t.content, t]));
    for (const t of g.todos) {
      const assignee = idsFor(t.who);
      const description = p(t.d || t.c);
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
