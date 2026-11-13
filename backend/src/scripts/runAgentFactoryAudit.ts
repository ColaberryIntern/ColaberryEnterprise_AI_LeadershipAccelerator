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
import { assessManagerReach, type ManagerAccessFacts } from './lib/agentManagerReach';

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

/** One row of raw access facts per domain. Every judgement on them happens in the pure module. */
interface ManagerFactRow {
  domain_key: string;
  recorded_can_reach: boolean | null;
  org_member_email: string | null;
  agents_reporting: number | string | null;
  bridge_mgmt_role: string | null;
  bridge_extra_sections: unknown;
  bridge_token_email: string | null;
  legacy_role: string | null;
  legacy_token_email: string | null;
}

/**
 * Fetch what the access chain actually depends on, for every domain's manager.
 *
 * This replaces reading `manager_can_reach`. That column was wrong on three of ten rows when
 * checked on 12 November 2026, and this audit's first version reported it as fact — so the
 * answer is now derived from the same inputs the request passes through:
 *
 *   - `org_members.email`, the EXACT string `requireAgentManagerOrAdmin` matches the token
 *     against (`manager_identity_id` is an `org_members.id`, not a platform identity, which a
 *     zero-row join proved the hard way).
 *   - the staff `community_members` row behind the bridge mint, and the enrollment email its
 *     token would carry. `ORDER BY (mgmt_role IS NOT NULL) DESC` because a person may hold
 *     several enrollments and only one of them is the staff one.
 *   - the legacy `admin_users` row, which mints a token with NO `mgmt_role` and therefore skips
 *     the section gate entirely.
 *   - how many agents name them as `reports_to`, the only part of the downstream check an audit
 *     can see without a specific agent id.
 */
async function managerFacts(): Promise<ManagerRow[]> {
  const rows = await sequelize.query<ManagerFactRow>(
    `SELECT p.domain_key,
            p.manager_can_reach AS recorded_can_reach,
            om.email            AS org_member_email,
            (SELECT COUNT(*) FROM ai_agents a
              WHERE a.reports_to_org_member_id::text = om.id::text) AS agents_reporting,
            b.mgmt_role         AS bridge_mgmt_role,
            b.mgmt_extra_sections AS bridge_extra_sections,
            b.email             AS bridge_token_email,
            au.role             AS legacy_role,
            au.email            AS legacy_token_email
       FROM agent_domain_projects p
       LEFT JOIN org_members om ON om.id::text = p.manager_identity_id::text
       LEFT JOIN LATERAL (
         SELECT cm.mgmt_role, cm.mgmt_extra_sections, e.email
           FROM enrollments e
           JOIN community_members cm ON cm.enrollment_id = e.id
          WHERE LOWER(e.email) = LOWER(om.email)
            AND cm.role = 'staff'
            AND cm.mgmt_role IS NOT NULL
          ORDER BY (cm.mgmt_role IS NOT NULL) DESC
          LIMIT 1
       ) b ON TRUE
       LEFT JOIN admin_users au ON LOWER(au.email) = LOWER(om.email)
      ORDER BY p.domain_key`,
    { type: QueryTypes.SELECT },
  );

  return (rows ?? []).map((r) => {
    const facts: ManagerAccessFacts = {
      domainKey: String(r.domain_key),
      orgMemberEmail: r.org_member_email ?? null,
      agentsReporting: Number(r.agents_reporting ?? 0),
      bridge: r.bridge_mgmt_role && r.bridge_token_email
        ? {
          mgmtRole: r.bridge_mgmt_role,
          // A Postgres text[] that may be null or empty (two managers currently hold
          // `{agents}`). Guarded rather than cast because the pure module drops anything that
          // is not a real section key, so an unexpected value narrows access, never widens it.
          extraSections: Array.isArray(r.bridge_extra_sections)
            ? r.bridge_extra_sections.map((x) => String(x))
            : [],
          tokenEmail: r.bridge_token_email,
        }
        : null,
      legacy: r.legacy_role && r.legacy_token_email
        ? { role: r.legacy_role, tokenEmail: r.legacy_token_email }
        : null,
      recordedCanReach: r.recorded_can_reach === true,
    };
    const verdict = assessManagerReach(facts);
    return {
      domain_key: verdict.domainKey,
      recorded_can_reach: facts.recordedCanReach,
      can_reach: verdict.canReach,
      blocker: verdict.blocker,
      via: verdict.via,
    };
  });
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
  const [b, m, s] = await Promise.all([builds(), managerFacts(), spine()]);
  const verdict = assess({ builds: b, managers: m, spine: s });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ verdict, builds: b, managers: m }, null, 2));
  } else {
    console.log(render(verdict, b, m));
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
