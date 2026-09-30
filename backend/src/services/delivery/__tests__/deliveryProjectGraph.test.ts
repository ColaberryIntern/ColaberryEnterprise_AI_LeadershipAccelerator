/**
 * Contract tests for the delivery project graph. Pure module, no database.
 */
import {
  analyzeImpact,
  findTraceabilityGaps,
  graphFromAffectedNodes,
  reachableFrom,
  type DeliveryGraph,
  type GraphNodeRef,
} from '../deliveryProjectGraph';

const n = (kind: GraphNodeRef['kind'], id: string): GraphNodeRef => ({ kind, id });

const edge = (from: GraphNodeRef, to: GraphNodeRef) => ({ from, to, relation: 'affects' });

const REQ = n('requirement', 'r1');
const STORY = n('story', 's1');
const RELEASE = n('release', 'rel1');
const ACCEPTANCE = n('client_acceptance', 'a1');
const DEPLOY = n('deployment', 'd1');

const CHAIN: DeliveryGraph = {
  nodes: [REQ, STORY, RELEASE, ACCEPTANCE, DEPLOY],
  edges: [edge(REQ, STORY), edge(STORY, RELEASE), edge(RELEASE, ACCEPTANCE), edge(RELEASE, DEPLOY)],
};

describe('reachableFrom', () => {
  it('walks the chain downstream', () => {
    const reached = reachableFrom(CHAIN, [REQ]).map((x) => x.id);
    expect(reached).toEqual(expect.arrayContaining(['s1', 'rel1', 'a1', 'd1']));
  });

  it('does not include the starting nodes', () => {
    expect(reachableFrom(CHAIN, [REQ]).map((x) => x.id)).not.toContain('r1');
  });

  it('a cycle terminates instead of hanging', () => {
    // affected_nodes is free-form data written by services; it cannot be trusted acyclic.
    const cyclic: DeliveryGraph = {
      nodes: [REQ, STORY],
      edges: [edge(REQ, STORY), edge(STORY, REQ)],
    };
    expect(reachableFrom(cyclic, [REQ]).map((x) => x.id)).toEqual(['s1']);
  });

  it('respects the depth limit', () => {
    expect(reachableFrom(CHAIN, [REQ], { maxDepth: 1 }).map((x) => x.id)).toEqual(['s1']);
  });

  it('an isolated node reaches nothing', () => {
    expect(reachableFrom(CHAIN, [n('story', 'orphan')])).toEqual([]);
  });
});

describe('analyzeImpact', () => {
  it('flags a change that reaches work the client already accepted', () => {
    // The fact that changes the conversation: this is not a draft edit any more.
    const report = analyzeImpact(CHAIN, [REQ]);
    expect(report.touchesAcceptedWork).toBe(true);
    expect(report.touchesDeployedWork).toBe(true);
  });

  it('a change touching nothing accepted or deployed says so', () => {
    const early: DeliveryGraph = { nodes: [REQ, STORY], edges: [edge(REQ, STORY)] };
    const report = analyzeImpact(early, [REQ]);
    expect(report.touchesAcceptedWork).toBe(false);
    expect(report.touchesDeployedWork).toBe(false);
  });

  it('groups affected nodes by kind for the impact report', () => {
    const report = analyzeImpact(CHAIN, [REQ]);
    expect(report.affectedByKind.story.map((x) => x.id)).toEqual(['s1']);
    expect(report.affectedByKind.client_acceptance.map((x) => x.id)).toEqual(['a1']);
  });

  it('reports truncation rather than silently under-reporting impact', () => {
    // An impact report that stopped walking reads as "nothing else is affected", which is
    // the most dangerous way to be wrong here.
    const report = analyzeImpact(CHAIN, [REQ], { maxDepth: 1 });
    expect(report.truncated).toBe(true);
  });

  it('does not claim truncation when the walk completed', () => {
    expect(analyzeImpact(CHAIN, [REQ], { maxDepth: 10 }).truncated).toBe(false);
  });
});

describe('traceability fails closed', () => {
  it('a must requirement covered by no story is a gap', () => {
    const orphan = n('requirement', 'r-orphan');
    const graph: DeliveryGraph = { nodes: [orphan], edges: [] };
    const gaps = findTraceabilityGaps(graph, {
      mustRequirements: [orphan],
      approvedDesignDecisions: [],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe('must_requirement_uncovered_by_story');
  });

  it('a covered must requirement is not a gap', () => {
    const gaps = findTraceabilityGaps(CHAIN, {
      mustRequirements: [REQ],
      approvedDesignDecisions: [],
    });
    expect(gaps).toEqual([]);
  });

  it('an approved design decision with no story is a gap', () => {
    const design = n('design_decision', 'dd1');
    const graph: DeliveryGraph = { nodes: [design], edges: [] };
    const gaps = findTraceabilityGaps(graph, {
      mustRequirements: [],
      approvedDesignDecisions: [design],
    });
    expect(gaps[0].reason).toBe('approved_design_decision_uncovered_by_story');
  });

  it('a recorded no-code rationale excuses a design decision', () => {
    const design = n('design_decision', 'dd1');
    const graph: DeliveryGraph = { nodes: [design], edges: [] };
    const gaps = findTraceabilityGaps(graph, {
      mustRequirements: [],
      approvedDesignDecisions: [design],
      noCodeRationaleFor: ['dd1'],
    });
    expect(gaps).toEqual([]);
  });

  it('reports every gap, not just the first', () => {
    const a = n('requirement', 'ra');
    const b = n('requirement', 'rb');
    const gaps = findTraceabilityGaps(
      { nodes: [a, b], edges: [] },
      { mustRequirements: [a, b], approvedDesignDecisions: [] },
    );
    expect(gaps).toHaveLength(2);
  });
});

describe('graphFromAffectedNodes tolerates malformed data', () => {
  it('builds edges from well-formed entries', () => {
    const { graph, skipped } = graphFromAffectedNodes([
      { node: REQ, affects: [{ kind: 'story', id: 's1' }] },
    ]);
    expect(skipped).toBe(0);
    expect(graph.edges).toHaveLength(1);
    expect(reachableFrom(graph, [REQ]).map((x) => x.id)).toEqual(['s1']);
  });

  it('skips a malformed target instead of throwing, and counts it', () => {
    // One bad row must degrade that row's edges, not break every impact report.
    const { graph, skipped } = graphFromAffectedNodes([
      { node: REQ, affects: [{ kind: 'story' }, null, 'nonsense', { kind: 'story', id: 's1' }] },
    ]);
    expect(skipped).toBe(3);
    expect(graph.edges).toHaveLength(1);
  });

  it('skips an entry with no usable node', () => {
    const { skipped } = graphFromAffectedNodes([{ node: { kind: 'story' } as any }]);
    expect(skipped).toBe(1);
  });

  it('a non-array affects value is treated as no edges, not an error', () => {
    const { graph } = graphFromAffectedNodes([{ node: REQ, affects: 'oops' }]);
    expect(graph.edges).toEqual([]);
    expect(graph.nodes).toHaveLength(1);
  });

  it('de-duplicates nodes appearing on both ends of edges', () => {
    const { graph } = graphFromAffectedNodes([
      { node: REQ, affects: [{ kind: 'story', id: 's1' }] },
      { node: STORY, affects: [{ kind: 'release', id: 'rel1' }] },
    ]);
    const ids = graph.nodes.map((x) => `${x.kind}:${x.id}`);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
