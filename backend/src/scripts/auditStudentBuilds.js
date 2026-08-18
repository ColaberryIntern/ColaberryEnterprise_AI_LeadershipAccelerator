/**
 * Audit every active student's build: is their project actually set up, and if
 * not, which stage of the pipeline did they stop at?
 *
 * Built because "did the cohort's builds land?" was a question nobody could
 * answer without hand-writing SQL, and because the answer has to be trustworthy
 * enough to mail people off the back of it. One row per active enrollment,
 * reporting the project the portal will actually open on, with a READY /
 * NOT_READY verdict and the specific reason. emailStudentBuildReady.js consumes
 * the --json form of this output.
 *
 * STRICTLY READ-ONLY. Every statement is a SELECT inside a READ ONLY session.
 * Safe to run against production as often as you like.
 *
 * Run:  node backend/src/scripts/auditStudentBuilds.js [--cohort "July 2026"] [--json]
 *                                                      [--only <verdict|stage>] [--with-project]
 *
 * Flags:
 *   --cohort <id|name fragment>  restrict to one cohort (default: all active enrollments)
 *   --json                       machine-readable output; the emailer reads this
 *   --only ready|not_ready|<stage>   filter rows (stages: see studentBuildVerdict.STAGES)
 *   --with-project               drop enrollments that have no project at all
 *
 * Output: human table (default) or JSON (--json) to stdout. Writes nothing, anywhere.
 */

const path = require('path');
try { require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); } catch (_) { /* container has real env */ }

const { runAudit } = require('./lib/studentBuildAudit');

function flag(name) {
  return process.argv.includes(`--${name}`);
}
function value(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}

const asJson = flag('json');
const onlyFilter = (value('only') || '').toLowerCase();
const withProjectOnly = flag('with-project');

function applyFilters(rows) {
  let out = rows;
  if (withProjectOnly) out = out.filter((r) => r.projectId);
  if (onlyFilter === 'ready') out = out.filter((r) => r.verdict === 'READY');
  else if (onlyFilter === 'not_ready') out = out.filter((r) => r.verdict === 'NOT_READY');
  else if (onlyFilter) out = out.filter((r) => r.stage === onlyFilter);
  return out;
}

function pad(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t.padEnd(n);
}

function renderTable(result, rows) {
  const L = [];
  const scope = result.cohort ? `${result.cohort.name} (starts ${result.cohort.startDate || 'no start date'})` : 'all active enrollments';
  L.push('');
  L.push(`STUDENT BUILD AUDIT  ${result.generatedAt}`);
  L.push(`Scope: ${scope}`);
  L.push('');

  const head = `${pad('EMAIL', 32)}  ${pad('PROJECT', 26)}  ${pad('INTAKE', 11)}  ${pad('PLAN', 11)}  ${pad('TASKS', 9)}  ${pad('S000', 4)}  ${pad('ACT', 3)}  VERDICT / REASON`;
  L.push(head);
  L.push('-'.repeat(Math.min(head.length + 40, 190)));

  for (const r of rows) {
    // "12/12" reads as dated-of-total at a glance; that ratio is the whole
    // point of the column and a bare count would hide the undated case.
    const tasks = r.projectId ? `${r.datedTaskCount}/${r.taskCount}` : '-';
    const planCell = r.planStatus
      ? `${r.planStatus}${r.hasPublishedPlan && r.planStatus !== 'published' ? '+pub' : ''}`
      : '-';
    L.push([
      pad(r.email, 32),
      pad(r.projectName || (r.projectId ? '(unnamed)' : '-'), 26),
      pad(r.intakeStatus || '-', 11),
      pad(planCell, 11),
      pad(tasks, 9),
      pad(r.hasStory000 ? 'yes' : (r.projectId ? 'NO' : '-'), 4),
      pad(r.isActiveProject ? 'yes' : (r.projectId ? 'NO' : '-'), 3),
      `${r.verdict}  ${r.reason}`,
    ].join('  '));
    for (const n of r.notes || []) L.push(`${' '.repeat(32)}  note: ${n}`);
    if (r.extraProjects > 0) {
      L.push(`${' '.repeat(32)}  note: ${r.extraProjects} other project(s) on this enrollment, not reported here`);
    }
  }

  L.push('');
  L.push(`${rows.length} row(s) shown of ${result.summary.enrollments} active enrollment(s); ${result.summary.withProject} have a project.`);
  L.push(`READY ${result.summary.ready}   NOT_READY ${result.summary.notReady}`);
  L.push('');
  L.push('Where builds stopped:');
  for (const [stage, n] of Object.entries(result.summary.byStage).sort((a, b) => b[1] - a[1])) {
    L.push(`  ${pad(stage, 22)} ${n}`);
  }
  L.push('');
  return L.join('\n');
}

async function main() {
  const result = await runAudit({ cohort: value('cohort') });
  const rows = applyFilters(result.rows);

  if (asJson) {
    // The filters shape `rows`; `summary` always describes the full audit, so a
    // filtered export still carries the denominator it came from.
    process.stdout.write(`${JSON.stringify({ ...result, rows, filters: { cohort: value('cohort'), only: onlyFilter || null, withProjectOnly } }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderTable(result, rows)}\n`);
}

main().catch((e) => {
  console.error(`[auditStudentBuilds] ${e.error_class || 'Error'}: ${e.message}`);
  process.exit(1);
});
