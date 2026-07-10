/**
 * searchService — one global search over the Memory Graph. Natural-language,
 * relationship-aware: it maps a query to a node-type intent + keyword, searches
 * labels + metadata, and returns each hit with its connection count (so results
 * are relationships, not rows). v1 uses keyword + canned intents; embeddings-
 * based semantic ranking is a documented follow-on.
 */
import { Op } from 'sequelize';
import GraphNode from '../../models/GraphNode';
import GraphEdge from '../../models/GraphEdge';

const TYPE_HINTS: Array<[RegExp, string]> = [
  [/student|learner|architect[- ]?ready|at[- ]?risk/, 'Student'],
  [/curriculum|blueprint|week/, 'Curriculum'],
  [/component|prompt lab|activity|video/, 'Component'],
  [/recommendation|recommend/, 'Recommendation'],
  [/meeting|standup|anthropic/, 'Meeting'],
  [/artifact|portfolio/, 'Artifact'],
  [/employee|director|chief|marketing|research/, 'AIEmployee'],
  [/card|timeline/, 'TimelineCard'],
];

function intent(q: string): { node_type?: string; keyword: string } {
  const s = q.toLowerCase();
  const hit = TYPE_HINTS.find(([re]) => re.test(s));
  // strip type/intent words to leave a keyword
  const keyword = s.replace(/show|find|which|list|students?|curriculum|components?|recommendations?|meetings?|artifacts?|employees?|directors?|ready|for|the|every|without|mentioning|discussing|by|generated|projects?/g, '').trim();
  return { node_type: hit?.[1], keyword };
}

export async function globalSearch(q: string) {
  const query = (q || '').trim();
  if (!query) return { query, count: 0, results: [], interpreted: null };
  const { node_type, keyword } = intent(query);

  const where: any = {};
  if (node_type) where.node_type = node_type;
  if (keyword.length >= 2) where.label = { [Op.iLike]: `%${keyword}%` };
  else if (!node_type) where.label = { [Op.iLike]: `%${query}%` };

  const nodes = await GraphNode.findAll({ where, order: [['trust_score', 'DESC']], limit: 40 });
  const ids = nodes.map((n) => n.id);
  const edges = ids.length ? await GraphEdge.findAll({ where: { [Op.or]: [{ from_id: { [Op.in]: ids } }, { to_id: { [Op.in]: ids } }] } }) : [];
  const degree = new Map<string, number>();
  edges.forEach((e) => { degree.set(e.from_id, (degree.get(e.from_id) || 0) + 1); degree.set(e.to_id, (degree.get(e.to_id) || 0) + 1); });

  const results = nodes.map((n) => ({ id: n.id, node_type: n.node_type, label: n.label, trust: Math.round(n.trust_score * 100) / 100, connections: degree.get(n.id) || 0, metadata: n.metadata }))
    .sort((a, b) => b.connections - a.connections);
  return { query, interpreted: { node_type: node_type || 'any', keyword }, count: results.length, results };
}
