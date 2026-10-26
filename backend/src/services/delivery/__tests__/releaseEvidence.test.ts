import {
  claimEvidenceForRelease,
  readReleaseEvidence,
  summarizeTrailCoverage,
} from '../releaseEvidence';
import { createReleaseCandidate } from '../releaseManagement';

/**
 * The release-to-evidence join (C8.11, acceptance criterion 2).
 *
 * `delivery_evidence.release_id` and `idx_delivery_evidence_release` have existed since
 * the delivery schema shipped and nothing ever wrote the column, so a handover carried
 * the gate's verdicts with no trail behind them.
 *
 * THE ASSERTIONS THAT MATTER are the ones about what is NOT touched: a second release
 * must not steal the first release's evidence, and a failure to stamp the join must not
 * lose the release. Both are cases where the wrong behavior still looks like success.
 */

function makeEvidenceModel(opts: { throws?: boolean; affected?: number; rows?: any[] } = {}) {
  const updates: any[] = [];
  return {
    updates,
    DeliveryEvidence: {
      update: async (values: any, options: any) => {
        if (opts.throws) throw new Error('db down');
        updates.push({ values, where: options.where });
        return [opts.affected ?? 0];
      },
      findAll: async () => opts.rows ?? [],
    },
  };
}

describe('claimEvidenceForRelease', () => {
  it('claims only the project rows that belong to no release yet', async () => {
    const m = makeEvidenceModel({ affected: 3 });
    const r = await claimEvidenceForRelease({
      releaseId: 'rel-1', projectId: 'proj-1', models: m,
    });

    expect(r).toEqual({ claimed: 3, ran: true });
    expect(m.updates).toHaveLength(1);
    expect(m.updates[0].values).toEqual({ release_id: 'rel-1' });
    // The null guard is the whole safety property: without it, cutting release 2 would
    // reassign release 1's evidence and silently rewrite what release 1 shipped with.
    expect(m.updates[0].where).toEqual({
      delivery_project_id: 'proj-1',
      release_id: null,
    });
  });

  it('is idempotent: a second claim finds nothing left to claim', async () => {
    const m = makeEvidenceModel({ affected: 0 });
    const r = await claimEvidenceForRelease({
      releaseId: 'rel-1', projectId: 'proj-1', models: m,
    });
    expect(r).toEqual({ claimed: 0, ran: true });
  });

  it('distinguishes "no evidence" from "could not look"', async () => {
    // A handover reporting zero evidence when it means it never ran is the exact failure
    // this initiative keeps finding, so the two results are different shapes.
    const ok = await claimEvidenceForRelease({
      releaseId: 'r', projectId: 'p', models: makeEvidenceModel({ affected: 0 }),
    });
    expect(ok).toEqual({ claimed: 0, ran: true });

    const broke = await claimEvidenceForRelease({
      releaseId: 'r', projectId: 'p', models: makeEvidenceModel({ throws: true }),
    });
    expect(broke).toEqual({ claimed: 0, ran: false });

    const absent = await claimEvidenceForRelease({
      releaseId: 'r', projectId: 'p', models: {},
    });
    expect(absent).toEqual({ claimed: 0, ran: false });
  });

  it('swallows a database failure rather than throwing', async () => {
    await expect(claimEvidenceForRelease({
      releaseId: 'r', projectId: 'p', models: makeEvidenceModel({ throws: true }),
    })).resolves.toEqual({ claimed: 0, ran: false });
  });
});

describe('createReleaseCandidate claims evidence', () => {
  const project = { id: 'proj-1', delivery_profile_key: 'internal_tool' };

  function makeModels(evidence: any) {
    const created: any[] = [];
    return {
      created,
      DeliveryProject: { findOne: async () => project },
      DeliveryRelease: {
        findOne: async () => null,
        create: async (row: any) => {
          created.push(row);
          return { ...row, id: 'rel-new' };
        },
      },
      ...evidence,
    };
  }

  it('stamps the new release onto the project evidence', async () => {
    const ev = makeEvidenceModel({ affected: 2 });
    const models = makeModels({ DeliveryEvidence: ev.DeliveryEvidence });
    const r = await createReleaseCandidate({
      projectId: 'proj-1', version: '1.0.0', models,
    });

    expect(r).toMatchObject({ ok: true, releaseId: 'rel-new' });
    expect(ev.updates[0].values).toEqual({ release_id: 'rel-new' });
  });

  it('still returns the release when the evidence claim fails', async () => {
    // The release is the primary record. A derived join that cannot be written must not
    // take it down, or a transient database blip loses the release itself.
    const ev = makeEvidenceModel({ throws: true });
    const models = makeModels({ DeliveryEvidence: ev.DeliveryEvidence });
    const r = await createReleaseCandidate({
      projectId: 'proj-1', version: '1.0.0', models,
    });
    expect(r).toMatchObject({ ok: true, releaseId: 'rel-new' });
  });

  it('does not claim anything when the release was refused', async () => {
    const ev = makeEvidenceModel({ affected: 5 });
    const models = {
      DeliveryProject: { findOne: async () => ({ id: 'p', delivery_profile_key: null }) },
      DeliveryRelease: { findOne: async () => null, create: async () => ({ id: 'x' }) },
      DeliveryEvidence: ev.DeliveryEvidence,
    };
    const r = await createReleaseCandidate({
      projectId: 'p', version: '1.0.0', models,
    });
    expect(r).toMatchObject({ ok: false, reason: 'no_profile_on_project' });
    expect(ev.updates).toHaveLength(0);
  });
});

describe('readReleaseEvidence', () => {
  it('maps the ledger columns into a stable shape', async () => {
    const rows = [{
      id: 'e1', dimension: 'tests', evidence_type: 'test_run', outcome: 'pass',
      subject_sha: 'abc123', source_ref: 'ci/run/9', story_id: 's1',
      created_at: '2026-10-26T12:00:00.000Z',
    }];
    const out = await readReleaseEvidence({
      releaseId: 'rel-1', models: makeEvidenceModel({ rows }),
    });
    expect(out).toEqual([{
      id: 'e1', dimension: 'tests', evidenceType: 'test_run', outcome: 'pass',
      subjectSha: 'abc123', sourceRef: 'ci/run/9', storyId: 's1',
      recordedAt: '2026-10-26T12:00:00.000Z',
    }]);
  });

  it('returns nothing rather than throwing when the model is absent', async () => {
    await expect(readReleaseEvidence({ releaseId: 'r', models: {} })).resolves.toEqual([]);
  });
});

describe('summarizeTrailCoverage', () => {
  const evidence = [
    { id: 'e1', dimension: 'tests', evidenceType: 't', outcome: 'pass',
      subjectSha: null, sourceRef: null, storyId: null, recordedAt: null },
    { id: 'e2', dimension: 'tests', evidenceType: 't', outcome: 'pass',
      subjectSha: null, sourceRef: null, storyId: null, recordedAt: null },
  ];

  it('reports a passing check with no evidence behind it as unevidenced', async () => {
    const out = summarizeTrailCoverage({
      checkResults: [
        { category: 'tests', outcome: 'pass' },
        { category: 'security', outcome: 'pass' },
      ],
      evidence,
    });
    expect(out).toEqual([
      { category: 'tests', checkOutcome: 'pass', evidenceRows: 2, unevidenced: false },
      { category: 'security', checkOutcome: 'pass', evidenceRows: 0, unevidenced: true },
    ]);
  });

  it('reports rather than judges: an unevidenced check is not a failure', async () => {
    // Deliberate. The gate already decides pass or fail from check_results; this exists
    // to make a thin trail VISIBLE at handover, not to add a second gate that would
    // block a release on a dimension nobody instrumented.
    const out = summarizeTrailCoverage({
      checkResults: [{ category: 'security', outcome: 'pass' }],
      evidence: [],
    });
    expect(out[0].checkOutcome).toBe('pass');
    expect(out[0].unevidenced).toBe(true);
  });

  it('ignores malformed check rows rather than inventing a category', async () => {
    const out = summarizeTrailCoverage({
      checkResults: [{ outcome: 'pass' }, { category: '', outcome: 'pass' }] as never,
      evidence,
    });
    expect(out).toEqual([]);
  });
});
