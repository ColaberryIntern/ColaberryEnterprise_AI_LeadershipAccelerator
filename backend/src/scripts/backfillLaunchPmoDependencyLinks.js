#!/usr/bin/env node
// Backfill dependency/artifact/list LINKS onto the AI Systems Architect
// Accelerator launch board (project 47502609), IN PLACE — non-destructive.
//
// Why: approval/review tasks name their upstream deliverable by TITLE only
// (e.g. "Draft sales call script for outreach to alumni") with no link. A
// fresh session cannot navigate to the artifact it must approve, so the gate
// stalls and the My Day scorer falsely escalates it as an approver delay
// (8 days of false CRITICAL on a task actionable in minutes). This script
// resolves each task's free-text dependency to its sibling todo and stamps
// the machine-readable markers the My Day surface parses:
//
//     Depends-on: <drafting todo URL>
//     Artifact:   <drafting todo URL if that task is complete, else PENDING>
//     List:       <todolist URL>
//
// Contract: AI_ProjectArchitect directives/approval-task-dependency-linking.md.
// Unlike generateLaunchTasks.js this NEVER trashes/recreates todos — it only
// edits descriptions via ops.updateTodo (merge-then-PUT, notify:false), so the
// live board, ids, comments, and assignments are preserved.
//
// Idempotent: re-running replaces the marker block in place (byte-stable when
// nothing changed, so no write). Dry-run by default; pass --apply to write.

const ops = require('./lib/launchPmoOps');
const { LAUNCH } = require('./lib/launchPmoTeam');
const dl = require('./lib/dependencyLinks');

const APPLY = process.argv.includes('--apply');

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(
    `/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`
  );

  // Gather every todo (open + completed) across all lists as resolution
  // candidates. Dependencies frequently point at a COMPLETED drafting task.
  const all = [];
  for (const list of lists) {
    const open = (await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`)) || [];
    const done = (await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json?completed=true`)) || [];
    for (const t of [...open, ...done]) {
      all.push({
        id: t.id,
        title: stripHtml(t.content),
        app_url: t.app_url,
        completed: !!t.completed,
        listId: list.id,
        listName: list.name,
        description: t.description || '',
      });
    }
  }

  const plan = [];      // resolvable links to write
  const unresolved = []; // tasks with a dependency we could not match (reported, not failed)

  for (const t of all) {
    if (t.completed) continue; // only link tasks still actionable
    const depText = dl.extractDependencyText(t.description);
    if (!depText) continue;
    const dep = dl.resolveDependency(depText, all, { selfId: t.id });
    if (!dep) { unresolved.push({ t, depText }); continue; }
    const listUrl = dl.listUrlFromAppUrl(t.app_url, t.listId);
    const artifact = dep.completed ? dep.app_url : 'PENDING';
    const block = dl.buildMarkersBlock({ dependsOnUrl: dep.app_url, artifact, listUrl });
    const newDesc = dl.injectMarkers(t.description, block);
    if (newDesc === t.description) continue; // already current — skip the write
    plan.push({ t, dep, artifact, newDesc });
  }

  console.log(`\n=== Launch PMO dependency-link backfill ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===`);
  console.log(`Project ${LAUNCH.projectId} | ${all.length} todos scanned across ${lists.length} lists`);
  console.log(`Resolvable links to stamp: ${plan.length} | unresolved dependencies: ${unresolved.length}\n`);

  const byArea = {};
  for (const p of plan) (byArea[p.t.listName] ||= []).push(p);
  for (const [area, rows] of Object.entries(byArea)) {
    console.log(`## ${area} (${rows.length})`);
    for (const p of rows) {
      const art = p.artifact === 'PENDING' ? 'PENDING' : 'attached';
      console.log(`  ${p.t.title.slice(0, 60).padEnd(60)} -> ${p.dep.title.slice(0, 45)} [artifact:${art}]`);
    }
  }
  if (unresolved.length) {
    console.log(`\n## Unresolved (left as-is, no link stamped):`);
    for (const u of unresolved) {
      console.log(`  ${u.t.title.slice(0, 60).padEnd(60)} dep="${u.depText.slice(0, 50)}"`);
    }
  }

  if (!APPLY) {
    console.log('\n(dry run — nothing written. Re-run with --apply to write.)');
    return;
  }

  console.log('\nApplying...');
  let ok = 0, fail = 0;
  for (const p of plan) {
    try {
      await ops.updateTodo({ todoId: p.t.id, patch: { description: p.newDesc } });
      ok++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      fail++;
      console.error(`  FAIL ${p.t.id} (${p.t.title.slice(0, 50)}): ${e.message}`);
    }
  }
  console.log(`\nDone. ${ok} updated, ${fail} failed.`);
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
}

module.exports = { main };
