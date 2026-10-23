import { sequelize } from '../config/database';

/**
 * ensureStrategicAccountSchema — C8.3, implementing the C6.1 reuse-versus-build design.
 *
 * C6.1 inspected the existing models and returned a verdict per entity: EXTEND
 * `organizations` for the account and its attributes, REUSE `leads` for decision makers,
 * and BUILD exactly ONE new table, for warm paths, because "who do we know at this
 * account and through whom" is a many-to-many with a relationship kind and cannot be a
 * column. That one table is all this file creates, and
 * `__tests__/ensureStrategicAccountSchema.test.ts` holds it to that, so C8.3's "no
 * parallel account table created unless C6.1 justified it" cannot quietly stop being true.
 *
 * WHY THE EXTEND COLUMNS ARE NOT HERE
 * -----------------------------------
 * The first draft added them with `ALTER TABLE organizations/leads ADD COLUMN IF NOT
 * EXISTS`. `bootSchemaCreatable.test.ts` rejected it, and it was right: nothing in the
 * boot path CREATEs `leads`, so on a pristine database that ALTER fails, the catch below
 * swallows it, and the column silently never lands. Its grandfather list of twenty such
 * tables is documented as one that SHRINKS, so adding `leads` to it was the wrong fix.
 *
 * The repo already has the right tool. `config/schemaReconcile.ts` exists for precisely
 * this — "a column added to a model over time never lands on an EXISTING prod table" —
 * and it is wired at boot in server.ts with the instruction "to protect another model,
 * add it here". It diffs each model's attributes against the live table, adds what is
 * missing as NULLABLE, never drops or retypes, and SKIPS a table that does not exist
 * rather than failing. So `Organization` and `Lead` were added to that list, and their
 * new columns are declared once, on the models, instead of twice.
 *
 * WHY THE NEW TABLE'S COLUMNS MUST NOT BE EDITED IN PLACE LATER
 * -------------------------------------------------------------
 * Once this has run anywhere, `CREATE TABLE IF NOT EXISTS account_warm_paths` is a no-op,
 * so a column folded into that block would skip every existing deployment — the trap
 * recorded at ensureBroadcastSchema.ts. After this ships, a new column on it needs its own
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and that table WILL then be boot-creatable
 * because this file creates it, so the guard above stays satisfied.
 *
 * `organization_type` needs no DDL at all: measured on prod 2026-10-23 it is a plain
 * `character varying` with no enum and no CHECK, so `strategic_account` is an
 * application-level value. Adding a constraint now would be a NEW restriction on nine
 * existing rows, which is not additive.
 */

/** The one new table C6.1 justified. Named so the test can assert there is only one. */
export const NEW_TABLES: ReadonlyArray<string> = ['account_warm_paths'];

/**
 * Models whose new C8.3 columns arrive through `reconcileMissingColumns`, not through
 * DDL here. Asserted against the boot list by the test, so the columns cannot be declared
 * on a model that nothing reconciles — which would read as working and write nothing.
 */
export const RECONCILED_MODELS: ReadonlyArray<string> = ['Organization', 'Lead'];

/**
 * How a person is connected to an account. Deliberately small and open: the value of a
 * warm path is the person and the introducer, not a taxonomy nobody will maintain.
 */
export const WARM_PATH_KINDS = [
  'colleague', 'former_colleague', 'alumni', 'customer', 'investor',
  'community', 'introduction', 'other',
] as const;

export function strategicAccountStatements(): string[] {
  return [
    // C6.1 row 7, the only BUILD verdict, with proof: a sweep of every column matching
    // referral/introduc/relationship/warm/connection found 24 hits and none joining a
    // person to an account.
    `CREATE TABLE IF NOT EXISTS account_warm_paths (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       organization_id UUID NOT NULL,
       lead_id INTEGER NOT NULL,
       relationship_kind VARCHAR(40) NOT NULL DEFAULT 'other',
       strength SMALLINT,
       introduced_by_lead_id INTEGER,
       notes TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Idempotency: recording the same path twice must not create a second row. Without
    // this, re-running any importer silently duplicates every warm path it knows, which
    // this repo treats as a production defect rather than a nit.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_account_warm_paths_account_person_kind
       ON account_warm_paths (organization_id, lead_id, relationship_kind)`,
    `CREATE INDEX IF NOT EXISTS idx_account_warm_paths_lead ON account_warm_paths (lead_id)`,
    // Deleting an account must not strand its warm paths. Dropped-then-added so the pair
    // is re-runnable; the house idiom from ensureLeadViewPreferenceSchema.
    `ALTER TABLE account_warm_paths DROP CONSTRAINT IF EXISTS fk_account_warm_paths_org`,
    `ALTER TABLE account_warm_paths
       ADD CONSTRAINT fk_account_warm_paths_org
       FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE`,
    // The lookup behind "who do we know at this account". Not an ALTER, so it does not
    // enter the boot-ALTER population; on a pristine database it warns once and self-heals
    // on the next boot after `leads` exists, and no data depends on it in the meantime.
    `CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON leads (organization_id)`,
  ];
}

export async function ensureStrategicAccountSchema(): Promise<void> {
  for (const sql of strategicAccountStatements()) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Self-healing by design: a statement that loses a race with another boot, or is
      // already satisfied, must not stop the rest and must never stop the server coming
      // up. Every statement here is independently idempotent.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({
        level: 'warn',
        service: 'backend',
        event: 'ensure_strategic_account_schema_statement_failed',
        outcome: 'partial',
        error_class: 'SchemaEnsureWarning',
        context: { statement: sql.slice(0, 80), message },
      }));
    }
  }
}
