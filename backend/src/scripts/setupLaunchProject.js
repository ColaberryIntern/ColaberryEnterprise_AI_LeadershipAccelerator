#!/usr/bin/env node
/**
 * One-shot setup for the AI Systems Architect Accelerator launch project.
 *
 * Idempotent: re-running adds missing pieces, updates descriptions, never
 * duplicates. Safe to run as many times as needed.
 *
 * Steps:
 *   1. Grant all provisioned team members access to project 47502609
 *   2. Create the 10 area todolists with DoD-driven descriptions
 *   3. Post the kickoff Message Board update explaining structure + cadence
 *   4. Print Rose-blocker note for Ali
 *
 * Phase A only - this script does NOT generate area-specific tasks yet.
 * That's the next script (generateLaunchWeek1Tasks.js).
 *
 * Run: node backend/src/scripts/setupLaunchProject.js
 *      Add --dry-run to preview without writing.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { TEAM, LAUNCH, provisioned, missing } = require('./lib/launchPmoTeam');
const ops = require('./lib/launchPmoOps');

const DRY = process.argv.includes('--dry-run');

// ============================================================================
// Area definitions - the 10 todolists CB will manage
// ============================================================================
function dodLine() {
  return `<p><strong>Definition of Done template (every task in this list):</strong></p>
<ol>
<li><strong>Objective:</strong> what business outcome this task moves forward</li>
<li><strong>Deliverable:</strong> concrete artifact (URL, file, decision, approval)</li>
<li><strong>Owner:</strong> assigned team member</li>
<li><strong>Due date:</strong> M-F only, working backward from 2026-07-11</li>
<li><strong>Dependencies:</strong> upstream tasks that must complete first</li>
<li><strong>Definition of done:</strong> "Done means..." statement, no ambiguity</li>
</ol>`;
}

const AREAS = [
  {
    name: 'Curriculum',
    description: `<div><h3>Curriculum</h3>
<p><strong>Owner:</strong> Swati Raman | <strong>Drafts:</strong> CB System | <strong>Approval:</strong> Swati + Ali | <strong>Tie-in:</strong> Kes (delivery platform)</p>
<p><strong>Scope:</strong> Dynamic project-based curriculum for AI Systems Architect Accelerator. Project work with Claude Code + MCP Servers + NotebookLM. Portfolio generation + certification prep.</p>
<p><strong>Cadence:</strong> CB drafts -> Swati reviews -> Ali approves design -> Kes wires into platform. Cycle weekly.</p>
${dodLine()}
<p><strong>Critical path:</strong> curriculum flow + design visuals due 2026-06-02 (2 days). Testable on enterprise.colaberry.ai by 2026-06-07 (1 week).</p>
</div>`,
  },
  {
    name: 'Website - training.colaberry.com',
    description: `<div><h3>training.colaberry.com (Public Marketing Site)</h3>
<p><strong>Owner:</strong> Sai Tejesh | <strong>Design approval:</strong> Aleem + Ali | <strong>SEO + content:</strong> Sohail</p>
<p><strong>Scope:</strong> Replace existing Data Analytics positioning with AI Systems Architect Accelerator. Keep testimonials + naming + reviews + blogs - swap product framing. Career changer / working professional audience.</p>
<p><strong>Cadence:</strong> Tejesh ships drafts -> Aleem design review -> Ali final approval -> deploy.</p>
${dodLine()}
<p><strong>Critical path:</strong> 1st draft 2026-06-07 (end of next week). Finalized 2026-06-21 (3 weeks).</p>
</div>`,
  },
  {
    name: 'Website - enterprise.colaberry.ai',
    description: `<div><h3>enterprise.colaberry.ai (Student + Operations Platform)</h3>
<p><strong>Owner:</strong> Kes Delele | <strong>Design approval:</strong> Aleem + Ali | <strong>CB role:</strong> code generation + spec drafts</p>
<p><strong>Scope:</strong> Learning platform + Student CRM + Portfolio system + PM + Community + Certification + Incubator + AI Agent ecosystem. Drives monthly subscription revenue. Source of truth for cohort data.</p>
<p><strong>Cadence:</strong> Kes architects -> CB drafts code -> Aleem UX review -> Ali approval -> ship.</p>
${dodLine()}
<p><strong>Critical path:</strong> migration done 2026-06-07. 3 sessions planned in advance by 2026-06-07. Curriculum testable 2026-06-07. Both websites finalized 2026-06-21.</p>
</div>`,
  },
  {
    name: 'Marketing',
    description: `<div><h3>Marketing</h3>
<p><strong>Owner:</strong> Sohail Syed | <strong>Creative:</strong> Aleem | <strong>Approval:</strong> Ali + Sohail | <strong>Distribution:</strong> Jackie (community)</p>
<p><strong>Scope:</strong> Strategy + landing pages + ads + social media + blogs + podcasts + newsletter + email campaigns + A/B testing. Mailchimp for alumni/dropout/prospect outreach. Landing pages built INSIDE enterprise.colaberry.ai by CB System with Ali design approval.</p>
<p><strong>Cadence:</strong> Sohail strategy -> CB drafts landing pages + ads -> Aleem creative review -> Ali approval -> publish. No auto-posts to LinkedIn.</p>
${dodLine()}
<p><strong>Critical path:</strong> strategy + landing pages + social plan 2026-06-06 (this week). Mailchimp active 2026-06-14 (2 weeks). Content production 2026-06-14. Viral videos 2026-06-14.</p>
</div>`,
  },
  {
    name: 'AI Systems',
    description: `<div><h3>AI Systems</h3>
<p><strong>Owner:</strong> Kes Delele | <strong>Execution:</strong> CB User (Claude Code) | <strong>Approval:</strong> Kes + Ali</p>
<p><strong>Scope:</strong> Voice AI (972-992-1024), Inbox AI (Cora @ support@colaberry.com), Enrollment AI, Student AI (4-agent model with human review queue), PM AI, Reporting AI, GHL workflow rebuild.</p>
<p><strong>Cadence:</strong> Kes architects -> CB User code generation -> Kes review -> deploy. Daily Claude Code session for execution.</p>
${dodLine()}
<p><strong>Critical path:</strong> All AI switched to new program by 2026-06-21 (3 weeks). Mentor Agent human-review queue designed from day 1 (Ali insists: don't pretend it's autonomous).</p>
</div>`,
  },
  {
    name: 'Open Houses & Events',
    description: `<div><h3>Open Houses & Events</h3>
<p><strong>Owner:</strong> Jackie Chalk | <strong>Marketing tie-in:</strong> Sohail | <strong>Sales tie-in:</strong> Roselen | <strong>Approval:</strong> Ali</p>
<p><strong>Scope:</strong> Recurring Open Houses (AI demos + Claude Code demos + student success + live Q&A + enrollment offer), WhatsApp community, Eventbrite, hackathons, office hours, alumni events.</p>
<p><strong>Per Open House deliverables:</strong> event plan, landing page (built by CB), slides, follow-up sequence, sales process.</p>
${dodLine()}
<p><strong>Critical path:</strong> identify what events possible in next 2 weeks (research what others are doing). Open House design + materials 2026-06-21 (3 weeks).</p>
</div>`,
  },
  {
    name: 'Sales & Admissions',
    description: `<div><h3>Sales & Admissions</h3>
<p><strong>Owner:</strong> Roselen [BLOCKED - not yet on Basecamp] | <strong>Ops:</strong> Taiwo Oludimimu | <strong>Materials:</strong> CB System | <strong>Approval:</strong> Ali</p>
<p><strong>Scope:</strong> Sales call workflow, enrollment system, lead follow-up, sales materials, subscription tracking, retention, lifecycle monitoring. Outreach to old DA students/alumni/dropouts asap.</p>
<p><strong>Cadence:</strong> CB drafts sales material -> Ali approval -> Roselen executes calls -> Taiwo tracks enrollments + subscriptions.</p>
${dodLine()}
<p><strong>Blocker:</strong> Roselen needs Basecamp access provisioned (Ali action). Until then CB will hold sales-call tasks unassigned + Taiwo will own enrollment ops.</p>
</div>`,
  },
  {
    name: 'TWC Compliance',
    description: `<div><h3>TWC Compliance</h3>
<p><strong>Owner:</strong> Swati Raman | <strong>Research:</strong> Dheeraj Garg | <strong>Approval:</strong> Ali (notarize where needed)</p>
<p><strong>Scope:</strong> Get the new AI Systems Architect Accelerator class registered with Texas Workforce Commission. Document the process steps. Tasks spread evenly Mon-Fri through to launch date.</p>
<p><strong>Cadence:</strong> Dheeraj researches each step -> Swati executes/files -> Ali notarizes/signs as needed. Weekly status to Ali.</p>
${dodLine()}
<p><strong>Note:</strong> We will launch even if TWC approval is not yet final. Goal is to create urgency, not gate on TWC.</p>
</div>`,
  },
  {
    name: 'Approval Queues',
    description: `<div><h3>Approval Queues</h3>
<p><strong>Owner:</strong> Ali Muwwakkil (sole approver) | <strong>CB role:</strong> queue + summarize + nudge</p>
<p><strong>Scope:</strong> Every task that needs Ali decision lives here. Design / Marketing / Curriculum / System approvals all flow through this list.</p>
<p><strong>Approval pairings:</strong></p>
<ul>
<li>Design Approval: Ali + Aleem</li>
<li>Marketing Approval: Ali + Sohail</li>
<li>Curriculum Approval: Swati + Ali</li>
<li>System Approval: Kes + Ali</li>
</ul>
<p><strong>Cadence:</strong> CB posts a HUMAN ACTION QUEUE update once a day (8am CST) listing what needs Ali this morning. Ali responds, CB unblocks the dependent AI tasks immediately.</p>
${dodLine()}
</div>`,
  },
  {
    name: 'Launch Readiness Dashboard',
    description: `<div><h3>Launch Readiness Dashboard</h3>
<p><strong>Owner:</strong> CB System (automated daily update) | <strong>Reader:</strong> Ali + leads</p>
<p><strong>Scope:</strong> Single source of truth for "are we ready to launch 2026-07-11?" CB recalculates % per area every morning and updates the topmost task in this list.</p>
<p><strong>Tracked %:</strong> Curriculum, Website (training), Website (enterprise), Marketing, AI Systems, Admissions, Community, Events, Overall.</p>
<p><strong>Escalation rules (CB enforces):</strong></p>
<ul>
<li>Task overdue 1 day -> CB reminder comment</li>
<li>Overdue 3 days -> escalation to area lead</li>
<li>Overdue 5 days -> notify Ali</li>
<li>Overdue 7 days -> tag as CRITICAL RISK on this dashboard</li>
</ul>
${dodLine()}
</div>`,
  },
];

// ============================================================================
// Kickoff Message
// ============================================================================
function kickoffMessage() {
  const provisionedRoster = provisioned()
    .map((p) => `<li><strong>${p.displayName}</strong> (${p.role}) - ${(p.hats || []).slice(0, 3).join(', ')}</li>`)
    .join('');
  const missingRoster = missing()
    .map((p) => `<li><strong>${p.displayName}</strong> (${p.role}) - ${p.note || 'Needs to be added to Basecamp'}</li>`)
    .join('');
  return `<div>
<h2>AI Systems Architect Accelerator - Launch PMO Kickoff</h2>
<p><strong>Target launch:</strong> 2026-07-11 (40 days from today, 2026-05-31)</p>
<p><strong>Operating model:</strong> CB System is the autonomous Program Management Office. CB plans, drafts, builds, escalates and reports. Humans are decision makers (approve / reject / pick a direction). AI is execution. Progress never waits on a human - CB always has the next AI task running.</p>

<h3>Daily cadence (starts tomorrow morning)</h3>
<ul>
<li><strong>8am CST:</strong> CB posts "HUMAN ACTION QUEUE" on this Message Board (NEXT HUMAN TASKS, sorted by urgency)</li>
<li><strong>8am CST:</strong> CB emails Ali the Executive Update (Status / Risks / Upcoming Deadlines / Blocked Items / Launch Readiness %)</li>
<li><strong>Continuous:</strong> CB executes AI tasks in the AI Systems list. When Ali clears a Human Action, CB picks up the next dependent AI work immediately.</li>
<li><strong>End of day:</strong> CB updates the "Launch Readiness Dashboard" todolist (top task = current readiness %).</li>
</ul>

<h3>Project structure (10 lists in this project)</h3>
<ol>
<li>Curriculum (Swati)</li>
<li>Website - training.colaberry.com (Tejesh)</li>
<li>Website - enterprise.colaberry.ai (Kes)</li>
<li>Marketing (Sohail)</li>
<li>AI Systems (Kes)</li>
<li>Open Houses & Events (Jackie)</li>
<li>Sales & Admissions (Roselen [blocked] + Taiwo)</li>
<li>TWC Compliance (Swati + Dheeraj)</li>
<li>Approval Queues (Ali)</li>
<li>Launch Readiness Dashboard (CB)</li>
</ol>

<h3>Team roster (provisioned on this project)</h3>
<ul>${provisionedRoster}</ul>

${missingRoster ? `<h3>Blockers - need Ali action</h3><ul>${missingRoster}</ul>` : ''}

<h3>Escalation rules</h3>
<ul>
<li>Overdue 1 day: CB reminder</li>
<li>Overdue 3 days: CB escalates to area lead</li>
<li>Overdue 5 days: CB notifies Ali</li>
<li>Overdue 7 days: tagged CRITICAL RISK on dashboard</li>
</ul>

<h3>Next steps (this session)</h3>
<ol>
<li>This message + 10 todolists created (you are reading the message now)</li>
<li>CB generates the first-week task list per area via gpt-4o (Mon-Fri only, due dates back-distributed from 2026-07-11) - happens immediately after this post</li>
<li>Daily PMO cron wired (next session continuation or this one)</li>
</ol>

<p><em>This project is operated by CB System under the Launch PMO operating contract. Any task without an Owner is CB's to figure out. Any decision flagged in Approval Queues is yours, Ali - reply on the task and CB unblocks the dependent work.</em></p>
</div>`;
}

// ============================================================================
// Main
// ============================================================================
(async () => {
  console.log(`Setup ${LAUNCH.projectName} (project ${LAUNCH.projectId})${DRY ? ' [DRY-RUN]' : ''}`);

  // Step 1: grant team access
  const provIds = provisioned().map((p) => p.basecampPersonId).filter(Boolean);
  console.log(`\n[1/3] Granting access to ${provIds.length} team members`);
  if (!DRY) {
    try {
      const r = await ops.addPeopleToProject({ personIds: provIds });
      console.log(`   granted=${(r.granted || []).length}, revoked=${(r.revoked || []).length}`);
    } catch (e) { console.error(`   addPeople fail: ${e.message}`); }
  }

  // Step 2: create the 10 todolists
  console.log(`\n[2/3] Creating ${AREAS.length} area todolists`);
  const created = [];
  for (const a of AREAS) {
    if (DRY) { console.log(`   [dry] would create "${a.name}"`); created.push({ name: a.name, dry: true }); continue; }
    try {
      const l = await ops.createTodolist({ name: a.name, description: a.description });
      console.log(`   + ${l.name} (id=${l.id})`);
      created.push({ name: l.name, id: l.id, url: l.app_url });
    } catch (e) { console.error(`   FAIL "${a.name}": ${e.message}`); }
  }

  // Step 3: kickoff MB message
  console.log(`\n[3/3] Posting kickoff Message Board update`);
  if (!DRY) {
    try {
      const m = await ops.postMessage({
        subject: 'Launch PMO Kickoff - AI Systems Architect Accelerator (target 2026-07-11)',
        content: kickoffMessage(),
      });
      console.log(`   + message id=${m.id} url=${m.app_url}`);
    } catch (e) { console.error(`   FAIL kickoff: ${e.message}`); }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Project: https://3.basecamp.com/3945211/projects/${LAUNCH.projectId}`);
  console.log(`Provisioned: ${provisioned().length} | Missing: ${missing().length}`);
  for (const m of missing()) console.log(`  BLOCKER: ${m.displayName} (${m.role}) - Ali to provision`);
  console.log(`Lists created: ${created.length}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
