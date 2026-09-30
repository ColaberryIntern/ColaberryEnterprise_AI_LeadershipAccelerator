import { DataTypes } from 'sequelize';
import type { Model, ModelStatic } from 'sequelize';
import { sequelize } from './database';

/**
 * Additive-only schema reconciler for a curated set of critical models.
 *
 * Why this exists
 * ---------------
 * `sequelize.sync({ alter: true })` is DISABLED on this 215-model prod graph:
 * the alter pass hits a pre-existing enum/index conflict and the create-only
 * fallback runs a full per-table introspection (~6 min) before erroring — every
 * boot became a multi-minute outage (see the long comment in server.ts).
 *
 * The consequence: a column added to a model over time never lands on an
 * EXISTING prod table, so any find/create on that model 500s with
 * `column "x" does not exist`. This has taken down the student Classroom TWICE
 * on enrollments drift (2026-07-05, 2026-07-13) because getFeed → Enrollment
 * SELECTs every model column.
 *
 * This routine closes that gap deterministically and cheaply. For each model it
 * runs ONE describeTable, diffs the live columns against the model's attributes,
 * and ADDs any missing column as NULLABLE. It never drops a column and never
 * alters an existing one, so it cannot fail on existing rows or clobber data.
 * Idempotent: a second run finds nothing to add. Scoped to a handful of models,
 * so it adds only a few info-schema queries to boot — not the 215-model scan.
 *
 * To protect a newly-drift-prone model, add it to CRITICAL_MODELS in server.ts.
 */
export interface ReconcileResult {
  checked: number;
  added: Array<{ table: string; column: string }>;
  skipped: Array<{ table: string; reason: string }>;
}

function tableLabel(model: ModelStatic<Model>): string {
  const t = model.getTableName();
  return typeof t === 'string' ? t : `${t.schema ? `${t.schema}.` : ''}${t.tableName}`;
}

export async function reconcileMissingColumns(
  models: ModelStatic<Model>[],
): Promise<ReconcileResult> {
  const qi = sequelize.getQueryInterface();
  const result: ReconcileResult = { checked: 0, added: [], skipped: [] };

  for (const model of models) {
    const table = tableLabel(model);
    let live: Record<string, unknown>;
    try {
      live = await qi.describeTable(model.getTableName());
    } catch (err: any) {
      // Table doesn't exist yet (created lazily elsewhere / different boot path) — skip.
      result.skipped.push({ table, reason: `describeTable failed: ${err?.message}` });
      continue;
    }
    result.checked++;

    const attrs = (model as any).rawAttributes as Record<string, any>;
    for (const attrName of Object.keys(attrs)) {
      const def = attrs[attrName];
      // VIRTUAL attributes have no physical column — never try to add them.
      if (def?.type instanceof DataTypes.VIRTUAL) continue;
      const column: string = def?.field || attrName;
      if (Object.prototype.hasOwnProperty.call(live, column)) continue; // already present

      try {
        await qi.addColumn(model.getTableName(), column, {
          type: def.type,
          allowNull: true, // never NOT NULL — existing rows would violate it
          defaultValue: def.defaultValue,
        });
        result.added.push({ table, column });
        console.log(`[schema-reconcile] added ${table}.${column}`);
      } catch (err: any) {
        // Non-fatal: a single column that can't be mapped (exotic enum, etc.)
        // must not abort boot or block the other columns/models.
        result.skipped.push({ table, reason: `addColumn ${column}: ${err?.message}` });
        console.warn(`[schema-reconcile] could not add ${table}.${column}: ${err?.message}`);
      }
    }
  }

  return result;
}
