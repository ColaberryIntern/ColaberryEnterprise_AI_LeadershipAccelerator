/**
 * reviewCycleCore — the agent loop, tested with injected deps (no DB / no model). Covers: stop on pass; stop on an
 * open question from the checks; stop + persist when the revision raises a question; stop on a revise failure; and
 * run to maxIterations writing a version each pass.
 */
import { reviewCycleCore, type ReviewCycleDeps } from '../runReviewCycle';
import type { CheckRunResult } from '../proposalReviewTypes';
import type { Grounding } from '../proposalGrounding';

const emptyGrounding: Grounding = { title: 't', scoringFactors: [], rules: [], pageBudget: null, requirements: [], sections: [], artifacts: [], facts: [] };
const checks = (over: Partial<CheckRunResult> = {}): CheckRunResult => ({ scores: { coverage: 90, format: 90, fact: 90, evaluator: 90, proof: 90, clarity: 90 }, findings: [], fatal: [], passes: false, pageCount: 1, ...over });

function deps(over: Partial<ReviewCycleDeps>): ReviewCycleDeps {
  return {
    loadContent: async () => '<p>draft</p>',
    runChecks: async () => checks(),
    gatherGrounding: async () => emptyGrounding,
    revise: async () => ({ html: '<p>revised</p>', gaps: [], changeSummary: 'fix' }),
    saveVersion: async () => {},
    persistGaps: async () => {},
    log: () => {},
    ...over,
  };
}

describe('reviewCycleCore', () => {
  it('stops at passed when the checks pass', async () => {
    const r = await reviewCycleCore(deps({ runChecks: async () => checks({ passes: true }) }));
    expect(r).toMatchObject({ stoppedBecause: 'passed', finalPasses: true, iterations: 1 });
  });

  it('stops at open_questions when the checks surface an open fact gap', async () => {
    const r = await reviewCycleCore(deps({ runChecks: async () => checks({ findings: [{ check: 'fact', severity: 'major', message: 'open question' }] }) }));
    expect(r.stoppedBecause).toBe('open_questions');
  });

  it('stops + persists gaps when the revision raises a question it cannot answer', async () => {
    const persistGaps = jest.fn(async () => {});
    const r = await reviewCycleCore(deps({ revise: async () => ({ html: '<p>x</p>', gaps: [{ question: 'Who is the PM?', suggestions: [] }], changeSummary: 'c' }), persistGaps }));
    expect(r.stoppedBecause).toBe('open_questions');
    expect(persistGaps).toHaveBeenCalled();
  });

  it('stops at revise_failed when the reviser errors', async () => {
    const r = await reviewCycleCore(deps({ revise: async () => ({ html: '', gaps: [], changeSummary: '', error: 'no key' }) }));
    expect(r.stoppedBecause).toBe('revise_failed');
  });

  it('runs to maxIterations writing a version each pass when it never passes and never asks', async () => {
    const saveVersion = jest.fn(async () => {});
    const r = await reviewCycleCore(deps({ saveVersion }), { maxIterations: 3 });
    expect(r.stoppedBecause).toBe('max_iterations');
    expect(r.iterations).toBe(3);
    expect(saveVersion).toHaveBeenCalledTimes(3);
  });

  it('stops at no_document when there is no draft and no create-path is injected', async () => {
    const r = await reviewCycleCore(deps({ loadContent: async () => null }));
    expect(r.stoppedBecause).toBe('no_document');
  });

  it('T06: with no draft, BUILDS one via createDraft, then reaches judging — passes on the built draft', async () => {
    const createDraft = jest.fn(async () => '<h3>Built section</h3>');
    const runChecks = jest.fn(async () => checks({ passes: true }));
    const r = await reviewCycleCore(deps({ loadContent: async () => null, createDraft, runChecks }));
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(runChecks).toHaveBeenCalled(); // it reached the judging loop rather than dead-ending at no_document
    expect(r).toMatchObject({ stoppedBecause: 'passed', finalPasses: true, iterations: 1 });
  });

  it('T06: stops at build_failed when the create-path cannot draft anything', async () => {
    const r = await reviewCycleCore(deps({ loadContent: async () => null, createDraft: async () => null }));
    expect(r.stoppedBecause).toBe('build_failed');
    expect(r.finalPasses).toBe(false);
  });
});
