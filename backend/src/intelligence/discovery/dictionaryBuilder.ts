import { inspectSchema } from './schemaInspector';
import { profileAllTables } from './dataProfiler';
import { classifyAll } from './semanticClassifier';
import { mapRelationships, Relationship } from './relationshipMapper';
import DatasetRegistry from '../../models/DatasetRegistry';
import { intelligenceProxy } from '../../services/intelligenceProxyService';

export interface DiscoveryResult {
  tables_discovered: number;
  relationships_found: number;
  hub_entity: string | null;
  duration_ms: number;
}

export async function runFullDiscovery(): Promise<DiscoveryResult> {
  const startTime = Date.now();

  // Step 1: Schema inspection
  const snapshot = await inspectSchema();

  // Step 2: Data profiling
  const baseTables = snapshot.tables
    .filter((t) => t.table_type === 'BASE TABLE')
    .map((t) => t.table_name);

  const baseColumns: Record<string, typeof snapshot.columns[string]> = {};
  for (const name of baseTables) {
    if (snapshot.columns[name]) baseColumns[name] = snapshot.columns[name];
  }

  const profiles = await profileAllTables(baseColumns, snapshot.row_counts);

  // Step 3: Semantic classification
  const semantics = classifyAll(snapshot.columns, profiles);

  // Step 4: Relationship mapping
  const relResult = mapRelationships(snapshot);

  // Step 5: Sync to DatasetRegistry
  const tablesWritten = await syncToDatasetRegistry(
    baseTables,
    snapshot,
    profiles,
    semantics,
    relResult.relationships,
    relResult.hub_entity
  );

  // Step 6: Fire-and-forget Python discovery to keep data_dictionary.json updated
  intelligenceProxy.runDiscovery().catch(() => {});

  // Step 7: Trigger embedding pipeline to populate vector store
  intelligenceProxy.embedPipeline().catch(() => {});

  return {
    tables_discovered: tablesWritten,
    relationships_found: relResult.relationships.length,
    hub_entity: relResult.hub_entity,
    duration_ms: Date.now() - startTime,
  };
}

async function syncToDatasetRegistry(
  tableNames: string[],
  snapshot: ReturnType<typeof inspectSchema> extends Promise<infer T> ? T : never,
  profiles: Record<string, { row_count: number; columns: Record<string, any> }>,
  semantics: Record<string, Record<string, string>>,
  relationships: Relationship[],
  hubEntity: string | null
): Promise<number> {
  let written = 0;

  for (const tableName of tableNames) {
    const cols = snapshot.columns[tableName] || [];
    const rowCount = snapshot.row_counts[tableName] || 0;
    const tableRelationships = relationships.filter(
      (r) => r.source_table === tableName || r.target_table === tableName
    );
    const tableSemantics = semantics[tableName] || {};
    const tableProfile = profiles[tableName]?.columns || {};

    try {
      await DatasetRegistry.upsert({
        table_name: tableName,
        schema_name: 'public',
        column_count: cols.length,
        row_count: rowCount,
        semantic_types: tableSemantics,
        relationships: tableRelationships.map((r) => ({
          source_table: r.source_table,
          source_column: r.source_column,
          target_table: r.target_table,
          target_column: r.target_column,
          type: r.type,
          confidence: r.confidence,
        })),
        profile_summary: {
          hub: tableName === hubEntity,
          column_profiles: Object.entries(tableProfile).reduce(
            (acc, [col, profile]) => {
              acc[col] = {
                null_rate: profile.null_rate,
                distinct_count: profile.distinct_count,
                cardinality: profile.cardinality,
              };
              return acc;
            },
            {} as Record<string, any>
          ),
        },
        status: 'active',
        last_scanned: new Date(),
      });
      written++;
    } catch {
      // Skip tables that fail to upsert (e.g., name conflicts)
    }
  }

  return written;
}
