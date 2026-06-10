#!/usr/bin/env node
/**
 * Reconfigure the Curriculum todolist (Basecamp project 47502609, list
 * 9946468992) into the full 12-week build tracker.
 *
 * Target structure (Ali, 2026-06-10): 12 week-groups, each holding the lean
 * 5-item build checklist (Anthropic-section mapped / Lab+artifact spec /
 * Assessment pack / NotebookLM video / Swati sign-off). Clean rebuild: legacy
 * top-level review todos are trashed; the 12 groups are (re)created and
 * populated. Kes owns the Anthropic-mapping item, Swati owns the rest. Every
 * todo is dated build-ahead of its teaching week (see lib/curriculumWeeks.js).
 *
 * Idempotent: groups keyed by name, todos keyed by content within each group,
 * so re-running reconciles and never duplicates. Safe to re-run as content firms.
 *
 * Run:
 *   node backend/src/scripts/reconfigureCurriculumList.js --dry-run   # preview, writes nothing
 *   node backend/src/scripts/reconfigureCurriculumList.js             # apply
 *
 * Token resolves via getBasecampToken() (CCPP) -> apply runs where creds live
 * (prod backend container / VPS). --dry-run with no token prints the intended
 * structure from data only.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { LAUNCH, getByHandle } = require('./lib/launchPmoTeam');
const ops = require('./lib/launchPmoOps');
const cur = require('./lib/curriculumWeeks');

let getBasecampToken = null;
try { ({ getBasecampToken } = require('./lib/basecampToken')); } catch { /* optional locally */ }

const DRY = process.argv.includes('--dry-run');
const CURRICULUM_LIST_ID = 9946468992;

function ownerIds(handle) {
  const p = getByHandle(handle);
  if (!p || !p.basecampPersonId) return [];
  return [p.basecampPersonId];
}

function ownerLabel(handle) {
  const p = getByHandle(handle);
  if (!p) return handle;
  return p.basecampPersonId ? p.displayName : `${p.displayName} (UNPROVISIONED — will skip assignment)`;
}

function printPlan() {
  console.log('=== Curriculum list reconfiguration plan ===');
  console.log(`Project ${LAUNCH.projectId} · Curriculum list ${CURRICULUM_LIST_ID}`);
  console.log(`Kickoff ${cur.KICKOFF} · build-ahead ${cur.BUILD_AHEAD_DAYS}d · ${cur.WEEKS.length} weeks × ${cur.COMPONENTS.length} items = ${cur.WEEKS.length * cur.COMPONENTS.length} todos\n`);
  for (const w of cur.WEEKS) {
    const due = cur.weekDueDate(w.week);
    console.log(`${cur.groupName(w)}   [due ${due}, teaches ${cur.weekTeachingMonday(w.week)}]`);
    for (const c of cur.COMPONENTS) {
      console.log(`    - [${ownerLabel(c.owner)}] ${c.content}`);
    }
  }
  console.log('');
}

async function resolveCurriculumList() {
  const dock = await ops.getDock(LAUNCH.projectId);
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const byName = (lists || []).find((l) => l.name === 'Curriculum');
  if (byName) return byName;
  // Fallback: fetch by known id.
  return ops.bcGet(`/buckets/${LAUNCH.projectId}/todolists/${CURRICULUM_LIST_ID}.json`);
}

async function main() {
  printPlan();

  // Resolve token (apply needs it; dry-run prefers it but degrades gracefully).
  let haveToken = !!process.env.BASECAMP_ACCESS_TOKEN;
  if (!haveToken && getBasecampToken) {
    try {
      process.env.BASECAMP_ACCESS_TOKEN = await getBasecampToken();
      haveToken = !!process.env.BASECAMP_ACCESS_TOKEN;
    } catch (e) {
      haveToken = false;
    }
  }

  if (!haveToken) {
    if (DRY) {
      console.log('[dry-run] No Basecamp token available locally — printed the intended structure from data only.');
      console.log('Run on the VPS / where CCPP creds resolve to see the live diff and to apply.');
      return;
    }
    throw new Error('BASECAMP_ACCESS_TOKEN could not be resolved — cannot apply. Run where CCPP creds are available.');
  }

  const list = await resolveCurriculumList();
  console.log(`Resolved Curriculum list: "${list.name}" (id ${list.id})\n`);

  const desiredNames = new Set(cur.WEEKS.map((w) => cur.groupName(w)));
  const componentContents = new Set(cur.COMPONENTS.map((c) => c.content));
  let trashed = 0;
  const trash = async (recordingId, label) => {
    if (DRY) {
      console.log(`   would trash: ${label}`);
    } else {
      await ops.trashTodo({ recordingId });
      console.log(`   trashed: ${label}`);
      trashed += 1;
    }
  };

  // 1. Clean up old tasks. Three sources of legacy items:
  //    (a) top-level (ungrouped) todos in the list,
  //    (b) stale groups whose name is not one of our 12 weeks — trash their
  //        todos then the group itself,
  //    (c) inside a kept week-group, any todo whose content is not one of our
  //        5 components (a stale item from an earlier structure).
  console.log('-- Cleanup of old tasks');
  const topTodos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
  for (const t of topTodos) await trash(t.id, `top-level todo "${t.content}"`);

  const existingGroups = await ops.listTodoGroups({ projectId: LAUNCH.projectId, listId: list.id });
  for (const g of existingGroups || []) {
    const groupTodos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${g.id}/todos.json`);
    if (!desiredNames.has(g.name)) {
      for (const t of groupTodos) await trash(t.id, `stale-group todo "${t.content}" (group "${g.name}")`);
      await trash(g.id, `stale group "${g.name}"`);
    } else {
      for (const t of groupTodos) {
        if (!componentContents.has(t.content)) await trash(t.id, `stale todo "${t.content}" in "${g.name}"`);
      }
    }
  }
  if (trashed === 0 && !DRY) console.log('   (nothing to trash — list already clean)');

  // 2. Build 12 week-groups, each with the 5-item checklist.
  console.log(`\n-- Building ${cur.WEEKS.length} week-groups`);
  let groupsTouched = 0;
  let todosTouched = 0;
  for (const w of cur.WEEKS) {
    const name = cur.groupName(w);
    const due = cur.weekDueDate(w.week);
    let group = null;
    if (DRY) {
      console.log(`   group: "${name}"`);
    } else {
      group = await ops.createTodoGroup({ listId: list.id, name });
      groupsTouched += 1;
    }
    for (const c of cur.COMPONENTS) {
      const description = typeof c.description === 'function' ? c.description(w) : c.description;
      if (DRY) {
        console.log(`       todo: [${c.owner}] ${c.content}  (due ${due})`);
      } else {
        await ops.createTodo({
          listId: group.id,
          content: c.content,
          description,
          assigneePersonIds: ownerIds(c.owner),
          dueOn: due,
        });
        todosTouched += 1;
      }
    }
  }

  if (DRY) {
    console.log('\n[dry-run] No changes written.');
  } else {
    console.log(`\nDone. ${groupsTouched} groups reconciled, ${todosTouched} todos reconciled, ${trashed} legacy items trashed.`);
  }
}

main().catch((e) => {
  console.error('reconfigureCurriculumList failed:', (e && e.message) || e);
  process.exit(1);
});
