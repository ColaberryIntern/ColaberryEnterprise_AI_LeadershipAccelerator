import { intakeSignal } from '../signalIntake';
import { notObserved } from '../operateSignals';

/**
 * The first caller of Gate 14's Operate phase, which had nowhere to write.
 *
 * Scenario G's observable is an **absence** — that a production signal changes nothing
 * automatically. Most of these assert that nothing was written, which is the only way to
 * test an absence.
 */

const PROJECT = 'project-1';
const observed = (value: number): any => ({ status: 'observed', signal: 'errors', value });

function makeModels(opts: { project?: any } = {}) {
  const created: any[] = [];
  return {
    created,
    DeliveryProject: {
      findOne: async () => (opts.project === undefined ? { id: PROJECT } : opts.project),
    },
    DeliverySignalCandidate: {
      create: async (row: any) => {
        created.push(row);
        return { id: 'candidate-1', ...row };
      },
    },
  };
}

describe('intakeSignal', () => {
  it('stores a candidate as PROPOSED, requiring human review', async () => {
    const models = makeModels();
    const out = await intakeSignal({
      projectId: PROJECT,
      kind: 'defect',
      signal: 'errors',
      summary: 'Error rate tripled after the checkout deploy on Tuesday.',
      evidence: observed(0.09),
      models,
    });
    expect(out.ok).toBe(true);
    expect(models.created[0].status).toBe('proposed');
    expect(models.created[0].requires_human_review).toBe(true);
  });

  it('writes ONLY a candidate row — no story, decision or release', async () => {
    // Scenario G in miniature. The fixture exposes no other model, so reaching for one
    // throws rather than silently succeeding against a permissive mock.
    const models = makeModels();
    const out = await intakeSignal({
      projectId: PROJECT,
      kind: 'optimization',
      signal: 'latency',
      summary: 'p99 latency doubled on the reporting endpoint after the index change.',
      evidence: observed(1200),
      models,
    });
    expect(out.ok).toBe(true);
    expect(Object.keys(models).filter((k) => k.startsWith('Delivery'))).toEqual([
      'DeliveryProject',
      'DeliverySignalCandidate',
    ]);
    expect(models.created).toHaveLength(1);
  });

  it('REFUSES a conclusion drawn from telemetry that was never observed', async () => {
    // The most valuable refusal in the module: "latency is bad" inferred from no latency
    // data is a fabrication, and it is the kind that reads as a real finding.
    const models = makeModels();
    const out = await intakeSignal({
      projectId: PROJECT,
      kind: 'defect',
      signal: 'latency',
      summary: 'Latency is unacceptable and must be fixed before the next release.',
      evidence: notObserved('latency', 'no APM configured on this project'),
      models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('refused_by_gate');
      expect(out.refusals?.some((r) => r.rule === 'no_observation')).toBe(true);
    }
    expect(models.created).toHaveLength(0);
  });

  it('ALLOWS a candidate about the missing telemetry itself', async () => {
    // The other half of that distinction. "We are not measuring latency" is a real finding,
    // and often a more important one than any value would have been.
    const models = makeModels();
    const out = await intakeSignal({
      projectId: PROJECT,
      kind: 'new_requirement',
      signal: 'latency',
      summary: 'This project has no latency instrumentation at all; we cannot see it.',
      evidence: notObserved('latency', 'no APM configured on this project'),
      aboutMissingTelemetry: true,
      models,
    });
    expect(out.ok).toBe(true);
    expect(models.created[0].about_missing_telemetry).toBe(true);
  });

  it('refuses a summary too thin to act on, and writes nothing', async () => {
    const models = makeModels();
    const out = await intakeSignal({
      projectId: PROJECT, kind: 'defect', signal: 'errors', summary: 'bad', evidence: observed(1), models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.refusals?.some((r) => r.rule === 'summary_insufficient')).toBe(true);
    expect(models.created).toHaveLength(0);
  });

  it('refuses an unknown signal and an unknown kind, and writes nothing', async () => {
    const models = makeModels();
    const out = await intakeSignal({
      projectId: PROJECT,
      kind: 'rewrite_everything',
      signal: 'vibes',
      summary: 'The system feels slower than it did last quarter, broadly speaking.',
      evidence: observed(1),
      models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      const rules = (out.refusals ?? []).map((r) => r.rule).sort();
      expect(rules).toEqual(['unknown_kind', 'unknown_signal']);
    }
    expect(models.created).toHaveLength(0);
  });

  it('refuses a signal for a project that does not exist', async () => {
    const models = makeModels({ project: null });
    const out = await intakeSignal({
      projectId: PROJECT,
      kind: 'defect', signal: 'errors',
      summary: 'Error rate tripled after the checkout deploy on Tuesday.',
      evidence: observed(0.09), models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_such_project');
    expect(models.created).toHaveLength(0);
  });

  it('preserves the not_observed REASON in stored evidence', async () => {
    // A nullable number here would make "no data" and "zero" the same row.
    const models = makeModels();
    await intakeSignal({
      projectId: PROJECT,
      kind: 'new_requirement', signal: 'ai_evals',
      summary: 'No eval suite runs against this project, so quality is unmeasured.',
      evidence: notObserved('ai_evals', 'no eval suite configured'),
      aboutMissingTelemetry: true,
      models,
    });
    expect(JSON.stringify(models.created[0].evidence)).toContain('no eval suite configured');
  });
});
