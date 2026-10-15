/**
 * The chain that had no consumer, now joined end to end.
 *
 * ## What was broken
 *
 * `POST /:projectId/compose` validated a blueprint and persisted nothing. `writeBlueprintManifest`
 * had ZERO production callers; so did `factoryToManifestRefs` and `sbpToManifestRefs`. So no
 * `operating_blueprint_manifests` row was ever written in production, `latestManifestRefs`
 * returned `null` for every real project, and every refs-derived evidence measurement reported
 * NOT_MEASURED — which blocks. The lifecycle could not leave `discovery` no matter what anyone
 * composed.
 *
 * ## What this suite asserts, and the one test that matters most
 *
 * The last `describe` is the end-to-end claim: the refs this service hands the writer, fed
 * straight into the real evidence measurements, produce ZERO blocking gaps at
 * `requirements_ready`. Every other test here could pass against a service that persisted
 * something subtly useless — refs the evidence reader cannot measure. That one cannot.
 *
 * It runs with NO DATABASE, deliberately. The question is "do the refs this service produces
 * satisfy the gate", which is answerable from the object it passes to the writer. Creating real
 * rows would test the same property more slowly and would skip in CI, which has no `DATABASE_URL`
 * — so the claim would stop being checked exactly where it matters.
 *
 * ## Why the mocks are at module scope
 *
 * `jest.resetModules()` plus a dynamic re-import per test cost 370 SECONDS for six tests earlier
 * in this programme, because it re-walks the whole dependency graph each time. Mocking once and
 * varying the implementation is identical coverage at single-digit milliseconds. The ADAPTERS are
 * deliberately NOT mocked: their output is the thing under assertion, and mocking them would
 * leave this suite testing that a mock returns what the mock was told to return.
 */
const loadAndAuthorize = jest.fn();
const writeBlueprintManifest = jest.fn();

jest.mock('../lifecycleStatus', () => ({
  __esModule: true,
  loadAndAuthorize: (...a: unknown[]) => loadAndAuthorize(...a),
}));
jest.mock('../manifestWriter', () => ({
  __esModule: true,
  writeBlueprintManifest: (...a: unknown[]) => writeBlueprintManifest(...a),
}));

// eslint-disable-next-line import/first
import { persistComposedBlueprint, type ComposedProjectLike } from '../blueprintPersistence';
// eslint-disable-next-line import/first
import { REQUIREMENT_SOURCE_COLLECTIONS, type ManifestRefs } from '../adapters/manifestRefs';
// eslint-disable-next-line import/first
import { EVIDENCE_MEASUREMENTS, applyMeasurements } from '../lifecycleEvidence';
// eslint-disable-next-line import/first
import { prerequisiteGaps, blockingGaps } from '../lifecyclePrerequisites';
// eslint-disable-next-line import/first
import { completeEvidence } from './evidenceFixture';

const ADMIN = { id: 'u-1', email: 'architect@example.test', role: 'SUPER_ADMIN' };

const ROW = {
  id: 'lc-1',
  tenant_id: 'tenant-1',
  student_project_id: null,
  delivery_project_id: 'dp-1',
  stage: 'discovery',
  condition: null,
  condition_reason: null,
};

/** A Factory-shaped composition body with `n` requirements. */
function project(opts: {
  requirements?: number;
  sourceBlocks?: Array<{ id: string; kind: string }>;
  tasks?: Array<{ id: string; source_evidence?: string[] }>;
} = {}): ComposedProjectLike {
  const n = opts.requirements ?? 3;
  return {
    requirements: Array.from({ length: n }, (_, i) => ({
      canonical_req_id: `R-${i + 1}`,
      evidence_state: 'tested',
      source_document: 'solicitation-A',
      amendment_version: '1',
      human_confirmed: true,
    })),
    ...(opts.sourceBlocks === undefined ? {} : { source_blocks: opts.sourceBlocks }),
    tasks: opts.tasks ?? [],
  };
}

/** The refs handed to the writer on the most recent call. */
function persistedRefs(): ManifestRefs {
  expect(writeBlueprintManifest).toHaveBeenCalled();
  const [arg] = writeBlueprintManifest.mock.calls[writeBlueprintManifest.mock.calls.length - 1];
  return (arg as { refs: ManifestRefs }).refs;
}

beforeEach(() => {
  loadAndAuthorize.mockReset();
  writeBlueprintManifest.mockReset();
  loadAndAuthorize.mockResolvedValue(ROW);
  writeBlueprintManifest.mockResolvedValue({
    manifestId: 'm-1', revision: 1, contentSha256: 'a'.repeat(64), refsSha256: 'b'.repeat(64), created: true,
  });
});

describe('the writer finally has a production caller', () => {
  it('persists a composed delivery blueprint and returns the manifest it filed', async () => {
    const out = await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project(),
    });

    expect(writeBlueprintManifest).toHaveBeenCalledTimes(1);
    expect(out).toEqual({
      persisted: true, manifestId: 'm-1', revision: 1, created: true, contentSha256: 'a'.repeat(64),
    });
  });

  it('files it under the right tenant and FK column, read from the row and not the request', async () => {
    // The tenant comes off the authorized lifecycle row. Taking it from the request would let a
    // caller name the tenant its own blueprint is filed under.
    await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project(),
    });

    const [arg] = writeBlueprintManifest.mock.calls[0];
    expect(arg).toMatchObject({ tenantId: 'tenant-1', origin: 'factory', projectId: 'dp-1' });
  });

  it('records the ADMIN as proposer, because separation of duty needs one', async () => {
    // `proposer_unrecorded` blocks `awaiting_blueprint_approval` precisely so a manifest cannot
    // reach approval without a proposer to compare the approver against.
    await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project(),
    });
    expect(writeBlueprintManifest.mock.calls[0][0]).toMatchObject({
      proposedBy: 'architect@example.test',
    });
  });

  it('passes the writer’s `created: false` through, so a replay is visible to the caller', async () => {
    // Composing an unchanged blueprint twice is the NORMAL case for a reviewer, not an edge one.
    // A caller that could not tell a replay from a new revision would read every re-submission as
    // progress.
    writeBlueprintManifest.mockResolvedValue({
      manifestId: 'm-1', revision: 1, contentSha256: 'a'.repeat(64), refsSha256: 'b'.repeat(64), created: false,
    });
    const out = await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project(),
    });
    expect(out).toMatchObject({ persisted: true, created: false });
  });
});

describe('the KIND picks the adapter, because a wrong pointer is worse than no manifest', () => {
  it('a delivery project’s sources point at `contract_requirements`', async () => {
    await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project({ requirements: 2 }),
    });

    const refs = persistedRefs();
    expect(refs.origin).toBe('factory');
    expect(refs.sources.map((s) => s.source)).toEqual(
      ['contract_requirements', 'contract_requirements'],
    );
  });

  it('a student project’s sources point at `build_plans#requirements`, NOT contract_requirements', async () => {
    // The shortcut this refuses: the composition body is `FactoryProject`-shaped for BOTH kinds,
    // so running the factory adapter for everything typechecks and is wrong. A student project's
    // requirements live in `build_plans`, and labelling them `contract_requirements` makes every
    // pointer in a student manifest dangle — worse than no manifest, because it looks resolvable.
    loadAndAuthorize.mockResolvedValue({
      ...ROW, student_project_id: 'sp-1', delivery_project_id: null,
    });

    await persistComposedBlueprint({
      projectId: 'sp-1', kind: 'student', admin: ADMIN, project: project({ requirements: 2 }),
    });

    const refs = persistedRefs();
    expect(refs.origin).toBe('sbp');
    expect(refs.sources.map((s) => s.source)).toEqual(
      ['build_plans#requirements', 'build_plans#requirements'],
    );
    expect(writeBlueprintManifest.mock.calls[0][0]).toMatchObject({ origin: 'sbp' });
  });

  it('either way the `source` is one `requirementCount` can measure', async () => {
    // The two assertions above pin literals. This one pins the PROPERTY that matters: an adapter
    // emitting a collection outside this set leaves `requirementCount` unassessed, which blocks
    // the gate silently rather than failing a test.
    for (const kind of ['delivery', 'student'] as const) {
      writeBlueprintManifest.mockClear();
      await persistComposedBlueprint({ projectId: 'p-1', kind, admin: ADMIN, project: project() });
      for (const s of persistedRefs().sources) {
        expect(REQUIREMENT_SOURCE_COLLECTIONS.has(s.source)).toBe(true);
      }
    }
  });

  it('provenance survives the field rename on the student path', async () => {
    // `ContractRequirement.source_document` becomes `SbpRequirementLike.source`. Different names,
    // same meaning. Dropping it would make every requirement report as having no provenance, which
    // blocks `requirements_ready` on a gap the data does not have.
    await persistComposedBlueprint({
      projectId: 'sp-1', kind: 'student', admin: ADMIN, project: project({ requirements: 1 }),
    });
    expect(persistedRefs().sources[0].provenanceKind).toBe('solicitation-A');
  });
});

describe('coverage is MEASURED on the delivery path and absent is not empty', () => {
  it('source blocks and tasks produce a real measurement', async () => {
    await persistComposedBlueprint({
      projectId: 'dp-1',
      kind: 'delivery',
      admin: ADMIN,
      project: project({
        sourceBlocks: [{ id: 'b-1', kind: 'requirement' }, { id: 'b-2', kind: 'requirement' }],
        tasks: [{ id: 't-1', source_evidence: ['b-1'] }],
      }),
    });

    expect(persistedRefs().coverage.uncitedRequirementBlocks).toEqual(['b-2']);
  });

  it('a body with NO source_blocks records `null`, not `[]`', async () => {
    // `[]` would mean "somebody checked and every requirement block is cited". A body that
    // supplied no blocks has not earned that, and the prerequisite must keep blocking.
    await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project(),
    });

    expect(persistedRefs().coverage.uncitedRequirementBlocks).toBeNull();
  });

  it('an EMPTY source_blocks array is honoured as a measurement of zero blocks', async () => {
    // The other side of the same distinction: present-but-empty is a measurement.
    await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project({ sourceBlocks: [] }),
    });

    expect(persistedRefs().coverage.uncitedRequirementBlocks).toEqual([]);
  });
});

describe('nothing is written that should not be', () => {
  it('a project with NO lifecycle row is declined with a reason, and nothing is written', async () => {
    // The legacy case: 4 delivery and 62 student projects predate their registration hooks and the
    // DRI decided not to backfill them. They may still compose; there is nowhere to file it.
    loadAndAuthorize.mockResolvedValue(null);

    const out = await persistComposedBlueprint({
      projectId: 'dp-legacy', kind: 'delivery', admin: ADMIN, project: project(),
    });

    expect(out).toEqual({ persisted: false, reason: 'no_lifecycle_row' });
    expect(writeBlueprintManifest).not.toHaveBeenCalled();
  });

  it('a blueprint with NO requirements is declined, so an empty row cannot take the refs key', async () => {
    // Because the idempotency key is the refs hash, an empty manifest would come back for every
    // later empty compose while a real blueprint takes the next revision.
    const out = await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project({ requirements: 0 }),
    });

    expect(out).toEqual({ persisted: false, reason: 'no_requirements' });
    expect(writeBlueprintManifest).not.toHaveBeenCalled();
  });

  it('AUTHORIZATION RUNS FIRST: a tenant refusal propagates and writes nothing', async () => {
    // The guard throws 404 rather than 403 for a row in another tenant, because a 403 confirms the
    // row exists. The throw is allowed to propagate for the route to map, exactly as
    // `requestTransition` does — and the write must not have happened.
    const err = Object.assign(new Error('Not found'), { name: 'TenantAccessError', status: 404 });
    loadAndAuthorize.mockRejectedValue(err);

    await expect(persistComposedBlueprint({
      projectId: 'dp-other', kind: 'delivery', admin: ADMIN, project: project(),
    })).rejects.toThrow('Not found');

    expect(writeBlueprintManifest).not.toHaveBeenCalled();
  });

  it('asks for WRITE authority, not read', async () => {
    // A compose that persists is a write. Asking for `read` would authorize a write through the
    // read path, and the distinction is the guard's to enforce rather than this module's to blur.
    await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project(),
    });
    expect(loadAndAuthorize).toHaveBeenCalledWith('dp-1', 'delivery', ADMIN, 'write');
  });
});

describe('THE CHAIN IS JOINED — persisted refs satisfy the gate they are read by', () => {
  /** The real measurements over the refs this service actually persisted. No database. */
  function gapsFromPersistedRefs() {
    const e = applyMeasurements(completeEvidence(), EVIDENCE_MEASUREMENTS, {
      row: ROW, refs: persistedRefs(), published: null,
    });
    return prerequisiteGaps('requirements_ready', e);
  }

  it('a delivery blueprint this service persists clears requirements_ready', async () => {
    await persistComposedBlueprint({
      projectId: 'dp-1',
      kind: 'delivery',
      admin: ADMIN,
      project: project({
        requirements: 4,
        sourceBlocks: [{ id: 'b-1', kind: 'requirement' }, { id: 'b-2', kind: 'context' }],
        tasks: [{ id: 't-1', source_evidence: ['b-1'] }],
      }),
    });

    // Mapped to strings rather than asserted as a length, because WHICH gap is the diagnostic and
    // `toHaveLength(0)` throws it away.
    expect(blockingGaps(gapsFromPersistedRefs()).map((g) => `${g.rule}:${g.kind}`)).toEqual([]);
  });

  it('a student blueprint this service persists clears it too — both consumers', async () => {
    loadAndAuthorize.mockResolvedValue({
      ...ROW, student_project_id: 'sp-1', delivery_project_id: null,
    });

    await persistComposedBlueprint({
      projectId: 'sp-1', kind: 'student', admin: ADMIN, project: project({ requirements: 2 }),
    });

    expect(blockingGaps(gapsFromPersistedRefs()).map((g) => `${g.rule}:${g.kind}`)).toEqual([]);
  });

  it('AND A DELIVERY BLUEPRINT WITH NO SOURCE BLOCKS STILL REFUSES', async () => {
    // The control on both tests above. If this passed, what they proved would be that the gate no
    // longer gates rather than that the refs are good. Coverage is unmeasured here, so
    // `source_block_uncited` must come back as `not_assessed` and block.
    await persistComposedBlueprint({
      projectId: 'dp-1', kind: 'delivery', admin: ADMIN, project: project({ requirements: 4 }),
    });

    const blocking = blockingGaps(gapsFromPersistedRefs());
    expect(blocking.map((g) => `${g.rule}:${g.kind}`)).toEqual(['source_block_uncited:not_assessed']);
  });
});
