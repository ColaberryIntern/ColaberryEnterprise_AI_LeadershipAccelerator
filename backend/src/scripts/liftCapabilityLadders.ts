/**
 * AF10.9 — lift the capability ladder to the top of every agent-domain board, and make the rungs
 * read as a ladder.
 *
 * The planning is all in `capabilityLadderLift.ts` and is pure. This file is the I/O half: read a
 * board, ask for a plan, refuse it if it would lose work, and write it in one transaction.
 *
 *   DRY RUN (default)   node dist/scripts/liftCapabilityLadders.js
 *   APPLY               node dist/scripts/liftCapabilityLadders.js --apply
 *   ONE BOARD           node dist/scripts/liftCapabilityLadders.js --domain platform [--apply]
 *
 * ## Why the planner existed for eight days without this file
 *
 * `capabilityLadderLift.ts` was written on 17 Nov with its unit tests and was never wired to
 * anything, so AF10.9's acceptance was never met: measured again on 25 Nov, the ladder is still
 * the last seven stories on all ten boards. A pure planner with no caller is indistinguishable
 * from no planner at all, which is the thing this script fixes.
 *
 * ## What it refuses, and why each refusal exists
 *
 *   - **A board whose stories span more than one task list.** `position` is scoped to
 *     `task_list_id`, so renumbering across two lists would interleave them into nonsense. Every
 *     board today keeps all of its stories in its `R0` list, which is exactly when a guard is
 *     worth writing: the run that trips it will be a later one nobody is watching.
 *   - **Any plan that would downgrade a finished rung** (`assertProgressPreserved`). Six rungs
 *     across Kalkidan's and Quincy's boards are complete and verified by the build pipeline.
 *   - **An odd board** — a missing rung, a duplicated rung, a rung suffix that cannot be read.
 *     Reported and skipped whole, never half-applied.
 *
 * A refusal is computed BEFORE the transaction opens, so a refused board is untouched rather than
 * rolled back. One board, one transaction: a board either lands completely or not at all.
 *
 * ## What it deliberately does NOT write
 *
 * `updated_at` is left alone. It is already a weak signal on these boards — most rows carry the
 * timestamp of a bulk provisioning run rather than any builder's work — and stamping 598 rows
 * with today's date would destroy what little of that signal survives. Reordering a board is not
 * builder activity and must not look like it. `verified_at`, `verified_by`, titles, narratives and
 * acceptance are never touched by this script at all: it writes `position` and `status`, nothing
 * else.
 */
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { AGENT_DOMAIN_KEYS } from '../services/agentDomain/agentDomainRegistry';
import { derivedProjectId } from '../services/agentDomain/agentDomainProvisionPlan';
import {
  assertProgressPreserved,
  planLadderLift,
  type BoardStory,
  type LadderLiftPlan,
} from '../services/agentDomain/capabilityLadderLift';

/** A board row, plus the list it hangs off so the single-list guard can check it. */
interface BoardRow extends BoardStory {
  readonly task_list_id: string;
}

const BOARD_SELECT_SQL = `
  SELECT id, story_id, story_kind, position, status,
         verified_at::text AS verified_at, task_list_id
    FROM student_tasks
   WHERE project_id = $1
   ORDER BY position ASC, story_id ASC, id ASC`;

/**
 * Move one story, and only while it still sits where the plan read it.
 *
 * The `position = $3` predicate turns a concurrent edit into a row count of 0, which aborts the
 * whole board instead of silently overwriting whatever somebody else just did. The reconciler
 * learned this the same way: a plan judges a snapshot, and a snapshot can go stale mid-run.
 */
const POSITION_UPDATE_SQL = `
  UPDATE student_tasks SET position = $2 WHERE id = $1 AND position = $3`;

const STATUS_UPDATE_SQL = `
  UPDATE student_tasks SET status = $2 WHERE id = $1 AND status = $3`;

async function readBoard(projectId: string): Promise<BoardRow[]> {
  return sequelize.query<BoardRow>(BOARD_SELECT_SQL, {
    bind: [projectId], type: QueryTypes.SELECT,
  });
}

/** Reasons this board must not be written. Empty means safe to apply. */
function refusals(board: ReadonlyArray<BoardRow>, plan: LadderLiftPlan): string[] {
  const reasons = [...plan.problems, ...assertProgressPreserved(board, plan)];

  const lists = new Set(board.map((s) => s.task_list_id));
  if (lists.size > 1) {
    reasons.push(
      `stories span ${lists.size} task lists; position is scoped to a list, so renumbering `
      + 'across them would interleave them. Refusing.',
    );
  }
  return reasons;
}

async function applyBoard(domainKey: string, plan: LadderLiftPlan): Promise<void> {
  await sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      for (const p of plan.positions) {
        const [, meta] = await sequelize.query(POSITION_UPDATE_SQL, {
          bind: [p.id, p.to, p.from], transaction,
        });
        const n = (meta as { rowCount?: number })?.rowCount ?? 0;
        if (n !== 1) {
          throw new Error(
            `${domainKey}: story ${p.id} did not move ${p.from} -> ${p.to} (matched ${n} rows). `
            + 'It was probably edited while this ran. Nothing was written; re-run to re-plan.',
          );
        }
      }
      for (const c of plan.statuses) {
        const [, meta] = await sequelize.query(STATUS_UPDATE_SQL, {
          bind: [c.id, c.to, c.from], transaction,
        });
        const n = (meta as { rowCount?: number })?.rowCount ?? 0;
        if (n !== 1) {
          throw new Error(
            `${domainKey}: ${c.rung} did not change ${c.from} -> ${c.to} (matched ${n} rows). `
            + 'It was probably worked on while this ran. Nothing was written; re-run to re-plan.',
          );
        }
      }
    },
  );
}

function describe(domainKey: string, board: ReadonlyArray<BoardRow>, plan: LadderLiftPlan): void {
  const ladder = board.filter((s) => s.story_kind === 'capability_ladder');
  const wasAt = ladder.map((s) => s.position);
  console.log(
    `\n${domainKey}: ${board.length} stories, ${ladder.length} ladder rungs `
    + `currently at ${wasAt.length ? `${Math.min(...wasAt)}-${Math.max(...wasAt)}` : 'n/a'}`,
  );
  console.log(`  ${plan.positions.length} position change(s), ${plan.statuses.length} status change(s)`);
  for (const c of plan.statuses) {
    console.log(`    ${c.rung}: ${c.from} -> ${c.to}`);
  }
  const rungMoves = plan.positions.filter((p) => ladder.some((s) => s.id === p.id));
  for (const p of rungMoves) {
    const s = ladder.find((x) => x.id === p.id)!;
    console.log(`    ${s.story_id}: position ${p.from} -> ${p.to}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const only = args.includes('--domain') ? args[args.indexOf('--domain') + 1] : null;
  if (only && !AGENT_DOMAIN_KEYS.includes(only as never)) {
    throw new Error(`not an agent domain: '${only}'`);
  }
  const domains = only ? [only] : [...AGENT_DOMAIN_KEYS];

  console.log(apply
    ? `[ladder-lift] APPLYING to ${domains.length} board(s)`
    : `[ladder-lift] DRY RUN over ${domains.length} board(s) — nothing will be written`);

  const refused: string[] = [];
  const failed: string[] = [];
  let changed = 0;
  let clean = 0;

  for (const domainKey of domains) {
    const projectId = derivedProjectId(domainKey);
    const board = await readBoard(projectId);
    if (board.length === 0) {
      console.log(`\n${domainKey}: no stories on this board, skipped`);
      continue;
    }

    const plan = planLadderLift(board);
    describe(domainKey, board, plan);

    const reasons = refusals(board, plan);
    if (reasons.length) {
      refused.push(domainKey);
      for (const r of reasons) console.log(`  REFUSED: ${r}`);
      continue;
    }

    if (plan.positions.length === 0 && plan.statuses.length === 0) {
      clean += 1;
      console.log('  already a ladder, nothing to do');
      continue;
    }

    if (!apply) { changed += 1; continue; }

    try {
      await applyBoard(domainKey, plan);
      changed += 1;
      console.log('  applied');
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service: 'backend',
        event: 'capability_ladder_lifted', outcome: 'success',
        context: {
          domain_key: domainKey, positions: plan.positions.length,
          statuses: plan.statuses.length, rungs: plan.rungsFound.length,
        },
      }));
    } catch (err: unknown) {
      failed.push(domainKey);
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  FAILED: ${message}`);
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'backend',
        event: 'capability_ladder_lift_failed', outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'Error',
        context: { domain_key: domainKey, message },
      }));
    }
  }

  console.log(
    `\n[ladder-lift] ${apply ? 'applied' : 'would change'} ${changed} board(s), `
    + `${clean} already correct, ${refused.length} refused, ${failed.length} failed`,
  );
  if (refused.length) console.log(`  refused: ${refused.join(', ')}`);
  if (failed.length) console.log(`  failed: ${failed.join(', ')}`);
  if (refused.length || failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((err: unknown) => {
      console.error('[ladder-lift] fatal:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
