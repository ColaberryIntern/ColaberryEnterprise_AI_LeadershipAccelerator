import {
  diffableCollections,
  uncoveredCollections,
  diffRevisions,
  hasMaterialChange,
} from '../blueprintRevisionDiff';
import { emptyRefs, INTEGRITY_CHECKED_LISTS } from '../adapters/manifestRefs';

/** Put a value at a dotted path in a plain ref object. */
const setPath = (obj: Record<string, any>, path: string, value: unknown): void => {
  const [head, tail] = path.split('.');
  if (tail === undefined) { obj[head] = value; return; }
  obj[head][tail] = value;
};

const base = () => emptyRefs('sbp', 'p-1') as unknown as Record<string, any>;
const pinned = (id: string, revision: unknown) => ({ id, revision, source: 't' });

describe('the diffable keyspace is DERIVED, not written down', () => {
  it('enumerates every collection in the ref vocabulary, reported as a list', () => {
    // A LIST, not a count. Adding a collection to `ManifestRefs` should change this assertion's
    // text, so a reviewer sees which collection appeared — a count would just move by one.
    expect(diffableCollections('sbp')).toEqual([
      'sources', 'processes', 'businessTasks', 'assignments',
      'agents.runtime', 'agents.builder',
      'surfaces', 'policies', 'designDecisions', 'downstream',
      'trackMappings.proposalSections', 'trackMappings.solutionStories',
    ]);
  });

  it('matches an INDEPENDENT walk of the runtime object, so the list above is not hand-kept', () => {
    // Derives the expectation from `emptyRefs` here, in the test, by a different traversal than
    // the implementation's. If the implementation stopped walking and returned a literal, this
    // would still hold — so it is paired with the nesting assertion below, which a literal
    // top-level list cannot satisfy.
    const shape = base();
    const walked: string[] = [];
    for (const k of Object.keys(shape)) {
      const v = shape[k];
      if (Array.isArray(v)) { walked.push(k); continue; }
      if (v && typeof v === 'object') {
        for (const inner of Object.keys(v)) {
          if (Array.isArray(v[inner])) walked.push(`${k}.${inner}`);
        }
      }
    }
    expect(diffableCollections('sbp').slice().sort()).toEqual(walked.slice().sort());
    // Non-vacuity: the walk must have found nested paths, or both sides agree on nothing useful.
    expect(walked.filter((p) => p.includes('.')).length).toBe(4);
  });

  it('covers FOUR collections the integrity list does not, which is why the walk goes deeper', () => {
    // `INTEGRITY_CHECKED_LISTS` is documented as the array-valued TOP-LEVEL keys. A diff built on
    // it would silently ignore these four, and moving a process from a runtime agent to a builder
    // agent lives entirely in the first two.
    expect(uncoveredCollections('sbp')).toEqual([
      'agents.runtime', 'agents.builder',
      'trackMappings.proposalSections', 'trackMappings.solutionStories',
    ]);
    // Guard against a vacuous filter: an empty covered-set would make everything "uncovered".
    expect(INTEGRITY_CHECKED_LISTS.length).toBe(8);
  });
});

describe('EVERY derived collection is actually compared, not just enumerated', () => {
  // Rule 1: the claim "the diff covers the whole ref vocabulary" is quantified over a keyspace,
  // so it ships with a generator that enumerates it. A collection could appear in
  // `diffableCollections` and still never be read — this is what would catch that.

  const paths = diffableCollections('sbp');

  it('detects a revision bump in each collection, and names any it misses', () => {
    const missed: string[] = [];
    for (const path of paths) {
      const before = base();
      const after = base();
      setPath(before, path, [pinned('x-1', 1)]);
      setPath(after, path, [pinned('x-1', 2)]);
      const d = diffRevisions(before, after);
      const hit = d.collections.find((c) => c.collection === path);
      if (!hit || hit.revised.length !== 1 || !d.changed) missed.push(path);
    }
    // Reported as a LIST: which collection is unreachable matters, the number does not.
    expect(missed).toEqual([]);
    // Non-vacuity: an empty `paths` would make the loop pass without comparing anything.
    expect(paths.length).toBe(12);
  });

  it('reports NO change for two identical ref sets, so the sweep above is not always-true', () => {
    const d = diffRevisions(base(), base());
    expect(d.changed).toBe(false);
    expect(d.unreadable).toEqual([]);
    expect(d.collections).toHaveLength(12);
  });
});

describe('an EDIT is detected, which added/removed alone would call unchanged', () => {
  it('same id at a different revision is `revised`, not quietly equal', () => {
    const before = base(); const after = base();
    before.sources = [pinned('req-1', 4)];
    after.sources = [pinned('req-1', 5)];
    const d = diffRevisions(before, after);
    const c = d.collections.find((x) => x.collection === 'sources')!;
    expect(c.revised).toEqual(['req-1']);
    expect(c.added).toEqual([]);
    expect(c.removed).toEqual([]);
    expect(d.changed).toBe(true);
  });

  it('treats a null revision on both sides as unchanged — `null` is a legitimate value', () => {
    const before = base(); const after = base();
    before.processes = [pinned('proc-1', null)];
    after.processes = [pinned('proc-1', null)];
    expect(diffRevisions(before, after).changed).toBe(false);
  });

  it('distinguishes a null revision from a numbered one', () => {
    const before = base(); const after = base();
    before.processes = [pinned('proc-1', null)];
    after.processes = [pinned('proc-1', 1)];
    const c = diffRevisions(before, after).collections.find((x) => x.collection === 'processes')!;
    expect(c.revised).toEqual(['proc-1']);
  });

  it('treats an ABSENT revision key the same as an explicit null', () => {
    // A manifest row written before `revision` existed has no such key. Without the `?? null`
    // normalisation one side reads as "undefined" and the other as "null", and every one of
    // those refs would be reported as edited on the next compare.
    const before = base(); const after = base();
    before.assignments = [{ id: 'asg-1', source: 't' }];
    after.assignments = [{ id: 'asg-1', revision: null, source: 't' }];
    const d = diffRevisions(before, after);
    expect(d.collections.find((x) => x.collection === 'assignments')!.revised).toEqual([]);
    expect(d.changed).toBe(false);
  });

  it('reports adds and removes by id', () => {
    const before = base(); const after = base();
    before.policies = [pinned('keep', 1), pinned('gone', 1)];
    after.policies = [pinned('keep', 1), pinned('new', 1)];
    const c = diffRevisions(before, after).collections.find((x) => x.collection === 'policies')!;
    expect(c.added).toEqual(['new']);
    expect(c.removed).toEqual(['gone']);
    expect(c.revised).toEqual([]);
  });
});

describe('EACH kind of change sets `changed` ON ITS OWN', () => {
  // Amendment 4: one isolating control per OPERAND. The agent-move test below asserts
  // `changed === true` with BOTH an addition and a removal present, so it cannot tell which
  // operand produced the answer — dropping either one from the predicate survived it. Each test
  // here asserts that the other two operands are empty EVERYWHERE, so only the named one can be
  // responsible.

  const soleChange = (d: ReturnType<typeof diffRevisions>, kind: 'added' | 'removed' | 'revised') => {
    const others = (['added', 'removed', 'revised'] as const).filter((k) => k !== kind);
    for (const other of others) {
      expect(d.collections.filter((c) => c[other].length > 0).map((c) => c.collection)).toEqual([]);
    }
    expect(d.collections.filter((c) => c[kind].length > 0).map((c) => c.collection)).toHaveLength(1);
  };

  it('an ADDITION alone sets changed', () => {
    const before = base(); const after = base();
    after.surfaces = [pinned('surf-1', 1)];
    const d = diffRevisions(before, after);
    soleChange(d, 'added');
    expect(d.changed).toBe(true);
  });

  it('a REMOVAL alone sets changed', () => {
    const before = base(); const after = base();
    before.businessTasks = [pinned('task-1', 1)];
    const d = diffRevisions(before, after);
    soleChange(d, 'removed');
    expect(d.changed).toBe(true);
  });

  it('a REVISION alone sets changed', () => {
    const before = base(); const after = base();
    before.designDecisions = [pinned('dd-1', 1)];
    after.designDecisions = [pinned('dd-1', 2)];
    const d = diffRevisions(before, after);
    soleChange(d, 'revised');
    expect(d.changed).toBe(true);
  });
});

describe('hasMaterialChange answers for BOTH of its reasons', () => {
  it('is true for a readable change, with nothing unreadable to account for it', () => {
    const before = base(); const after = base();
    before.sources = [pinned('req-1', 1)];
    after.sources = [pinned('req-1', 2)];
    // Isolation: the unreadable operand is empty, so only `changed` can make this true.
    expect(diffRevisions(before, after).unreadable).toEqual([]);
    expect(hasMaterialChange(before, after)).toBe(true);
  });

  it('is false when nothing changed and every collection was readable', () => {
    const d = diffRevisions(base(), base());
    expect([d.changed, d.unreadable.length]).toEqual([false, 0]);
    expect(hasMaterialChange(base(), base())).toBe(false);
  });
});

describe('an agent moving between runtime and builder is visible', () => {
  // The change a top-level-only diff would miss completely: both lists live under `agents`, so
  // nothing at the top level changes shape at all.

  it('shows the move as a removal from one nested list and an addition to the other', () => {
    const before = base(); const after = base();
    before.agents.runtime = [pinned('agent-7', 1)];
    before.agents.builder = [];
    after.agents.runtime = [];
    after.agents.builder = [pinned('agent-7', 1)];

    const d = diffRevisions(before, after);
    expect(d.collections.find((c) => c.collection === 'agents.runtime')!.removed).toEqual(['agent-7']);
    expect(d.collections.find((c) => c.collection === 'agents.builder')!.added).toEqual(['agent-7']);
    expect(d.changed).toBe(true);
  });
});

describe('track mappings are compared by VALUE, because they have no id', () => {
  it('a re-pointed requirement shows as a remove plus an add, and never as `revised`', () => {
    const before = base(); const after = base();
    before.trackMappings.proposalSections = [{ canonicalReqId: 'C-1', sectionRef: 'S-1' }];
    after.trackMappings.proposalSections = [{ canonicalReqId: 'C-1', sectionRef: 'S-2' }];

    const c = diffRevisions(before, after).collections
      .find((x) => x.collection === 'trackMappings.proposalSections')!;
    expect(c.identity).toBe('tuple');
    expect(c.added).toHaveLength(1);
    expect(c.removed).toHaveLength(1);
    // A `revised` entry here would double-report the same change.
    expect(c.revised).toEqual([]);
  });

  it('key order inside a mapping is not a change', () => {
    const before = base(); const after = base();
    before.trackMappings.solutionStories = [{ canonicalReqId: 'C-1', storyId: 'S-1' }];
    after.trackMappings.solutionStories = [{ storyId: 'S-1', canonicalReqId: 'C-1' }];
    expect(diffRevisions(before, after).changed).toBe(false);
  });
});

describe('UNREADABLE is its own answer, never silence', () => {
  it('a collection missing on one side is unreadable, not unchanged', () => {
    const before = base(); const after = base();
    delete after.policies;
    const d = diffRevisions(before, after);
    expect(d.unreadable).toContain('policies');
    expect(d.collections.map((c) => c.collection)).not.toContain('policies');
    // And it does NOT report a change, which is exactly why `hasMaterialChange` adds it in.
    expect(d.changed).toBe(false);
    expect(hasMaterialChange(before, after)).toBe(true);
  });

  it('a non-array where a list belongs is unreadable', () => {
    const before = base(); const after = base();
    after.sources = { nope: true };
    expect(diffRevisions(before, after).unreadable).toContain('sources');
  });

  it('a MIXED list is unreadable rather than partly diffed', () => {
    // Taking the majority rule would drop the element without an id from the comparison, and a
    // manifest with one malformed ref would compare as if that ref did not exist.
    const before = base(); const after = base();
    before.downstream = [pinned('r-1', 1)];
    after.downstream = [pinned('r-1', 1), { noId: true }];
    const d = diffRevisions(before, after);
    expect(d.unreadable).toContain('downstream');
    expect(hasMaterialChange(before, after)).toBe(true);
  });

  it('a whole non-object manifest side makes every collection unreadable', () => {
    const d = diffRevisions(null, base());
    expect(d.unreadable).toHaveLength(12);
    expect(d.collections).toEqual([]);
    expect(hasMaterialChange(null, base())).toBe(true);
  });

  it('an agents object replaced by a scalar makes BOTH nested lists unreadable', () => {
    const before = base(); const after = base();
    after.agents = 'nope';
    const d = diffRevisions(before, after);
    expect(d.unreadable).toContain('agents.runtime');
    expect(d.unreadable).toContain('agents.builder');
  });
});
