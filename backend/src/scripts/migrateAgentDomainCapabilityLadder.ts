/**
 * Bring the ten live agent-domain boards onto the four-step capability ladder.
 *
 *   node dist/scripts/migrateAgentDomainCapabilityLadder.js                      # dry run
 *   node dist/scripts/migrateAgentDomainCapabilityLadder.js --apply
 *   node dist/scripts/migrateAgentDomainCapabilityLadder.js --apply --domain platform
 *
 * The decision lives in `services/agentDomain/agentDomainBoardReconciler.ts`; this file is the
 * I/O. Read that module's header first -- in particular what it refuses to delete and why.
 *
 * ## What this does to a real builder's board
 *
 * Measured against production 2026-11-13, across all ten domains: **964 per-rung behaviour
 * stories deleted, 40 ladder stories inserted, 443 capability rows rewritten as candidates.**
 * Seven of the ten boards belong to a named builder. Every one of the 964 is `not_started` with
 * no `verified_at`, so no completed work is destroyed -- that was checked before this was written
 * and is re-checked, per row, every time it runs.
 *
 * ## Dry run is the default, and it is a real plan
 *
 * Without `--apply` nothing is written and the exact per-domain plan is printed. The dry run
 * reads the same rows and runs the same reconciler as the apply, so it cannot drift from it. What
 * a dry run can NOT prove is that the writes parse -- see the bind-parameter note below, which
 * cost this repo a failed production run once already.
 *
 * ## Every column gets its OWN bind placeholder
 *
 * `migrateAgentDomainAutonomyReleases.ts` records the reason at length: a statement that shares
 * one placeholder between a varchar column and a text column is refused by Postgres at parse,
 * because the parameter's type is deduced from each use site. Worse, pinning the parameter's type
 * elsewhere in the statement makes the contradiction resolve and the write succeed into the wrong
 * column, silently. `STORY_UPDATE_SQL` below therefore numbers every column separately even where
 * two of them would take the same value, and its test asserts each column BY VALUE rather than
 * trusting the server to object.
 *
 * ## Failure path
 *
 * One domain, one transaction: a domain either lands completely or not at all, and a failure
 * leaves that board exactly as it was. Domains are independent, so a failure on one does not
 * prevent the other nine -- the exit code is non-zero if any failed, and the summary names them.
 * A refusal (a row somebody has worked on) is raised BEFORE the transaction opens, so a refused
 * domain writes nothing rather than writing half.
 */
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { AGENT_DOMAIN_KEYS } from '../services/agentDomain/agentDomainRegistry';
import { derivedProjectId } from '../services/agentDomain/agentDomainProvisionPlan';
import {
  describePlan,
  describePreserved,
  planBoardReconcile,
  type BoardReconcilePlan,
  type ExistingStoryRow,
} from '../services/agentDomain/agentDomainBoardReconciler';
import type { PlannedStory } from '../services/agentDomain/agentDomainProvisionPlan';

/** The rows the reconciler judges. Selected by project, so a board is read in one statement. */
export const STORY_SELECT_SQL = `
  SELECT id, story_id, story_kind, status, verified_at, title, narrative, build,
         release_key, autonomy_stage, acceptance
    FROM student_tasks
   WHERE project_id = $1`;

/**
 * Delete by primary key, and ONLY while the row is still untouched.
 *
 * The status predicate repeats the reconciler's refusal as a database-level guard. It is not
 * redundant: the reconciler judged a snapshot, and a builder may tick a task between the read and
 * the write. Without this, a concurrent update would be silently destroyed; with it, the delete
 * matches zero rows and the count mismatch aborts the transaction.
 */
export const STORY_DELETE_SQL = `
  DELETE FROM student_tasks
   WHERE id = $1 AND status = 'not_started' AND verified_at IS NULL`;

/** Identical in shape to the provisioner's insert, so the two cannot disagree about a story row. */
export const STORY_INSERT_SQL = `
  INSERT INTO student_tasks
    (id, task_list_id, project_id, title, description, narrative, build, status, position,
     story_id, release_key, capability_id, autonomy_stage, story_kind, acceptance,
     created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_started', $8, $9, $10, $11, $12, $13, $14::jsonb,
          now(), now())
  ON CONFLICT (id) DO NOTHING`;

/**
 * Rewrite ONLY the columns the reconciler cleared for writing.
 *
 * This used to be a fixed statement setting every column at once. That is what would have
 * nulled 683 authored acceptance lines: the plan carries acceptance for the 40 ladder
 * stories only, so "set acceptance to whatever the plan says" meant "set it to nothing"
 * on every other row. The column list is now built from `update.write`, so a field the
 * reconciler preserved is not in the statement at all and cannot be written by accident.
 *
 * Every column still gets its OWN placeholder -- see the header. `title` (varchar) and
 * `description` (text) take the same value and are deliberately not shared.
 */
export function buildUpdateSql(fields: ReadonlyArray<string>): { sql: string; columns: string[] } {
  // `title` also drives `description`, which is not independently planned.
  const columns: string[] = [];
  for (const f of fields) {
    if (f === 'title') { columns.push('title', 'description'); continue; }
    if (f === 'acceptance') { columns.push('acceptance'); continue; }
    columns.push(f);
  }
  if (columns.length === 0) throw new Error('buildUpdateSql called with nothing to write');

  // $1 is the row id; the columns start at $2.
  const sets = columns.map((c, i) => (c === 'acceptance'
    ? `acceptance = $${i + 2}::jsonb`
    : `${c} = $${i + 2}`));
  return {
    sql: `
  UPDATE student_tasks
     SET ${sets.join(', ')}, updated_at = now()
   WHERE id = $1`,
    columns,
  };
}

/** The value each column takes, so the bind order cannot drift from the column order. */
export function updateBindFor(column: string, s: PlannedStory): unknown {
  switch (column) {
    case 'title': return s.title;
    case 'description': return s.title;
    case 'narrative': return s.narrative;
    case 'build': return s.build;
    case 'release_key': return s.release_key;
    case 'autonomy_stage': return s.autonomy_stage;
    case 'story_kind': return s.kind;
    case 'acceptance': return s.acceptance.length > 0 ? JSON.stringify([...s.acceptance]) : null;
    default: throw new Error(`no bind defined for column '${column}'`);
  }
}

interface DomainOutcome {
  readonly domain_key: string;
  readonly plan: BoardReconcilePlan;
  readonly applied: boolean;
  readonly error: string | null;
}

async function readBoard(projectId: string): Promise<ExistingStoryRow[]> {
  return sequelize.query<ExistingStoryRow>(STORY_SELECT_SQL, {
    bind: [projectId], type: QueryTypes.SELECT,
  });
}

/** The list a story hangs off, keyed by release cluster, for the rows being inserted. */
async function listIdsByCluster(projectId: string): Promise<Map<string, string>> {
  const rows = await sequelize.query<{ id: string; cluster: string }>(
    `SELECT id, cluster FROM student_task_lists WHERE project_id = $1`,
    { bind: [projectId], type: QueryTypes.SELECT },
  );
  return new Map(rows.map((r) => [r.cluster, r.id]));
}

async function applyDomain(plan: BoardReconcilePlan, projectId: string): Promise<void> {
  const lists = await listIdsByCluster(projectId);
  const missing = [...new Set(plan.to_insert.map((s) => s.release_cluster))]
    .filter((c) => !lists.has(c));
  if (missing.length) {
    // Refuse rather than create: a missing release list means the board was never provisioned the
    // way this plan assumes, and inventing one here would hide that.
    throw new Error(`no release list for cluster(s) ${missing.join(', ')} on ${plan.domain_key}`);
  }

  await sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      for (const row of plan.to_delete) {
        const [, meta] = await sequelize.query(STORY_DELETE_SQL, {
          bind: [row.id], transaction,
        });
        const n = (meta as { rowCount?: number })?.rowCount ?? 0;
        if (n !== 1) {
          // Somebody touched this row between the read and the write. Abort the whole domain.
          throw new Error(
            `${plan.domain_key}: '${row.story_id}' did not delete (matched ${n} rows). `
            + 'It was probably worked on while this ran. Nothing was written; re-run to re-plan.',
          );
        }
      }
      for (const s of plan.to_insert) {
        await sequelize.query(STORY_INSERT_SQL, {
          bind: [s.id, lists.get(s.release_cluster), projectId, s.title, s.title, s.narrative,
            s.build, s.position, s.story_id, s.release_key, s.capability_id, s.autonomy_stage,
            s.kind, s.acceptance.length > 0 ? JSON.stringify([...s.acceptance]) : null],
          transaction,
        });
      }
      for (const u of plan.to_update) {
        const { sql, columns } = buildUpdateSql(u.write);
        await sequelize.query(sql, {
          bind: [u.id, ...columns.map((c) => updateBindFor(c, u.next))],
          transaction,
        });
      }
    },
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const only = args.includes('--domain') ? args[args.indexOf('--domain') + 1] : null;
  const domains = only ? [only] : [...AGENT_DOMAIN_KEYS];
  if (only && !AGENT_DOMAIN_KEYS.includes(only as never)) {
    throw new Error(`not an agent domain: '${only}'`);
  }

  console.log(apply
    ? `[ladder] APPLYING to ${domains.length} domain(s)`
    : `[ladder] DRY RUN over ${domains.length} domain(s) — nothing will be written`);

  const outcomes: DomainOutcome[] = [];
  for (const domainKey of domains) {
    const projectId = derivedProjectId(domainKey);
    const plan = planBoardReconcile(domainKey, await readBoard(projectId));
    console.log(`  ${describePlan(plan)}`);
    for (const r of plan.refusals) console.log(`    REFUSED ${r.story_id}: ${r.detail}`);
    for (const line of describePreserved(plan)) console.log(`    PRESERVED ${line}`);

    let applied = false;
    let error: string | null = null;
    if (apply && plan.refusals.length === 0 && !plan.noop) {
      try {
        await applyDomain(plan, projectId);
        applied = true;
      } catch (err) {
        error = (err as Error)?.message ?? String(err);
        console.log(`    FAILED ${domainKey}: ${error}`);
      }
    }
    outcomes.push({ domain_key: domainKey, plan, applied, error });
  }

  const refused = outcomes.filter((o) => o.plan.refusals.length);
  const failed = outcomes.filter((o) => o.error);
  const totals = outcomes.reduce((a, o) => ({
    del: a.del + o.plan.to_delete.length,
    ins: a.ins + o.plan.to_insert.length,
    upd: a.upd + o.plan.to_update.length,
    kept: a.kept + o.plan.preserved.length,
  }), { del: 0, ins: 0, upd: 0, kept: 0 });

  console.log(`[ladder] ${apply ? 'applied' : 'planned'}: `
    + `-${totals.del} delete, +${totals.ins} insert, ~${totals.upd} update, `
    + `=${totals.kept} field(s) preserved `
    + `across ${outcomes.length} domain(s); `
    + `${outcomes.filter((o) => o.applied).length} written, `
    + `${refused.length} refused, ${failed.length} failed`);
  if (!apply) console.log('[ladder] dry run only. Re-run with --apply to write.');

  if (refused.length || failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((err) => { console.error('[ladder] fatal:', err?.message ?? err); process.exitCode = 1; })
    .finally(() => sequelize.close());
}

export { main };
