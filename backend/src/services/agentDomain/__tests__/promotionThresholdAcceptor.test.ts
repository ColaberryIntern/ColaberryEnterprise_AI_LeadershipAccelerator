/**
 * AF7.2 — the threshold acceptor must be a RECORDED HUMAN.
 *
 * ## The channel this closes
 *
 * `recorded_human_approvers` was applied to the approver and to evidence evaluators, and never to
 * the acceptor of the quality threshold the whole promotion rests on. `isThresholdAccepted` is a
 * pure function over ONE threshold, so it has no roster and can only ever consult the denylist --
 * and a denylist cannot establish that an identity is a person.
 *
 * An independent verifier walked through it with the human gate fully ON and every other field
 * legitimate, varying only `thresholds[0].accepted_by`. Ten identities reached
 * `promoted: true, refusals: []`, including `auto-approval` -- ONE LETTER off the production
 * timer that wrote all 106 rows in `approval_requests` -- and `Mallory`, whom this module ALREADY
 * refuses as an approver on precisely the grounds that a denylist cannot establish humanity.
 *
 * Every one of those ten is asserted below, by name, because the previous test here was called
 * "REFUSES every machine identity as an acceptor, not just the timer" while asserting only seven
 * hand-picked strings the regex happened to match. A test name claiming more than its assertions
 * is the exact anti-pattern that file's own header condemns.
 */
import {
  evaluatePromotion,
  type PromotionAttempt,
  type PromotionCriteria,
  type QualityThreshold,
} from '../promotionCriteria';

const DHEE = 'Dhee';
const ALI = 'Ali Muwwakkil';

function threshold(over: Partial<QualityThreshold> = {}): QualityThreshold {
  return {
    metric: 'held_rate',
    measured_by: 'approval ledger',
    target: '>= 0.95',
    state: 'accepted',
    accepted_by: DHEE,
    accepted_at: '2026-10-15T12:00:00.000Z',
    ...over,
  } as QualityThreshold;
}

function criteria(over: Partial<PromotionCriteria> = {}): PromotionCriteria {
  return {
    capability_id: 'cap',
    from_autonomy: 'autonomy:R1',
    to_autonomy: 'autonomy:R2',
    entry_prerequisites: ['scoped'],
    permitted_actions: ['draft a reply'],
    prohibited_actions: ['send without approval'],
    scenarios: {
      success: 'drafts and holds',
      ambiguity: 'asks',
      failure: 'reports',
      recovery: 'retries once',
      permission_denial: 'stops',
    },
    thresholds: [threshold()],
    required_evidence: ['held_action'],
    evaluated_by: 'the accountable human',
    human_approval_required: true,
    rollback_conditions: ['any unheld send'],
    suspension_conditions: ['two failures'],
    downgrade_conditions: ['manager asks'],
    ...over,
  } as PromotionCriteria;
}

/** The fully legitimate attempt. Everything here is a recorded human doing its own job. */
function attempt(over: Partial<PromotionAttempt> = {}): PromotionAttempt {
  return {
    criteria: criteria(),
    evidence: [{
      kind: 'held_action',
      source: 'approval ledger row 41',
      observed_at: '2026-10-15T11:00:00.000Z',
      evaluated_by: DHEE,
      summary: 'held for approval as designed',
    }],
    signals: ['pilot_outcomes_reviewed'],
    human_approval: { approver: DHEE, approved_at: '2026-10-15T12:30:00.000Z' },
    proposed_by: ALI,
    recorded_human_approvers: [DHEE, ALI],
    ...over,
  } as PromotionAttempt;
}

describe('AF7.2 the ten identities that used to promote are refused', () => {
  // Verbatim from the verifier's probe output.
  const WALKED_THROUGH = [
    'auto-approval',
    'approval_timer',
    '4-hour timer',
    'timeout handler',
    'the scheduler',
    'nightly cron',
    'approvalTimeoutWorker',
    'robot',
    'daemon',
    'Mallory',
  ];

  it('the control passes: the legitimate attempt still promotes', () => {
    // Without this, every refusal below could be caused by a broken fixture rather than by the
    // acceptor check. This is the assertion that makes the rest mean anything.
    const d = evaluatePromotion(attempt());
    expect(d.refusals).toEqual([]);
    expect(d.promoted).toBe(true);
  });

  it.each(WALKED_THROUGH)('REFUSES %s as the threshold acceptor', (identity) => {
    const d = evaluatePromotion(attempt({
      criteria: criteria({ thresholds: [threshold({ accepted_by: identity })] }),
    }));
    expect(d.promoted).toBe(false);
    // It must be refused for the RIGHT reason, not incidentally by some other gate.
    expect(d.refusals).toContain('threshold_acceptor_not_a_recorded_human');
  });

  it('still refuses the identities the denylist already caught, with its own reason', () => {
    // The denylist keeps its job: it gives a precise reason for an obvious machine.
    const d = evaluatePromotion(attempt({
      criteria: criteria({
        thresholds: [threshold({ accepted_by: 'system:auto_approve_timeout' })],
      }),
    }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('threshold_not_accepted');
  });

  it('a whitespace or case variant of a recorded human is still accepted', () => {
    // norm() trims, case-folds and collapses runs, so a recorded human does not become a machine
    // by being typed with a trailing space.
    const d = evaluatePromotion(attempt({
      criteria: criteria({ thresholds: [threshold({ accepted_by: '  dhee ' })] }),
    }));
    expect(d.refusals).not.toContain('threshold_acceptor_not_a_recorded_human');
  });

  it('a zero-width character cannot smuggle an unrecorded identity past the roster', () => {
    const sneaky = `Dhee${String.fromCharCode(0x200B)}x`;
    const d = evaluatePromotion(attempt({
      criteria: criteria({ thresholds: [threshold({ accepted_by: sneaky })] }),
    }));
    // Stripping the zero-width leaves "dheex", which is not on the roster.
    expect(d.refusals).toContain('threshold_acceptor_not_a_recorded_human');
  });
});

describe('AF7.2 absence is not acceptance — the fourth instance in this module', () => {
  it('a threshold claiming `accepted` with NO roster is refused', () => {
    // Previously the allowlist checks degraded to the denylist whenever the roster was omitted,
    // which is legal any time `human_approval_required` is false.
    const d = evaluatePromotion(attempt({
      recorded_human_approvers: undefined,
      criteria: criteria({ human_approval_required: false }),
      human_approval: null,
    }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('threshold_acceptor_not_a_recorded_human');
  });

  it('an EMPTY roster is treated the same as an absent one', () => {
    const d = evaluatePromotion(attempt({ recorded_human_approvers: [] }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('threshold_acceptor_not_a_recorded_human');
  });

  it('THE ZERO-HUMAN CONSTRUCTION is refused', () => {
    // The verifier composed this: R1->R2, human gate off, roster omitted, and every identity the
    // same machine string. It returned promoted: true with no refusals at all.
    const ghost = 'timeout handler';
    const d = evaluatePromotion({
      criteria: criteria({
        human_approval_required: false,
        evaluated_by: ghost,
        thresholds: [threshold({ accepted_by: ghost })],
      }),
      evidence: [{
        kind: 'held_action',
        source: 'ledger',
        observed_at: '2026-10-15T11:00:00.000Z',
        evaluated_by: ghost,
        summary: 'x',
      }],
      signals: ['manager_review_completed'],
      human_approval: null,
      proposed_by: undefined,
      recorded_human_approvers: undefined,
    } as unknown as PromotionAttempt);

    expect(d.promoted).toBe(false);
    // There is no human anywhere in that attempt, and the refusals must say so.
    expect(d.refusals).toContain('threshold_acceptor_not_a_recorded_human');
    expect(d.refusals).toContain('evaluator_is_not_human');
  });

  it('the evaluator check no longer degrades when the roster is omitted', () => {
    const d = evaluatePromotion(attempt({
      recorded_human_approvers: undefined,
      criteria: criteria({ human_approval_required: false }),
      human_approval: null,
      evidence: [{
        kind: 'held_action',
        source: 'ledger',
        observed_at: '2026-10-15T11:00:00.000Z',
        evaluated_by: 'robot',
        summary: 'x',
      }],
    }));
    expect(d.refusals).toContain('evaluator_is_not_human');
  });
});
