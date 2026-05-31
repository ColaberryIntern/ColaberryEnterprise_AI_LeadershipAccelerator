#!/usr/bin/env node
/**
 * Repair tasks that had their due_on + description wiped by an earlier
 * incident (reassignDraftedTasks.js PUT without merging fields).
 *
 * For each task with missing due_on OR empty description:
 *   1. Compute a back-distributed Mon-Fri due date based on position in area
 *      (earliest at top, working back from 2026-07-11)
 *   2. Restore a functional description with tier badge + reviewer +
 *      relevant brief links + Vault folder link
 *   3. PUT via updateTodo (which merges, doesn't wipe)
 *
 * Idempotent: re-running just confirms existing fields. Tasks already
 * complete are not touched.
 *
 * Run: node backend/src/scripts/repairWipedTasks.js [--dry-run]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { LAUNCH, getByHandle } = require('./lib/launchPmoTeam');

const DRY = process.argv.includes('--dry-run');
const VAULT_MAP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/launch-briefs-vault-urls.json'), 'utf8'));
const RUNNER_STATE = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/launch-pmo-ai-runner-state.json'), 'utf8'));
const DRAFTED = new Set(Object.keys(RUNNER_STATE.tasks || {}));

const LAUNCH_DATE = new Date(`${LAUNCH.targetLaunchDate}T00:00:00Z`);
const REVIEWER_BY_AREA = {
  'Curriculum': 'swati',
  'Website - training.colaberry.com': 'tejesh',
  'Website - enterprise.colaberry.ai': 'kes',
  'Marketing': 'sohail',
  'AI Systems': 'kes',
  'Open Houses & Events': 'jackie',
  'Sales & Admissions': 'taiwo',
  'TWC Compliance': 'swati',
  'Approval Queues': 'ali',
  'Launch Readiness Dashboard': 'ali',
};
const BRIEFS_BY_AREA = {
  'Curriculum': ['swati-curriculum-twc', 'program-overview', 'launch-timeline-41d'],
  'Website - training.colaberry.com': ['tejesh-website-training', 'brand-pricing', 'program-overview'],
  'Website - enterprise.colaberry.ai': ['kes-ai-systems', 'program-overview', 'launch-timeline-41d'],
  'Marketing': ['sohail-marketing', 'brand-pricing', 'program-overview'],
  'AI Systems': ['kes-ai-systems', 'program-overview', 'cb-pmo-contract'],
  'Open Houses & Events': ['jackie-events', 'sohail-marketing', 'launch-timeline-41d'],
  'Sales & Admissions': ['roselen-sales', 'taiwo-admissions', 'brand-pricing'],
  'TWC Compliance': ['swati-curriculum-twc', 'twc-context', 'program-overview'],
  'Approval Queues': ['ali-decisions', 'decisions-locked', 'program-overview'],
  'Launch Readiness Dashboard': ['cb-pmo-contract', 'launch-timeline-41d', 'program-overview'],
};

// Add N Mon-Fri working days backward from a base date.
function workdaysBackward(baseIso, n) {
  let d = new Date(`${baseIso}T00:00:00Z`);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

function tierFromContent(content) {
  const c = (content || '').toLowerCase();
  if (/^(review|approve|finalize|sign|conduct|develop strategy|develop marketing strategy)/i.test(content || '')) return 'HUMAN';
  if (/^(draft|create|design|build|develop|implement|produce|deploy|set up|generate|integrate|launch|migrate|complete)/i.test(content || '')) return 'AI';
  return 'EITHER';
}

function buildDescription({ task, area, tier, reviewerName, briefSlugs }) {
  const briefs = briefSlugs.map((s) => VAULT_MAP.briefs[s]).filter(Boolean);
  const briefList = briefs.map((b) => `<li><a href="${b.url}">${b.description || b.filename}</a></li>`).join('');
  const folderLink = VAULT_MAP.folder?.url
    ? `<p style="font-size:11px;color:#64748b">All briefs: <a href="${VAULT_MAP.folder.url}">Launch Briefs vault folder</a></p>`
    : '';
  const tierBadge = tier === 'AI'
    ? '<span style="background:#dbeafe;color:#1e40af;font-weight:700;font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:1px">AI TASK</span>'
    : '<span style="background:#fef3c7;color:#92400e;font-weight:700;font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:1px">HUMAN TASK</span>';
  const draftedNote = DRAFTED.has(String(task.id))
    ? `<div style="background:#dbeafe;border-left:4px solid #1e40af;padding:10px 14px;margin:8px 0;border-radius:0 4px 4px 0;font-size:12px;color:#1e40af"><strong>CB has drafted this task.</strong> ${reviewerName} reviews + refines + marks complete. See earlier comments on this todo for the deliverable.</div>`
    : '';
  return `<div>
${tierBadge} <strong>Owner:</strong> ${reviewerName}
${draftedNote}
<h3>Objective</h3>
<p>Complete this task per the area's brief. Specific guidance in the linked briefs below.</p>
<h3>Deliverable</h3>
<p>A concrete artifact appropriate for this task type: code (for AI Systems / Websites), copy + design (for Marketing / Curriculum / Open Houses), document (for TWC / Approval Queues), or decision (for Approvals).</p>
<h3>Definition of done</h3>
<p>Reviewer (${reviewerName}) signs off + marks the BC todo complete. If approval flows through Ali, surface via Approval Queues.</p>
<h3>Dependencies</h3>
<p>See area brief for upstream tasks. CB blocker detection runs daily.</p>
<h3>Briefs to read first</h3>
<ul>${briefList}</ul>
${folderLink}
<p style="font-size:11px;color:#64748b">Description restored 2026-05-31 after a reassignment incident wiped the original. Tag <code>@CB System</code> on this todo to request a fresh gpt-4o-derived detailed brief.</p>
</div>`;
}

(async () => {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);

  // For each area, compute the desired due dates for tasks needing them.
  // Strategy: collect all open tasks in the area sorted by current due_on
  // (nulls last). Tasks WITH due dates keep them. Tasks WITHOUT due dates
  // get back-distributed slots interleaved between the dated tasks AND
  // between the latest dated and launch date.
  let totalFixed = 0, totalSkipped = 0, totalFailed = 0;
  for (const list of lists) {
    const todos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
    if (!todos || todos.length === 0) continue;

    // Find tasks with dates + without
    const withDate = todos.filter((t) => t.due_on);
    const withoutDate = todos.filter((t) => !t.due_on);
    if (withoutDate.length === 0) continue;

    const reviewerHandle = REVIEWER_BY_AREA[list.name] || 'ali';
    const reviewer = getByHandle(reviewerHandle);
    const reviewerName = reviewer?.displayName || 'Ali';
    const briefSlugs = BRIEFS_BY_AREA[list.name] || ['program-overview'];

    // Find the latest existing date in the area; if none, use launch - 14 days
    const latestExistingDate = withDate.length
      ? withDate.map((t) => t.due_on).sort().pop()
      : workdaysBackward(LAUNCH.targetLaunchDate, 14);

    // Back-distribute the undated tasks across Mon-Fri days between
    // latestExistingDate and launch. Spread them evenly with ~2-day spacing.
    const dueDatesNew = withoutDate.map((_, i) => {
      // Place starting 2 work-days after latestExistingDate, spaced by 2 work-days
      let d = new Date(`${latestExistingDate}T00:00:00Z`);
      let added = 0, needed = 2 + i * 2;
      while (added < needed) {
        d.setUTCDate(d.getUTCDate() + 1);
        const dow = d.getUTCDay();
        if (dow !== 0 && dow !== 6) added++;
      }
      const iso = d.toISOString().slice(0, 10);
      return iso > LAUNCH.targetLaunchDate ? LAUNCH.targetLaunchDate : iso;
    });

    for (let i = 0; i < withoutDate.length; i++) {
      const t = withoutDate[i];
      const dueOn = dueDatesNew[i];
      const tier = tierFromContent(t.content);
      const desc = buildDescription({ task: t, area: list.name, tier, reviewerName, briefSlugs });
      console.log(`${DRY ? '[dry] ' : ''}repair ${t.id} [${list.name}] due=${dueOn} desc=${desc.length}c -> "${(t.content || '').slice(0, 60)}"`);
      if (DRY) { totalFixed++; continue; }
      try {
        await ops.updateTodo({
          todoId: t.id,
          patch: { due_on: dueOn, description: desc },
        });
        totalFixed++;
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        console.error(`  FAIL ${t.id}: ${e.message}`);
        totalFailed++;
      }
    }
  }

  console.log(`\nResult: fixed=${totalFixed}, skipped=${totalSkipped}, failed=${totalFailed}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
