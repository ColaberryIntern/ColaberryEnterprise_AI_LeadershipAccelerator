/**
 * reasoningService — the shared reasoning engine. AI Directors reason over the
 * connected Memory Graph (recommendations, their evidence, the students +
 * curriculum they touch) rather than isolated SQL. Every recommendation can
 * explain itself by walking its evidence edges. This is the service every module
 * uses so intelligence is never duplicated.
 */
import { Op } from 'sequelize';
import GraphNode from '../../models/GraphNode';
import { neighbors } from './graphService';
import { findEmployee } from '../workforce/orgRegistry';

/** A domain's reasoning: its recommendations + the graph context behind each. */
export async function reason(domain: string) {
  const recNodes = await GraphNode.findAll({ where: { node_type: 'Recommendation', owner: domain }, order: [['trust_score', 'DESC']], limit: 20 });
  const director = findEmployee(domain);
  const recommendations = [];
  for (const rn of recNodes) {
    const hood = await neighbors(rn.id);
    const gen = hood.relationships.find((r) => r.edge_type === 'GENERATED_BY');
    recommendations.push({
      id: rn.id, title: rn.label, trust: Math.round(rn.trust_score * 100) / 100, metadata: rn.metadata,
      generated_by: gen?.node?.label || director?.name || domain,
      evidence_path: hood.relationships.map((r) => `${r.direction === 'out' ? '→' : '←'} ${r.edge_type} ${r.node?.node_type}:${r.node?.label}`),
    });
  }
  return { domain, director: director ? { slug: director.slug, name: director.name, role: director.role } : null, reasoned_over: 'memory_graph', recommendations };
}

/** Explain any node by walking its neighborhood — self-explaining intelligence. */
export async function explainNode(id: string) {
  const hood = await neighbors(id);
  const outs = hood.relationships.filter((r) => r.direction === 'out');
  const ins = hood.relationships.filter((r) => r.direction === 'in');
  const lines = [
    ...outs.map((r) => `This ${hood.node.node_type} ${r.edge_type} ${r.node?.node_type} "${r.node?.label}".`),
    ...ins.map((r) => `${r.node?.node_type} "${r.node?.label}" ${r.edge_type} this ${hood.node.node_type}.`),
  ];
  return { node: hood.node, explanation: lines, connections: hood.relationships.length, relationships: hood.relationships };
}
