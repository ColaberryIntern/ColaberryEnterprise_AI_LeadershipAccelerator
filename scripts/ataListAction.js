#!/usr/bin/env node
/**
 * Carry out a strategic move on a whole list. DRY RUN BY DEFAULT.
 *
 *   node scripts/ataListAction.js --list "9. Ensuring Data Security" --dismiss --reason "demo scaffolding"
 *   node scripts/ataListAction.js --list "Understanding Inputs and Outputs" --redate-from 2026-11-17 --per-week 3
 *   node scripts/ataListAction.js --list "3. Tracking Shipments" --assign Kes
 *
 * Add --apply to write. Without it, nothing happens and the plan is printed.
 *
 * TWO CLASSES OF ACTION, AND THE DIFFERENCE IS ENFORCED HERE
 *
 *   dismiss  touches the local mirror only. The ticket stays OPEN in Basecamp and anyone else
 *            assigned still sees it. This is "stop showing it to me", not "this is cancelled".
 *            Safe, reversible, and it is the one action this script will actually perform.
 *
 *   redate   reach Basecamp, so other people see the result. The script PLANS them and writes the
 *   assign   plan to a file, but refuses to apply them itself: bulk Basecamp writes on Ali's
 *            behalf are gated in this environment, and a script that quietly did them anyway
 *            would be routing around the gate rather than respecting it.
 *
 * Every applied dismissal records who, when and why, because a bulk change nobody can explain six
 * weeks later is indistinguishable from data loss.
 */
const fs = require('fs');
const path = require('path');
const { sequelize } = require('/app/dist/config/database');
const { QueryTypes } = require('/app/node_modules/sequelize');

const libDir = fs.existsSync(path.join(__dirname, 'listActions.js'))
  ? __dirname
  : path.join(__dirname, '../backend/src/scripts/lib/aliTaskAgent');
const { planDismiss, planRedate, planAssign, renderPlan } = require(path.join(libDir, 'listActions'));

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

const LIST = arg('list');
const APPLY = has('apply');
const ALI = 17454835;

if (!LIST) { console.error('--list "<exact list name>" is required'); process.exit(1); }

(async () => {
  const rows = await sequelize.query(`
    SELECT bc_id, project_id, title, due_on, todolist_name, is_dismissed
      FROM ops_bc_todos
     WHERE status = 'active' AND is_dismissed IS NOT TRUE
       AND todolist_name = $1
       AND assignee_ids::text LIKE $2
     ORDER BY due_on ASC NULLS LAST`,
  { type: QueryTypes.SELECT, bind: [LIST, `%${ALI}%`] });

  if (!rows.length) {
    console.log(`No active, undismissed tasks assigned to Ali in list "${LIST}".`);
    await sequelize.close();
    process.exit(0);
  }

  const tasks = rows.map((r) => ({ id: `${r.project_id}/${r.bc_id}`, bcId: r.bc_id, title: r.title, dueOn: r.due_on }));
  console.log(`List "${LIST}": ${tasks.length} task(s) assigned to Ali\n`);

  let plan;
  if (has('dismiss')) plan = planDismiss(tasks, { reason: arg('reason', '') });
  else if (arg('redate-from')) plan = planRedate(tasks, { from: arg('redate-from'), perWeek: Number(arg('per-week', '3')) });
  else if (arg('assign')) plan = planAssign(tasks, { to: arg('assign') });
  else { console.error('pick one of --dismiss, --redate-from <date>, --assign <person>'); await sequelize.close(); process.exit(1); }

  console.log(renderPlan(plan, { limit: 10 }));
  console.log('');

  if (plan.problems.length) { await sequelize.close(); process.exit(1); }

  if (!APPLY) {
    console.log('DRY RUN. Nothing was changed. Add --apply to carry this out.');
    await sequelize.close();
    process.exit(0);
  }

  if (plan.writesToBasecamp) {
    /**
     * Refused on purpose, and the plan is written out rather than discarded so the work of
     * producing it is not lost. Bulk Basecamp writes as Ali are gated in this environment; a
     * script that performed them anyway would be defeating the gate, not satisfying the request.
     */
    const out = `/tmp/ata-plan-${plan.action}-${Date.now()}.json`;
    fs.writeFileSync(out, JSON.stringify({ list: LIST, ...plan }, null, 2), 'utf8');
    console.log(`REFUSED to apply: this action writes to Basecamp, and bulk Basecamp writes as Ali`);
    console.log(`are gated in this environment. The full plan is saved at ${out} for Ali to run.`);
    await sequelize.close();
    process.exit(2);
  }

  // The one action this script performs: a local, reversible dismissal.
  const ids = plan.changes.map((c) => Number(String(c.id).split('/')[1])).filter(Boolean);
  const [, affected] = await sequelize.query(
    `UPDATE ops_bc_todos
        SET is_dismissed = true, dismissed_at = now(), dismissed_by = $1, dismissed_reason = $2
      WHERE bc_id = ANY($3::bigint[]) AND is_dismissed IS NOT TRUE`,
    { type: QueryTypes.UPDATE, bind: ['ata-list', plan.changes[0].reason, ids] },
  );

  console.log(`APPLIED. ${affected} row(s) dismissed from the queue.`);
  console.log('The tickets remain OPEN in Basecamp. To undo:');
  console.log(`  UPDATE ops_bc_todos SET is_dismissed = false, dismissed_at = NULL,`);
  console.log(`    dismissed_by = NULL, dismissed_reason = NULL WHERE bc_id = ANY('{${ids.slice(0, 5).join(',')}${ids.length > 5 ? ',...' : ''}}'::bigint[]);`);

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
