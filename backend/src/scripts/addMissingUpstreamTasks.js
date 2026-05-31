#!/usr/bin/env node
/**
 * One-shot: add explicit upstream "create" tasks that were missing for
 * Approval Queue items. Without these, approvals appear as orphan blockers.
 *
 * Example: Approval Queue had "Review and approve Curriculum design visuals"
 * but no list contained "Create Curriculum design visuals" — so Ali was being
 * asked to approve a deliverable nobody was scheduled to produce.
 *
 * Adds the missing upstreams to the most-appropriate area list with CB User
 * as owner + due dates ~1-2 days BEFORE the approval task.
 *
 * Idempotent (createTodo dedupes on content).
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { LAUNCH, getByHandle } = require('./lib/launchPmoTeam');
const VAULT_MAP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/launch-briefs-vault-urls.json'), 'utf8'));

function brief(slug) {
  const b = VAULT_MAP.briefs[slug];
  return b ? `<li><a href="${b.url}">${b.description || b.filename}</a></li>` : '';
}

// Missing upstreams (manually catalogued from the Approval Queue)
const UPSTREAMS = [
  {
    list: 'Curriculum',
    content: 'Create Curriculum design visuals (UI/UX-grade)',
    owner: 'cb',
    due: '2026-06-01',
    objective: 'Produce UI/UX-grade curriculum flow visuals that look like a professional product tool. Source material for Ali + Aleem approval on 2026-06-02.',
    deliverable: 'Mermaid diagrams + Figma-style mockup of the 12-week curriculum flow + per-intensive deliverable cards. Saved as PNG attachments on this task.',
    dod: 'Visuals shipped as attachment under this todo. Includes overall 12-week flow, per-week artifacts, per-intensive standalone outcome, and CCA-F cert checkpoint.',
    briefs: ['swati-curriculum-twc', 'aleem-creative', 'program-overview'],
  },
  {
    list: 'Marketing',
    content: 'Draft viral video concepts for AI Systems Architect Accelerator',
    owner: 'cb',
    due: '2026-06-11',
    objective: 'Produce 3 viral video concepts Aleem can take into production by 2026-06-12.',
    deliverable: '3 one-page concept treatments: hook, 60-second beat sheet, target audience emotional trigger, CTA.',
    dod: 'Concepts shipped as PDF attachment on this task. Aleem reviews + approves which one(s) to produce.',
    briefs: ['aleem-creative', 'sohail-marketing', 'brand-pricing'],
  },
  {
    list: 'Open Houses & Events',
    content: 'Draft Open House design + materials package',
    owner: 'cb',
    due: '2026-06-18',
    objective: 'Produce the first Open House plan + landing page draft + slides outline + 3-email follow-up + sales process - to be reviewed 2026-06-19.',
    deliverable: 'PDF package containing all 5 sub-deliverables, plus a separate XLSX for the post-event follow-up cadence.',
    dod: 'Package shipped as attachments under this task. Jackie approves; Aleem designs the slides for real; Ali signs off in the parallel Approval Queue.',
    briefs: ['jackie-events', 'aleem-creative', 'sohail-marketing'],
  },
  {
    list: 'Website - training.colaberry.com',
    content: 'Draft Both website plan + page-by-page spec',
    owner: 'cb',
    due: '2026-06-18',
    objective: 'Produce the combined training.colaberry.com + enterprise.colaberry.ai launch-readiness plan + page-by-page spec - for Ali approval 2026-06-19.',
    deliverable: 'Markdown spec document attached as PDF. Per-page section: purpose, hero copy, CTA, design references, owner, completion %.',
    dod: 'Spec doc attached under this task. Tejesh + Kes confirm scope coverage; Ali signs off in Approval Queue.',
    briefs: ['tejesh-website-training', 'kes-ai-systems', 'sohail-marketing'],
  },
  {
    list: 'Approval Queues',
    content: 'Draft Anthropic Partner Network status memo for Ali',
    owner: 'cb',
    due: '2026-06-11',
    objective: 'Produce the memo Ali approves 2026-06-12 confirming Anthropic Partner Network status (LOCKED A1 co-branding, 10-person partner cohort, CCA-F free for first 5K).',
    deliverable: 'PDF memo: where we stand on the 10-person cohort, what is confirmed by Anthropic, what is unconfirmed, the ask to Ali to authorize co-branding.',
    dod: 'Memo attached under the approval task 9946498281. Ali approves or asks for revision.',
    briefs: ['ali-decisions', 'program-overview', 'launch-timeline-41d'],
  },
  {
    list: 'Approval Queues',
    content: 'Draft Project Marketplace governance proposal',
    owner: 'cb',
    due: '2026-07-08',
    objective: 'Produce the v1 governance proposal for the Project Marketplace (read-only at launch, manual assignment by Ali, formal governance v1.1).',
    deliverable: 'PDF proposal covering: who can list projects, vetting process, student matching rules, liability/contract language, payment flow for student work.',
    dod: 'Proposal attached under the approval task 9946498286. Ali approves the v1 framework.',
    briefs: ['ali-decisions', 'program-overview'],
  },
  {
    list: 'Approval Queues',
    content: 'Draft Capstone evaluation rubric for Ali approval',
    owner: 'cb',
    due: '2026-07-07',
    objective: 'Produce the Capstone evaluation rubric Ali approves 2026-07-08 (LOCKED A12 provisional: 5 dimensions x 0-4 points = 20 max, pass at 12, honors at 17).',
    deliverable: 'PDF rubric document: each dimension defined, scoring criteria per point level, examples of pass / honors, tie to Architect Readiness Score.',
    dod: 'Rubric attached under the approval task 9946498300. Ali approves or revises.',
    briefs: ['swati-curriculum-twc', 'kes-ai-systems', 'ali-decisions'],
  },
  {
    list: 'Approval Queues',
    content: 'Draft Skilljar progress sync architecture spec',
    owner: 'cb',
    due: '2026-07-02',
    objective: 'Produce architecture spec Ali approves 2026-07-03 (LOCKED A14: manual cert upload + daily polling; webhook in v1.1).',
    deliverable: 'PDF spec: API contract, polling cadence, fallback for missing cert, error handling, webhook upgrade path.',
    dod: 'Spec attached under the approval task 9946498325. Kes + Ali sign off.',
    briefs: ['kes-ai-systems', 'ali-decisions'],
  },
  {
    list: 'Approval Queues',
    content: 'Draft Architect Expo logistics plan',
    owner: 'cb',
    due: '2026-07-09',
    objective: 'Produce the hybrid Architect Expo logistics plan Ali approves 2026-07-10 (LOCKED A13: hybrid, Zoom + recorded, in-person optional Austin).',
    deliverable: 'PDF plan: date proposal, run-of-show, technology stack, student consent flow, recording publication rules.',
    dod: 'Plan attached under the approval task 9946498332. Ali approves or revises.',
    briefs: ['ali-decisions', 'jackie-events'],
  },
];

function dodHtml({ objective, deliverable, dod, briefs }) {
  const briefList = briefs.map(brief).join('');
  return `<div>
<span style="background:#dbeafe;color:#1e40af;font-weight:700;font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:1px">AI TASK</span> <strong>Owner:</strong> CB System (AI Execution Queue)
<h3>Objective</h3><p>${objective}</p>
<h3>Deliverable</h3><p>${deliverable}</p>
<h3>Definition of done</h3><p>${dod}</p>
<h3>Dependencies</h3><p>none - CB drafts autonomously</p>
<h3>How to do this in Claude Code</h3>
<p>This task is auto-executed by CB nightly via runCbAiTasks.js. CB reads the briefs below, generates a first-pass deliverable via gpt-4o, posts it as a comment + attachment on this todo. The owner reviews + refines.</p>
<h3>Briefs to read first</h3>
<ul>${briefList}</ul>
<p style="font-size:11px;color:#64748b">Generated by CB System on 2026-05-31 to fill in a missing upstream that an Approval Queue task was waiting on.</p>
</div>`;
}

(async () => {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const byName = Object.fromEntries(lists.map((l) => [l.name, l]));

  for (const u of UPSTREAMS) {
    const list = byName[u.list];
    if (!list) { console.error(`MISS list "${u.list}"`); continue; }
    const owner = getByHandle(u.owner);
    const assigneeIds = owner?.basecampPersonId ? [owner.basecampPersonId] : [];
    try {
      const todo = await ops.createTodo({
        listId: list.id,
        content: u.content,
        description: dodHtml(u),
        assigneePersonIds: assigneeIds,
        dueOn: u.due,
      });
      console.log(`+ ${u.list} / ${todo.id}: ${u.content}`);
    } catch (e) {
      console.error(`FAIL "${u.content}": ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log('\nDone.');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
