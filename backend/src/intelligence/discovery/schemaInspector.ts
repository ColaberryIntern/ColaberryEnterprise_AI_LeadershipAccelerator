import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export interface TableInfo {
  table_name: string;
  table_type: string;
}

export interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

export interface ForeignKey {
  constraint_name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
}

export interface SchemaSnapshot {
  tables: TableInfo[];
  columns: Record<string, ColumnInfo[]>;
  foreign_keys: ForeignKey[];
  primary_keys: Record<string, string[]>;
  row_counts: Record<string, number>;
}

async function getTables(): Promise<TableInfo[]> {
  const rows = await sequelize.query<TableInfo>(
    `SELECT table_name, table_type
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type IN ('BASE TABLE', 'VIEW')
     ORDER BY table_name`,
    { type: QueryTypes.SELECT }
  );
  return rows;
}

async function getColumns(tableNames: string[]): Promise<Record<string, ColumnInfo[]>> {
  if (!tableNames.length) return {};
  const rows = await sequelize.query<ColumnInfo>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (:tableNames)
     ORDER BY table_name, ordinal_position`,
    { type: QueryTypes.SELECT, replacements: { tableNames } }
  );
  const grouped: Record<string, ColumnInfo[]> = {};
  for (const row of rows) {
    if (!grouped[row.table_name]) grouped[row.table_name] = [];
    grouped[row.table_name].push(row);
  }
  return grouped;
}

async function getForeignKeys(): Promise<ForeignKey[]> {
  const rows = await sequelize.query<ForeignKey>(
    `SELECT
       tc.constraint_name,
       kcu.table_name AS source_table,
       kcu.column_name AS source_column,
       ccu.table_name AS target_table,
       ccu.column_name AS target_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'`,
    { type: QueryTypes.SELECT }
  );
  return rows;
}

async function getPrimaryKeys(tableNames: string[]): Promise<Record<string, string[]>> {
  if (!tableNames.length) return {};
  const rows = await sequelize.query<{ table_name: string; column_name: string }>(
    `SELECT kcu.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = 'public'
       AND kcu.table_name IN (:tableNames)`,
    { type: QueryTypes.SELECT, replacements: { tableNames } }
  );
  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    if (!grouped[row.table_name]) grouped[row.table_name] = [];
    grouped[row.table_name].push(row.column_name);
  }
  return grouped;
}

async function getRowCounts(tableNames: string[]): Promise<Record<string, number>> {
  if (!tableNames.length) return {};
  // Use pg_class for fast approximate counts
  const rows = await sequelize.query<{ table_name: string; row_count: string }>(
    `SELECT c.relname AS table_name, c.reltuples::bigint AS row_count
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN (:tableNames)
       AND c.relkind = 'r'`,
    { type: QueryTypes.SELECT, replacements: { tableNames } }
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.table_name] = Number(row.row_count) || 0;
  }
  return counts;
}

export async function inspectSchema(): Promise<SchemaSnapshot> {
  const tables = await getTables();
  const baseTableNames = tables
    .filter((t) => t.table_type === 'BASE TABLE')
    .map((t) => t.table_name);

  const allTableNames = tables.map((t) => t.table_name);

  const [columns, foreign_keys, primary_keys, row_counts] = await Promise.all([
    getColumns(allTableNames),
    getForeignKeys(),
    getPrimaryKeys(baseTableNames),
    getRowCounts(baseTableNames),
  ]);

  return { tables, columns, foreign_keys, primary_keys, row_counts };
}
