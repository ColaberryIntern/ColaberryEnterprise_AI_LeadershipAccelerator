/**
 * Unit tests for the PURE Architect Time Machine logic (no I/O): the state machine,
 * the 14 completion gates, interview-answer validation, baseline, receipt/ratio, and
 * the derived Mindset Ledger. Modeled on assessmentScoring.test.ts.
 */
import { WEEK0_SCENARIO, WEEK1_SCENARIO, scenarioForWeek } from '../../../data/architectMindsetScenario';
import {
  isValidTransition, isAnswerValid, invalidAnswers, completionGaps, isCompletionEligible,
  deriveEvidence, assessBaseline, scoreMindset, AM_DIMENSIONS, computeReceipt, ledgerEntryFor, projectLedger, isMeaningful,
  AmProgress, AmInterviewAnswer,
} from '../architectMindsetLogic';

const S = WEEK0_SCENARIO;
const firstOpt = (qid: string) => {
  const q = [...S.interview_part_1, ...S.interview_part_2].find((x) => x.id === qid)!;
  return q.options[0].id; // options[0] is always a real (non-custom) instinct
};
function answeredAll(): Record<string, AmInterviewAnswer> {
  const iv: Record<string, AmInterviewAnswer> = {};
  for (const q of [...S.interview_part_1, ...S.interview_part_2]) iv[q.id] = { choice: q.options[0].id };
  return iv;
}
function fullProgress(): AmProgress {
  return {
    state: 'evaluation_complete',
    first_decision: { choice: 'ask', reasoning: 'I would ask more questions.' },
    revised_decision: { choice: 'redesign' },
    interview: answeredAll(),
    reflection: 'I planned for success but not the failure path.',
    commitment: 'map the whole system, its owners, and its failure paths first',
    flags: { consequence_viewed: true },
    evaluation: { baseline: true, signal: 60 },
    assumptions: [], tradeoffs: [], failure_modes: [],
    last_saved_at: '2026-07-20T00:00:00Z',
  };
}
/** the service applies deriveEvidence before checking gates — mirror that here. */
const withDerived = (p: AmProgress) => ({ ...p, ...deriveEvidence(p, S) });

describe('architectMindset state machine', () => {
  it('allows normal forward moves and resume/back-nav', () => {
    expect(isValidTransition('arrival', 'request_viewed').ok).toBe(true);
    expect(isValidTransition('interview_part_1_complete', 'first_decision_submitted').ok).toBe(true); // back-nav for review
  });
  it('rejects an unknown state', () => {
    expect(isValidTransition('arrival', 'teleport').ok).toBe(false);
    expect(isValidTransition('arrival', 'teleport').reason).toBe('unknown_state');
  });
  it('makes a completed record immutable', () => {
    expect(isValidTransition('completed', 'arrival').ok).toBe(false);
    expect(isValidTransition('completed', 'completed').ok).toBe(true);
  });
  it('never lets advance() reach completion (server-gated only)', () => {
    expect(isValidTransition('project_transfer_complete', 'completed').ok).toBe(false);
    expect(isValidTransition('evaluation_complete', 'completion_eligible').ok).toBe(false);
  });
  it('supports the evaluation retry loop', () => {
    expect(isValidTransition('evaluation_pending', 'evaluation_failed_retryable').ok).toBe(true);
    expect(isValidTransition('evaluation_failed_retryable', 'evaluation_pending').ok).toBe(true);
  });
});

describe('interview validation', () => {
  it('accepts a chosen non-custom option', () => {
    const q = S.interview_part_1[0];
    expect(isAnswerValid(q, { choice: q.options[0].id })).toBe(true);
  });
  it('rejects a custom option with no text, accepts it with text', () => {
    const q = S.interview_part_1[0];
    const customId = q.options.find((o) => o.custom)!.id;
    expect(isAnswerValid(q, { choice: customId, custom: '  ' })).toBe(false);
    expect(isAnswerValid(q, { choice: customId, custom: 'I focused on the org first.' })).toBe(true);
  });
  it('flags every unanswered required question', () => {
    expect(invalidAnswers(S.interview_part_1, {}).length).toBe(S.interview_part_1.length);
    expect(invalidAnswers(S.interview_part_1, answeredAll()).length).toBe(0);
  });
  it('isMeaningful rejects whitespace and one-char', () => {
    expect(isMeaningful('   ')).toBe(false);
    expect(isMeaningful('x')).toBe(false);
    expect(isMeaningful('ok')).toBe(true);
  });
});

describe('completion gates (14, backend-authoritative)', () => {
  it('a fully-answered experience (with derived evidence) is eligible', () => {
    expect(completionGaps(withDerived(fullProgress()), S)).toEqual([]);
    expect(isCompletionEligible(withDerived(fullProgress()), S)).toBe(true);
  });
  it('blocks when the consequence reveal was not viewed', () => {
    const p = withDerived({ ...fullProgress(), flags: {} });
    expect(completionGaps(p, S).some((g) => g.code === 'consequence_viewed')).toBe(true);
  });
  it('blocks when a required interview question is unanswered', () => {
    const p = fullProgress(); const iv = { ...p.interview }; delete (iv as any).q1;
    expect(completionGaps(withDerived({ ...p, interview: iv }), S).some((g) => g.code === 'interview')).toBe(true);
  });
  it('blocks when the Architect Commitment is missing', () => {
    expect(completionGaps(withDerived({ ...fullProgress(), commitment: '' }), S).some((g) => g.code === 'commitment')).toBe(true);
  });
  it('blocks when the experience has not been evaluated', () => {
    expect(completionGaps(withDerived({ ...fullProgress(), evaluation: null }), S).some((g) => g.code === 'evaluation')).toBe(true);
  });
  it('derives assumption/tradeoff/failure evidence from the interview so the MC flow completes', () => {
    const ev = deriveEvidence(fullProgress(), S);
    expect(ev.assumptions.length).toBeGreaterThanOrEqual(1);
    expect(ev.tradeoffs.length).toBeGreaterThanOrEqual(1);
    expect(ev.failure_modes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('receipt + baseline + ledger', () => {
  it('computes the compression ratio from represented hours / duration', () => {
    const r = computeReceipt(S);
    expect(r.represented_hours).toBe(450);
    expect(r.ratio).toBe(Math.round(450 / (r.minutes / 60)));
    expect(r.qualification).toMatch(/not employment experience earned/i);
  });
  it('produces a baseline stage from the structural signal', () => {
    const b = assessBaseline(withDerived(fullProgress()), S);
    expect(b.signal).toBeGreaterThanOrEqual(0);
    expect(b.signal).toBeLessThanOrEqual(100);
    expect(b.stage.label).toBeTruthy();
  });
  it('projects a cumulative ledger across entries', () => {
    const e = ledgerEntryFor({ ...fullProgress(), state: 'completed' }, S);
    const total = projectLedger([e, e]);
    expect(total.lessons_completed).toBe(2);
    expect(total.decisions_recorded).toBe(e.decisions * 2);
    expect(total.represented_hours).toBe(S.receipt.represented_hours * 2);
  });
});

// ── Week 1 (a new scenario on the same framework) + formal scoring ────────────
const W1 = WEEK1_SCENARIO;
function w1Answered(): Record<string, AmInterviewAnswer> {
  const iv: Record<string, AmInterviewAnswer> = {};
  for (const q of [...W1.interview_part_1, ...W1.interview_part_2]) iv[q.id] = { choice: q.options[0].id, custom: null };
  return iv;
}
function w1Full(): AmProgress {
  return {
    state: 'evaluation_complete',
    first_decision: { choice: 'measure', reasoning: 'I would measure why students contact staff.' },
    revised_decision: { choice: 'phased' },
    interview: w1Answered(),
    reflection: 'The request named a solution; the requirement was an outcome.',
    commitment: 'name the outcome and the owner before choosing a tool',
    flags: { zoom_out_viewed: true, consequence_viewed: true },
    assumptions: [], tradeoffs: [], failure_modes: [],
  };
}

describe('Week 1 scenario (reusability) + formal score', () => {
  it('Week 1 is registered as a new scenario instance, scored, on the same framework', () => {
    expect(scenarioForWeek(1)).toBe(W1);
    expect(W1.baseline).toBe(false);
    expect(W1.title).toMatch(/Request Is Not the Requirement/);
    expect(W1.consequence.dashboard && W1.consequence.dashboard.length).toBeGreaterThan(0);   // 30-day dashboard
    expect(W1.zoom_out.titles?.people).toMatch(/Stakeholders/);
    expect(W1.adr.title).toMatch(/ADR-001/);
    expect(computeReceipt(W1).represented_hours).toBe(3200);
  });
  it('the 8 dimensions carry the canonical weights (sum 100)', () => {
    expect(AM_DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBe(100);
  });
  it('scoreMindset produces a weighted total, a stage, and one entry per dimension', () => {
    const sc = scoreMindset({ ...w1Full(), ...deriveEvidence(w1Full(), W1) }, W1);
    expect(sc.dimensions.length).toBe(AM_DIMENSIONS.length);
    expect(sc.total).toBeGreaterThanOrEqual(0);
    expect(sc.total).toBeLessThanOrEqual(100);
    expect(sc.stage.label).toBeTruthy();
    // the weighted total equals the sum of score*weight/100 (transparent)
    const recomputed = Math.round(sc.dimensions.reduce((s, d) => s + d.score * (d.weight / 100), 0));
    expect(sc.total).toBe(recomputed);
  });
  it('rewards depth: reasoning + custom answers raise the score above a bare click-through', () => {
    const bare: AmProgress = { state: 'evaluation_complete', interview: w1Answered(), flags: {} };
    const deep = { ...w1Full(), interview: (() => { const iv = w1Answered(); iv.q1 = { choice: 'hard', custom: 'The hard 18% is exactly who still needs a human.' }; return iv; })() };
    const low = scoreMindset({ ...bare, ...deriveEvidence(bare, W1) }, W1).total;
    const high = scoreMindset({ ...deep, ...deriveEvidence(deep as AmProgress, W1) }, W1).total;
    expect(high).toBeGreaterThan(low);
  });
  it('Week 1 completes through the same 14 gates', () => {
    const p = { ...w1Full(), ...deriveEvidence(w1Full(), W1), evaluation: { baseline: false, total: 60 } } as AmProgress;
    expect(isCompletionEligible(p, W1)).toBe(true);
  });
});
