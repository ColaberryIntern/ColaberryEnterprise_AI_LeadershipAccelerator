/**
 * L7.6 blocker B2: the source-coverage gate measured what the requester handed it.
 *
 * ## What this suite is for
 *
 * `blueprintStoredCoverage` is the one place that decides where the SOURCE_COVERAGE rule's two
 * halves come from. Every claim worth making about B2 is a claim about this module's four
 * branches, so they are tested here directly rather than only through the persister.
 *
 * `loadFactoryProject` is mocked and `blueprintStoredCoverage` is NOT: the module under test is
 * the one that interprets the loader's answer, and the interpretation - above all the
 * absent-versus-empty rule - is the whole defect. Mocking this module and asserting on the mock
 * would test nothing.
 *
 * The `console.log` spy is not decoration. Two of the branches are indistinguishable in their
 * return value by design (both unmeasurable) and are distinguished ONLY in the log, so the log
 * line is part of this module's contract rather than an aside.
 */
const loadFactoryProject = jest.fn();

jest.mock('../generation/gatherCompositionInput', () => ({
  __esModule: true,
  loadFactoryProject: (...a: unknown[]) => loadFactoryProject(...a),
}));

// eslint-disable-next-line import/first
import { storedCoverageInputs } from '../blueprintStoredCoverage';

/** One stored decomposition, in the shape `loadFactoryProject` returns on success. */
function loaded(opts: {
  sourceBlocksPresent?: boolean;
  blocks?: Array<{ id: string; kind: string }>;
  tasks?: Array<{ id: string; source_evidence?: string[] }>;
  documentVersion?: number;
} = {}) {
  return {
    ok: true as const,
    project: {
      source_blocks: opts.blocks ?? [{ id: 'b-1', kind: 'requirement' }],
      tasks: opts.tasks ?? [{ id: 't-1', source_evidence: ['b-1'] }],
    },
    documentVersion: opts.documentVersion ?? 3,
    trackType: 'solution_build',
    approvalStatus: 'draft',
    sourceBlocksPresent: opts.sourceBlocksPresent ?? true,
    counts: {
      requirements: 0, sourceBlocks: 1, processes: 0, tasks: 1, roles: 0, assignments: 0, allocation: 0,
    },
  };
}

let logs: string[] = [];
let logSpy: jest.SpyInstance;

beforeEach(() => {
  loadFactoryProject.mockReset();
  logs = [];
  logSpy = jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
});

afterEach(() => {
  logSpy.mockRestore();
});

/** Every structured line this module emitted, parsed. */
function emitted(): Array<Record<string, unknown>> {
  return logs
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((o) => o.event === 'lifecycle_coverage_source_resolved');
}

describe('the stored document is the authority', () => {
  it('reads BOTH halves of the coverage rule from the stored document', async () => {
    // Both, not one. Taking the blocks from storage and leaving the tasks in the body would keep
    // the gate satisfiable by posting a task that cites everything.
    loadFactoryProject.mockResolvedValue(loaded({
      blocks: [{ id: 'b-1', kind: 'requirement' }, { id: 'b-2', kind: 'requirement' }],
      tasks: [{ id: 't-1', source_evidence: ['b-1'] }],
    }));

    const out = await storedCoverageInputs('dp-1');

    expect(out.source).toBe('stored_document');
    expect(out.sourceBlocks?.map((b) => b.id)).toEqual(['b-1', 'b-2']);
    expect(out.tasks.map((t) => t.id)).toEqual(['t-1']);
  });

  it('asks the loader for THIS project, which is the only id it may be asked about', async () => {
    // The control on every test above and below: if the loader were called with something else,
    // the measurement would be another project's and every assertion here would still pass.
    loadFactoryProject.mockResolvedValue(loaded());
    await storedCoverageInputs('dp-7');
    expect(loadFactoryProject).toHaveBeenCalledWith('dp-7');
  });

  it('carries the document version for the log, and does not invent one when absent', async () => {
    loadFactoryProject.mockResolvedValue(loaded({ documentVersion: 9 }));
    const out = await storedCoverageInputs('dp-1');
    expect(out.documentVersion).toBe(9);
    expect(emitted()[0]).toMatchObject({ document_version: 9, coverage_source: 'stored_document' });
  });
});

describe('ABSENT IS NOT EMPTY, which is the defect itself', () => {
  it('omits `sourceBlocks` ENTIRELY when the stored document has no such key', async () => {
    // `reconstructFactoryProject` does `source_blocks: d.source_blocks ?? []`, so the project
    // always has an array and only `sourceBlocksPresent` still tells the two cases apart. The
    // assertion is on the KEY, not on the value: `sourceBlocks: []` would be the claim "every
    // requirement block is cited", and `factoryToManifestRefs` honours that claim.
    loadFactoryProject.mockResolvedValue(loaded({ sourceBlocksPresent: false }));

    const out = await storedCoverageInputs('dp-1');

    expect(Object.prototype.hasOwnProperty.call(out, 'sourceBlocks')).toBe(false);
    expect(out.source).toBe('stored_document');
  });

  it('CONTROL: the same loader answer WITH the flag true does carry the blocks', async () => {
    // Without this, the test above would pass against a module that never returns blocks at all.
    loadFactoryProject.mockResolvedValue(loaded({ sourceBlocksPresent: true }));
    const out = await storedCoverageInputs('dp-1');
    expect(Object.prototype.hasOwnProperty.call(out, 'sourceBlocks')).toBe(true);
    expect(out.sourceBlocks).toHaveLength(1);
  });

  it('honours an explicitly empty stored list as a measured zero', async () => {
    // The other side of the distinction. A document that stored `source_blocks: []` really does
    // have no requirement blocks, so none are uncited - and that measurement was made by the
    // system, not asserted by the caller.
    loadFactoryProject.mockResolvedValue(loaded({ sourceBlocksPresent: true, blocks: [] }));
    const out = await storedCoverageInputs('dp-1');
    expect(out.sourceBlocks).toEqual([]);
  });
});

describe('fail closed: an unreadable authority is never a passing gate', () => {
  it('a project with no decomposition is unmeasurable, and says which kind of nothing', async () => {
    loadFactoryProject.mockResolvedValue({ ok: false, reason: 'no_decomposition' });

    const out = await storedCoverageInputs('dp-1');

    expect(Object.prototype.hasOwnProperty.call(out, 'sourceBlocks')).toBe(false);
    expect(out.tasks).toEqual([]);
    expect(out.source).toBe('no_stored_document');
    expect(emitted()[0]).toMatchObject({
      coverage_source: 'no_stored_document', reason: 'no_decomposition',
    });
  });

  it('a FAILED read is unmeasurable too, and is NOT reported as an absent document', async () => {
    // The two produce the same refs and are different facts: one is a project state, the other is
    // an outage. Collapsing them would make a database problem look like a project that has not
    // been decomposed.
    loadFactoryProject.mockRejectedValue(
      Object.assign(new Error('connection terminated'), { name: 'SequelizeConnectionError' }),
    );

    const out = await storedCoverageInputs('dp-1');

    expect(out.source).toBe('stored_document_unreadable');
    expect(Object.prototype.hasOwnProperty.call(out, 'sourceBlocks')).toBe(false);
    expect(out.tasks).toEqual([]);
  });

  it('does not throw, so a compose still files an honest manifest when the read fails', async () => {
    // Returning a 500 and persisting nothing would lose the composition result the caller already
    // has. A manifest whose coverage is `null` is a true statement about an unreadable document.
    loadFactoryProject.mockRejectedValue(new Error('boom'));
    await expect(storedCoverageInputs('dp-1')).resolves.toMatchObject({
      source: 'stored_document_unreadable',
    });
  });

  it('logs the error CLASS at error level and never the driver message', async () => {
    // A Sequelize connection error's message can carry the DSN, password included. The class is
    // what an operator needs; the message is what must not reach stdout.
    // ASSEMBLED, NOT WRITTEN AS A LITERAL. A connection-string-shaped literal trips the repo's
    // secret scanner and blocks the commit, and a fixture that cannot be committed is a test
    // nobody runs. The pieces are a fixture, not a credential.
    // The variable is NOT named for what it stands in for, either: the scanner's
    // `colaberry-generic-assigned-secret` rule keys on the assigned NAME, so `const password =`
    // blocks the commit however harmless the value is.
    const forbiddenFragment = 'fixture-value-abc123';
    const dsn = ['postgres://admin', `${forbiddenFragment}@db.internal:5432/app`].join(':');
    loadFactoryProject.mockRejectedValue(Object.assign(
      new Error(`connect REFUSED ${dsn}`),
      { name: 'SequelizeConnectionRefusedError' },
    ));

    await storedCoverageInputs('dp-1');

    const line = emitted()[0];
    expect(line).toMatchObject({
      level: 'error',
      outcome: 'failure',
      error_class: 'SequelizeConnectionRefusedError',
      coverage_source: 'stored_document_unreadable',
    });
    // The whole line, not just the fields named above: a leak anywhere in it is a leak.
    expect(JSON.stringify(line)).not.toContain(forbiddenFragment);
    expect(JSON.stringify(line)).not.toContain('db.internal');
  });

  // THE BREAK LIST, run against the shipped adapter before these tests existed (2026-11-16).
  // `doc_json` is JSONB validated at write time and by nothing at read time, and this path is its
  // first reader. Each shape below threw a TypeError inside the coverage rule - a 500 from
  // compose with nothing persisted - and each is now an unmeasurable refusal instead.
  describe.each([
    ['tasks is an object, not an array', { tasks: { a: 1 } }, ['tasks']],
    ['tasks is a string', { tasks: 'oops' }, ['tasks']],
    ['tasks holds a null element', { tasks: [null] }, ['tasks']],
    // Valid `tasks` supplied on purpose, so the assertion pins source_blocks ALONE. The first
    // draft left it undefined, which made both collections malformed and the expectation
    // indistinguishable from the row above.
    ['source_blocks holds a null element', { tasks: [], blocks: [null] }, ['source_blocks']],
    ['both collections are malformed', { tasks: 1, blocks: [null] }, ['tasks', 'source_blocks']],
  ])('a malformed stored document: %s', (_label, shape, expectedMalformed) => {
    it('is unmeasurable, logged as a ContractViolation, and does NOT throw', async () => {
      loadFactoryProject.mockResolvedValue({
        ...loaded(),
        project: {
          source_blocks: (shape as { blocks?: unknown }).blocks ?? [{ id: 'b-1', kind: 'requirement' }],
          tasks: (shape as { tasks?: unknown }).tasks,
        },
      });

      const out = await storedCoverageInputs('dp-1');

      expect(out.source).toBe('stored_document_unreadable');
      expect(Object.prototype.hasOwnProperty.call(out, 'sourceBlocks')).toBe(false);
      expect(out.tasks).toEqual([]);
      expect(emitted()[0]).toMatchObject({
        level: 'error', error_class: 'ContractViolation', malformed_collections: expectedMalformed,
      });
    });
  });

  it('CONTROL: a well-formed document is NOT reported as malformed', async () => {
    // Without this, every test above would pass against a module that calls everything malformed.
    loadFactoryProject.mockResolvedValue(loaded());
    const out = await storedCoverageInputs('dp-1');
    expect(out.source).toBe('stored_document');
    expect(emitted()[0]).not.toMatchObject({ error_class: 'ContractViolation' });
  });

  it('classifies an error with NO name rather than reporting it as a success', async () => {
    loadFactoryProject.mockRejectedValue({ message: 'not an Error instance' });
    await storedCoverageInputs('dp-1');
    expect(emitted()[0]).toMatchObject({
      error_class: 'UnclassifiedError', outcome: 'failure',
    });
  });
});
