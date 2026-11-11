#!/usr/bin/env node
/**
 * Render the backlog triage board from live data.
 *
 * READ-ONLY. It queries the ops_bc_todos mirror and writes an HTML file. It posts nothing, emails
 * nothing and changes no ticket, which is deliberate: the board exists to make a decision easier,
 * and a report that also acts is a report you have to audit before you can read it.
 *
 * Run inside accelerator-backend, where the database credentials live:
 *   node /tmp/ataTriageBoard.js --out /tmp/triage.html [--days 60] [--limit 400]
 *
 * --days sets where dormant begins. It is surfaced as a flag rather than fixed because the right
 * cut depends on the cadence of the work, and the whole point of the board is to argue about that
 * number rather than inherit it.
 */
const fs = require('fs');
const path = require('path');
const { sequelize } = require('/app/dist/config/database');
const { QueryTypes } = require('/app/node_modules/sequelize');

/**
 * The renderer is required RELATIVE to this file, not from /app/dist.
 *
 * These are plain .js modules under src/scripts/lib, and whether the image's build copies them
 * into dist is an assumption rather than a fact. Resolving relatively means the script runs
 * wherever its three modules sit beside it, including a scratch directory, which is how it was
 * first run against production.
 */
const libDir = fs.existsSync(path.join(__dirname, 'renderTriageBoard.js'))
  ? __dirname
  : path.join(__dirname, '../backend/src/scripts/lib/aliTaskAgent');
const { renderTriageBoard } = require(path.join(libDir, 'renderTriageBoard'));
const { summarize } = require(path.join(libDir, 'ageBands'));

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};

const OUT = arg('out', '/tmp/triage.html');
const DAYS = Number(arg('days', '60'));
const LIMIT = Number(arg('limit', '400'));
const ALI_BC_ID = 17454835; // Ali's Basecamp person id. The 16988292 in older code is an OAuth id.

(async () => {
  const rows = await sequelize.query(`
    SELECT bc_id, project_id, title, status, due_on, urgency_score, bc_app_url,
           todolist_name, assignee_ids, bc_updated_at
      FROM ops_bc_todos
     WHERE status = 'active'
       AND (is_dismissed IS NOT TRUE)
       AND (assignee_ids IS NULL OR assignee_ids::text LIKE $1)
     ORDER BY urgency_score DESC NULLS LAST, due_on ASC NULLS LAST
     LIMIT $2`,
  { type: QueryTypes.SELECT, bind: [`%${ALI_BC_ID}%`, LIMIT] });

  const items = rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.todolist_name || '',
    url: r.bc_app_url || '',
    score: r.urgency_score == null ? null : Number(r.urgency_score),
    todo: { id: r.bc_id, title: r.title, due_on: r.due_on, updated_at: r.bc_updated_at },
  }));

  const html = renderTriageBoard({
    items,
    today: new Date(),
    runId: `TRIAGE-${new Date().toISOString().slice(0, 10)}`,
    dormantAfterDays: DAYS,
  });
  fs.writeFileSync(OUT, html, 'utf8');

  // A one-line summary to stdout so the run is auditable without opening the file.
  const s = summarize(items, new Date(), { dormantAfterDays: DAYS });
  console.log(`rows=${items.length} live=${s.liveCount} dormant=${s.dormantCount} `
    + `(${Math.round(s.dormantShare * 100)}%) oldest=${s.worst ? s.worst.days + 'd' : 'n/a'} -> ${OUT}`);

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
