#!/usr/bin/env node
/**
 * Take the next N tickets in one go: claim them, print every brief, hand back one release command.
 *
 *   node scripts/ataWorkBatch.js --top 5 --holder "nudge-tab"
 *   node scripts/ataWorkBatch.js --top 8 --holder "nudge-tab" --disposition prep
 *   node scripts/ataWorkBatch.js --top 5 --holder "nudge-tab" --list "3. Tracking Shipments"
 *   node scripts/ataWorkBatch.js --holder "nudge-tab" --release-all
 *   node scripts/ataWorkBatch.js --top 5 --dry          # see the batch, claim nothing
 *
 * THE MIDDLE THAT WAS MISSING
 *
 * ataWorkTask takes one ticket; ataListAction decides a whole list. Neither fits the common case:
 * a session with an hour, wanting the next few things that need no decision from anyone. Doing
 * that with the single-ticket script is N round trips and N chances to pick one somebody else
 * already holds.
 *
 * DEFAULTS TO `act` ON PURPOSE. Those are the tickets whose own evidence says nothing is blocking
 * them and no human is required - the ones that fell off for no reason. A batch that defaulted to
 * everything would put a decision or a filing in front of a session that cannot make or do it.
 *
 * Claims are taken one at a time and a held ticket is SKIPPED, not waited on. The batch is best
 * effort: asking for five and getting three because two were taken is the correct outcome, and it
 * is reported rather than hidden.
 */
const fs = require('fs');
const path = require('path');
const { sequelize } = require('/app/dist/config/database');
const { QueryTypes } = require('/app/node_modules/sequelize');

const libDir = fs.existsSync(path.join(__dirname, 'workOrder.js'))
  ? __dirname
  : path.join(__dirname, '../backend/src/scripts/lib/aliTaskAgent');
const { buildWorkOrder, renderWorkOrderText, DISPOSITION_LABEL } = require(path.join(libDir, 'workOrder'));
const claims = require('/app/dist/services/ops/taskClaims');

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

const TOP = Math.max(1, Math.min(25, Number(arg('top', '5')) || 5));
const HOLDER = arg('holder', 'unnamed-session');
const WANT = arg('disposition', 'act');
const LIST = arg('list');
const TTL = Number(arg('ttl', '90'));
const DRY = has('dry');
const ALI = 17454835;

(async () => {
  if (has('release-all')) {
    const live = await claims.listLive();
    const mine = live.filter((c) => c.holder === HOLDER);
    let n = 0;
    for (const c of mine) { if (await claims.release(c.task_key, HOLDER)) n += 1; }
    console.log(`Released ${n} of ${mine.length} claim(s) held by ${HOLDER}.`);
    await sequelize.close();
    process.exit(0);
  }

  const rows = await sequelize.query(`
    SELECT bc_id, project_id, title, description, category, status, due_on, urgency_score,
           bc_app_url, todolist_name
      FROM ops_bc_todos
     WHERE status = 'active' AND is_dismissed IS NOT TRUE
       AND assignee_ids::text LIKE $1
       ${LIST ? 'AND todolist_name = $2' : ''}
     ORDER BY urgency_score DESC NULLS LAST, due_on ASC NULLS LAST
     LIMIT 600`,
  { type: QueryTypes.SELECT, bind: LIST ? [`%${ALI}%`, LIST] : [`%${ALI}%`] });

  const now = new Date();
  const all = rows.map((r) => buildWorkOrder(r, now));
  const pool = WANT === 'any' ? all : all.filter((w) => w.disposition === WANT);

  console.log(`${all.length} candidate ticket(s)${LIST ? ` in "${LIST}"` : ''}; `
    + `${pool.length} with disposition "${WANT}".`);
  if (!pool.length) {
    console.log('Nothing to take. Try --disposition any, or a different list.');
    await sequelize.close();
    process.exit(0);
  }

  const taken = [];
  const skipped = [];
  for (const wo of pool) {
    if (taken.length >= TOP) break;
    if (DRY) { taken.push(wo); continue; }
    const got = await claims.claim(wo.id, HOLDER, { ttlMinutes: TTL, purpose: String(wo.title).slice(0, 80) });
    if (got.ok) taken.push(wo);
    else skipped.push({ wo, heldBy: got.heldBy });
  }

  console.log('');
  console.log(DRY
    ? `DRY RUN: these ${taken.length} would be claimed. Nothing was taken.`
    : `CLAIMED ${taken.length} for ${HOLDER}, ${TTL} minute lease.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} already held: `
      + skipped.map((s) => `${s.wo.id} (${s.heldBy})`).join(', '));
  }
  console.log('');

  taken.forEach((wo, i) => {
    console.log(`----- ${i + 1} of ${taken.length} -- ${DISPOSITION_LABEL[wo.disposition]} -----`);
    console.log(renderWorkOrderText(wo));
    console.log('');
  });

  const noFinish = taken.filter((w) => !w.doneWhen).length;
  if (noFinish) {
    console.log(`${noFinish} of these state NO finish line. Establish one from the ticket's`);
    console.log("source-of-truth document, or ask Ali a single question covering all of them.");
    console.log('');
  }

  if (!DRY) {
    console.log(`When done:  node scripts/ataWorkBatch.js --holder "${HOLDER}" --release-all`);
  }

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
