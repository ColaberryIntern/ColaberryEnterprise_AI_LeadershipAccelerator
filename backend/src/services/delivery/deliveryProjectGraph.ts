/**
 * deliveryProjectGraph — traversal and impact analysis over the delivery graph.
 *
 * PURE. No I/O, no model imports. Callers load the nodes they have and pass them in;
 * this module only knows about shapes. That keeps it unit-testable without a database and
 * lets the same logic run over a persisted graph or a proposed one.
 *
 * NOT A GRAPH DATABASE. Master plan §Gate 3 forbids introducing one unless repository
 * evidence proves relational modelling inadequate, and Gate 0 found no such evidence. The
 * graph is edges expressed as `affected_nodes` references plus foreign keys, walked here.
 *
 * The question this exists to answer, from master plan §5: what would this change affect?
 * A client asking "can we add X?" must get an impact answer *before* anything is built —
 * that gap between the request and the commit is the product.
 */

export type GraphNodeKind =
  | 'contract'
  | 'requirement'
  | 'architecture_decision'
  | 'design_decision'
  | 'agent_definition'
  | 'release'
  | 'story'
  | 'execution_run'
  | 'evidence'
  | 'client_acceptance'
  | 'deployment'
  | 'operational_signal'
  | 'business_outcome';

export interface GraphNodeRef {
  kind: GraphNodeKind;
  id: string;
  /** Human-readable label for the impact report. Never used for identity. */
  label?: string;
}

export interface GraphEdge {
  from: GraphNodeRef;
  to: GraphNodeRef;
  /** Why these are connected — 'covers', 'implements', 'supersedes', 'evidences'. */
  relation: string;
}

export interface DeliveryGraph {
  nodes: GraphNodeRef[];
  edges: GraphEdge[];
}

const nodeKey = (n: GraphNodeRef): string => `${n.kind}:${n.id}`;

/**
 * Everything reachable downstream of a set of nodes.
 *
 * Breadth-first with a visited set, so a cycle terminates instead of hanging. Cycles
 * should not occur in a well-formed delivery graph, but this walks data that includes
 * free-form `affected_nodes` written by services and eventually by models — neither of
 * which can be trusted to be acyclic.
 */
export function reachableFrom(
  graph: DeliveryGraph,
  start: GraphNodeRef[],
  options: { maxDepth?: number } = {},
): GraphNodeRef[] {
  const maxDepth = options.maxDepth ?? 10;
  const adjacency = new Map<string, GraphNodeRef[]>();
  for (const edge of graph.edges) {
    const key = nodeKey(edge.from);
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key)!.push(edge.to);
  }

  const visited = new Set(start.map(nodeKey));
  const result: GraphNodeRef[] = [];
  let frontier = [...start];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const next: GraphNodeRef[] = [];
    for (const node of frontier) {
      for (const neighbour of adjacency.get(nodeKey(node)) ?? []) {
        const key = nodeKey(neighbour);
        if (visited.has(key)) continue;
        visited.add(key);
        result.push(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
    depth += 1;
  }

  return result;
}

export interface ImpactReport {
  changed: GraphNodeRef[];
  affected: GraphNodeRef[];
  affectedByKind: Record<string, GraphNodeRef[]>;
  /** True when the change reaches something a client has already accepted. */
  touchesAcceptedWork: boolean;
  /** True when it reaches something already deployed. */
  touchesDeployedWork: boolean;
  /** True when the walk hit its depth limit, so the report may be incomplete. */
  truncated: boolean;
}

/**
 * What a proposed change would affect.
 *
 * `touchesAcceptedWork` and `touchesDeployedWork` are surfaced as their own flags rather
 * than left for the caller to derive from `affectedByKind`, because they are the two
 * facts that change the *conversation*: altering something a client already signed off,
 * or something already running in production, is a different request from altering a
 * draft, and the person approving it should not have to notice that for themselves.
 *
 * `truncated` matters for the same reason. An impact report that silently stopped walking
 * reads as "nothing else is affected", which is the most dangerous possible way to be
 * wrong here.
 */
export function analyzeImpact(
  graph: DeliveryGraph,
  changed: GraphNodeRef[],
  options: { maxDepth?: number } = {},
): ImpactReport {
  const maxDepth = options.maxDepth ?? 10;
  const affected = reachableFrom(graph, changed, { maxDepth });

  const affectedByKind: Record<string, GraphNodeRef[]> = {};
  for (const node of affected) {
    (affectedByKind[node.kind] ??= []).push(node);
  }

  // Re-run one level deeper: if that finds more, the report at maxDepth was incomplete.
  const deeper = reachableFrom(graph, changed, { maxDepth: maxDepth + 1 });

  return {
    changed,
    affected,
    affectedByKind,
    touchesAcceptedWork: affected.some((n) => n.kind === 'client_acceptance'),
    touchesDeployedWork: affected.some((n) => n.kind === 'deployment'),
    truncated: deeper.length > affected.length,
  };
}

export interface TraceabilityGap {
  node: GraphNodeRef;
  reason: string;
}

/**
 * Traceability, failing closed (master plan §Gate 7).
 *
 * Every `must` requirement needs a story; every approved design decision needs a story or
 * a recorded no-code rationale. A requirement covered by nothing is a promise the plan
 * does not keep, and the point of checking it here is that it is answerable
 * deterministically rather than by reading a document and hoping.
 *
 * Mirrors the reasoning in `sbp/planGate.ts`, which is pure and deterministic for exactly
 * this reason: a gate that cannot be talked out of a refusal.
 */
export function findTraceabilityGaps(
  graph: DeliveryGraph,
  input: {
    mustRequirements: GraphNodeRef[];
    approvedDesignDecisions: GraphNodeRef[];
    /** Design decisions explicitly recorded as needing no code. */
    noCodeRationaleFor?: string[];
  },
): TraceabilityGap[] {
  const gaps: TraceabilityGap[] = [];
  const noCode = new Set(input.noCodeRationaleFor ?? []);

  const reachesStory = (node: GraphNodeRef): boolean =>
    reachableFrom(graph, [node]).some((n) => n.kind === 'story');

  for (const requirement of input.mustRequirements) {
    if (!reachesStory(requirement)) {
      gaps.push({ node: requirement, reason: 'must_requirement_uncovered_by_story' });
    }
  }

  for (const decision of input.approvedDesignDecisions) {
    if (noCode.has(decision.id)) continue;
    if (!reachesStory(decision)) {
      gaps.push({ node: decision, reason: 'approved_design_decision_uncovered_by_story' });
    }
  }

  return gaps;
}

/**
 * Build a graph from `affected_nodes` payloads.
 *
 * Tolerates malformed entries by skipping them rather than throwing. These payloads are
 * written by services and will eventually be written by models; one bad row must degrade
 * that row's edges, not break every impact report for the project. Skipped entries are
 * returned so the caller can surface them rather than have them vanish.
 */
export function graphFromAffectedNodes(
  entries: Array<{ node: GraphNodeRef; affects?: unknown }>,
): { graph: DeliveryGraph; skipped: number } {
  const nodes: GraphNodeRef[] = [];
  const edges: GraphEdge[] = [];
  let skipped = 0;

  for (const entry of entries) {
    if (!entry?.node?.kind || !entry.node.id) {
      skipped += 1;
      continue;
    }
    nodes.push(entry.node);

    const affects = Array.isArray(entry.affects) ? entry.affects : [];
    for (const target of affects) {
      const t = target as Partial<GraphNodeRef>;
      if (!t || typeof t.kind !== 'string' || typeof t.id !== 'string') {
        skipped += 1;
        continue;
      }
      const to: GraphNodeRef = { kind: t.kind as GraphNodeKind, id: t.id, label: t.label };
      nodes.push(to);
      edges.push({ from: entry.node, to, relation: 'affects' });
    }
  }

  const deduped = new Map<string, GraphNodeRef>();
  for (const node of nodes) deduped.set(nodeKey(node), node);

  return { graph: { nodes: [...deduped.values()], edges }, skipped };
}
