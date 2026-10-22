/**
 * AF10.4 - the daily report. Gathers production state, assembles it, and mails it to Ali.
 *
 * "One report that tells Ali what moved, what is late, who is quiet and what is blocked, without
 * him opening seven tickets and three admin pages."
 *
 * Assembly, every judgment AND the HTML body live in `lib/dailyAgentReport.js`, which is pure
 * and tested. This file does two things only: query production, then send what the lib returns.
 * Keeping it that thin is why the bands, the stale-sync rule and the quiet-day wording can be
 * asserted in a unit test rather than confirmed by reading an email - and why the artifact on
 * the ticket shows the real email body instead of a second renderer's idea of it.
 *
 * ALWAYS SENDS, including on a quiet day. An email that only arrives when something happened is
 * indistinguishable from a broken job on the day nothing did, and the broken-job reading is the
 * one that costs you.
 *
 * Run: `node backend/src/scripts/sendDailyAgentReport.js`          (dry run, prints the report)
 *      `node backend/src/scripts/sendDailyAgentReport.js --send`   (mails it)
 *      `node backend/src/scripts/sendDailyAgentReport.js --html`   (prints the email body, sends nothing)
 *
 * `--html` exists so the email body can be looked at, and so the ticket artifact can show the
 * report Ali actually receives rather than a drawing of it. It never sends.
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { buildReport, shapeAgentRows, renderHtml } = require('./lib/dailyAgentReport');

const ARGS = process.argv.slice(2);
const SEND = ARGS.includes('--send');
const HTML_ONLY = ARGS.includes('--html');
const TO = process.env.REPORT_TO || 'ali@colaberry.com';

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set.');
  process.exit(1);
}

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, b) => sql.query(t, { bind: b || [], type: QueryTypes.SELECT });

async function main() {
  const nowRow = await q('SELECT now()::text AS now');
  const now = nowRow[0].now;

  const agents = await q(`
    SELECT d.domain_key AS domain, d.intended_builder AS intern,
           e.created_at::text AS joined_at,
           g.repo_url, g.last_sync_at::text AS last_sync_at, g.commit_summary_json AS commits,
           (SELECT count(*)::int FROM student_tasks t WHERE t.project_id = d.student_project_id) AS stories,
           (SELECT count(*)::int FROM student_tasks t
             WHERE t.project_id = d.student_project_id AND t.verified_at IS NOT NULL) AS verified,
           (SELECT array_agg(t.due_on::text) FROM student_tasks t
             WHERE t.project_id = d.student_project_id AND t.due_on IS NOT NULL
               AND t.verified_at IS NULL) AS due_dates,
           (SELECT array_agg(t.story_id || ' verified') FROM student_tasks t
             WHERE t.project_id = d.student_project_id
               AND t.verified_at > now() - interval '24 hours') AS moved
      FROM agent_domain_projects d
      JOIN projects p ON p.id = d.student_project_id
      JOIN enrollments e ON e.id = p.enrollment_id
      LEFT JOIN github_connections g ON g.project_id = d.student_project_id
     WHERE d.intended_builder IS NOT NULL
     ORDER BY d.domain_key`);

  const shaped = shapeAgentRows(agents, now);

  const report = buildReport({ agents: shaped, now });

  if (HTML_ONLY) { process.stdout.write(renderHtml(report, now)); return; }

  console.log(`=== ${report.today} ===`);
  console.log(report.headline);
  console.log(`\n${report.totals.verified} verified of ${report.totals.stories} across ${report.totals.agents} agents`);
  console.log(`overdue=${report.totals.overdue}  dueSoon=${report.totals.dueSoon}  moved=${report.totals.movedCount}`);
  for (const x of report.rows) {
    console.log(`  ${x.domain.padEnd(20)} verified=${String(x.verified).padStart(2)}/${String(x.stories).padEnd(3)}`
      + ` ${x.activity.padEnd(8)} moved=${x.movedSinceYesterday.length} overdue=${x.overdue} dueSoon=${x.dueSoon}`);
  }
  console.log(`\nstale-sync: ${report.stale.determinable
    ? `${report.stale.flagged.length} flagged, median age ${report.stale.medianAgeHours.toFixed(1)}h`
    : report.stale.reason}`);
  for (const f of report.stale.flagged) console.log(`  DRIFTING  ${f.domain}  ${f.ageHours.toFixed(1)}h`);
  if (report.undetermined.length) {
    console.log(`\ncould not determine (${report.undetermined.length}):`);
    for (const u of report.undetermined) console.log(`  - ${u}`);
  }

  if (!SEND) { console.log('\nDRY RUN. Re-run with --send to mail it.'); return; }

  const key = (process.env.MANDRILL_API_KEY || '').trim();
  if (!key) { console.log('\nNOT SENT: MANDRILL_API_KEY absent.'); return; }
  const nodemailer = require('nodemailer');
  await nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: key },
  }).sendMail({
    from: '"Colaberry Accelerator" <ali@colaberry.com>',
    to: TO,
    subject: `Ali, here's the Agent Factory day: ${report.totals.verified} verified`
      + `${report.totals.overdue ? `, ${report.totals.overdue} overdue` : ''}`
      + `${report.stale.flagged.length ? `, ${report.stale.flagged.length} repo drifting` : ''}`,
    html: renderHtml(report, now),
    text: `${report.headline}\n\n${report.rows.map((x) => `${x.domain}: ${x.verified}/${x.stories} verified, ${x.activity}`).join('\n')}`,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('\nSENT.');
}

main()
  .then(async () => { await sql.close(); process.exit(0); })
  .catch(async (e) => {
    console.error('FAILED: ' + e.message);
    try { await sql.close(); } catch (_) { /* pool may already be down */ }
    process.exit(1);
  });
