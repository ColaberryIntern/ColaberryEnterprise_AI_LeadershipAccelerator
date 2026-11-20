import type { QueryInterface } from 'sequelize';

/**
 * Add every column a model declares and its table lacks. Additive only: nothing is altered or
 * dropped, and an added column is nullable (an existing row has no value for it), keeping the
 * model's default when it is a plain value.
 *
 * Why: boot runs `Model.sync()`, which creates a missing table but never adds a column to an
 * existing one. A table that grows phase by phase (enterprise_intakes, W28 to W31) would
 * otherwise reach production without the columns the code now reads.
 */
export async function addMissingColumns(
  model: { getTableName(): unknown; getAttributes(): Record<string, unknown> },
  qi: Pick<QueryInterface, 'describeTable' | 'addColumn'>,
): Promise<string[]> {
  const table = model.getTableName() as string;
  const existing = await qi.describeTable(table);
  const added: string[] = [];
  for (const attr of Object.values(model.getAttributes()) as Array<{ field?: string; fieldName?: string; type: unknown; defaultValue?: unknown }>) {
    const column = attr.field || attr.fieldName;
    if (!column || existing[column]) continue;
    const plainDefault =
      attr.defaultValue !== undefined && (typeof attr.defaultValue !== 'object' || attr.defaultValue === null)
        ? { defaultValue: attr.defaultValue }
        : {};
    await qi.addColumn(table, column, { type: attr.type as never, allowNull: true, ...plainDefault });
    added.push(column);
  }
  return added;
}
