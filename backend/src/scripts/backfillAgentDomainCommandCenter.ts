/**
 * backfillAgentDomainCommandCenter -- put STORY-000 on the ten agent-domain project boards.
 *
 * Owner instruction, 30 October 2026: "Everyone should be building a Command Center as Story 000
 * so they can understand what all they will be building."
 *
 * ## Why a backfill is needed AND the generator change is not enough
 *
 * The ten domain projects were provisioned through `agentDomainProvisioner.ts`, whose every INSERT
 * is `ON CONFLICT DO NOTHING`. That is what makes it safe to re-run, and it is also why adding a
 * story to the generator cannot reach a project that already exists: the new row would be inserted
 * at a position the old rows already occupy, and nothing would move. Measured in production
 * 2026-10-30: 0 of the 10 domain projects carried a Command Center, against 54 rows elsewhere in
 * the platform where the SBP path injects one. The mechanism was never broken; these ten were
 * provisioned around it.
 *
 * So the fix is two halves and both ship together. `agentDomainStoryTemplates.ts` makes every
 * FUTURE domain get one. This makes the ten EXISTING ones get one.
 *
 * ## It deletes nothing, and position is the only existing column it writes
 *
 * Nothing here drops a story, a release, a status, a `verified_at` or a prompt. The one thing it
 * writes on a row that already exists is `position`, because the portal sorts the board on it and
 * a Command Center that renders fourth is a Command Center nobody opens first.
 *
 * ## Why it RENORMALIZES positions instead of shifting them by one
 *
 * A shift has to know whether it already ran. Run it twice and r0 starts at 2; crash between the
 * shift and the insert and it starts at 1 with a hole. Both states are silent.
 *
 * Instead this computes the intended order -- Command Center first, then every existing row in its
 * current order -- and writes `0..n`. That is idempotent by VALUE rather than by bookkeeping: a
 * second run computes the same numbers and the `IS DISTINCT FROM` guard means it writes nothing.
 * It also repairs a tie or a gap left by anything else, which a shift would preserve forever.
 *
 * The total order is `(position, created_at, id)`. Position alone is not a total order -- the
 * existing rows can and do tie -- and a sort that is not total makes the output depend on the
 * order Postgres happened to return, which is the non-determinism this is here to remove.
 *
 * ## Dry run by default
 *
 * `--apply` is required to write anything. Intern Safety Rules: no destructive scripts without
 * confirmation. The dry run prints exactly what the apply would do.
 *
 * ## Failure path
 *
 * One transaction per domain, so a failure rolls that domain back whole and the other nine are
 * untouched. A domain that throws is recorded with its error class and the run continues: nine
 * repaired boards plus one named failure beats ten unrepaired ones. No retry -- an insert that
 * failed for a real reason fails the same way twice, and unbounded retry is forbidden.
 *
 * Usage:
 *   node dist/scripts/backfillAgentDomainCommandCenter.js            # dry run
 *   node dist/scripts/backfillAgentDomainCommandCenter.js --apply    # write
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { AGENT_DOMAIN_KEYS } from '../services/agentDomain/agentDomainRegistry';
import {
  derivedProjectId,
  derivedReleaseId,
  derivedStoryId,
} from '../services/agentDomain/agentDomainProvisionPlan';
import { planForDomain } from '../services/agentDomain/agentDomainStoryTemplates';
import {
  COMMAND_CENTER_ACCEPTANCE,
  domainCommandCenterStoryId,
} from '../services/agentDomain/agentDomainCommandCenterStory';

const APPLY = process.argv.includes('--apply');

/** The release the Command Center belongs to. First release of every domain project. */
const FIRST_CLUSTER = 'r0';

export type DomainOutcome =
  | 'created'
  | 'refreshed'
  | 'no_project'
  | 'no_release'
  | 'failed';

export interface DomainResult {
  readonly domain_key: string;
  readonly outcome: DomainOutcome;
  /** Rows in r0 whose `position` this run did (or would) rewrite. Excludes the new row. */
  readonly repositioned: number;
  /** r0 row count after the run, Command Center included. */
  readonly stories_in_release: number;
  readonly error_class?: string;
  readonly error?: string;
}

interface TaskRow {
  readonly id: string;
  readonly story_id: string;
  readonly position: number;
}

/**
 * The INSERT, exported so a test can execute THE STATEMENT THIS SCRIPT RUNS rather than a copy
 * of it. A copy drifts, and a pinned copy that drifts is worse than no test: it goes green while
 * the real statement is broken.
 *
 * It is exported because of what happened on the first production run. The statement then shared
 * `$4` between `title` and `description`, and Postgres refused all ten domains with
 * `inconsistent types deduced for parameter $4` - it deduces a parameter's type from each use
 * site, `title` is `varchar(500)` and `description` is `text`, and one parameter cannot be both.
 * Nothing in the unit tier could see it: those mock `sequelize.query`, and a mock never deduces a
 * type. The dry run could not see it either, because a dry run computes the plan and never
 * executes the write. Only real Postgres answers this question, which is why the companion test
 * is an `*.integration.test.ts` and why the statement had to come out of the function to be
 * reachable from one.
 *
 * `description` duplicating `title` is intentional and matches `agentDomainProvisioner.ts`, which
 * binds `s.title, s.title` into `$4, $5` for this same reason.
 */
export const COMMAND_CENTER_INSERT_SQL = `INSERT INTO student_tasks
             (id, task_list_id, project_id, title, description, narrative, build, acceptance,
              status, position, story_id, release_key, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'not_started', $9, $10, $11, now(), now())
           ON CONFLICT (id) DO NOTHING`;

/**
 * The content refresh, exported for the same reason and carrying the same original defect.
 *
 * This is the statement a SECOND run takes, so the broken version made the idempotency claim
 * unprovable in practice: run one would create, run two would refuse all ten. Both statements are
 * therefore executed by the companion integration test, and both have a negative control.
 *
 * Status is never in the SET list. A refresh updates what the generator produced and must not
 * reset a builder's progress.
 */
export const COMMAND_CENTER_REFRESH_SQL = `UPDATE student_tasks
              SET title = $3, description = $4, narrative = $5, build = $6,
                  acceptance = $7::jsonb, updated_at = now()
            WHERE task_list_id = $1 AND project_id = $2 AND story_id = $8`;

/**
 * The intended `0..n` ordering for one release.
 *
 * PURE, and exported, because this is the whole decision the script makes and a decision that
 * cannot be tested without a database is a decision nobody checks. Takes the existing rows in the
 * order the query returned them (already a total order) and puts the Command Center first.
 */
export function intendedOrder(
  rows: ReadonlyArray<TaskRow>,
  commandCenterStoryId: string,
): ReadonlyArray<{ readonly id: string; readonly position: number }> {
  const cc = rows.filter((r) => r.story_id === commandCenterStoryId);
  const rest = rows.filter((r) => r.story_id !== commandCenterStoryId);
  return [...cc, ...rest].map((r, i) => ({ id: r.id, position: i }));
}

async function backfillOne(domainKey: string): Promise<DomainResult> {
  const projectId = derivedProjectId(domainKey);
  const listId = derivedReleaseId(domainKey, FIRST_CLUSTER);
  const storyId = domainCommandCenterStoryId(domainKey);
  const rowId = derivedStoryId(domainKey, storyId);

  // The story content is generated, never typed here. Same generator the provisioner uses, and
  // the row id is the same derivation, so a backfilled board and a freshly provisioned one carry
  // byte-identical rows. `planForDomain` throws on an unknown domain key, so there is no separate
  // registry check to drift from it.
  const planned = planForDomain(domainKey).stories.find((s) => s.story_id === storyId);
  if (!planned) {
    throw new Error(
      `the generator produced no Command Center for '${domainKey}' -- `
      + 'agentDomainStoryTemplates.ts and this script disagree about the story id',
    );
  }

  return sequelize.transaction(async (tx) => {
    const projects = await sequelize.query<{ id: string }>(
      'SELECT id FROM projects WHERE id = $1',
      { bind: [projectId], type: QueryTypes.SELECT, transaction: tx },
    );
    if (projects.length === 0) {
      return { domain_key: domainKey, outcome: 'no_project' as const, repositioned: 0, stories_in_release: 0 };
    }

    const lists = await sequelize.query<{ id: string }>(
      'SELECT id FROM student_task_lists WHERE id = $1 AND project_id = $2',
      { bind: [listId, projectId], type: QueryTypes.SELECT, transaction: tx },
    );
    if (lists.length === 0) {
      return { domain_key: domainKey, outcome: 'no_release' as const, repositioned: 0, stories_in_release: 0 };
    }

    // FOR UPDATE: another writer re-running the provisioner, or a builder reordering their board,
    // must not interleave with the renormalize. Without the lock two concurrent runs can both
    // compute `0..n` off the same pre-state and both write it, which is harmless, and can also
    // both decide the Command Center is absent, which is not.
    const existing = await sequelize.query<TaskRow>(
      `SELECT id, story_id, position
         FROM student_tasks
        WHERE task_list_id = $1 AND project_id = $2
        ORDER BY position ASC, created_at ASC, id ASC
          FOR UPDATE`,
      { bind: [listId, projectId], type: QueryTypes.SELECT, transaction: tx },
    );

    const present = existing.some((r) => r.story_id === storyId);
    const outcome: DomainOutcome = present ? 'refreshed' : 'created';

    if (APPLY) {
      if (present) {
        // Content refresh, status NEVER touched. `backfillStory000Prompt` learned this the hard
        // way: it rewrote `build` and left `acceptance` three versions behind on 19 of 20 live
        // builds, and reported `unchanged` on every later pass. Both columns move together here,
        // from one generator call, so they cannot desync.
        await sequelize.query(
          COMMAND_CENTER_REFRESH_SQL,
          {
            // Same reason as the INSERT: `$3` is title, `$4` is description, and the value is
            // deliberately bound twice. This statement carried the identical defect, and it is
            // the one a SECOND run takes - so the half of the script that proves idempotency was
            // the half with no chance of running.
            bind: [listId, projectId, planned.title, planned.title, planned.body,
              planned.claude_code_prompt,
              JSON.stringify([...COMMAND_CENTER_ACCEPTANCE]), storyId],
            type: QueryTypes.UPDATE,
            transaction: tx,
          },
        );
      } else {
        // `position` is written by the renormalize below, so this inserts at the end and is
        // immediately moved to 0. Two statements rather than one because the renormalize is the
        // single place that decides position, and a second place deciding it is a second place to
        // get it wrong.
        await sequelize.query(
          COMMAND_CENTER_INSERT_SQL,
          {
            // `planned.title` appears TWICE: `$4` is title and `$5` is description. Duplicating
            // the value is intended; sharing one placeholder between them is the defect that
            // failed all ten domains in production. See COMMAND_CENTER_INSERT_SQL above.
            bind: [rowId, listId, projectId, planned.title, planned.title, planned.body,
              planned.claude_code_prompt,
              JSON.stringify([...COMMAND_CENTER_ACCEPTANCE]), existing.length, storyId,
              FIRST_CLUSTER],
            type: QueryTypes.INSERT,
            transaction: tx,
          },
        );
      }
    }

    // The row set the board WILL have. The Command Center is included even in a dry run, because
    // what a dry run has to print is what the apply would do -- not what the table holds now.
    // Its assumed current position is `existing.length`, which is exactly where the INSERT above
    // put it, so apply and dry run compute the same move list.
    const rowSet: ReadonlyArray<TaskRow> = present
      ? existing
      : [...existing, { id: rowId, story_id: storyId, position: existing.length }];
    const target = intendedOrder(rowSet, storyId);
    const currentById = new Map(rowSet.map((r) => [r.id, r.position]));
    const moving = target.filter((t) => currentById.get(t.id) !== t.position);

    if (APPLY) {
      for (const t of moving) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          `UPDATE student_tasks SET position = $2, updated_at = now()
            WHERE id = $1 AND position IS DISTINCT FROM $2`,
          { bind: [t.id, t.position], type: QueryTypes.UPDATE, transaction: tx },
        );
      }
    }

    return {
      domain_key: domainKey,
      outcome,
      repositioned: moving.filter((t) => t.id !== rowId).length,
      stories_in_release: target.length,
    };
  });
}

export async function backfillAll(): Promise<DomainResult[]> {
  const results: DomainResult[] = [];
  for (const key of AGENT_DOMAIN_KEYS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      results.push(await backfillOne(key));
    } catch (err: any) {
      results.push({
        domain_key: key,
        outcome: 'failed',
        repositioned: 0,
        stories_in_release: 0,
        error_class: err?.constructor?.name || err?.name || 'UnknownError',
        error: err?.message,
      });
    }
  }
  return results;
}

async function main(): Promise<void> {
  const results = await backfillAll();
  const count = (o: DomainOutcome) => results.filter((r) => r.outcome === o).length;

  console.log('');
  console.log(`STORY-000 backfill -- ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log('');
  for (const r of results) {
    const detail = r.outcome === 'failed'
      ? `  ${r.error_class}: ${r.error}`
      : `  r0 rows ${r.stories_in_release}, repositioned ${r.repositioned}`;
    console.log(`  ${r.domain_key.padEnd(20)} ${r.outcome.padEnd(12)}${detail}`);
  }
  console.log('');
  console.log(`  ${APPLY ? 'created' : 'would create'}      ${count('created')}`);
  console.log(`  ${APPLY ? 'refreshed' : 'would refresh'}    ${count('refreshed')}`);
  console.log(`  no project       ${count('no_project')}`);
  console.log(`  no r0 release    ${count('no_release')}`);
  console.log(`  failed           ${count('failed')}`);
  if (!APPLY) console.log('\n  Re-run with --apply to write.');
  console.log('');

  await sequelize.close();
  if (count('failed') > 0) process.exit(1);
}

// Only when run as a script, so `intendedOrder` can be imported and tested without opening a
// database connection.
if (require.main === module) {
  main().catch((err: any) => {
    console.error(`[backfillAgentDomainCommandCenter] ${err?.constructor?.name || 'Error'}: ${err?.message}`);
    process.exit(1);
  });
}
