#!/usr/bin/env node
/**
 * Trash todos in the launch project that were created BEFORE a cutoff
 * timestamp. Used to clean up the v1 task set after generating v2.
 *
 * Cutoff defaults to 2026-05-31T19:00:00Z (just before the v2 generation run
 * which started ~19:50 UTC). Pass --cutoff="2026-05-31T19:00:00Z" to override.
 *
 * Run: node backend/src/scripts/trashStaleLaunchTodos.js [--dry-run]
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { LAUNCH } = require('./lib/launchPmoTeam');

const DRY = process.argv.includes('--dry-run');
const cutoffArg = process.argv.find((a) => a.startsWith('--cutoff='));
const CUTOFF = new Date(cutoffArg ? cutoffArg.split('=')[1] : '2026-05-31T19:00:00Z');

(async () => {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  let trashed = 0, skipped = 0;
  for (const list of lists) {
    const open = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
    const done = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json?completed=true`);
    const all = [...(open || []), ...(done || [])];
    console.log(`\n${list.name}: ${all.length} todos`);
    for (const t of all) {
      const ctime = new Date(t.created_at);
      if (ctime >= CUTOFF) { skipped++; continue; }
      console.log(`  ${DRY ? '[dry] ' : ''}trash ${t.id} [${t.created_at.slice(0,16)}] ${t.content.slice(0,70)}`);
      if (DRY) { trashed++; continue; }
      try {
        await ops.bcPut(`/buckets/${LAUNCH.projectId}/recordings/${t.id}/status/trashed.json`, {});
        trashed++;
        await new Promise((r) => setTimeout(r, 100));
      } catch (e) {
        console.error(`    FAIL: ${e.message}`);
      }
    }
  }
  console.log(`\nResult: trashed=${trashed}, kept=${skipped} (cutoff ${CUTOFF.toISOString()})`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
