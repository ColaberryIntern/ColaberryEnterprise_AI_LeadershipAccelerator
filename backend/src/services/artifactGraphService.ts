import { ArtifactDefinition, ArtifactRelationship } from '../models';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// 1. Relationship CRUD
// ---------------------------------------------------------------------------

export async function addRelationship(
  parentId: string,
  childId: string,
  type: string,
  metadata?: Record<string, any>
): Promise<ArtifactRelationship> {
  // Validate both artifacts exist
  const [parent, child] = await Promise.all([
    ArtifactDefinition.findByPk(parentId),
    ArtifactDefinition.findByPk(childId),
  ]);
  if (!parent) throw new Error(`Parent artifact ${parentId} not found`);
  if (!child) throw new Error(`Child artifact ${childId} not found`);
  if (parentId === childId) throw new Error('Cannot create self-referencing relationship');

  // Cycle detection: walk from parent upward — if we reach child, adding this edge creates a cycle
  const hasCycle = await detectCycle(childId, parentId);
  if (hasCycle) throw new Error('Adding this relationship would create a cycle');

  return ArtifactRelationship.create({
    parent_artifact_id: parentId,
    child_artifact_id: childId,
    relationship_type: type,
    metadata,
  });
}

export async function removeRelationship(id: string): Promise<boolean> {
  const deleted = await ArtifactRelationship.destroy({ where: { id } });
  return deleted > 0;
}

// ---------------------------------------------------------------------------
// 2. Graph Queries
// ---------------------------------------------------------------------------

export async function getParents(artifactId: string): Promise<ArtifactDefinition[]> {
  const edges = await ArtifactRelationship.findAll({
    where: { child_artifact_id: artifactId },
    include: [{ model: ArtifactDefinition, as: 'parentArtifact' }],
  });
  return edges.map((e: any) => e.parentArtifact).filter(Boolean);
}

export async function getChildren(artifactId: string): Promise<ArtifactDefinition[]> {
  const edges = await ArtifactRelationship.findAll({
    where: { parent_artifact_id: artifactId },
    include: [{ model: ArtifactDefinition, as: 'childArtifact' }],
  });
  return edges.map((e: any) => e.childArtifact).filter(Boolean);
}

export async function getFullGraph(programId?: string): Promise<{
  nodes: ArtifactDefinition[];
  edges: ArtifactRelationship[];
}> {
  // Get all artifact definitions, optionally filtered by program
  const where: any = {};
  // ArtifactDefinition doesn't have a direct program_id — filter via session/section if needed
  // For now return all; programId filtering can be added later via joins

  const nodes = await ArtifactDefinition.findAll({ where, order: [['sort_order', 'ASC']] });
  const nodeIds = nodes.map((n) => n.id);

  const edges = await ArtifactRelationship.findAll({
    where: {
      [Op.or]: [
        { parent_artifact_id: { [Op.in]: nodeIds } },
        { child_artifact_id: { [Op.in]: nodeIds } },
      ],
    },
  });

  return { nodes, edges };
}

export async function getFoundationArtifacts(programId?: string): Promise<ArtifactDefinition[]> {
  // Foundation artifacts = those that have no parents (roots of the graph)
  const allEdges = await ArtifactRelationship.findAll({
    attributes: ['child_artifact_id'],
  });
  const childIds = new Set(allEdges.map((e) => e.child_artifact_id));

  const allArtifacts = await ArtifactDefinition.findAll({
    order: [['sort_order', 'ASC']],
  });

  return allArtifacts.filter((a) => !childIds.has(a.id));
}

export async function getAncestorChain(artifactId: string): Promise<ArtifactDefinition[]> {
  return bfsTraversal(artifactId, 'up');
}

export async function getDependencyTree(artifactId: string): Promise<ArtifactDefinition[]> {
  return bfsTraversal(artifactId, 'down');
}

// ---------------------------------------------------------------------------
// 3. Cycle Detection
// ---------------------------------------------------------------------------

async function detectCycle(fromId: string, toId: string): Promise<boolean> {
  // BFS from fromId following parent edges upward. If we reach toId, there's a cycle.
  const visited = new Set<string>();
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const parentEdges = await ArtifactRelationship.findAll({
      where: { child_artifact_id: current },
      attributes: ['parent_artifact_id'],
    });
    for (const edge of parentEdges) {
      if (!visited.has(edge.parent_artifact_id)) {
        queue.push(edge.parent_artifact_id);
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 4. BFS Traversal Helper
// ---------------------------------------------------------------------------

async function bfsTraversal(
  startId: string,
  direction: 'up' | 'down'
): Promise<ArtifactDefinition[]> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current !== startId) result.push(current);

    const edges = await ArtifactRelationship.findAll({
      where: direction === 'up'
        ? { child_artifact_id: current }
        : { parent_artifact_id: current },
      attributes: [direction === 'up' ? 'parent_artifact_id' : 'child_artifact_id'],
    });

    for (const edge of edges) {
      const nextId = direction === 'up' ? edge.parent_artifact_id : edge.child_artifact_id;
      if (!visited.has(nextId)) queue.push(nextId);
    }
  }

  if (result.length === 0) return [];
  return ArtifactDefinition.findAll({
    where: { id: { [Op.in]: result } },
    order: [['sort_order', 'ASC']],
  });
}
