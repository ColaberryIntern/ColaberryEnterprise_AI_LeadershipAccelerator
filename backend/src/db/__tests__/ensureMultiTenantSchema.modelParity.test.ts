import { MULTI_TENANT_SCHEMA_STATEMENTS } from '../ensureMultiTenantSchema';
import { sequelize } from '../../config/database';
import '../../models';

/**
 * Schema/model parity for the tenancy columns.
 *
 * THE BUG THIS EXISTS TO PREVENT, which actually happened:
 *
 * The DDL added `tenant_id`, `brand_id` and friends to nine existing tables, and every
 * service was written to read and write them. But none of the nine Sequelize models
 * declared the new attributes, and **Sequelize only ever touches attributes a model
 * knows about**. The result was a system that reported success and did nothing:
 *
 *   - `LeadSource.findOne()` never SELECTed `tenant_id`, so it read back `undefined`
 *     and the tenant resolver could never resolve anything;
 *   - `source.update({ tenant_id })` silently dropped the write, so the backfill
 *     reported "updated=5" while the database stayed null;
 *   - the scheduler asked for `tenant_id` in its `attributes` list and got `undefined`,
 *     so every campaign fell back to the legacy sender.
 *
 * Every unit test still passed, because they all mock the models. Nothing caught it
 * until the migration was rehearsed against a real database.
 *
 * This test closes that gap permanently: it reads the DDL itself and asserts that every
 * column the DDL adds is declared on the model that owns the table. It needs no
 * database — it compares the two sources of truth directly.
 */

/** `ALTER TABLE x ADD COLUMN IF NOT EXISTS y TYPE` → { table, column } */
function parseAddedColumns(statements: readonly string[]): Array<{ table: string; column: string }> {
  const added: Array<{ table: string; column: string }> = [];
  const rx = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi;
  for (const sql of statements) {
    let m: RegExpExecArray | null;
    rx.lastIndex = 0;
    while ((m = rx.exec(sql)) !== null) added.push({ table: m[1], column: m[2] });
  }
  return added;
}

/** tableName → the model registered for it. */
function modelsByTable(): Record<string, any> {
  const byTable: Record<string, any> = {};
  for (const model of Object.values(sequelize.models)) {
    byTable[(model as any).getTableName()] = model;
  }
  return byTable;
}

describe('ensureMultiTenantSchema — every added column is declared on its model', () => {
  const added = parseAddedColumns(MULTI_TENANT_SCHEMA_STATEMENTS);

  it('the DDL actually adds columns (guards against a silently-empty parse)', () => {
    // If the regex ever stops matching, every assertion below would vacuously pass.
    expect(added.length).toBeGreaterThan(15);
  });

  it('every table the DDL alters has a registered Sequelize model', () => {
    const byTable = modelsByTable();
    const unknown = [...new Set(added.map((a) => a.table))].filter((t) => !byTable[t]);
    expect(unknown).toEqual([]);
  });

  it('every added column is declared as a model attribute', () => {
    const byTable = modelsByTable();
    const missing: string[] = [];

    for (const { table, column } of added) {
      const model = byTable[table];
      if (!model) continue; // reported by the test above
      if (!Object.prototype.hasOwnProperty.call(model.getAttributes(), column)) {
        missing.push(`${table}.${column} (model ${model.name})`);
      }
    }

    // A failure here means the column exists in Postgres but is invisible to the ORM:
    // reads return undefined and writes are silently dropped.
    expect(missing).toEqual([]);
  });
});

describe('the tenancy columns the services actually depend on', () => {
  /**
   * Named explicitly rather than derived, so that deleting a column from the DDL cannot
   * quietly make this suite pass by having nothing left to check. These are the exact
   * reads and writes that were broken.
   */
  const REQUIRED: Array<[string, string[]]> = [
    ['lead_sources', ['tenant_id', 'brand_id', 'source_type']],
    ['entry_points', ['entry_type']],
    ['visitor_sessions', ['tenant_id', 'brand_id', 'source_id', 'campaign_id']],
    ['page_events', ['tenant_id', 'brand_id', 'source_id', 'campaign_id']],
    ['campaigns', ['tenant_id', 'brand_id', 'organization_id', 'sender_profile_id']],
    ['organizations', ['tenant_id', 'brand_id', 'organization_type']],
    ['org_members', ['platform_identity_id']],
    ['event_ledger', ['tenant_id', 'brand_id']],
    ['follow_up_sequences', ['tenant_id']],
  ];

  it.each(REQUIRED)('%s declares its tenancy attributes', (table, columns) => {
    const model = modelsByTable()[table];
    expect(model).toBeDefined();
    const attrs = Object.keys(model.getAttributes());
    for (const column of columns) expect(attrs).toContain(column);
  });
});
