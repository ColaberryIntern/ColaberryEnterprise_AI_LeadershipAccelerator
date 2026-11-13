/**
 * Run the Agent Factory audit against the live database and print it.
 *
 *   node dist/scripts/runAgentFactoryAudit.js          # plain text
 *   node dist/scripts/runAgentFactoryAudit.js --json   # the verdict as JSON
 *
 * READ-ONLY. Every statement here is a SELECT, deliberately: this is the thing you run to
 * find out whether the board is still true, and a tool that can change what it measures is
 * not one you can trust at that moment.
 *
 * The judgement lives in `lib/agentFactoryAudit.ts` and is tested there. This file only
 * fetches rows, which is why it holds no thresholds and no opinions.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import {
  assess, render, type BuildRow, type ManagerRow, type SpineRow,
} from './lib/agentFactoryAudit';

/**
 * The governance path, in the order a request actually travels it.
 *
 * Each step names the table that records it. That pairing is the point: a zero is only
 * meaningful next to the thing it counted, because a zero from the wrong table is
 * indistinguishable from a zero from the right one.
 */
const SPINE: ReadonlyArray<{ step: string; table: string }> = [
  { step: 'build authorization', table: 'agent_domain_build_authorizations' },
  { step: 'capability confirmation', table: 'agent_domain_capability_confirmations' },
  { step: 'change request filed', table: 'agent_domain_change_requests' },
  { step: 'tool request', table: 'agent_domain_tool_request_details' },
  { step: 'tool request decision', table: 'agent_domain_tool_request_decisions' },
  { step: 'tool grant', table: 'agent_domain_tool_grants' },
];

async function builds(): Promise<BuildRow[]> {
  return sequelize.query<BuildRow>(
    `SELECT p.domain_key,
            p.intended_builder,
            COUNT(t.id)::int                                       AS tasks,
            COUNT(*) FILTER (WHERE t.status = 'complete')::int     AS complete,
            COUNT(*) FILTER (WHERE t.status = 'in_progress')::int  AS in_progress,
            COUNT(*) FILTER (WHERE t.verified_at IS NOT NULL)::int AS verified
       FROM agent_domain_projects p
       LEFT JOIN student_tasks t ON t.project_id = p.student_project_id
      GROUP BY p.domain_key, p.intended_builder`,
    { type: QueryTypes.SELECT },
  );
}

async function managers(): Promise<ManagerRow[]> {
  return sequelize.query<ManagerRow>(
    `SELECT domain_key, manager_can_reach, manager_blocker
       FROM agent_domain_projects
      ORDER BY domain_key`,
    { type: QueryTypes.SELECT },
  );
}

/**
 * Count each spine table, tolerating one that does not exist yet.
 *
 * A missing table is reported as a missing table, never as a zero. They mean opposite
 * things — "this step has never happened" against "this step was never built" — and
 * collapsing them is how an audit reassures you about something that is not there.
 */
async function spine(): Promise<SpineRow[]> {
  const present = await sequelize.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    { bind: [SPINE.map((s) => s.table)], type: QueryTypes.SELECT },
  );
  const have = new Set((present ?? []).map((r) => String(r.table_name)));

  const out: SpineRow[] = [];
  for (const s of SPINE) {
    if (!have.has(s.table)) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'agent-factory-audit',
        event: 'spine_table_missing',
        outcome: 'partial',
        error_class: 'SchemaMissing',
        context: { step: s.step, table: s.table },
      }));
      continue;
    }
    // Table names come from the SPINE constant above and are never caller-supplied, so
    // this interpolation cannot carry untrusted input. A bind cannot name a table.
    const [row] = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM "${s.table}"`,
      { type: QueryTypes.SELECT },
    );
    out.push({ step: s.step, table_name: s.table, rows: Number(row?.n ?? 0) });
  }
  return out;
}

async function main(): Promise<void> {
  const [b, m, s] = await Promise.all([builds(), managers(), spine()]);
  const verdict = assess({ builds: b, managers: m, spine: s });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ verdict, builds: b }, null, 2));
  } else {
    console.log(render(verdict, b));
  }
}

main()
  .then(async () => {
    // Close the pool explicitly. An open Sequelize handle keeps the process alive, which
    // in a cron turns a finished job into one that never exits.
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error('[agent-factory-audit] failed:', err instanceof Error ? err.message : err);
    try { await sequelize.close(); } catch { /* already closing */ }
    process.exit(1);
  });
