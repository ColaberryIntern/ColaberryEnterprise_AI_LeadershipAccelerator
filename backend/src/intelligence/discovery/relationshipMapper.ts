import { SchemaSnapshot, ForeignKey, ColumnInfo } from './schemaInspector';

export interface Relationship {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  type: 'foreign_key' | 'inferred';
  confidence: number;
}

export interface RelationshipResult {
  relationships: Relationship[];
  hub_entity: string | null;
  entity_graph: Record<string, string[]>;
}

function buildFromForeignKeys(fks: ForeignKey[]): Relationship[] {
  return fks.map((fk) => ({
    source_table: fk.source_table,
    source_column: fk.source_column,
    target_table: fk.target_table,
    target_column: fk.target_column,
    type: 'foreign_key' as const,
    confidence: 1.0,
  }));
}

function inferFromNaming(
  columns: Record<string, ColumnInfo[]>,
  tableNames: Set<string>,
  existingPairs: Set<string>
): Relationship[] {
  const inferred: Relationship[] = [];

  for (const [tableName, cols] of Object.entries(columns)) {
    for (const col of cols) {
      const name = col.column_name.toLowerCase();
      if (!name.endsWith('_id') || name === 'id') continue;

      // Try to find the target table
      const prefix = name.slice(0, -3); // remove _id
      const candidates = [
        prefix + 's',        // user_id -> users
        prefix + 'es',       // process_id -> processes
        prefix,              // campaign_id -> campaign
        prefix.replace(/_/g, '') + 's', // admin_user_id -> adminusers
      ];

      for (const candidate of candidates) {
        if (tableNames.has(candidate) && candidate !== tableName) {
          const pairKey = `${tableName}.${col.column_name}->${candidate}`;
          if (!existingPairs.has(pairKey)) {
            inferred.push({
              source_table: tableName,
              source_column: col.column_name,
              target_table: candidate,
              target_column: 'id',
              type: 'inferred',
              confidence: 0.8,
            });
            existingPairs.add(pairKey);
          }
          break;
        }
      }
    }
  }

  return inferred;
}

export function detectHubEntity(relationships: Relationship[]): string | null {
  const refCounts: Record<string, number> = {};
  for (const rel of relationships) {
    refCounts[rel.target_table] = (refCounts[rel.target_table] || 0) + 1;
  }

  let maxTable: string | null = null;
  let maxCount = 0;
  for (const [table, count] of Object.entries(refCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxTable = table;
    }
  }

  return maxCount >= 2 ? maxTable : null;
}

function buildAdjacencyList(relationships: Relationship[]): Record<string, string[]> {
  const graph: Record<string, Set<string>> = {};
  for (const rel of relationships) {
    if (!graph[rel.source_table]) graph[rel.source_table] = new Set();
    if (!graph[rel.target_table]) graph[rel.target_table] = new Set();
    graph[rel.source_table].add(rel.target_table);
    graph[rel.target_table].add(rel.source_table);
  }

  const result: Record<string, string[]> = {};
  for (const [table, neighbors] of Object.entries(graph)) {
    result[table] = [...neighbors];
  }
  return result;
}

export function mapRelationships(snapshot: SchemaSnapshot): RelationshipResult {
  const tableNames = new Set(snapshot.tables.map((t) => t.table_name));

  // Explicit foreign keys
  const fkRelationships = buildFromForeignKeys(snapshot.foreign_keys);

  // Track existing pairs to avoid duplicates
  const existingPairs = new Set(
    fkRelationships.map((r) => `${r.source_table}.${r.source_column}->${r.target_table}`)
  );

  // Inferred from naming patterns
  const inferredRelationships = inferFromNaming(snapshot.columns, tableNames, existingPairs);

  const allRelationships = [...fkRelationships, ...inferredRelationships];

  return {
    relationships: allRelationships,
    hub_entity: detectHubEntity(allRelationships),
    entity_graph: buildAdjacencyList(allRelationships),
  };
}
