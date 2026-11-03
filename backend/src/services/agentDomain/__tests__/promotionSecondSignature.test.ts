/**
 * AF6.3: two signatures from `autonomy:R6` up.
 *
 * Every rule is asserted in BOTH directions -- what must now be refused, and what must still
 * promote. A gate that only ever refuses is indistinguishable from a gate that is broken shut, and
 * this subsystem's own history is of checks that passed with the value they guard gutted.
 *
 * The load-bearing test in here is the one for a SECOND SIGNATURE FROM THE SAME PERSON. That is
 * the only way to satisfy a two-signature rule while defeating it completely, so it is tested four
 * ways: the same name, a different case, collapsed whitespace, and a zero-width character spliced
 * into the middle -- the exact trick a verifier previously used to defeat `self_evaluated`.
 */

import {
  SECOND_SIGNATURE_FLOOR,
  SECOND_SIGNATURE_AGENT_MODES,
  SINGLE_SIGNATURE_AGENT_MODES,
  requiresSecondSignature,
  evaluateSecondSignature,
} from '../promotionSecondSignature';
import { evaluatePromotion, recordEvidence } from '../promotionCriteria';
import type {
  PromotionAttempt, PromotionCriteria, QualityThreshold,
} from '../promotionContract';
import { AUTONOMY_STAGES, autonomyIndex, type AutonomyStage } from '../autonomyLadder';

const ROSTER = ['Ali Muwwakkil', 'Kes', 'Dhee'];
const ALI = { approver: 'Ali Muwwakkil', approved_at: '2026-11-02T00:00:00Z' };
const KES = { approver: 'Kes', approved_at: '2026-11-02T01:00:00Z' };

const ACCEPTED: QualityThreshold = {
  metric: 'duplicates', measured_by: 'ledger count', target: '= 0',
  state: 'accepted', accepted_by: 'Dhee', accepted_at: '2026-10-09T00:00:00Z',
};

/** Criteria promoting INTO `to`, one single step, everything else legitimate. */
const criteria = (to: AutonomyStage, over: Partial<PromotionCriteria> = {}): PromotionCriteria => ({
  capability_id: 'internship.routine_document_reminder',
  from_autonomy: AUTONOMY_STAGES[autonomyIndex(to) - 1],
  to_autonomy: to,
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

/** A complete, legitimate attempt into `to`, signed by Ali and countersigned by Kes. */
const attempt = (to: AutonomyStage, over: Partial<PromotionAttempt> = {}): PromotionAttempt => ({
  criteria: criteria(to),
  evidence: [recordEvidence({
    kind: 'pilot_ledger', source: 'email_send_ledger', observed_at: '2026-10-09',
    evaluated_by: 'Dhee', summary: 'send ledger shows no duplicates',
  })!],
  signals: ['pilot_outcomes_reviewed'],
  human_approval: ALI,
  second_approval: KES,
  proposed_by: 'claude',
  human_decision: false,
  recorded_human_approvers: ROSTER,
  ...over,
});

/** The gate on its own, without the other twenty-two refusals in the way. */
const gate = (to: unknown, over: Partial<Parameters<typeof evaluateSecondSignature>[0]> = {}) =>
  evaluateSecondSignature({
    to_autonomy: to, first: ALI, second: KES, proposed_by: 'claude',
    recorded_human_approvers: ROSTER, ...over,
  });

describe('where the line falls', () => {
  it('R6 is the floor, because R6 is where the ladder stops describing a sandbox', () => {
    expect(SECOND_SIGNATURE_FLOOR).toBe('autonomy:R6');
  });

  it.each(['autonomy:R0', 'autonomy:R1', 'autonomy:R2', 'autonomy:R3', 'autonomy:R4', 'autonomy:R5'])(
    '%s needs ONE signature — the agent produces something a human then acts on',
    (stage) => {
      expect(requiresSecondSignature(stage)).toBe(false);
    },
  );

  it.each(['autonomy:R6', 'autonomy:R7', 'autonomy:R8', 'autonomy:R9'])(
    '%s needs TWO — the agent itself causes an effect outside the system',
    (stage) => {
      expect(requiresSecondSignature(stage)).toBe(true);
    },
  );

  it('every one of the ten levels is decided, so none is silently unclassified', () => {
    const decided = AUTONOMY_STAGES.filter(
      (s) => requiresSecondSignature(s) === true || requiresSecondSignature(s) === false,
    );
    expect(decided).toHaveLength(10);
  });

  it('the floor IS the automating line this module already drew, not a second one beside it', () => {
    // `automating_level_without_human_approval` fires above autonomy:R5. Two thresholds one level
    // apart would be two rules nobody could keep straight.
    expect(autonomyIndex(SECOND_SIGNATURE_FLOOR)).toBe(autonomyIndex('autonomy:R5') + 1);
  });

  it('the owner ruled in agent-model words, and the translation stays on record', () => {
    expect(SECOND_SIGNATURE_AGENT_MODES).toEqual(['act_audited', 'communicate']);
    expect(SINGLE_SIGNATURE_AGENT_MODES).toContain('suggest');
    expect(SINGLE_SIGNATURE_AGENT_MODES).not.toContain('act_audited');
  });

  it('an unrecognised level claims nothing, because not_a_single_step already refuses it', () => {
    for (const bad of ['R7', 'autonomy:R10', '', null, undefined, 7, {}]) {
      expect(requiresSecondSignature(bad)).toBe(false);
    }
  });
});

describe('POSITIVE CONTROLS: the refusals below are real constraints', () => {
  it('two distinct recorded humans at R7 promotes with no refusals at all', () => {
    const d = evaluatePromotion(attempt('autonomy:R7'));
    expect(d.refusals).toEqual([]);
    expect(d.promoted).toBe(true);
  });

  it('Ali or Kes, in either order — neither is privileged over the other', () => {
    const swapped = evaluatePromotion(attempt('autonomy:R7', {
      human_approval: KES, second_approval: ALI,
    }));
    expect(swapped.refusals).toEqual([]);
    expect(swapped.promoted).toBe(true);
  });

  it('one signature at R5 still promotes, so the gate is not simply always on', () => {
    const d = evaluatePromotion(attempt('autonomy:R5', { second_approval: null }));
    expect(d.refusals).toEqual([]);
    expect(d.promoted).toBe(true);
  });

  it('the gate itself returns an empty list on a sound attempt', () => {
    expect(gate('autonomy:R6')).toEqual([]);
  });
});

describe('the second signature is missing', () => {
  it('absent at R6 is refused — absence is not approval', () => {
    expect(gate('autonomy:R6', { second: null })).toEqual(['second_signature_missing']);
    expect(gate('autonomy:R6', { second: undefined })).toEqual(['second_signature_missing']);
  });

  it('a signature with no approver is not a signature', () => {
    expect(gate('autonomy:R6', { second: { approver: '   ', approved_at: 'now' } }))
      .toEqual(['second_signature_missing']);
  });

  it('a signature with no date is not a signature either', () => {
    expect(gate('autonomy:R6', { second: { approver: 'Kes', approved_at: '' } }))
      .toEqual(['second_signature_missing']);
  });

  it('reaches the promotion decision', () => {
    const d = evaluatePromotion(attempt('autonomy:R7', { second_approval: null }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('second_signature_missing');
  });
});

describe('THE ONE THAT MATTERS: one person cannot sign twice', () => {
  it('the same name in both slots is one signature written twice', () => {
    expect(gate('autonomy:R6', { first: ALI, second: { ...ALI, approved_at: 'later' } }))
      .toContain('second_signature_repeats_the_first_approver');
  });

  it('a different CASE is the same person', () => {
    expect(gate('autonomy:R6', {
      first: { approver: 'Kes', approved_at: 'a' },
      second: { approver: 'kes', approved_at: 'b' },
    })).toContain('second_signature_repeats_the_first_approver');
  });

  it('EXTRA WHITESPACE is the same person', () => {
    expect(gate('autonomy:R6', {
      first: { approver: 'Ali Muwwakkil', approved_at: 'a' },
      second: { approver: '  Ali   Muwwakkil  ', approved_at: 'b' },
    })).toContain('second_signature_repeats_the_first_approver');
  });

  it('A ZERO-WIDTH CHARACTER is the same person — the trick that beat self_evaluated', () => {
    // U+200B inside an otherwise-identical name. `\s` does not match it, so a trim-and-compare
    // would read these as two different approvers and the whole gate would be decorative.
    expect(gate('autonomy:R6', {
      first: { approver: 'Kes', approved_at: 'a' },
      second: { approver: 'K​es', approved_at: 'b' },
    })).toContain('second_signature_repeats_the_first_approver');
  });

  it('reaches the promotion decision', () => {
    const d = evaluatePromotion(attempt('autonomy:R7', { second_approval: { ...ALI } }));
    expect(d.promoted).toBe(false);
    expect(d.refusals).toContain('second_signature_repeats_the_first_approver');
  });
});

describe('the second approver is held to the standard of the first', () => {
  it('a timer cannot countersign', () => {
    const r = gate('autonomy:R6', {
      second: { approver: 'system:auto_approve_timeout', approved_at: 'now' },
    });
    expect(r).toContain('second_approver_is_not_human');
  });

  it('an unrecorded name cannot countersign, because a denylist cannot establish humanity', () => {
    // Mallory is refused as the FIRST approver for exactly this reason. The second slot being
    // weaker than the first would be a documented way through the gate.
    expect(gate('autonomy:R6', { second: { approver: 'Mallory', approved_at: 'now' } }))
      .toEqual(['second_approver_not_a_recorded_human']);
  });

  it('NO ROSTER is refused rather than waved through', () => {
    expect(gate('autonomy:R6', { recorded_human_approvers: undefined }))
      .toEqual(['second_approver_not_a_recorded_human']);
    expect(gate('autonomy:R6', { recorded_human_approvers: [] }))
      .toEqual(['second_approver_not_a_recorded_human']);
  });

  it('the proposer cannot countersign its own promotion', () => {
    expect(gate('autonomy:R6', {
      proposed_by: 'Kes', second: KES,
    })).toContain('second_approver_is_the_proposer');
  });

  it('an obvious machine collects BOTH codes, as the first approver already does', () => {
    const r = gate('autonomy:R6', {
      second: { approver: 'claude', approved_at: 'now' },
    });
    expect(r).toContain('second_approver_is_not_human');
    expect(r).toContain('second_approver_not_a_recorded_human');
  });
});

describe('the requirement cannot be switched off', () => {
  it('human_approval_required: false does NOT buy a single signature at R7', () => {
    // That flag is an opt-out this subsystem has already been burned by, which is why
    // `automating_level_without_human_approval` exists. The second signature keys on the LEVEL.
    const d = evaluatePromotion(attempt('autonomy:R7', {
      criteria: criteria('autonomy:R7', { human_approval_required: false }),
      second_approval: null,
    }));
    expect(d.refusals).toContain('second_signature_missing');
    expect(d.refusals).toContain('automating_level_without_human_approval');
    expect(d.promoted).toBe(false);
  });

  it('NEGATIVE CONTROL: below the floor the same defects are ignored', () => {
    // Proves the gate is keyed on the level rather than firing on everything it is handed. A
    // duplicate, machine, unrecorded second signature at R4 is simply not this gate's business.
    expect(gate('autonomy:R4', {
      first: ALI,
      second: { approver: 'system:auto_approve_timeout', approved_at: 'now' },
      recorded_human_approvers: [],
    })).toEqual([]);
  });
});
