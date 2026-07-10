/**
 * graphService — the primitives of the Enterprise Memory Graph. Upsert nodes,
 * relate them (first-class edges), record organizational events, and traverse
 * neighborhoods. This is the platform's knowledge engine; every subsystem writes
 * identity + relationships + evidence through here so nothing reasons in
 * isolation.
 */
import { Op } from 'sequelize';
import GraphNode from '../../models/GraphNode';
import GraphEdge from '../../models/GraphEdge';
import GraphEvent from '../../models/GraphEvent';

export async function upsertNode(node_type: string, entity_id: string, label: string, metadata: any = {}, opts: { owner?: string; trust_score?: number; status?: string } = {}) {
  const [node, created] = await GraphNode.findOrCreate({
    where: { node_type, entity_id },
    defaults: { node_type, entity_id, label, metadata, owner: opts.owner ?? null, trust_score: opts.trust_score ?? 0.6, status: opts.status ?? 'active' },
  });
  if (!created) await node.update({ label, metadata, ...(opts.owner ? { owner: opts.owner } : {}), ...(opts.trust_score != null ? { trust_score: opts.trust_score } : {}), version: node.version + 1 });
  return node;
}

export async function relate(from_id: string, to_id: string, edge_type: string, opts: { strength?: number; confidence?: number; evidence?: any } = {}) {
  if (from_id === to_id) return null;
  const [edge, created] = await GraphEdge.findOrCreate({
    where: { from_id, to_id, edge_type },
    defaults: { from_id, to_id, edge_type, strength: opts.strength ?? 1, confidence: opts.confidence ?? 0.8, evidence: opts.evidence ?? [] },
  });
  if (!created && opts.evidence) await edge.update({ evidence: opts.evidence, strength: opts.strength ?? edge.strength, confidence: opts.confidence ?? edge.confidence });
  return edge;
}

export async function recordEvent(node_id: string | null, event_type: string, summary: string, actor?: string, ref?: string) {
  return GraphEvent.create({ node_id, event_type, summary, actor: actor ?? null, ref: ref ?? null });
}

export async function getNode(id: string) {
  return GraphNode.findByPk(id);
}
export async function findNode(node_type: string, entity_id: string) {
  return GraphNode.findOne({ where: { node_type, entity_id } });
}

/** A node + its immediate neighborhood (in + out edges, resolved to nodes). */
export async function neighbors(id: string) {
  const node = await GraphNode.findByPk(id);
  if (!node) throw Object.assign(new Error('Node not found'), { status: 404 });
  const edges = await GraphEdge.findAll({ where: { [Op.or]: [{ from_id: id }, { to_id: id }] }, limit: 200 });
  const otherIds = Array.from(new Set(edges.map((e) => (e.from_id === id ? e.to_id : e.from_id))));
  const others = otherIds.length ? await GraphNode.findAll({ where: { id: { [Op.in]: otherIds } } }) : [];
  const byId = new Map(others.map((n) => [n.id, n]));
  return {
    node: node.toJSON(),
    relationships: edges.map((e) => {
      const dir = e.from_id === id ? 'out' : 'in';
      const other = byId.get(dir === 'out' ? e.to_id : e.from_id);
      return { edge_type: e.edge_type, direction: dir, strength: e.strength, confidence: e.confidence, node: other ? { id: other.id, node_type: other.node_type, label: other.label, entity_id: other.entity_id } : null };
    }).filter((r) => r.node),
  };
}

export async function nodesByType(node_type: string, limit = 100) {
  const rows = await GraphNode.findAll({ where: { node_type }, order: [['updated_at', 'DESC']], limit });
  return rows.map((r) => r.toJSON());
}

export async function graphStats() {
  const nodes = await GraphNode.findAll({ attributes: ['node_type'] });
  const edges = await GraphEdge.findAll({ attributes: ['edge_type'] });
  const nodeBy: Record<string, number> = {};
  nodes.forEach((n) => { nodeBy[n.node_type] = (nodeBy[n.node_type] || 0) + 1; });
  const edgeBy: Record<string, number> = {};
  edges.forEach((e) => { edgeBy[e.edge_type] = (edgeBy[e.edge_type] || 0) + 1; });
  return { total_nodes: nodes.length, total_edges: edges.length, node_types: nodeBy, edge_types: edgeBy };
}
