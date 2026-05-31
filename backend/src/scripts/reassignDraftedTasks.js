#!/usr/bin/env node
/**
 * Reassign every CB-drafted AI task in the launch project to its area's
 * designated human reviewer. Once CB has produced a first-pass deliverable,
 * the task is no longer "CB's plate" - it belongs to the reviewer to refine
 * and mark complete.
 *
 * The reviewer mapping mirrors REVIEWER_BY_AREA in launchPmoDailyUpdate.js.
 * Idempotent: skips tasks already assigned to the right reviewer.
 *
 * Run: node backend/src/scripts/reassignDraftedTasks.js [--dry-run]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { LAUNCH, getByHandle } = require('./lib/launchPmoTeam');

const DRY = process.argv.includes('--dry-run');

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

(async () => {
  const runnerState = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/launch-pmo-ai-runner-state.json'), 'utf8'));
  const drafted = new Set(Object.keys(runnerState.tasks || {}));

  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);

  let reassigned = 0, skipped = 0, failed = 0;
  for (const list of lists) {
    const reviewerHandle = REVIEWER_BY_AREA[list.name];
    if (!reviewerHandle) { console.log(`skip area "${list.name}" - no reviewer mapping`); continue; }
    const reviewer = getByHandle(reviewerHandle);
    if (!reviewer || !reviewer.basecampPersonId) { console.log(`skip area "${list.name}" - reviewer ${reviewerHandle} not provisioned`); continue; }
    const todos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
    for (const t of todos) {
      if (!drafted.has(String(t.id))) continue;
      const current = (t.assignees || []).map((a) => a.id);
      if (current.length === 1 && current[0] === reviewer.basecampPersonId) { skipped++; continue; }
      console.log(`${DRY ? '[dry] ' : ''}reassign ${t.id} "${(t.content || '').slice(0, 60)}" -> ${reviewer.displayName}`);
      if (DRY) continue;
      try {
        // Basecamp PUT /buckets/<bucket>/todos/<id>.json with assignee_ids
        await ops.bcPut(`/buckets/${LAUNCH.projectId}/todos/${t.id}.json`, {
          content: t.content,
          assignee_ids: [reviewer.basecampPersonId],
        });
        reassigned++;
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        console.error(`  FAIL ${t.id}: ${e.message}`);
        failed++;
      }
    }
  }
  console.log(`\nResult: reassigned=${reassigned}, skipped=${skipped}, failed=${failed}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
