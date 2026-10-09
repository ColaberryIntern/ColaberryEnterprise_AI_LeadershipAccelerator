import {
  NON_PROMOTING_SIGNALS,
  REQUIRED_SCENARIO_CLASSES,
  INTERNSHIP_REMINDER_EXAMPLE,
  INTERNSHIP_ACCEPTANCE_IS_HUMAN,
  evaluatePromotion,
  isNonPromotingSignal,
  isThresholdAccepted,
  recordEvidence,
  renderThreshold,
  type PromotionAttempt,
  type PromotionCriteria,
  type QualityThreshold,
} from '../promotionCriteria';
import { autonomyIndex } from '../autonomyLadder';

const ACCEPTED: QualityThreshold = {
  metric: 'duplicates', measured_by: 'ledger count', target: '= 0',
  state: 'accepted', accepted_by: 'Dhee', accepted_at: '2026-10-09T00:00:00Z',
};

const criteria = (over: Partial<PromotionCriteria> = {}): PromotionCriteria => ({
  capability_id: 'internship.routine_document_reminder',
  from_autonomy: 'autonomy:R2',
  to_autonomy: 'autonomy:R3',
  entry_prerequisites: ['a pilot completed'],
  permitted_actions: ['send an approved template'],
  prohibited_actions: ['accept an application'],
  scenarios: {
    success: 'one reminder sent',
    ambiguity: 'unreadable state, escalate',
    failure: 'missing record, escalate',
    recovery: 'retry sends no duplicate',
    permission_denial: 'refused and logged',
  },
  thresholds: [ACCEPTED],
  required_evidence: ['send ledger'],
  evaluated_by: 'the accountable human',
  human_approval_required: true,
  rollback_conditions: ['any duplicate'],
  suspension_conditions: ['ledger unreadable'],
  downgrade_conditions: ['key not enforced'],
  ...over,
});

const attempt = (over: Partial<PromotionAttempt> = {}): PromotionAttempt => ({
  criteria: criteria(),
  evidence: [recordEvidence({
    kind: 'pilot_ledger', source: 'email_send_ledger', observed_at: '2026-10-09',
    evaluated_by: 'Dhee', summary: 'no duplicates',
  })!],
  signals: ['pilot_outcomes_reviewed'],
  human_approval: { approver: 'Dhee', approved_at: '2026-10-09T00:00:00Z' },
  proposed_by: 'claude',
  human_decision: false,
  ...over,
});

describe('a complete attempt CAN promote, so the refusals below are real constraints', () => {
  it('promotes when every condition is met', () => {
    const d = evaluatePromotion(attempt());
    expect(d.refusals).toEqual([]);
    expect(d.promoted).toBe(true);
  });
});

describe('the four signals that promote NOTHING', () => {
  // The owner named these four explicitly. Each gets its own test.
  it('lists exactly the four', () => {
    expect([...NON_PROMOTING_SIGNALS].sort()).toEqual(
      ['elapsed_time', 'mocked_tests_passed', 'story_completed', 'successful_conversation'],
    );
  });

  it('STORY COMPLETION alone does not promote', () => {
    const d = evaluatePromotion(attempt({ signals: ['story_completed'] }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('non_promoting_signal_only');
  });

  it('ELAPSED TIME alone does not promote — the failure already on record here', () => {
    // 106 approval_requests rows carry exactly one decided_by value:
    // system:auto_approve_timeout. A 4.25-hour clock was recorded as a human decision.
    const d = evaluatePromotion(attempt({ signals: ['elapsed_time'] }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('non_promoting_signal_only');
  });

  it('A SUCCESSFUL CONVERSATION alone does not promote', () => {
    const d = evaluatePromotion(attempt({ signals: ['successful_conversation'] }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('non_promoting_signal_only');
  });

  it('PASSING MOCKED TESTS alone does not promote', () => {
    const d = evaluatePromotion(attempt({ signals: ['mocked_tests_passed'] }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('non_promoting_signal_only');
  });

  it('all four together still do not promote', () => {
    const d = evaluatePromotion(attempt({ signals: [...NON_PROMOTING_SIGNALS] }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('non_promoting_signal_only');
  });

  it('POSITIVE CONTROL: a real signal alongside them DOES clear this refusal', () => {
    // Proves the refusal keys on the signals rather than refusing everything.
    const d = evaluatePromotion(attempt({ signals: ['elapsed_time', 'pilot_outcomes_reviewed'] }));
    expect(d.refusals).not.toContain('non_promoting_signal_only');
  });

  it('the classifier names each one', () => {
    for (const s of NON_PROMOTING_SIGNALS) expect(isNonPromotingSignal(s)).toBe(true);
    expect(isNonPromotingSignal('pilot_outcomes_reviewed')).toBe(false);
  });
});

describe('proposed is never accepted', () => {
  const proposed: QualityThreshold = {
    metric: 'duplicates', measured_by: 'ledger count', target: '= 0', state: 'proposed',
    accepted_by: null, accepted_at: null,
  };

  it('a proposed threshold blocks promotion', () => {
    const d = evaluatePromotion(attempt({ criteria: criteria({ thresholds: [proposed] }) }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('threshold_not_accepted');
  });

  it('a proposed threshold ALWAYS renders with its label', () => {
    expect(renderThreshold(proposed)).toContain('PROPOSED');
    expect(renderThreshold(proposed)).not.toMatch(/\[accepted\]/);
  });

  it('an accepted threshold renders as accepted', () => {
    expect(renderThreshold(ACCEPTED)).toContain('[accepted]');
  });

  it('acceptance requires a NAMED human and a timestamp, not just the word', () => {
    expect(isThresholdAccepted({ ...ACCEPTED, accepted_by: null })).toBe(false);
    expect(isThresholdAccepted({ ...ACCEPTED, accepted_at: null })).toBe(false);
    expect(isThresholdAccepted({ ...ACCEPTED, accepted_by: '  ' })).toBe(false);
    expect(isThresholdAccepted({ ...proposed, state: 'accepted' })).toBe(false);
    expect(isThresholdAccepted(ACCEPTED)).toBe(true);
  });

  it('a threshold with no measurement method is refused', () => {
    const d = evaluatePromotion(attempt({
      criteria: criteria({ thresholds: [{ ...ACCEPTED, measured_by: '' }] }),
    }));
    expect(d.refusals).toContain('threshold_has_no_measurement');
  });
});

describe('no fabricated evaluation results', () => {
  it('evidence without a source is REFUSED at creation', () => {
    expect(recordEvidence({ kind: 'k', source: '', observed_at: 'x', evaluated_by: 'y' })).toBeNull();
    expect(recordEvidence({ kind: 'k', observed_at: 'x', evaluated_by: 'y' })).toBeNull();
  });

  it('POSITIVE CONTROL: a sourced record IS accepted', () => {
    expect(recordEvidence({
      kind: 'k', source: 'email_send_ledger', observed_at: 'x', evaluated_by: 'y',
    })).not.toBeNull();
  });

  it('an attempt with no evidence does not promote', () => {
    const d = evaluatePromotion(attempt({ evidence: [] }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('evidence_missing');
  });

  it('a sourceless record smuggled in is still caught at evaluation', () => {
    const d = evaluatePromotion(attempt({
      evidence: [{ kind: 'k', source: '', observed_at: 'x', evaluated_by: 'y', summary: '' }],
    }));
    expect(d.refusals).toContain('evidence_without_source');
  });

  it('the module exports no function that produces a result', () => {
    // It accepts and attributes evidence; it never scores its own promotion.
    const mod = require('../promotionCriteria');
    const names = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
    for (const n of names) {
      expect(n).not.toMatch(/generate|simulate|synthes|fabricat|score/i);
    }
  });
});

describe('human approval, and approver is never proposer', () => {
  it('missing approval blocks promotion', () => {
    const d = evaluatePromotion(attempt({ human_approval: null }));
    expect(d.refusals).toContain('human_approval_missing');
  });

  it('SELF-APPROVAL is refused', () => {
    const d = evaluatePromotion(attempt({ proposed_by: 'claude', human_approval: { approver: 'claude', approved_at: 'now' } }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('self_evaluated');
  });

  it('POSITIVE CONTROL: a different approver is accepted', () => {
    const d = evaluatePromotion(attempt({ proposed_by: 'claude', human_approval: { approver: 'Dhee', approved_at: 'now' } }));
    expect(d.refusals).not.toContain('self_evaluated');
  });
});

describe('every scenario class is required', () => {
  it('lists the five classes', () => {
    expect([...REQUIRED_SCENARIO_CLASSES]).toEqual(
      ['success', 'ambiguity', 'failure', 'recovery', 'permission_denial'],
    );
  });

  for (const cls of REQUIRED_SCENARIO_CLASSES) {
    it(`a missing ${cls} scenario blocks promotion`, () => {
      const scenarios = { ...criteria().scenarios, [cls]: '' };
      const d = evaluatePromotion(attempt({ criteria: criteria({ scenarios: scenarios as any }) }));
      expect(d.refusals).toContain('missing_scenario_class');
    });
  }
});

describe('promotion is one step, and a human decision can never be automated', () => {
  it('a two-step jump is not a promotion', () => {
    const d = evaluatePromotion(attempt({
      criteria: criteria({ from_autonomy: 'autonomy:R2', to_autonomy: 'autonomy:R4' }),
    }));
    expect(d.refusals).toContain('not_a_single_step');
  });

  it('a human-required decision cannot promote above R5, however much evidence exists', () => {
    const d = evaluatePromotion(attempt({
      human_decision: true,
      criteria: criteria({ from_autonomy: 'autonomy:R5', to_autonomy: 'autonomy:R6' }),
    }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('human_decision_cannot_be_automated');
  });

  it('no criteria at all refuses rather than defaulting to permitted', () => {
    const d = evaluatePromotion(attempt({ criteria: null }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toEqual(['no_criteria_defined']);
  });
});

describe('the owner worked example is encoded, not paraphrased', () => {
  it('the reminder capability defines all five scenario classes', () => {
    for (const cls of REQUIRED_SCENARIO_CLASSES) {
      expect(INTERNSHIP_REMINDER_EXAMPLE.scenarios[cls]).toBeTruthy();
    }
  });

  it('its prohibited actions cover self-approval and the owner named exceptions', () => {
    const p = INTERNSHIP_REMINDER_EXAMPLE.prohibited_actions.join(' | ').toLowerCase();
    expect(p).toContain('self-approve');
    expect(p).toContain('accept, reject or advance');
    expect(p).toMatch(/contact-restricted|opted out/);
    expect(p).toMatch(/second reminder|duplicate/);
  });

  it('duplicate prevention, incorrect and missing records, escalation are all covered', () => {
    const s = Object.values(INTERNSHIP_REMINDER_EXAMPLE.scenarios).join(' | ').toLowerCase();
    expect(s).toContain('duplicate');
    expect(s).toContain('missing');
    expect(s).toContain('escalate');
  });

  it('its thresholds are PROPOSED, because no human has accepted them', () => {
    expect(INTERNSHIP_REMINDER_EXAMPLE.thresholds.every((t) => !isThresholdAccepted(t))).toBe(true);
  });

  it('so the example itself does NOT promote today — which is the honest state', () => {
    const d = evaluatePromotion({
      criteria: INTERNSHIP_REMINDER_EXAMPLE,
      evidence: [recordEvidence({ kind: 'pilot', source: 'ledger', observed_at: 'x', evaluated_by: 'Dhee' })!],
      signals: ['pilot_outcomes_reviewed'],
      human_approval: { approver: 'Dhee', approved_at: 'now' },
      proposed_by: 'claude',
      human_decision: false,
    });
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('threshold_not_accepted');
  });

  it('ACCEPTANCE stays human at every level, capped below automation', () => {
    expect(INTERNSHIP_ACCEPTANCE_IS_HUMAN.human_decision).toBe(true);
    expect(autonomyIndex(INTERNSHIP_ACCEPTANCE_IS_HUMAN.max_permitted_autonomy))
      .toBeLessThanOrEqual(autonomyIndex('autonomy:R5'));
    expect(INTERNSHIP_ACCEPTANCE_IS_HUMAN.rationale).toMatch(/never self-approve an applicant/i);
  });

  it('the reminder and the acceptance decision are DIFFERENT capabilities', () => {
    // The owner split: reminders may eventually automate; acceptance never does.
    expect(INTERNSHIP_REMINDER_EXAMPLE.capability_id)
      .not.toBe(INTERNSHIP_ACCEPTANCE_IS_HUMAN.capability_id);
    expect(autonomyIndex(INTERNSHIP_REMINDER_EXAMPLE.to_autonomy))
      .toBeGreaterThan(autonomyIndex(INTERNSHIP_ACCEPTANCE_IS_HUMAN.max_permitted_autonomy));
  });
});
