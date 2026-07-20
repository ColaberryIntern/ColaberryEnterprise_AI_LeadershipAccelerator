/**
 * Unit tests for the PURE Architect Time Machine logic (no I/O): the state machine,
 * the 14 completion gates, interview-answer validation, baseline, receipt/ratio, and
 * the derived Mindset Ledger. Modeled on assessmentScoring.test.ts.
 */
import { WEEK0_SCENARIO } from '../../../data/architectMindsetScenario';
import {
  isValidTransition, isAnswerValid, invalidAnswers, completionGaps, isCompletionEligible,
  deriveEvidence, assessBaseline, computeReceipt, ledgerEntryFor, projectLedger, isMeaningful,
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
