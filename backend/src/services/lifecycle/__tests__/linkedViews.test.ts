import {
  SPEC_NAMED_VIEW_KINDS,
  VIEW_KINDS,
  COLLECTIONS_NOT_SHOWN,
  viewKindFor,
  unboundCollections,
  roleOfAssignmentId,
  connectedRecords,
  type ViewKind,
} from '../linkedViews';
import { diffableCollections } from '../blueprintRevisionDiff';
import { emptyRefs } from '../adapters/manifestRefs';
import { isKnownDeliveryRole, ALL_DELIVERY_ROLES } from '../../../modules/delivery/deliveryRoles';
import { factoryToManifestRefs } from '../adapters/factoryAdapter';
import { sbpToManifestRefs } from '../adapters/sbpAdapter';

const base = () => emptyRefs('sbp', 'p-1') as unknown as Record<string, any>;
const pinned = (id: string) => ({ id, revision: 1, source: 't' });

const setPath = (obj: Record<string, any>, path: string, value: unknown): void => {
  const [head, tail] = path.split('.');
  if (tail === undefined) { obj[head] = value; return; }
  obj[head][tail] = value;
};

const ROLE = ALL_DELIVERY_ROLES[0];

describe('the six view kinds are asserted BOTH WAYS', () => {
  // Deriving the set from the registry under test alone catches a seventh kind appearing and
  // NOT a sixth going missing. The spec's own sentence is the other side of the assertion.

  it('every kind the spec names is in the registry', () => {
    const missing = SPEC_NAMED_VIEW_KINDS.filter(
      (k) => !Object.prototype.hasOwnProperty.call(VIEW_KINDS, k),
    );
    expect(missing).toEqual([]);
    expect(SPEC_NAMED_VIEW_KINDS.length).toBe(6);
  });

  it('every kind in the registry is one the spec names', () => {
    const extra = Object.keys(VIEW_KINDS).filter(
      (k) => !(SPEC_NAMED_VIEW_KINDS as readonly string[]).includes(k),
    );
    expect(extra).toEqual([]);
  });

  it('names the six as a LIST, so a substitution is visible and not just a count', () => {
    expect([...SPEC_NAMED_VIEW_KINDS]).toEqual([
      'requirements', 'workflow', 'allocation', 'workspaces', 'controls', 'design',
    ]);
  });
});

describe('every collection in the ref vocabulary is bound to a view or excluded WITH A REASON', () => {
  it('leaves nothing unbound', () => {
    // A collection bound to neither is a record no screen in the product can show. Nothing
    // behavioural would catch that — the view would simply never mention it.
    expect(unboundCollections()).toEqual([]);
    // Non-vacuity: an empty keyspace would make the filter above pass trivially.
    expect(diffableCollections().length).toBe(12);
  });

  it('accounts for all 12 collections exactly once', () => {
    const bound = Object.values(VIEW_KINDS).flat();
    const excluded = Object.keys(COLLECTIONS_NOT_SHOWN);
    const all = [...bound, ...excluded].slice().sort();
    expect(all).toEqual(diffableCollections().slice().sort());
    // Each appears once: a collection shown by two views would be double-counted above and the
    // lengths would disagree even though the sorted sets matched.
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every exclusion a non-empty reason', () => {
    const silent = Object.entries(COLLECTIONS_NOT_SHOWN)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([c]) => c);
    expect(silent).toEqual([]);
    expect(Object.keys(COLLECTIONS_NOT_SHOWN)).toEqual([
      'downstream', 'trackMappings.proposalSections', 'trackMappings.solutionStories',
    ]);
  });

  it('maps each collection to exactly the view that claims it', () => {
    expect(viewKindFor('sources')).toBe('requirements');
    expect(viewKindFor('businessTasks')).toBe('workflow');
    expect(viewKindFor('agents.builder')).toBe('allocation');
    expect(viewKindFor('downstream')).toBeNull();
    expect(viewKindFor('not_a_collection')).toBeNull();
  });
});

describe('selecting a record of EACH kind returns that kind’s real outcome', () => {
  // One case per view kind, as the spec requires — but asserting what the manifest can ACTUALLY
  // answer. Only two of the six have an edge to traverse, so four must return the explicit
  // no-edge state. Writing six "connections appear" tests would have required inventing edges.

  const EXPECTED: Record<ViewKind, 'connections' | 'no_edge_recorded'> = {
    requirements: 'connections',
    allocation: 'connections',
    workflow: 'no_edge_recorded',
    workspaces: 'no_edge_recorded',
    controls: 'no_edge_recorded',
    design: 'no_edge_recorded',
  };

  /** A manifest holding one entity of the given kind, plus the edges that kind can have. */
  const manifestWithOne = (kind: ViewKind): { refs: Record<string, any>; id: string } => {
    const refs = base();
    const collection = VIEW_KINDS[kind][0];
    const id = kind === 'allocation' ? `${ROLE}:Approve the thing` : `${kind}-1`;
    setPath(refs, collection, [pinned(id)]);
    if (kind === 'requirements') {
      refs.trackMappings.proposalSections = [{ canonicalReqId: id, sectionRef: 'L.3.1' }];
    }
    return { refs, id };
  };

  it('returns the expected outcome for every one of the six, naming any that differ', () => {
    const wrong: string[] = [];
    for (const kind of SPEC_NAMED_VIEW_KINDS) {
      const { refs, id } = manifestWithOne(kind);
      const out = connectedRecords(refs, id, isKnownDeliveryRole);
      const got = out.groups.length > 0 ? 'connections' : out.unlinked?.kind;
      if (out.entity?.viewKind !== kind || got !== EXPECTED[kind]) {
        wrong.push(`${kind}: entity=${out.entity?.viewKind} outcome=${got}`);
      }
    }
    // Named, not counted: which kind broke is the only useful output.
    expect(wrong).toEqual([]);
    expect(Object.keys(EXPECTED).length).toBe(6);
  });

  it('a requirement reveals its proposal section', () => {
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.trackMappings.proposalSections = [
      { canonicalReqId: 'REQ-1', sectionRef: 'L.3.1' },
      { canonicalReqId: 'REQ-2', sectionRef: 'M.1' },
    ];
    const out = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole);
    const g = out.groups.find((x) => x.via === 'track_proposal_section')!;
    expect(g.ids).toEqual(['L.3.1']);
    // Scoped to the selected requirement, not every mapping in the project.
    expect(g.ids).not.toContain('M.1');
    expect(out.unlinked).toBeNull();
  });

  it('a requirement reveals its downstream story', () => {
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.downstream = [pinned('STORY-7'), pinned('REL-1')];
    refs.trackMappings.solutionStories = [{ canonicalReqId: 'REQ-1', storyId: 'STORY-7' }];
    const g = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole)
      .groups.find((x) => x.via === 'track_solution_story')!;
    expect(g.ids).toEqual(['STORY-7']);
  });

  it('DROPS a mapping that points at a story this blueprint does not contain', () => {
    // A dangling edge would send a reviewer looking for a record that is not there.
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.downstream = [];
    refs.trackMappings.solutionStories = [{ canonicalReqId: 'REQ-1', storyId: 'STORY-GONE' }];
    const out = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole);
    expect(out.groups).toEqual([]);
    expect(out.unlinked!.kind).toBe('no_edge_recorded');
  });

  it('does NOT fabricate a section from a mapping with no sectionRef', () => {
    // `String(undefined)` is the string 'undefined', so this used to report a proposal section
    // literally called "undefined". One malformed mapping was enough; nothing had to agree with
    // it. A fabricated edge is worse than a missing one because a reviewer acts on it.
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.trackMappings.proposalSections = [
      { canonicalReqId: 'REQ-1' },
      { canonicalReqId: 'REQ-1', sectionRef: 'L.3.1' },
    ];
    const out = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole);
    const g = out.groups.find((x) => x.via === 'track_proposal_section')!;
    // The good one survives; the malformed one is dropped rather than renamed.
    expect(g.ids).toEqual(['L.3.1']);
    expect(JSON.stringify(out)).not.toContain('undefined');
  });

  it('does NOT fabricate a story edge when BOTH sides are malformed', () => {
    // The two-sided case: a mapping with no storyId and a downstream ref with no id both
    // stringified to 'undefined' and therefore matched each other.
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.downstream = [{ revision: 1, source: 't' }];
    refs.trackMappings.solutionStories = [{ canonicalReqId: 'REQ-1' }];
    const out = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole);
    expect(out.groups).toEqual([]);
    expect(out.unlinked!.kind).toBe('no_edge_recorded');
  });

  it('drops an EMPTY-STRING target, which is as fabricated as an undefined one', () => {
    // Mutation M15 survived without this: allowing '' let a mapping with `sectionRef: ''` report
    // a proposal section whose id is the empty string. A reviewer would see a connection to a
    // record with no name - a fabricated edge wearing different clothes.
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.trackMappings.proposalSections = [
      { canonicalReqId: 'REQ-1', sectionRef: '' },
      { canonicalReqId: 'REQ-1', sectionRef: 'L.3.1' },
    ];
    const g = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole)
      .groups.find((x) => x.via === 'track_proposal_section')!;
    expect(g.ids).toEqual(['L.3.1']);
  });

  it('drops an empty-string story id on BOTH sides of the join', () => {
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.downstream = [{ id: '', revision: 1, source: 't' }];
    refs.trackMappings.solutionStories = [{ canonicalReqId: 'REQ-1', storyId: '' }];
    const out = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole);
    expect(out.groups).toEqual([]);
    expect(out.unlinked!.kind).toBe('no_edge_recorded');
  });

  it('drops a non-string id rather than coercing it into one', () => {
    // A number or object id would stringify to something that can collide with a real id.
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.downstream = [{ id: 42, revision: 1, source: 't' }];
    refs.trackMappings.solutionStories = [{ canonicalReqId: 'REQ-1', storyId: 42 }];
    expect(connectedRecords(refs, 'REQ-1', isKnownDeliveryRole).groups).toEqual([]);
  });

  it('still joins a legitimate story edge, so the guards are not blanket refusals', () => {
    const refs = base();
    refs.sources = [pinned('REQ-1')];
    refs.downstream = [pinned('STORY-7')];
    refs.trackMappings.solutionStories = [{ canonicalReqId: 'REQ-1', storyId: 'STORY-7' }];
    const g = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole)
      .groups.find((x) => x.via === 'track_solution_story')!;
    expect(g.ids).toEqual(['STORY-7']);
  });

  it('an assignment reveals the role in its composite id', () => {
    const refs = base();
    refs.assignments = [pinned(`${ROLE}:Approve the release`)];
    const g = connectedRecords(refs, `${ROLE}:Approve the release`, isKnownDeliveryRole)
      .groups.find((x) => x.via === 'assignment_role')!;
    expect(g.ids).toEqual([ROLE]);
  });
});

describe('the role prefix is VALIDATED, not merely split off', () => {
  it('accepts a known role', () => {
    expect(roleOfAssignmentId(`${ROLE}:Do the thing`, isKnownDeliveryRole)).toBe(ROLE);
  });

  it('refuses an unknown prefix rather than inventing a role', () => {
    // An unvalidated split turns any id containing a colon into a fabricated role link, and the
    // responsibility half is free text that frequently contains one.
    expect(roleOfAssignmentId('NOT_A_ROLE:Do the thing', isKnownDeliveryRole)).toBeNull();
    expect(roleOfAssignmentId('ns:NOT_A_ROLE:Do the thing', isKnownDeliveryRole)).toBeNull();
  });

  it('keeps only the FIRST segment, so a colon in the responsibility is harmless', () => {
    expect(roleOfAssignmentId(`${ROLE}:Approve: then sign`, isKnownDeliveryRole)).toBe(ROLE);
  });

  it('refuses an id with no colon or a leading colon', () => {
    expect(roleOfAssignmentId(ROLE, isKnownDeliveryRole)).toBeNull();
    expect(roleOfAssignmentId(`:${ROLE}`, isKnownDeliveryRole)).toBeNull();
  });

  it('is not vacuous: the role fixture is a role the registry really knows', () => {
    expect(isKnownDeliveryRole(ROLE)).toBe(true);
    expect(isKnownDeliveryRole('NOT_A_ROLE')).toBe(false);
  });
});

describe('the NEGATIVE CONTROL: nothing is never a bare empty list', () => {
  it('an entity absent from the manifest says so, and is not reported as unconnected', () => {
    // Different findings: "we have no such record" versus "that record stands alone".
    const out = connectedRecords(base(), 'nope-1', isKnownDeliveryRole);
    expect(out.entity).toBeNull();
    expect(out.unlinked!.kind).toBe('entity_not_in_manifest');
    expect(out.unlinked!.detail).toContain('nope-1');
  });

  it('does NOT resolve a prefix: REQ-10 is not an answer for REQ-1', () => {
    // Matching by prefix survived a mutation here. It would hand a reviewer a different
    // record's connections under the id they selected, which is worse than finding nothing.
    const refs = base();
    refs.sources = [pinned('REQ-10'), pinned('REQ-1-SUFFIX')];
    const out = connectedRecords(refs, 'REQ-1', isKnownDeliveryRole);
    expect(out.entity).toBeNull();
    expect(out.unlinked!.kind).toBe('entity_not_in_manifest');
    // Control: the exact id DOES resolve, so the assertion above is about prefixes and not
    // about the lookup being broken outright.
    expect(connectedRecords(refs, 'REQ-10', isKnownDeliveryRole).entity).toEqual({
      id: 'REQ-10', viewKind: 'requirements', collection: 'sources',
    });
  });

  it('refuses a leading-colon assignment id through VALIDATION, not an index bound', () => {
    const refs = base();
    refs.assignments = [pinned(`:${ROLE}`)];
    const out = connectedRecords(refs, `:${ROLE}`, isKnownDeliveryRole);
    expect(out.groups).toEqual([]);
    expect(out.unlinked!.kind).toBe('no_edge_recorded');
  });

  it('a present entity with no edges NAMES the cause and the edges that do exist', () => {
    const refs = base();
    refs.processes = [pinned('PROC-1')];
    const out = connectedRecords(refs, 'PROC-1', isKnownDeliveryRole);
    expect(out.entity).toEqual({ id: 'PROC-1', viewKind: 'workflow', collection: 'processes' });
    expect(out.groups).toEqual([]);
    expect(out.unlinked!.kind).toBe('no_edge_recorded');
    expect(out.unlinked!.detail).toContain('requirement-to-proposal-section');
  });

  it('a record found only in an EXCLUDED collection is not labelled with a view', () => {
    // A downstream story is a real record with no view of its own. Giving it one would put it on
    // a screen that claims to show business records.
    const refs = base();
    refs.downstream = [pinned('STORY-9')];
    const out = connectedRecords(refs, 'STORY-9', isKnownDeliveryRole);
    expect(out.entity).toBeNull();
    expect(out.unlinked!.kind).toBe('entity_not_in_manifest');
  });

  it('a malformed refs payload is handled as absent, not as a crash', () => {
    for (const bad of [null, undefined, 'nope', 42, [], { sources: 'not-an-array' }]) {
      const out = connectedRecords(bad, 'x', isKnownDeliveryRole);
      expect(out.entity).toBeNull();
      expect(out.unlinked!.kind).toBe('entity_not_in_manifest');
    }
  });
});

describe('WHICH COLLECTIONS ANY ADAPTER ACTUALLY WRITES, measured from the real adapters', () => {
  // Three of the six views are bound to collections nothing populates yet. That is a MEASUREMENT
  // gap, not an empty project, and the difference matters to a reviewer. Measured by running the
  // real adapters rather than asserted from memory, so the day an adapter starts writing
  // `surfaces` this test changes and the claim above gets revisited.

  const populated = (refs: unknown): string[] => diffableCollections().filter((path) => {
    const [head, tail] = path.split('.');
    const top = (refs as any)?.[head];
    const v = tail === undefined ? top : top?.[tail];
    return Array.isArray(v) && v.length > 0;
  });

  it('the factory adapter populates exactly this set of collections', () => {
    const refs = factoryToManifestRefs({
      deliveryProjectId: 'p-1',
      documentVersion: 3,
      requirements: [{ canonical_req_id: 'REQ-1' }],
      processes: [{ id: 'PROC-1' }],
      tasks: [{ id: 'TASK-1' }],
      assignments: [{ role_id: ROLE, responsibility: 'Approve' }],
      runtimeAgentIds: ['agent-r'],
      builderAgentIds: ['agent-b'],
      proposalSections: [{ canonical_req_id: 'REQ-1', proposal_section_ref: 'L.3' }],
      solutionStories: [{ canonical_req_id: 'REQ-1', student_task_story_id: 'S-1' }],
    } as any);
    expect(populated(refs).slice().sort()).toEqual([
      'agents.builder', 'agents.runtime', 'assignments', 'businessTasks', 'processes', 'sources',
      'trackMappings.proposalSections', 'trackMappings.solutionStories',
    ]);
  });

  it('the sbp adapter populates exactly this set of collections', () => {
    const refs = sbpToManifestRefs({
      projectId: 'p-1',
      planVersion: 2,
      requirements: [{ id: 'REQ-1' }],
      releases: [{ id: 'REL-1' }],
      stories: [{ id: 'STORY-1', release_id: 'REL-1' }],
      agents: [{ id: 'agent-r' }],
      builderAgentIds: ['agent-b'],
    });
    expect(populated(refs).slice().sort()).toEqual([
      'agents.builder', 'agents.runtime', 'downstream', 'sources',
    ]);
  });

  it('surfaces, policies and designDecisions are written by NEITHER adapter', () => {
    // The three views bound to these cannot show anything today, whatever a project contains.
    const factory = factoryToManifestRefs({
      deliveryProjectId: 'p-1', documentVersion: 1,
      requirements: [{ canonical_req_id: 'R' }], processes: [{ id: 'P' }],
      tasks: [{ id: 'T' }], assignments: [{ role_id: ROLE }],
      runtimeAgentIds: ['a'], builderAgentIds: ['b'],
      proposalSections: [{ canonical_req_id: 'R', proposal_section_ref: 'L' }],
      solutionStories: [{ canonical_req_id: 'R', student_task_story_id: 'S' }],
    } as any);
    const sbp = sbpToManifestRefs({
      projectId: 'p-1', planVersion: 1, requirements: [{ id: 'R' }],
      releases: [{ id: 'REL' }], stories: [{ id: 'S' }], agents: [{ id: 'a' }],
      builderAgentIds: ['b'],
    });
    const unwritten = ['surfaces', 'policies', 'designDecisions'];
    for (const refs of [factory, sbp]) {
      expect(unwritten.filter((c) => ((refs as any)[c] ?? []).length > 0)).toEqual([]);
    }
    // Non-vacuity: these adapters DID write other collections in the same call, so the emptiness
    // above is specific to these three rather than an adapter that produced nothing.
    expect(populated(factory).length).toBeGreaterThan(5);
    expect(populated(sbp).length).toBeGreaterThan(2);
  });

  it('the story→release edge does not survive into the manifest', () => {
    // `SbpStoryLike.release_id` is on the adapter INPUT and is dropped: stories and releases are
    // flattened into one `downstream` list. Carried forward rather than worked around, because
    // adding it changes the manifest contract and its content hash.
    const refs = sbpToManifestRefs({
      projectId: 'p-1', planVersion: 1, requirements: [],
      releases: [{ id: 'REL-1' }], stories: [{ id: 'STORY-1', release_id: 'REL-1' }],
    });
    expect(JSON.stringify(refs)).not.toContain('release_id');
    expect(refs.downstream.map((r) => r.id).slice().sort()).toEqual(['REL-1', 'STORY-1']);
  });
});
