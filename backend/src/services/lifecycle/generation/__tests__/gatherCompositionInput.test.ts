/**
 * The gatherer: what it reads, what it refuses to invent, and the one distinction it must not lose.
 *
 * ## The property this file exists for
 *
 * `ABSENT source_blocks MUST NOT BECOME EMPTY.` `reconstructFactoryProject` does
 * `source_blocks: d.source_blocks ?? []`, which is right for a view model and wrong as a
 * composition input: `factoryToManifestRefs` treats an ABSENT `sourceBlocks` as coverage
 * unmeasurable (recorded `null`, prerequisite keeps blocking) and an EMPTY one as measured —
 * no blocks, therefore none uncited, coverage clean. Laundering the first into the second
 * reports SOURCE COVERAGE PASSED on a project nobody measured, which is the exact failure
 * shape the whole evidence path exists to refuse.
 *
 * Because the reconstruction has already flattened both cases into one array, the only place
 * the difference survives is a flag read from the RAW doc_json. That is what is pinned here.
 *
 * ## The other load-bearing one
 *
 * `missingAuthoredInputs` reports EVERY missing field, not the first. One missing field per
 * round trip is the pattern `composeBlueprint` already refuses by running all four surface
 * checks after generation has refused.
 */
import {
  REQUIRED_AUTHORED_FIELDS, gatherCompositionInput, loadFactoryProject, missingAuthoredInputs,
  type AuthoredInputs,
} from '../gatherCompositionInput';

/** One stored decomposition row, as `ContractProcessDocument.findAll` returns them. */
interface DocRow {
  version: number;
  track_type: string;
  status: string;
  doc_json: Record<string, unknown> | null;
}

const docRows: DocRow[] = [];
const trackRows: Array<Record<string, unknown>> = [];
const reqRows: Array<Record<string, unknown>> = [];

jest.mock('../../../../models/ContractProcessDocument', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => docRows) },
}));
jest.mock('../../../../models/ContractTrack', () => ({
  __esModule: true,
  // `get({ plain: true })` is what the loader calls, so the stub has to answer it rather than
  // being a bare object — a stub shaped unlike the model would pass while the real call throws.
  default: { findAll: jest.fn(async () => trackRows.map((r) => ({ get: () => r }))) },
}));
jest.mock('../../../../models/ContractRequirement', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => reqRows.map((r) => ({ get: () => r }))) },
}));

const DOC_FULL = {
  processes: [{ id: 'p1' }],
  roles: [{ id: 'role-a', name: 'A', definition: 'does a' }, { id: 'role-b', name: 'B', definition: 'does b' }],
  tasks: [{ id: 't1' }, { id: 't2' }],
  assignments: [{ role_id: 'role-a', responsibility: 'PERFORMER' }],
  transitions: [],
  allocation: [{ task_id: 't1', execution_class: 'ai_assisted' }],
  role_map: [],
  source_blocks: [{ id: 'sb1', kind: 'requirement' }],
};

/** Every required authored field supplied, so a test can remove exactly one. */
const AUTHORED_COMPLETE: AuthoredInputs = {
  understanding: [],
  agents: [],
  effort: [],
  declaration: { kind: 'stated' } as unknown as AuthoredInputs['declaration'],
  bindings: [],
  workspaceStates: [],
  policies: [],
  design: null,
};

function setDocs(rows: DocRow[]) {
  docRows.length = 0;
  docRows.push(...rows);
}

beforeEach(() => {
  setDocs([{ version: 3, track_type: 'solution_build', status: 'approved', doc_json: { ...DOC_FULL } }]);
  trackRows.length = 0;
  reqRows.length = 0;
  reqRows.push({ canonical_req_id: 'R-1' }, { canonical_req_id: 'R-2' });
});

describe('loadFactoryProject', () => {
  it('reports no_decomposition rather than an empty project when nothing is stored', async () => {
    setDocs([]);
    const out = await loadFactoryProject('dp-1');
    expect(out).toEqual({ ok: false, reason: 'no_decomposition' });
  });

  it('assembles the project from the three tables', async () => {
    const out = await loadFactoryProject('dp-1');
    if (!out.ok) throw new Error('expected a loaded project');
    expect(out.project.delivery_project_id).toBe('dp-1');
    expect(out.documentVersion).toBe(3);
    expect(out.counts).toEqual({
      requirements: 2, sourceBlocks: 1, processes: 1, tasks: 2, roles: 2, assignments: 1, allocation: 1,
    });
  });

  it('prefers the solution_build track over a newer row on another track', async () => {
    // THE RULE IS LIFTED FROM factoryRoutes, NOT REIMPLEMENTED. Pinned so lifting it cannot
    // quietly change it: version 9 is newer, and solution_build still wins.
    setDocs([
      { version: 9, track_type: 'discovery', status: 'draft', doc_json: { ...DOC_FULL, tasks: [] } },
      { version: 3, track_type: 'solution_build', status: 'approved', doc_json: { ...DOC_FULL } },
    ]);
    const out = await loadFactoryProject('dp-1');
    if (!out.ok) throw new Error('expected a loaded project');
    expect(out.trackType).toBe('solution_build');
    expect(out.documentVersion).toBe(3);
  });

  it('falls back to the newest row when no solution_build track exists', async () => {
    setDocs([
      { version: 9, track_type: 'discovery', status: 'draft', doc_json: { ...DOC_FULL } },
      { version: 2, track_type: 'proposal', status: 'draft', doc_json: { ...DOC_FULL } },
    ]);
    const out = await loadFactoryProject('dp-1');
    if (!out.ok) throw new Error('expected a loaded project');
    // The loader relies on the query's own `version DESC` ordering, so the FIRST row is the
    // newest. Asserting the version rather than the index is what makes that reliance visible.
    expect(out.trackType).toBe('discovery');
    expect(out.documentVersion).toBe(9);
  });

  describe('ABSENT source_blocks must not become EMPTY', () => {
    it('reports sourceBlocksPresent FALSE when the stored document omits the field', async () => {
      const { source_blocks, ...withoutBlocks } = DOC_FULL;
      setDocs([{ version: 1, track_type: 'solution_build', status: 'draft', doc_json: withoutBlocks }]);
      const out = await loadFactoryProject('dp-1');
      if (!out.ok) throw new Error('expected a loaded project');

      expect(out.sourceBlocksPresent).toBe(false);
      // AND the reason the flag has to exist: the project itself cannot answer the question,
      // because reconstruction has already turned the absent field into an empty array.
      expect(out.project.source_blocks).toEqual([]);
    });

    it('reports sourceBlocksPresent TRUE for an explicitly empty list — a measured zero', async () => {
      setDocs([{
        version: 1, track_type: 'solution_build', status: 'draft',
        doc_json: { ...DOC_FULL, source_blocks: [] },
      }]);
      const out = await loadFactoryProject('dp-1');
      if (!out.ok) throw new Error('expected a loaded project');

      // Same `project.source_blocks` as the test above, opposite meaning. That is the whole point.
      expect(out.project.source_blocks).toEqual([]);
      expect(out.sourceBlocksPresent).toBe(true);
    });
  });

  it('survives a null doc_json without inventing a project', async () => {
    setDocs([{ version: 1, track_type: 'solution_build', status: 'draft', doc_json: null }]);
    const out = await loadFactoryProject('dp-1');
    if (!out.ok) throw new Error('expected a loaded project');
    expect(out.sourceBlocksPresent).toBe(false);
    expect(out.counts.tasks).toBe(0);
    // Requirements come from their OWN table, so a null doc_json does not erase them.
    expect(out.counts.requirements).toBe(2);
  });
});

describe('missingAuthoredInputs', () => {
  it('names EVERY missing field, not the first', () => {
    expect(missingAuthoredInputs({})).toEqual([...REQUIRED_AUTHORED_FIELDS]);
  });

  it('counts an empty array as supplied, because "I checked, there are none" must be sayable', () => {
    expect(missingAuthoredInputs(AUTHORED_COMPLETE)).toEqual([]);
  });

  it('does not demand design, which composition refuses under its own name', () => {
    // `design: null` is a legitimate "what else is wrong first?" and composeBlueprint reports
    // DESIGN_NOT_SELECTED itself. Listing it here too would report one problem twice.
    expect(REQUIRED_AUTHORED_FIELDS).not.toContain('design');
    expect(missingAuthoredInputs({ ...AUTHORED_COMPLETE, design: null })).toEqual([]);
  });

  it.each(REQUIRED_AUTHORED_FIELDS)('detects %s missing on its own', (field) => {
    const partial = { ...AUTHORED_COMPLETE } as Partial<AuthoredInputs>;
    delete partial[field];
    expect(missingAuthoredInputs(partial)).toEqual([field]);
  });
});

describe('gatherCompositionInput', () => {
  it('refuses with the full missing list rather than composing a half input', async () => {
    const out = await gatherCompositionInput({ deliveryProjectId: 'dp-1', authored: {} });
    expect(out).toEqual({
      ok: false, reason: 'missing_authored_inputs', missing: [...REQUIRED_AUTHORED_FIELDS],
    });
  });

  it('reports no_decomposition BEFORE the authored check, the cheaper fact first', async () => {
    // A caller with nothing authored still learns whether authoring is worth starting at all.
    setDocs([]);
    const out = await gatherCompositionInput({ deliveryProjectId: 'dp-1', authored: {} });
    expect(out).toEqual({ ok: false, reason: 'no_decomposition' });
  });

  it('derives roleIds from the project rather than asking the caller for them', async () => {
    const out = await gatherCompositionInput({ deliveryProjectId: 'dp-1', authored: AUTHORED_COMPLETE });
    if (out.ok !== true) throw new Error(`expected ok, got ${JSON.stringify(out)}`);
    // Hand-authoring these is how every named role becomes unknown and `controls` refuses for
    // no real reason.
    expect([...(out.input.roleIds ?? [])].sort()).toEqual(['role-a', 'role-b']);
    expect(REQUIRED_AUTHORED_FIELDS).not.toContain('roleIds');
  });

  it("takes allocation from the project, so there is no second divergent copy", async () => {
    const out = await gatherCompositionInput({ deliveryProjectId: 'dp-1', authored: AUTHORED_COMPLETE });
    if (out.ok !== true) throw new Error('expected ok');
    expect(out.input.allocation).toEqual([{ task_id: 't1', execution_class: 'ai_assisted' }]);
  });

  it('carries sourceBlocksPresent out to the caller that has to pass it on', async () => {
    const { source_blocks, ...withoutBlocks } = DOC_FULL;
    setDocs([{ version: 1, track_type: 'solution_build', status: 'draft', doc_json: withoutBlocks }]);
    const out = await gatherCompositionInput({ deliveryProjectId: 'dp-1', authored: AUTHORED_COMPLETE });
    if (out.ok !== true) throw new Error('expected ok');
    expect(out.sourceBlocksPresent).toBe(false);
  });

  it('threads the correlation id through, and defaults it to null rather than undefined', async () => {
    const withId = await gatherCompositionInput({
      deliveryProjectId: 'dp-1', authored: AUTHORED_COMPLETE, correlationId: 'corr-1',
    });
    if (withId.ok !== true) throw new Error('expected ok');
    expect(withId.input.correlationId).toBe('corr-1');

    const without = await gatherCompositionInput({ deliveryProjectId: 'dp-1', authored: AUTHORED_COMPLETE });
    if (without.ok !== true) throw new Error('expected ok');
    expect(without.input.correlationId).toBeNull();
  });

  it('omits the optional generation fields rather than setting them undefined', async () => {
    // `reworkBounds: undefined` and an ABSENT `reworkBounds` are the same to a reader and not to
    // `exactOptionalPropertyTypes`. Spreading conditionally keeps the key off entirely.
    const out = await gatherCompositionInput({ deliveryProjectId: 'dp-1', authored: AUTHORED_COMPLETE });
    if (out.ok !== true) throw new Error('expected ok');
    expect(Object.prototype.hasOwnProperty.call(out.input, 'reworkBounds')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out.input, 'targetAcceptance')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out.input, 'priorIds')).toBe(false);
  });
});
