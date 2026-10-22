/**
 * AF10.4 - the daily report. Gathers production state, assembles it, and mails it to Ali.
 *
 * "One report that tells Ali what moved, what is late, who is quiet and what is blocked, without
 * him opening seven tickets and three admin pages."
 *
 * Assembly and all the judgement live in `lib/dailyAgentReport.js`, which is pure and tested.
 * This file does three things only: read, render, send. Keeping it that thin is why the bands,
 * the stale-sync rule and the quiet-day wording can be asserted in a unit test rather than
 * confirmed by reading an email.
 *
 * ALWAYS SENDS, including on a quiet day. An email that only arrives when something happened is
 * indistinguishable from a broken job on the day nothing did, and the broken-job reading is the
 * one that costs you.
 *
 * Run: `node backend/src/scripts/sendDailyAgentReport.js`          (dry run, prints the report)
 *      `node backend/src/scripts/sendDailyAgentReport.js --send`   (mails it)
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { buildReport } = require('./lib/dailyAgentReport');

const SEND = process.argv.slice(2).includes('--send');
const TO = process.env.REPORT_TO || 'ali@colaberry.com';

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set.');
  process.exit(1);
}

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, b) => sql.query(t, { bind: b || [], type: QueryTypes.SELECT });

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Colour for an activity band. Matches the Intern Console's own reading of these words. */
const BAND_COLOR = {
  green: '#2f7d32', yellow: '#b26a00', orange: '#c2410c', red: '#b3261e',
  black: '#1f2937', unknown: '#718096',
};

function render(r, now) {
  const row = (x) => `<tr>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0"><strong>${esc(x.agent)}</strong><br>
      <span style="color:#718096;font-size:12px">${esc(x.intern)}</span></td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:right">
      <strong>${x.verified}</strong> <span style="color:#718096">of ${x.stories}</span></td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0">
      <span style="color:${BAND_COLOR[x.activity]};font-weight:700">${esc(x.activity)}</span>
      ${x.graced ? '<span style="color:#718096;font-size:11px"> (new, capped)</span>' : ''}
      <br><span style="color:#718096;font-size:11px">${x.daysSinceCommit === null ? 'no commit recorded'
    : x.daysSinceCommit === 0 ? 'committed today' : `${x.daysSinceCommit}d since last commit`}</span></td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;font-size:12px">
      ${x.movedSinceYesterday.length ? x.movedSinceYesterday.map(esc).join('<br>') : '<span style="color:#718096">nothing</span>'}</td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px">
      ${x.overdue ? `<strong style="color:#b3261e">${x.overdue} overdue</strong><br>` : ''}
      ${x.dueSoon ? `${x.dueSoon} due soon` : (x.overdue ? '' : '<span style="color:#718096">-</span>')}</td>
  </tr>`;

  const staleBlock = !r.stale.determinable
    ? `<p style="color:#718096">Stale-sync watch could not run: ${esc(r.stale.reason)}</p>`
    : r.stale.flagged.length
      ? `<p><strong style="color:#b3261e">${r.stale.flagged.length} repository drifting behind the others.</strong>
         A repository that goes private stops producing work with no error at all, and this drift is its only tell.</p>
         <ul>${r.stale.flagged.map((f) => `<li><strong>${esc(f.domain)}</strong> (${esc(f.intern)}): last synced
           <strong>${f.ageHours.toFixed(1)}h</strong> ago against a median of ${r.stale.medianAgeHours.toFixed(1)}h
           &mdash; <a href="${esc(f.repoUrl)}">${esc(String(f.repoUrl).replace('https://github.com/', ''))}</a></li>`).join('')}</ul>`
      : `<p style="color:#2f7d32">All repositories are syncing together. Median age
         ${r.stale.medianAgeHours.toFixed(1)}h, nothing drifting more than ${r.stale.thresholdHours}h behind.</p>`;

  return `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.55">
<h2 style="color:#C20E1E;margin:0 0 4px">Agent Factory, ${esc(r.today)}</h2>
<p style="font-size:15px;margin:0 0 14px"><strong>${esc(r.headline)}</strong></p>

<p style="margin:0 0 4px"><strong>${r.totals.verified}</strong> stories verified of ${r.totals.stories} across
${r.totals.agents} agents &middot; <strong>${r.totals.overdue}</strong> overdue &middot;
<strong>${r.totals.dueSoon}</strong> due in the next two days</p>

<table style="border-collapse:collapse;font-size:13px;margin-top:10px;width:100%">
<tr style="text-align:left">
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0">Agent</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0;text-align:right">Verified</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0">Activity</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0">Moved since yesterday</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0;text-align:right">Dates</th>
</tr>
${r.rows.map(row).join('')}
</table>

<h3 style="color:#C20E1E;margin:16px 0 4px">Repository sync</h3>
${staleBlock}

${r.quiet.length ? `<h3 style="color:#C20E1E;margin:16px 0 4px">Gone quiet</h3>
<ul>${r.quiet.map((x) => `<li><strong>${esc(x.intern)}</strong> (${esc(x.domain)}):
  <span style="color:${BAND_COLOR[x.activity]}">${esc(x.activity)}</span>,
  ${x.daysSinceCommit}d since their last commit</li>`).join('')}</ul>` : ''}

${r.never.length ? `<h3 style="color:#C20E1E;margin:16px 0 4px">Never committed</h3>
<ul>${r.never.map((x) => `<li><strong>${esc(x.intern)}</strong> (${esc(x.domain)}) has no recorded commit at all.
  This is not softened by the new-intern grace, because it is the group always worth acting on.</li>`).join('')}</ul>` : ''}

${r.undetermined.length ? `<h3 style="color:#C20E1E;margin:16px 0 4px">What this report could not determine</h3>
<ul>${r.undetermined.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
<p style="font-size:12px;color:#718096">Stated rather than omitted, because an omission reads as a zero.</p>` : ''}

<h3 style="color:#C20E1E;margin:16px 0 4px">Where these numbers come from</h3>
<ul style="font-size:12px;color:#718096">
<li>Verified: <code>student_tasks.verified_at</code>, set by <code>build_pipeline:repo_verification</code></li>
<li>Activity bands: last commit in <code>github_connections.commit_summary_json</code>, banded by the same rule the Intern Console uses</li>
<li>Moved since yesterday: <code>verified_at</code> within 24h, and commits dated within 24h</li>
<li>Dates: <code>student_tasks.due_on</code></li>
<li>Sync drift: <code>github_connections.last_sync_at</code>, compared against the median of the others</li>
</ul>
<p style="font-size:11px;color:#718096">Generated ${esc(now)}. Sent every day, including quiet ones, so a
silent day and a broken job cannot look the same.</p>
</div>`;
}

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

  const shaped = agents.map((a) => {
    const commits = Array.isArray(a.commits) ? a.commits : [];
    const latest = commits.map((c) => c.date).filter(Boolean).sort().pop() || null;
    const recentCommits = commits
      .filter((c) => c.date && Date.parse(c.date) > Date.parse(now) - 86400000)
      .filter((c) => !/build bot|^chore\(colaberry\)/i.test(`${c.author} ${c.message}`))
      .map((c) => `commit: ${String(c.message).slice(0, 60)}`);
    return {
      domain: a.domain,
      agent: a.domain,
      intern: a.intern,
      stories: a.stories,
      verified: a.verified,
      joinedAt: a.joined_at,
      lastCommitAt: latest,
      lastSyncAt: a.last_sync_at,
      repoUrl: a.repo_url,
      dueDates: a.due_dates || [],
      movedSinceYesterday: [...(a.moved || []), ...recentCommits],
    };
  });

  const report = buildReport({ agents: shaped, now });

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
    html: render(report, now),
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
