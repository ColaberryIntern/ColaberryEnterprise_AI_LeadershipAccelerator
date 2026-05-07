/**
 * databaseSynchronizer — merges manifest-declared DB changes with declared
 * map and discovered schema into the project's database map.
 *
 * Output conforms to /system/database/database_map.schema.json (V2).
 *
 * Foundation only — discovery/introspection is stubbed.
 *
 * Contract: DATABASE_CONTRACT_V2.md
 */
import type { BuildManifest } from './buildManifestSchema';

export interface DatabaseMap {
  db_version: '2.0';
  project_id: string;
  generated_at: string;
  source: 'manifest' | 'declared' | 'discovered' | 'merged';
  tables: TableEntry[];
  orphan_tables: { name: string; schema?: string; reason: string }[];
  undocumented_tables: { name: string; schema?: string; reason: string }[];
}

export interface TableEntry {
  schema?: string;
  name: string;
  columns: { name: string; type: string; nullable?: boolean; is_pk?: boolean; is_unique?: boolean }[];
  indexes: { name: string; columns: string[]; unique?: boolean }[];
  relationships: { kind: 'fk' | 'implied'; to_table: string; to_column?: string; from_column: string }[];
  row_count_estimate?: number;
  documented?: boolean;
  consumers?: { apis: string[]; bps: string[]; frontend_components: string[] };
}

/**
 * Pure: produce a database map from manifests alone.
 *
 * Phase 3 V1: tables come from manifests' `database_changes` (create_table /
 * add_column / etc). Column-level detail is partial; richer introspection
 * deferred to V2.
 */
export function buildDatabaseMapFromManifests(
  projectId: string,
  manifests: ReadonlyArray<BuildManifest & { id: string }>,
): DatabaseMap {
  const tableMap = new Map<string, TableEntry>();
  const apisByTable = new Map<string, Set<string>>();
  const bpsByTable = new Map<string, Set<string>>();

  for (const m of manifests) {
    const bpId = m.bp_id ?? null;

    for (const change of m.database_changes || []) {
      const key = `${change.schema || 'public'}.${change.table}`;
      let entry = tableMap.get(key);
      if (!entry) {
        entry = {
          schema: change.schema || 'public',
          name: change.table,
          columns: [],
          indexes: [],
          relationships: [],
          documented: false,
        };
        tableMap.set(key, entry);
      }
      // Drops remove the table entry.
      if (change.operation === 'drop_table') {
        tableMap.delete(key);
        apisByTable.delete(key);
        bpsByTable.delete(key);
        continue;
      }
      // Other operations leave a record we can detail later from declared map.
      // For now, stamp documented=true if any manifest references the table.
      entry.documented = true;
    }

    // Track consumers (BPs + APIs that touched the table indirectly via this manifest)
    for (const change of m.database_changes || []) {
      const key = `${change.schema || 'public'}.${change.table}`;
      if (!tableMap.has(key)) continue;
      if (bpId) {
        if (!bpsByTable.has(key)) bpsByTable.set(key, new Set());
        bpsByTable.get(key)!.add(bpId);
      }
      // Each API in the same manifest is treated as a potential consumer.
      for (const api of [...(m.apis_added || []), ...(m.apis_modified || [])]) {
        const apiKey = `${api.method} ${api.path}`;
        if (!apisByTable.has(key)) apisByTable.set(key, new Set());
        apisByTable.get(key)!.add(apiKey);
      }
    }
  }

  const tables = Array.from(tableMap.entries()).map(([key, entry]): TableEntry => ({
    ...entry,
    consumers: {
      apis: Array.from(apisByTable.get(key) || []),
      bps: Array.from(bpsByTable.get(key) || []),
      frontend_components: [],   // populated by uiSynchronizer correlation in Phase 4
    },
  }));

  // Orphan detection: any table with no API/BP/frontend consumer
  const orphan_tables = tables
    .filter(t => {
      const c = t.consumers;
      return !c || (c.apis.length === 0 && c.bps.length === 0 && c.frontend_components.length === 0);
    })
    .map(t => ({ name: t.name, schema: t.schema, reason: 'no API/BP/frontend reference in any manifest' }));

  // Undocumented: phase 3 V1 considers any non-documented table undocumented.
  // The flag is set whenever a manifest references the table, so undocumented
  // here = no manifest mention.
  const undocumented_tables: { name: string; schema?: string; reason: string }[] = [];

  return {
    db_version: '2.0',
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source: 'manifest',
    tables,
    orphan_tables,
    undocumented_tables,
  };
}

/** DB-backed: load manifests + build map. */
export async function buildDatabaseMapForProject(projectId: string): Promise<DatabaseMap> {
  const { loadManifestsForProject } = await import('./telemetryIngestionService');
  const manifests = await loadManifestsForProject(projectId, { limit: 500 });
  return buildDatabaseMapFromManifests(projectId, manifests as any);
}

/** Persist a reference copy to /system/database/database_map.json. */
export async function persistReferenceCopy(map: DatabaseMap): Promise<void> {
  try {
    const path = await import('path');
    const fs = await import('fs/promises');
    const repoRoot = path.resolve(__dirname, '../../../../..');
    const target = path.join(repoRoot, 'system', 'database', 'database_map.json');
    await fs.writeFile(target, JSON.stringify(map, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[databaseSynchronizer] persistReferenceCopy failed:', err?.message);
  }
}
