import DatasetRegistry from '../../models/DatasetRegistry';

export interface EntityNode {
  id: string;
  label: string;
  row_count: number;
  column_count: number;
  is_hub: boolean;
}

export interface EntityEdge {
  source: string;
  target: string;
  type: string;
  confidence: number;
}

export interface EntityNetwork {
  nodes: EntityNode[];
  edges: EntityEdge[];
  hub_entity: string | null;
}

export async function buildEntityNetwork(): Promise<EntityNetwork> {
  const datasets = await DatasetRegistry.findAll({
    where: { status: 'active' },
    order: [['row_count', 'DESC']],
  });

  if (!datasets.length) {
    return { nodes: [], edges: [], hub_entity: null };
  }

  // Detect hub from profile_summary
  let hubEntity: string | null = null;

  const nodes: EntityNode[] = datasets.map((ds) => {
    const isHub = !!(ds.profile_summary as any)?.hub;
    if (isHub) hubEntity = ds.table_name;

    return {
      id: ds.table_name,
      label: ds.table_name,
      row_count: ds.row_count || 0,
      column_count: ds.column_count || 0,
      is_hub: isHub,
    };
  });

  // Build unique edges from stored relationships
  const edgeSet = new Set<string>();
  const edges: EntityEdge[] = [];
  const tableNames = new Set(datasets.map((d) => d.table_name));

  for (const ds of datasets) {
    const rels = (ds.relationships as any[]) || [];
    for (const rel of rels) {
      const source = rel.source_table;
      const target = rel.target_table;
      // Only include edges where both nodes are in our dataset list
      if (!tableNames.has(source) || !tableNames.has(target)) continue;

      const edgeKey = [source, target].sort().join('->');
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);

      edges.push({
        source,
        target,
        type: rel.type || 'foreign_key',
        confidence: rel.confidence || 1.0,
      });
    }
  }

  // If no hub detected from profile, use the most-referenced table
  if (!hubEntity) {
    const refCounts: Record<string, number> = {};
    for (const edge of edges) {
      refCounts[edge.target] = (refCounts[edge.target] || 0) + 1;
    }
    let maxCount = 0;
    for (const [table, count] of Object.entries(refCounts)) {
      if (count > maxCount) {
        maxCount = count;
        hubEntity = table;
      }
    }
    // Mark the hub node
    if (hubEntity) {
      const hubNode = nodes.find((n) => n.id === hubEntity);
      if (hubNode) hubNode.is_hub = true;
    }
  }

  return { nodes, edges, hub_entity: hubEntity };
}
