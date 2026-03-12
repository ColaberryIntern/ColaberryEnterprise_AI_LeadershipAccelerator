// ─── Cory Knowledge Graph Service ──────────────────────────────────────────
// Central graph interface used by Cory and all Reporting agents.
// Promotes the in-memory KnowledgeGraph to persistent DB storage while
// maintaining fast in-memory lookups via the existing KnowledgeGraph class.

import { KnowledgeNode, KnowledgeEdge, AiAgent, Campaign, Lead, Cohort, Enrollment } from '../../models';
import { KnowledgeGraph, KGNode, KGEdge } from '../../intelligence/knowledge/knowledgeGraph';
import type { KnowledgeNodeType } from '../../models/KnowledgeNode';
import { Op } from 'sequelize';

// ─── In-Memory Cache ──────────────────────────────────────────────────────

let cachedGraph: KnowledgeGraph | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function isCacheValid(): boolean {
  return cachedGraph !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

export function invalidateGraphCache(): void {
  cachedGraph = null;
  cacheTimestamp = 0;
}

// ─── Graph Building ───────────────────────────────────────────────────────

export async function buildGraph(): Promise<{ nodes_created: number; edges_created: number }> {
  let nodesCreated = 0;
  let edgesCreated = 0;

  // 1. Gather all system entities
  const [campaigns, leads, agents, cohorts, enrollments] = await Promise.all([
    Campaign.findAll({ attributes: ['id', 'name', 'campaign_type', 'status'], raw: true }),
    Lead.findAll({ attributes: ['id', 'name', 'email', 'company', 'pipeline_stage'], raw: true }),
    AiAgent.findAll({ attributes: ['id', 'agent_name', 'category', 'status'], where: { enabled: true }, raw: true }),
    Cohort.findAll({ attributes: ['id', 'name', 'status'], raw: true }),
    Enrollment.findAll({ attributes: ['id', 'lead_id', 'cohort_id', 'status'], raw: true }),
  ]);

  // 2. Upsert nodes
  const nodeSpecs: Array<{ node_type: string; entity_id: string; entity_name: string; department?: string; metadata?: Record<string, any> }> = [];

  for (const c of campaigns) {
    nodeSpecs.push({ node_type: 'campaign', entity_id: String((c as any).id), entity_name: (c as any).name || 'Unnamed Campaign', metadata: { campaign_type: (c as any).campaign_type, status: (c as any).status } });
  }
  for (const l of leads) {
    nodeSpecs.push({ node_type: 'lead', entity_id: String((l as any).id), entity_name: (l as any).name || (l as any).email || 'Unknown Lead', metadata: { company: (l as any).company, pipeline_stage: (l as any).pipeline_stage } });
  }
  for (const a of agents) {
    nodeSpecs.push({ node_type: 'agent', entity_id: String((a as any).id), entity_name: (a as any).agent_name, department: (a as any).category, metadata: { status: (a as any).status } });
  }
  for (const co of cohorts) {
    nodeSpecs.push({ node_type: 'cohort', entity_id: String((co as any).id), entity_name: (co as any).name || 'Unnamed Cohort', metadata: { status: (co as any).status } });
  }

  // System-level nodes
  nodeSpecs.push({ node_type: 'department', entity_id: 'system', entity_name: 'System', metadata: {} });

  for (const spec of nodeSpecs) {
    const [, created] = await KnowledgeNode.findOrCreate({
      where: { node_type: spec.node_type, entity_id: spec.entity_id },
      defaults: { ...spec, node_type: spec.node_type as KnowledgeNodeType },
    });
    if (created) nodesCreated++;
  }

  // 3. Build edges from enrollments (lead → cohort)
  for (const e of enrollments) {
    const leadNodeId = await getNodeId('lead', String((e as any).lead_id));
    const cohortNodeId = await getNodeId('cohort', String((e as any).cohort_id));
    if (leadNodeId && cohortNodeId) {
      const [, created] = await KnowledgeEdge.findOrCreate({
        where: { source_node_id: leadNodeId, target_node_id: cohortNodeId, relationship_type: 'enrolled_in' },
        defaults: { source_node_id: leadNodeId, target_node_id: cohortNodeId, relationship_type: 'enrolled_in', weight: 1.0, confidence: 1.0 },
      });
      if (created) edgesCreated++;
    }
  }

  // Rebuild in-memory cache
  invalidateGraphCache();
  await getGraph();

  return { nodes_created: nodesCreated, edges_created: edgesCreated };
}

async function getNodeId(nodeType: string, entityId: string): Promise<string | null> {
  const node = await KnowledgeNode.findOne({ where: { node_type: nodeType, entity_id: entityId }, attributes: ['id'] });
  return node ? node.id : null;
}

// ─── Graph Retrieval ──────────────────────────────────────────────────────

export async function getGraph(): Promise<KnowledgeGraph> {
  if (isCacheValid() && cachedGraph) return cachedGraph;

  const graph = new KnowledgeGraph();
  const [nodes, edges] = await Promise.all([
    KnowledgeNode.findAll({ raw: true }),
    KnowledgeEdge.findAll({ raw: true }),
  ]);

  for (const n of nodes) {
    graph.addNode({
      id: (n as any).id,
      type: 'entity',
      label: (n as any).entity_name,
      metadata: { node_type: (n as any).node_type, entity_id: (n as any).entity_id, department: (n as any).department, ...(n as any).metadata },
    });
  }

  for (const e of edges) {
    graph.addEdge({
      source: (e as any).source_node_id,
      target: (e as any).target_node_id,
      relationship: (e as any).relationship_type,
      weight: (e as any).weight || 1.0,
    });
  }

  cachedGraph = graph;
  cacheTimestamp = Date.now();
  return graph;
}

// ─── Query Functions ──────────────────────────────────────────────────────

export async function getNodeWithRelationships(nodeType: string, entityId: string): Promise<{ node: any; related: any[] } | null> {
  const node = await KnowledgeNode.findOne({ where: { node_type: nodeType, entity_id: entityId } });
  if (!node) return null;

  const graph = await getGraph();
  const related = graph.getRelated(node.id, 2);
  return { node, related };
}

export async function traverseRelationships(nodeId: string, depth = 2): Promise<KGNode[]> {
  const graph = await getGraph();
  return graph.getRelated(nodeId, depth);
}

export async function findPath(fromNodeId: string, toNodeId: string): Promise<KGEdge[]> {
  const graph = await getGraph();
  return graph.getPath(fromNodeId, toNodeId);
}

export async function traceImpact(nodeId: string): Promise<{ affected: KGNode[]; edges: KGEdge[] }> {
  const graph = await getGraph();
  return graph.traceImpact(nodeId);
}

export async function getGraphStats(): Promise<{ total_nodes: number; total_edges: number; node_types: Record<string, number> }> {
  const nodes = await KnowledgeNode.findAll({ attributes: ['node_type'], raw: true });
  const edgeCount = await KnowledgeEdge.count();

  const typeCounts: Record<string, number> = {};
  for (const n of nodes) {
    const t = (n as any).node_type;
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  return { total_nodes: nodes.length, total_edges: edgeCount, node_types: typeCounts };
}
