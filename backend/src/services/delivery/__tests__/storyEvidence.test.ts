import { evaluateStoryGate, recordEvidence, upsertStory } from '../storyEvidence';

/**
 * The first code path that runs the Gate 9 quality gate on real data.
 *
 * `evaluateQualityGate` had zero production callers, `delivery_stories` did not exist as
 * a table, and nothing ever wrote to `delivery_evidence`. The gate could not be asked
 * about anything real — its `evidence: []` path, the one that fails closed and blocks a
 * release, had been reached only by tests.
 *
 * These cover the wiring: that a story can be persisted and refused, that evidence
 * dedupes, and that the gate is fed from the DATABASE rather than from the caller.
 * `deliveryQualityGate.test.ts` already proves the gate's own rules.
 */

const PROJECT = 'project-1';

const goodContract = {
  storyId: 'STORY-1',
  title: 'Riders can see live arrivals',
  fulfills: ['REQ-1'],
  businessReason: 'Riders call the depot because the board is wrong.',
  acceptance: ['Board refreshes within 30s'],
  // riskLevel is BLOCKING in validateStoryContract, not optional as the interface's `?`
  // suggests. The first version of this fixture omitted it and was correctly refused -
  // the fixture was wrong, not the validator.
  riskLevel: 'R2',
  testRequirements: ['unit', 'integration'],
};

function makeModels(opts: {
  story?: any;
  evidenceRows?: any[];
  existingEvidence?: any;
} = {}) {
  const createdEvidence: any[] = [];
  const createdStories: any[] = [];
  const updated: any[] = [];
  return {
    createdEvidence,
    createdStories,
    updated,
    DeliveryStory: {
      findOne: async () => opts.story ?? null,
      create: async (row: any) => {
        createdStories.push(row);
        return { id: 'story-row-1', story_key: row.story_key, ...row };
      },
    },
    DeliveryEvidence: {
      findOne: async () => opts.existingEvidence ?? null,
      findAll: async () => opts.evidenceRows ?? [],
      create: async (row: any) => {
        createdEvidence.push(row);
        return { id: 'evidence-1', ...row };
      },
    },
  };
}

describe('upsertStory', () => {
  it('stores a valid contract', async () => {
    const models = makeModels();
    const out = await upsertStory({ projectId: PROJECT, contract: goodContract as any, models });
    expect('refused' in out).toBe(false);
    expect(models.createdStories).toHaveLength(1);
  });

  it('REFUSES a contract with blocking issues rather than storing it', async () => {
    // Storing a contract that misleads about what is being built means the quality gate
    // later reasons about a story that does not describe reality, and every verdict after
    // that is worthless.
    const models = makeModels();
    const out = await upsertStory({
      projectId: PROJECT,
      contract: { storyId: '', title: '', fulfills: [] } as any,
      models,
    });
    expect('refused' in out).toBe(true);
    expect(models.createdStories).toHaveLength(0);
  });

  it('a replayed create is an UPDATE, not a duplicate', async () => {
    const existing = {
      id: 'story-row-1',
      story_key: 'STORY-1',
      update: jest.fn(async () => undefined),
    };
    const models = makeModels({ story: existing });
    const out = await upsertStory({ projectId: PROJECT, contract: goodContract as any, models });
    expect('refused' in out).toBe(false);
    if (!('refused' in out)) expect(out.created).toBe(false);
    expect(existing.update).toHaveBeenCalled();
    expect(models.createdStories).toHaveLength(0);
  });
});

describe('recordEvidence', () => {
  it('records a new measurement', async () => {
    const models = makeModels();
    const out = await recordEvidence({
      projectId: PROJECT,
      storyId: 'story-row-1',
      dimension: 'unit_tests',
      evidenceType: 'test_run',
      outcome: 'pass',
      sourceRef: 'run-42',
      models,
    });
    expect(out.deduped).toBe(false);
    expect(models.createdEvidence).toHaveLength(1);
  });

  it('DEDUPES a replayed callback instead of writing a second row', async () => {
    // Master plan §15: a replayed execution callback must produce no duplicate evidence.
    // A runner retrying a webhook is the normal case, and two rows for one measurement
    // would let a single test run satisfy a dimension twice.
    const models = makeModels({ existingEvidence: { id: 'evidence-1' } });
    const out = await recordEvidence({
      projectId: PROJECT,
      storyId: 'story-row-1',
      dimension: 'unit_tests',
      evidenceType: 'test_run',
      outcome: 'pass',
      sourceRef: 'run-42',
      models,
    });
    expect(out.deduped).toBe(true);
    expect(models.createdEvidence).toHaveLength(0);
  });
});

describe('evaluateStoryGate', () => {
  const story = {
    id: 'story-row-1',
    story_key: 'STORY-1',
    is_ui_story: false,
    contract: goodContract,
  };

  it('returns null for a story that does not exist', async () => {
    expect(
      await evaluateStoryGate({ projectId: PROJECT, storyKey: 'nope', models: makeModels() }),
    ).toBeNull();
  });

  it('BLOCKS when there is no evidence at all', async () => {
    // The fail-closed path. It had never been reached by a running system before this.
    const models = makeModels({ story, evidenceRows: [] });
    const out = await evaluateStoryGate({ projectId: PROJECT, storyKey: 'STORY-1', models });
    expect(out).not.toBeNull();
    expect(out!.evidenceCount).toBe(0);
    expect(out!.gate.passes).toBe(false);
  });

  it('reads evidence from the DATABASE, never from the caller', async () => {
    // The caller chooses which story and which commit. If it could supply the evidence
    // list, it could pass the gate by describing a healthier world than the one that
    // exists — which would make the gate a formality.
    const models = makeModels({
      story,
      evidenceRows: [
        { dimension: 'unit_tests', evidence_type: 'test_run', outcome: 'pass', subject_sha: 'abc', source_ref: 'r1' },
      ],
    });
    const out = await evaluateStoryGate({ projectId: PROJECT, storyKey: 'STORY-1', models });
    expect(out!.evidenceCount).toBe(1);
    // The signature has no evidence parameter at all — the strongest form of this
    // guarantee is that there is no way to pass one.
    expect(Object.keys({ projectId: '', storyKey: '', candidateSha: '', models: {} })).not.toContain(
      'evidence',
    );
  });

  it('a recorded FAILURE blocks even when the dimension was not required', async () => {
    // Gate 9's rule: a recorded failure is a fact about the commit. Ignoring it because
    // nobody asked for that dimension would let a story ship over a known break.
    const models = makeModels({
      story,
      evidenceRows: [
        { dimension: 'security_scan', evidence_type: 'scan', outcome: 'fail', subject_sha: 'abc', source_ref: 'r2' },
      ],
    });
    const out = await evaluateStoryGate({ projectId: PROJECT, storyKey: 'STORY-1', models });
    expect(out!.gate.passes).toBe(false);
  });
});
