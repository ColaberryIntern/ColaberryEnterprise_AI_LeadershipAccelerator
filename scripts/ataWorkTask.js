#!/usr/bin/env node
/**
 * Pick up ONE ticket properly: claim it, print everything needed to work it, and nothing else.
 *
 *   node scripts/ataWorkTask.js --task 7463955/10406234078 --holder "nudge-tab"
 *   node scripts/ataWorkTask.js --task 7463955/10406234078 --holder "nudge-tab" --release
 *   node scripts/ataWorkTask.js --task 7463955/10406234078 --peek      # no claim taken
 *
 * WHY CLAIMING IS THE FIRST THING IT DOES, NOT THE LAST
 *
 * The Ali Task Agent's idempotency marker is a comment on the Basecamp thread, which is the right
 * source of truth for "has ATA acted" and completely blind to a session with a worktree open and a
 * PR half-written. Two tabs handed the same digest will otherwise do the same ticket. The claim is
 * taken BEFORE the brief is printed, so a session that cannot have the ticket never even sees the
 * work and is not tempted by it.
 *
 * It refuses rather than queues. If somebody else holds it, the right move is a different ticket,
 * not a wait: there are hundreds available and blocking on one is how a tab goes idle.
 */
const fs = require('fs');
const path = require('path');
const { sequelize } = require('/app/dist/config/database');
const { QueryTypes } = require('/app/node_modules/sequelize');

const libDir = fs.existsSync(path.join(__dirname, 'workOrder.js'))
  ? __dirname
  : path.join(__dirname, '../backend/src/scripts/lib/aliTaskAgent');
const { buildWorkOrder, renderWorkOrderText } = require(path.join(libDir, 'workOrder'));
const { parseBrief } = require(path.join(libDir, 'briefParser'));
const claims = require('/app/dist/services/ops/taskClaims');

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

const TASK = arg('task');
const HOLDER = arg('holder', 'unnamed-session');
const TTL = Number(arg('ttl', '60'));

if (!TASK || !/^\d+\/\d+$/.test(TASK)) {
  console.error('--task <projectId>/<todoId> is required, exactly as the work order prints it');
  process.exit(1);
}
const [projectId, bcId] = TASK.split('/');

(async () => {
  if (has('release')) {
    const ok = await claims.release(TASK, HOLDER);
    console.log(ok
      ? `Released ${TASK}.`
      : `Not released: ${HOLDER} does not hold ${TASK}. Only the holder may release it.`);
    await sequelize.close();
    process.exit(ok ? 0 : 1);
  }

  const rows = await sequelize.query(`
    SELECT bc_id, project_id, title, description, category, status, due_on, urgency_score,
           bc_app_url, todolist_name, is_dismissed
      FROM ops_bc_todos WHERE bc_id = $1 AND project_id = $2`,
  { type: QueryTypes.SELECT, bind: [bcId, projectId] });

  if (!rows.length) {
    console.error(`No mirror row for ${TASK}. The id may be stale, or the sync has not seen it.`);
    await sequelize.close();
    process.exit(1);
  }
  const row = rows[0];

  if (row.status !== 'active' || row.is_dismissed) {
    console.log(`WARNING: ${TASK} is status=${row.status}${row.is_dismissed ? ', dismissed' : ''}.`);
    console.log('The mirror can lag Basecamp on completion, so check the ticket before working it.');
    console.log('');
  }

  // The claim comes first, deliberately. See the header.
  if (!has('peek')) {
    const got = await claims.claim(TASK, HOLDER, { ttlMinutes: TTL, purpose: String(row.title).slice(0, 80) });
    if (!got.ok) {
      console.error(`HELD BY ${got.heldBy} until ${got.heldUntil}.`);
      console.error('Pick a different ticket rather than waiting: there are hundreds available,');
      console.error('and blocking on one is how a tab goes idle.');
      await sequelize.close();
      process.exit(2);
    }
    console.log(`CLAIMED ${TASK} for ${HOLDER} until ${got.claim.expires_at}`);
    console.log(`Release when done:  node scripts/ataWorkTask.js --task ${TASK} --holder "${HOLDER}" --release`);
    console.log('');
  }

  const wo = buildWorkOrder(row, new Date());
  console.log(renderWorkOrderText(wo));

  /**
   * The full brief, after the summary rather than instead of it. The work order's one-line summary
   * is for scanning a queue; a session about to spend an hour on the ticket needs what the author
   * actually wrote, and re-fetching it from Basecamp is a round trip for something already here.
   */
  const brief = parseBrief(row.description);
  if (brief.text) {
    console.log('');
    console.log('--- the ticket, in full -------------------------------------------------');
    console.log(brief.text.split('\n').map((l) => `  ${l}`).join('\n'));
    console.log('-------------------------------------------------------------------------');
  }

  if (!wo.doneWhen) {
    console.log('');
    console.log('NO FINISH LINE IS STATED. Establish one before working, or ask Ali a single');
    console.log('question. 83% of tickets omit it, and a session that invents one delivers');
    console.log('something nobody asked for.');
  }

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
