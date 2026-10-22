/**
 * auditScheduledAgentHealth — name every agent the catalog advertises as scheduled
 * that is not actually running.
 *
 * `ai_agents` is a catalog seeded by `agentRegistrySeed`; the schedulers implement a
 * subset of it. Nothing asserts the two agree, so an agent can sit there `enabled`
 * with a valid cron string, be wired to no scheduler at all, and still be reported as
 * capability the platform has. This script is that missing assertion.
 *
 * Read-only. It issues one SELECT and writes nothing.
 *
 * Run:
 *   docker exec accelerator-backend node dist/scripts/auditScheduledAgentHealth.js
 *   node dist/scripts/auditScheduledAgentHealth.js --json     # machine-readable
 *   node dist/scripts/auditScheduledAgentHealth.js --strict   # exit 1 if any never ran
 *
 * Exit codes: 0 clean (or findings without --strict), 1 findings under --strict,
 * 2 the query itself failed. --strict is what a CI job or a cron check should use;
 * without it the script reports and succeeds, so it is safe to run casually.
 */
import { sequelize } from '../config/database';
import {
  buildHealthReport, STALLED_AFTER_HOURS, ScheduledAgentRow,
} from '../services/workforce/scheduledAgentHealth';

/**
 * The catalog's claim joined to the execution log's answer. LEFT JOIN, because an
 * agent with no execution rows at all is the exact thing being hunted and an INNER
 * JOIN would silently drop every one of them — the failure mode that would make this
 * script report a clean fleet precisely when the fleet is at its worst.
 */
const QUERY = `
  SELECT a.agent_name,
         a.schedule,
         COALESCE(a.run_count, 0)::int AS run_count,
         count(l.id)::int              AS execution_count,
         max(l.created_at)             AS last_execution_at
    FROM ai_agents a
    LEFT JOIN ai_agent_activity_logs l ON l.agent_id = a.id
   WHERE a.enabled = true
     AND a.schedule IS NOT NULL
     AND a.schedule <> ''
   GROUP BY a.agent_name, a.schedule, a.run_count
   ORDER BY count(l.id) ASC, a.agent_name ASC
`;

function line(r: ScheduledAgentRow): string {
  const when = r.last_execution_at ? String(new Date(r.last_execution_at).toISOString()).slice(0, 16) : 'NEVER';
  return `  ${r.agent_name.slice(0, 40).padEnd(42)}${r.schedule.slice(0, 22).padEnd(24)}`
    + `${String(r.execution_count).padStart(9)}  ${when}`;
}

export async function auditScheduledAgentHealth(): Promise<number> {
  const strict = process.argv.includes('--strict');
  const asJson = process.argv.includes('--json');

  const [rows] = await sequelize.query(QUERY);
  const fleet = rows as ScheduledAgentRow[];
  const report = buildHealthReport(fleet);

  if (asJson) {
    console.log(JSON.stringify({
      checked: fleet.length,
      stalled_after_hours: STALLED_AFTER_HOURS,
      running: report.running.length,
      stalled: report.stalled.map((r) => r.agent_name),
      never_ran: report.never_ran.map((r) => r.agent_name),
      unverifiable: report.unverifiable.map((r) => r.agent_name),
      run_count_disagrees: report.run_count_disagrees,
    }, null, 2));
  } else {
    console.log(`Scheduled agents the catalog advertises: ${fleet.length}`);
    console.log(`Stalled threshold: ${STALLED_AFTER_HOURS}h (${STALLED_AFTER_HOURS / 24} days)\n`);
    console.log(`=== NEVER RAN (${report.never_ran.length}) — declared, wired to nothing ===`);
    report.never_ran.forEach((r) => console.log(line(r)));
    console.log(`\n=== STALLED (${report.stalled.length}) — ran before, not lately ===`);
    report.stalled.forEach((r) => console.log(line(r)));
    console.log(`\n=== UNVERIFIABLE (${report.unverifiable.length}) — runs recorded, no activity row to date them ===`);
    console.log('    these are NOT dead; their telemetry is. Fix the logging, then re-run.');
    report.unverifiable.forEach((r) => console.log(line(r)));
    console.log(`\n=== RUNNING: ${report.running.length}`);

    if (report.run_count_disagrees.length) {
      // Printed, never acted on. See the module docblock: run_count under-reports,
      // so a disagreement means the column is wrong, not that the agent is.
      console.log(`\n=== run_count DISAGREES with the execution log (${report.run_count_disagrees.length}) ===`);
      console.log('    informational: the column is unreliable, the log decides');
      for (const d of report.run_count_disagrees) {
        console.log(`  ${d.agent_name.slice(0, 40).padEnd(42)}run_count=${String(d.run_count).padStart(7)}`
          + `  log=${String(d.execution_count).padStart(8)}`);
      }
    }
  }

  return strict && report.never_ran.length > 0 ? 1 : 0;
}

if (require.main === module) {
  auditScheduledAgentHealth()
    .then(async (code) => { await sequelize.close(); process.exit(code); })
    .catch(async (e) => {
      console.error(`auditScheduledAgentHealth failed: ${e instanceof Error ? e.message : String(e)}`);
      await sequelize.close().catch(() => {});
      process.exit(2);
    });
}
