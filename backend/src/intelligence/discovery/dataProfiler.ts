import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ColumnInfo } from './schemaInspector';

export interface ColumnProfile {
  null_rate: number;
  distinct_count: number;
  cardinality: number;
  min?: number | string;
  max?: number | string;
  avg_length?: number;
}

export interface TableProfile {
  row_count: number;
  columns: Record<string, ColumnProfile>;
}

const NUMERIC_TYPES = ['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision', 'decimal'];
const TEXT_TYPES = ['character varying', 'text', 'character', 'varchar', 'char'];

function isNumeric(dataType: string): boolean {
  return NUMERIC_TYPES.some((t) => dataType.toLowerCase().includes(t));
}

function isText(dataType: string): boolean {
  return TEXT_TYPES.some((t) => dataType.toLowerCase().includes(t));
}

// Escape identifier for safe SQL interpolation
function escapeId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function profileTable(
  tableName: string,
  columns: ColumnInfo[],
  rowCount: number
): Promise<TableProfile> {
  if (!columns.length || rowCount === 0) {
    const emptyProfiles: Record<string, ColumnProfile> = {};
    for (const col of columns) {
      emptyProfiles[col.column_name] = {
        null_rate: 0,
        distinct_count: 0,
        cardinality: 0,
      };
    }
    return { row_count: rowCount, columns: emptyProfiles };
  }

  // Batch null/distinct counts in one query per table
  const selectParts: string[] = [];
  for (const col of columns) {
    const id = escapeId(col.column_name);
    selectParts.push(
      `COUNT(*) - COUNT(${id}) AS "null_${col.column_name}"`,
      `COUNT(DISTINCT ${id}) AS "dist_${col.column_name}"`
    );
  }

  // Add numeric min/max
  for (const col of columns) {
    if (isNumeric(col.data_type)) {
      const id = escapeId(col.column_name);
      selectParts.push(
        `MIN(${id}) AS "min_${col.column_name}"`,
        `MAX(${id}) AS "max_${col.column_name}"`
      );
    }
  }

  // Add text avg length
  for (const col of columns) {
    if (isText(col.data_type)) {
      const id = escapeId(col.column_name);
      selectParts.push(`AVG(LENGTH(${id}::text)) AS "avglen_${col.column_name}"`);
    }
  }

  const sql = `SELECT ${selectParts.join(', ')} FROM ${escapeId(tableName)}`;

  let statsRow: Record<string, any> = {};
  try {
    const [result] = await sequelize.query(sql, { type: QueryTypes.SELECT });
    statsRow = (result as Record<string, any>) || {};
  } catch {
    // Table might be empty or have permission issues
  }

  const profiles: Record<string, ColumnProfile> = {};
  for (const col of columns) {
    const nullCount = Number(statsRow[`null_${col.column_name}`]) || 0;
    const distinctCount = Number(statsRow[`dist_${col.column_name}`]) || 0;

    const profile: ColumnProfile = {
      null_rate: rowCount > 0 ? nullCount / rowCount : 0,
      distinct_count: distinctCount,
      cardinality: rowCount > 0 ? distinctCount / rowCount : 0,
    };

    if (isNumeric(col.data_type)) {
      const minVal = statsRow[`min_${col.column_name}`];
      const maxVal = statsRow[`max_${col.column_name}`];
      if (minVal != null) profile.min = Number(minVal);
      if (maxVal != null) profile.max = Number(maxVal);
    }

    if (isText(col.data_type)) {
      const avgLen = statsRow[`avglen_${col.column_name}`];
      if (avgLen != null) profile.avg_length = Math.round(Number(avgLen));
    }

    profiles[col.column_name] = profile;
  }

  return { row_count: rowCount, columns: profiles };
}

export async function profileAllTables(
  columns: Record<string, ColumnInfo[]>,
  rowCounts: Record<string, number>
): Promise<Record<string, TableProfile>> {
  const results: Record<string, TableProfile> = {};

  for (const tableName of Object.keys(columns)) {
    try {
      results[tableName] = await profileTable(
        tableName,
        columns[tableName],
        rowCounts[tableName] || 0
      );
    } catch {
      results[tableName] = { row_count: rowCounts[tableName] || 0, columns: {} };
    }
  }

  return results;
}
