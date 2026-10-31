/**
 * Turn each agent-domain project's releases into the ten rungs of the autonomy ladder.
 *
 * Phase 2 of `docs/architecture/ai-workforce-management/AUTONOMY_RELEASE_MIGRATION.md`, items 4-6.
 * The decision lives in `services/agentDomain/agentDomainAutonomyReleaseMigration.ts`; this file
 * is the I/O. Read that module's header for what a migrated row keeps and the one promise in the
 * design document that had to be corrected.
 *
 *   node dist/scripts/migrateAgentDomainAutonomyReleases.js                 # dry run, writes nothing
 *   node dist/scripts/migrateAgentDomainAutonomyReleases.js --apply
 *   node dist/scripts/migrateAgentDomainAutonomyReleases.js --apply --domain platform
 *
 * ## Why this is a script and not part of the provisioner
 *
 * The provisioner's every insert is `ON CONFLICT (id) DO NOTHING`, asserted by a test, so it can
 * never reach a project that already exists -- which is the whole reason the ten boards needed a
 * Command Center backfilled rather than regenerated. A second test refuses any `UPDATE` or
 * `DELETE` in that module by design. Re-parenting is an UPDATE. So it belongs here, and the
 * generator change and this script are two halves that have to ship together.
 *
 * ## The SQL is exported, deliberately
 *
 * Phase 1's backfill shipped two statements that shared one bind placeholder between `title`
 * (varchar) and `description` (text). Postgres deduces a parameter's type from each use site,
 * refused at parse, and failed all ten domains in production -- while the unit tier stayed green,
 * because a mocked `sequelize.query` records a string and never deduces a type, and the dry run
 * stayed green because a dry run never executes the write. These constants are exported so an
 * integration test can execute the exact statement this script runs, against a real server,
 * rather than a retyped copy that can drift.
 *
 * ## The server will NOT catch that mistake in `STORY_REPARENT_SQL`
 *
 * Worth knowing before editing that statement. Measured against a real Postgres 16:
 *
 *   UPDATE t SET vc = $2, tx = $2 WHERE id = $1                             -> REFUSED
 *   UPDATE t SET vc = $2, tx = $2 WHERE id = $1 AND vc IS DISTINCT FROM $2  -> ACCEPTED
 *
 * Comparing a parameter against a typed column in the `WHERE` **pins its type**, so the
 * contradiction that refuses the first form resolves in the second, and the statement runs --
 * writing one column's value into another and reporting success. `STORY_REPARENT_SQL` compares
 * every one of its parameters that way, because that is what makes it idempotent.
 *
 * So the idempotency guard and the server's type check are in direct tension: this statement
 * gained replay safety at the cost of the gate that caught the Phase 1 defect a fortnight ago, and
 * there is no way to have both. Its integration test therefore checks each column by VALUE instead
 * of relying on the server to object, and anyone adding a column here must add an assertion with
 * it. Phase 1's failure was loud and wrote nothing; this one would be silent.
 */
import { sequelize } from '../config/database';
import { AGENT_DOMAIN_KEYS } from '../services/agentDomain/agentDomainRegistry';
import { derivedProjectId } from '../services/agentDomain/agentDomainProvisionPlan';
import {
  planDomainMigration,
  type DomainMigrationPlan,
  type ExistingList,
  type ExistingStory,
} from '../services/agentDomain/agentDomainAutonomyReleaseMigration';

/** Same shape as the provisioner's list insert, so the two cannot disagree about a release row. */
export const LIST_INSERT_SQL = `INSERT INTO student_task_lists
     (id, project_id, enrollment_id, cluster, title, status, position, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, 'not_started', $6, now(), now())
   ON CONFLICT (id) DO NOTHING`;

/**
 * The three kept releases move below the ladder and say they are superseded.
 *
 * `IS DISTINCT FROM` on both columns so a second run writes nothing. `status` is untouched: an
 * empty release is not a completed one.
 */
export const LIST_RETITLE_SQL = `UPDATE student_task_lists
      SET title = $2, position = $3, updated_at = now()
    WHERE id = $1
      AND (title IS DISTINCT FROM $2 OR position IS DISTINCT FROM $3)`;

/**
 * Re-parent one existing story onto its rung.
 *
 * Six columns, each with its OWN placeholder -- see the header for what sharing one costs. The
 * guard repeats the plan's own value comparison in SQL so the statement is idempotent even if it
 * is run against state the plan did not see. Nothing else on the row is named: no `status`, no
 * `title`, no `narrative`, no `build`, and none of the four verification columns, so the 51 rows
 * carrying a verification stamp keep it.
 */
export const STORY_REPARENT_SQL = `UPDATE student_tasks
      SET task_list_id = $2, release_key = $3, autonomy_stage = $4, capability_id = $5,
          story_kind = $6, position = $7, story_id = $8, updated_at = now()
    WHERE id = $1
      AND (task_list_id IS DISTINCT FROM $2
           OR release_key IS DISTINCT FROM $3
           OR autonomy_stage IS DISTINCT FROM $4
           OR capability_id IS DISTINCT FROM $5
           OR story_kind IS DISTINCT FROM $6
           OR position IS DISTINCT FROM $7
           OR story_id IS DISTINCT FROM $8)`;

/** The projected per-rung stories. `title` and `description` carry one value through two slots. */
export const STORY_INSERT_SQL = `INSERT INTO student_tasks
     (id, task_list_id, project_id, title, description, narrative, build, status, position,
      story_id, release_key, capability_id, autonomy_stage, story_kind, acceptance,
      created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_started', $8, $9, $10, $11, $12, $13, $14::jsonb,
           now(), now())
   ON CONFLICT (id) DO NOTHING`;

const APPLY = process.argv.includes('--apply');
const ONE_DOMAIN = (() => {
  const i = process.argv.indexOf('--domain');
  return i >= 0 ? process.argv[i + 1] : null;
})();

interface DomainOutcome {
  readonly domain_key: string;
  readonly state: 'migrated' | 'unchanged' | 'skipped' | 'failed';
  readonly lists_created: number;
  readonly lists_retitled: number;
  readonly reparented: number;
  readonly inserted: number;
  /** Named, not just counted: see the note where these are printed. */
  readonly unrecognised_stories: ReadonlyArray<string>;
  readonly detail?: string;
}

async function readCurrentState(projectId: string): Promise<{
  lists: ExistingList[]; stories: ExistingStory[]; enrollmentId: string | null;
}> {
  const lists = await sequelize.query<ExistingList & { enrollment_id: string | null }>(
    `SELECT id, cluster, title, position, enrollment_id
       FROM student_task_lists
      WHERE project_id = $1
      ORDER BY position, cluster`,
    { bind: [projectId], type: (sequelize as any).QueryTypes.SELECT },
  ) as unknown as (ExistingList & { enrollment_id: string | null })[];

  const stories = await sequelize.query<ExistingStory>(
    `SELECT id, story_id, task_list_id, release_key, position, capability_id, autonomy_stage,
            story_kind
       FROM student_tasks
      WHERE project_id = $1
      ORDER BY position, created_at, id`,
    { bind: [projectId], type: (sequelize as any).QueryTypes.SELECT },
  ) as unknown as ExistingStory[];

  const enrollmentId = lists.find((l) => l.enrollment_id)?.enrollment_id ?? null;
  return { lists, stories, enrollmentId };
}

function summarise(plan: DomainMigrationPlan): string {
  const rungs = new Map<string, number>();
  for (const s of plan.stories_to_insert) rungs.set(s.release_key, (rungs.get(s.release_key) ?? 0) + 1);
  const spread = [...rungs.entries()].sort().map(([r, n]) => `${r.replace('autonomy:', '')}:${n}`).join(' ');
  return `+${plan.lists_to_create.length} lists, ${plan.stories_to_reparent.length} re-parented, `
    + `+${plan.stories_to_insert.length} stories (${spread || 'none'})`;
}

/**
 * One domain, one transaction.
 *
 * Per-domain rather than one transaction for all ten, matching the provisioner: a domain that
 * fails rolls back whole and leaves the other nine alone, and the failure is reported against the
 * domain that caused it rather than taking down a run that was otherwise correct.
 */
async function migrateDomain(domainKey: string): Promise<DomainOutcome> {
  const projectId = derivedProjectId(domainKey);
  const zero = {
    domain_key: domainKey, lists_created: 0, lists_retitled: 0, reparented: 0, inserted: 0,
  };

  const { lists, stories, enrollmentId } = await readCurrentState(projectId);
  if (lists.length === 0 && stories.length === 0) {
    return {
      ...zero, state: 'skipped', unrecognised_stories: [],
      detail: 'project has no releases or stories',
    };
  }

  const plan = planDomainMigration(domainKey, lists, stories);
  const counts = {
    domain_key: domainKey,
    lists_created: plan.lists_to_create.length,
    lists_retitled: plan.lists_to_retitle.length,
    reparented: plan.stories_to_reparent.length,
    inserted: plan.stories_to_insert.length,
    unrecognised_stories: plan.unrecognised_stories,
  };

  if (plan.already_migrated) return { ...counts, state: 'unchanged' };
  if (!APPLY) return { ...counts, state: 'migrated', detail: `DRY RUN - ${summarise(plan)}` };

  if (plan.lists_to_create.length > 0 && !enrollmentId) {
    return {
      ...counts, state: 'failed',
      detail: 'no enrollment_id found on any existing release, so a new release cannot be created '
        + 'without guessing one',
    };
  }

  const tx = await sequelize.transaction();
  try {
    for (const l of plan.lists_to_create) {
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [l.id, projectId, enrollmentId, l.cluster, l.title, l.position], transaction: tx,
      });
    }
    for (const l of plan.lists_to_retitle) {
      await sequelize.query(LIST_RETITLE_SQL, {
        bind: [l.id, l.title, l.position], transaction: tx,
      });
    }
    for (const s of plan.stories_to_reparent) {
      await sequelize.query(STORY_REPARENT_SQL, {
        bind: [s.id, s.task_list_id, s.release_key, s.autonomy_stage, s.capability_id,
          s.story_kind, s.position, s.story_id],
        transaction: tx,
      });
    }
    for (const s of plan.stories_to_insert) {
      await sequelize.query(STORY_INSERT_SQL, {
        bind: [s.id, s.task_list_id, projectId, s.title, s.title, s.narrative, s.build,
          s.position, s.story_id, s.release_key, s.capability_id, s.autonomy_stage, s.story_kind,
          s.acceptance.length > 0 ? JSON.stringify([...s.acceptance]) : null],
        transaction: tx,
      });
    }
    await tx.commit();
    return { ...counts, state: 'migrated', detail: summarise(plan) };
  } catch (err: any) {
    await tx.rollback();
    return { ...counts, state: 'failed', detail: `${err?.name ?? 'Error'}: ${err?.message}` };
  }
}

async function main(): Promise<void> {
  const domains = ONE_DOMAIN ? [ONE_DOMAIN] : [...AGENT_DOMAIN_KEYS];
  for (const d of domains) {
    if (!AGENT_DOMAIN_KEYS.includes(d as never)) {
      console.error(`not an agent domain: '${d}'`);
      process.exit(1);
    }
  }

  console.log(APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)');
  const outcomes: DomainOutcome[] = [];
  for (const d of domains) outcomes.push(await migrateDomain(d));

  for (const o of outcomes) {
    const odd = o.unrecognised_stories.length;
    console.log(
      `${o.domain_key.padEnd(20)} ${o.state.padEnd(10)} lists +${o.lists_created}/~${o.lists_retitled} `
      + `stories ~${o.reparented}/+${o.inserted} `
      + `${odd > 0 ? `unrecognised ${odd} ` : ''}${o.detail ?? ''}`,
    );
  }

  const failed = outcomes.filter((o) => o.state === 'failed');
  const totals = outcomes.reduce((a, o) => ({
    lists: a.lists + o.lists_created,
    reparented: a.reparented + o.reparented,
    inserted: a.inserted + o.inserted,
  }), { lists: 0, reparented: 0, inserted: 0 });

  console.log(
    `\n${outcomes.length} domain(s): +${totals.lists} releases, ${totals.reparented} stories `
    + `re-parented, +${totals.inserted} stories projected, ${failed.length} failed`,
  );

  // Every unrecognised row is NAMED rather than counted, because the one thing this migration
  // promises is that nothing an intern has done disappears, and a row the generator no longer
  // produces is where that promise would quietly break. A count would let somebody shrug at it.
  for (const o of outcomes) {
    if (o.unrecognised_stories.length === 0) continue;
    console.log(`\n${o.domain_key}: ${o.unrecognised_stories.length} row(s) the generator does not `
      + 'produce, left exactly as they are:');
    for (const sid of o.unrecognised_stories) console.log(`  ${sid}`);
  }

  await sequelize.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('migration failed:', err?.message ?? err);
    try { await sequelize.close(); } catch { /* already closed */ }
    process.exit(1);
  });
}
