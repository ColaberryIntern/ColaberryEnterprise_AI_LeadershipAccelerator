/**
 * rehearseRefactoredDeliverySchema — run the delivery DDL against a real Postgres.
 *
 * WHY THIS EXISTS. `ensureRefactoredDeliverySchema` is wired into `server.ts` and runs at
 * boot. Gates 1–15 added 19 tables of raw DDL to it, and until this script ran, **none of
 * it had ever executed against a real database**. It would have armed on the next
 * production deploy of this repo — possibly one triggered by an unrelated workstream.
 *
 * This repo has no migration framework, deliberately: `sync({alter:true})` once produced
 * ~50k duplicate constraints and OOM-ed Postgres. The replacement is idempotent raw DDL
 * that re-runs on every boot. That design is only safe if the DDL genuinely *is*
 * idempotent — a claim about behaviour, which has to be executed rather than reasoned about.
 *
 * ## What it checks
 *
 * 1. **Every statement applies** to a database that does not yet have the tables.
 * 2. **Every statement applies AGAIN.** This is the one that matters: a `CREATE TABLE`
 *    without `IF NOT EXISTS`, or an `ALTER TABLE ADD CONSTRAINT` (which has no
 *    `IF NOT EXISTS` form), passes the first run and fails every boot afterwards.
 * 3. **The second run changes nothing** — same tables, same indexes.
 * 4. **The ESC-1 relaxation actually took effect**: `organizations.owner_enrollment_id`
 *    became nullable AND its unique index survived. Gate 1 decided to drop NOT NULL while
 *    keeping UNIQUE (PostgreSQL treats NULLs as distinct, so the constraint never blocked
 *    client organizations, and it is what makes `registerManager`'s findOrCreate
 *    race-safe). That decision is only correct if the DDL does what it says.
 *
 * ## Prerequisite
 *
 * `organizations` is created inline in `server.ts` before this module runs, so a faithful
 * rehearsal creates it the same way first (`--with-prerequisites`). Without it the four
 * ORGANIZATION_RELAXATION statements fail against a bare database — which is *correct*
 * behaviour for the module (it logs and continues rather than killing boot), and worth
 * rehearsing on its own.
 *
 * ## Safety
 *
 * Refuses to run against anything that is not an explicitly-supplied throwaway URL. No
 * default, no fallback to `DATABASE_URL`, and a host check. A rehearsal script that can be
 * pointed at production by omitting an argument is a loaded gun.
 *
 *   npx ts-node --transpile-only src/scripts/rehearseRefactoredDeliverySchema.ts \
 *     postgres://rehearsal:rehearsal@localhost:5601/rehearsal --with-prerequisites
 */

import { QueryTypes, Sequelize } from 'sequelize';
import { REFACTORED_DELIVERY_SCHEMA_STATEMENTS } from '../db/ensureRefactoredDeliverySchema';

const FORBIDDEN_HOST_FRAGMENTS = ['95.216.199.47', 'prod', 'production', 'accelerator-db'];

function assertThrowaway(url: string): void {
  if (!url) {
    throw new Error(
      'A throwaway Postgres URL must be supplied explicitly. There is no default: a ' +
        'rehearsal that falls back to DATABASE_URL can be pointed at production by ' +
        'forgetting an argument.',
    );
  }
  const lowered = url.toLowerCase();
  for (const fragment of FORBIDDEN_HOST_FRAGMENTS) {
    if (lowered.includes(fragment)) {
      throw new Error(`Refusing to rehearse against a URL containing '${fragment}'.`);
    }
  }
}

/**
 * The `organizations` table exactly as `server.ts` creates it — NOT NULL owner, and the
 * unique index named `organizations_owner_enrollment_unique`.
 *
 * Copied rather than imported because it lives inline in `server.ts`'s boot path, and
 * importing that would start a server. If it drifts, this rehearsal stops matching reality
 * — which is a reason to move it into its own ensure* module, not a reason to skip the
 * rehearsal.
 */
const PREREQUISITES: string[] = [
  `CREATE TABLE IF NOT EXISTS organizations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name VARCHAR(255) NOT NULL,
     owner_enrollment_id UUID NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS organizations_owner_enrollment_unique
     ON organizations (owner_enrollment_id)`,
];

interface StatementOutcome {
  index: number;
  sql: string;
  ok: boolean;
  error?: string;
}

async function runAll(sequelize: Sequelize, pass: number): Promise<StatementOutcome[]> {
  const outcomes: StatementOutcome[] = [];
  for (let i = 0; i < REFACTORED_DELIVERY_SCHEMA_STATEMENTS.length; i += 1) {
    const sql = REFACTORED_DELIVERY_SCHEMA_STATEMENTS[i];
    try {
      await sequelize.query(sql);
      outcomes.push({ index: i, sql, ok: true });
    } catch (err: any) {
      outcomes.push({ index: i, sql, ok: false, error: err?.message ?? String(err) });
    }
  }
  const failed = outcomes.filter((o) => !o.ok);
  console.log(`[pass ${pass}] ${outcomes.length - failed.length}/${outcomes.length} statements applied`);
  return outcomes;
}

/** Tables this build owns. `builder_authority_profiles` does not start with `delivery`. */
const OWNED_TABLE_PATTERN = `(table_name LIKE 'delivery%' OR table_name = 'builder_authority_profiles')`;

async function inventory(sequelize: Sequelize) {
  // `::text` matters. `information_schema` columns are `sql_identifier`, not `text`, and
  // the driver hands that back as a value the property read cannot use — the count is
  // right while every name reads `undefined`. Casting makes the result a plain string.
  const tables = await sequelize.query<{ name: string }>(
    `SELECT table_name::text AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND ${OWNED_TABLE_PATTERN}
      ORDER BY table_name`,
    { type: QueryTypes.SELECT },
  );
  const indexes = await sequelize.query<{ name: string }>(
    `SELECT indexname::text AS name FROM pg_indexes
      WHERE schemaname = 'public'
        AND (tablename LIKE 'delivery%' OR tablename = 'builder_authority_profiles')
      ORDER BY indexname`,
    { type: QueryTypes.SELECT },
  );
  return { tables: tables.map((r) => r.name), indexes: indexes.map((r) => r.name) };
}

/** Did the ESC-1 relaxation actually take effect? */
async function checkRelaxation(sequelize: Sequelize) {
  const cols = await sequelize.query<{ column_name: string; is_nullable: string }>(
    `SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'organizations'
        AND column_name IN ('owner_enrollment_id', 'organization_type')`,
    { type: QueryTypes.SELECT },
  );
  const idx = await sequelize.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
      WHERE tablename = 'organizations'
        AND indexname = 'organizations_owner_enrollment_unique'`,
    { type: QueryTypes.SELECT },
  );
  const owner = cols.find((c) => c.column_name === 'owner_enrollment_id');
  return {
    ownerNullable: owner?.is_nullable === 'YES',
    organizationTypeAdded: cols.some((c) => c.column_name === 'organization_type'),
    uniqueIndexKept: idx.length === 1,
  };
}

async function main(): Promise<void> {
  const url = process.argv[2];
  const withPrereqs = process.argv.includes('--with-prerequisites');
  assertThrowaway(url);

  const sequelize = new Sequelize(url, { logging: false });
  await sequelize.authenticate();
  console.log(`connected: ${url.replace(/:[^:@]+@/, ':***@')}`);
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  if (withPrereqs) {
    for (const sql of PREREQUISITES) await sequelize.query(sql);
    console.log('prerequisites applied: organizations (owner NOT NULL + unique index)');
  } else {
    console.log('prerequisites SKIPPED — the relaxation group is expected to fail');
  }

  console.log(`\n--- PASS 1: ${REFACTORED_DELIVERY_SCHEMA_STATEMENTS.length} statements ---`);
  const first = await runAll(sequelize, 1);
  const afterFirst = await inventory(sequelize);

  console.log(`\n--- PASS 2: the same statements again ---`);
  const second = await runAll(sequelize, 2);
  const afterSecond = await inventory(sequelize);

  const relaxation = withPrereqs ? await checkRelaxation(sequelize) : null;

  console.log('\n=================== REHEARSAL RESULT ===================');
  console.log(`tables  : ${afterFirst.tables.length} after pass 1, ${afterSecond.tables.length} after pass 2`);
  console.log(`indexes : ${afterFirst.indexes.length} after pass 1, ${afterSecond.indexes.length} after pass 2`);

  const idempotent =
    afterFirst.tables.length === afterSecond.tables.length &&
    afterFirst.indexes.length === afterSecond.indexes.length;
  console.log(`idempotent : ${idempotent ? 'YES' : 'NO — SECOND RUN CHANGED THE SCHEMA'}`);

  if (relaxation) {
    console.log('\nESC-1 relaxation:');
    console.log(`  owner_enrollment_id nullable : ${relaxation.ownerNullable ? 'YES' : 'NO'}`);
    console.log(`  organization_type added      : ${relaxation.organizationTypeAdded ? 'YES' : 'NO'}`);
    console.log(`  unique index KEPT            : ${relaxation.uniqueIndexKept ? 'YES' : 'NO'}`);
  }

  const report = (label: string, failures: StatementOutcome[]) => {
    if (failures.length === 0) {
      console.log(`\n${label}: none`);
      return;
    }
    console.log(`\n${label}: ${failures.length}`);
    for (const f of failures) {
      console.log(`  [${f.index}] ${f.sql.trim().split('\n')[0].slice(0, 88)}`);
      console.log(`        -> ${f.error}`);
    }
  };

  const firstFailures = first.filter((o) => !o.ok);
  const secondFailures = second.filter((o) => !o.ok);
  report('PASS 1 failures', firstFailures);
  report('PASS 2 failures', secondFailures);

  console.log(`\ntables created (${afterSecond.tables.length}):`);
  for (const t of afterSecond.tables) console.log(`  ${t}`);

  await sequelize.close();

  const relaxationOk =
    !relaxation || (relaxation.ownerNullable && relaxation.organizationTypeAdded && relaxation.uniqueIndexKept);
  const broken = !idempotent || secondFailures.length > firstFailures.length || !relaxationOk;
  process.exit(broken ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
