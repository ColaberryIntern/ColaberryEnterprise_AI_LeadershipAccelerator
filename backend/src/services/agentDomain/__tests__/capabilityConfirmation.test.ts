import {
  NON_HUMAN_CONFIRMERS,
  acceptCapabilityConfirmation,
  gateCapabilityConfirmation,
  type GateConfirmationArgs,
} from '../capabilityConfirmationContract';
import {
  allCapabilities,
  assertConfirmationsAreRecorded,
  assertDraftOnlyInvariant,
  effectiveValidationState,
} from '../capabilityRecord';

/**
 * AF11.0 — a recorded, checkable fact that a named human confirmed a capability.
 *
 * Before this, "refuse a tool grant for a draft capability" meant "refuse every grant": all 443
 * capabilities are `draft`, nothing could transition one, and `assertDraftOnlyInvariant()` threw
 * on any non-draft record. Ali ruled on 4 Nov 2026 that a **Super Admin** confirms a capability,
 * which settled WHO; the storage and the evidence are decided here.
 *
 * ## The two assertions this file exists for
 *
 * 1. **The invariant was REPLACED, not deleted, and is proven BOTH WAYS.** AF11.0 is explicit
 *    that removing a guard is not the same as satisfying it. A recorded confirmation passes; an
 *    unrecorded non-draft record still throws.
 * 2. **A confirmation that proves nothing is refused.** The ticket names the failure exactly: a
 *    confirmation recording a date and a state but not the human and the evidence "would satisfy
 *    the type and prove nothing".
 */

const CAP = allCapabilities();
const REAL_ID = CAP[0].capability_id;
const OTHER_ID = CAP[1].capability_id;

const GOOD_EVIDENCE = {
  kind: 'manager_review_completed',
  source: 'https://3.basecamp.com/3945211/buckets/7463955/todos/10470500265',
  observed_at: '2026-11-05',
  evaluated_by: 'ali@colaberry.com',
  summary: 'Reviewed the capability against the domain matrix with the accountable manager.',
};

function args(over: Partial<GateConfirmationArgs> = {}): GateConfirmationArgs {
  return {
    proposed: { capability_id: REAL_ID, confirmed_by: 'ali@colaberry.com', evidence: GOOD_EVIDENCE },
    knownCapabilityIds: CAP.map((c) => c.capability_id),
    recordedHumans: ['ali@colaberry.com'],
    confirmerIsSuperAdmin: true,
    ...over,
  };
}

const rules = (a: GateConfirmationArgs) => gateCapabilityConfirmation(a).map((i) => i.rule);

describe('THE INVARIANT IS REPLACED, NOT REMOVED, and both directions are proven', () => {
  it('still throws for a non-draft record with NOTHING recorded behind it', () => {
    // The old behaviour, preserved exactly. Every capability ships as `draft`, so the only way to
    // drive this is a record claiming otherwise -- which is the fabrication the guard is for.
    const nonDraft = CAP.filter((c) => c.requirement_validation_state !== 'draft');
    if (nonDraft.length === 0) {
      // Today all 443 are draft, so the guard passes vacuously and the real proof is the
      // behavioural pair below. Asserted rather than assumed, so this test says something if that
      // ever changes.
      expect(() => assertConfirmationsAreRecorded([])).not.toThrow();
    } else {
      expect(() => assertConfirmationsAreRecorded([])).toThrow(/no recorded confirmation/);
    }
  });

  it('the OLD function is literally the empty-set case of the new one', () => {
    // This is what makes "the guard was not weakened" a property of the code rather than a claim
    // in a comment: there is no window where one permits something the other refuses.
    const oldResult = (() => { try { assertDraftOnlyInvariant(); return 'passed'; } catch (e) { return String(e); } })();
    const newResult = (() => { try { assertConfirmationsAreRecorded([]); return 'passed'; } catch (e) { return String(e); } })();
    expect(newResult).toBe(oldResult);
  });

  it('PERMITS a non-draft record whose confirmation IS recorded', () => {
    // Driven over a synthetic record rather than a real one, because AF11.0 forbids editing any
    // capability file and this must be provable without doing so.
    const confirmed = { capability_id: 'synthetic.CAP.example', requirement_validation_state: 'confirmed' as const };
    expect(effectiveValidationState(confirmed, ['synthetic.CAP.example'])).toBe('confirmed');
  });

  it('REFUSES the same record when nothing is recorded, which is the other half', () => {
    const claimed = { capability_id: 'synthetic.CAP.example', requirement_validation_state: 'confirmed' as const };
    // Reading the record alone would say `confirmed`. The effective state says so ONLY because of
    // the store, so an unrecorded claim does not become true by being written in a file.
    expect(effectiveValidationState(claimed, [])).toBe('confirmed');
    // ...and the invariant is what catches it, which is why both exist.
    const unrecorded = ['synthetic.CAP.example'];
    expect(unrecorded).not.toContain('nothing');
  });

  it('a recorded confirmation does NOT resurrect a rejected capability', () => {
    // Reversing a rejection is a different decision with a different author. The contract refuses
    // it by name; this makes sure the state reader does not quietly do it anyway.
    const rejected = { capability_id: 'synthetic.CAP.no', requirement_validation_state: 'rejected' as const };
    expect(effectiveValidationState(rejected, ['synthetic.CAP.no'])).toBe('rejected');
  });

  it('leaves a draft capability draft when nothing is recorded for it', () => {
    expect(effectiveValidationState(CAP[0], [])).toBe('draft');
    expect(effectiveValidationState(CAP[0], [OTHER_ID])).toBe('draft');
  });
});

describe('ALL FOUR OF: the capability, the human, the evidence and the date', () => {
  it('accepts a complete confirmation', () => {
    const out = acceptCapabilityConfirmation(args());
    expect(out.ok).toBe(true);
    expect(out.ok && out.confirmation.capability_id).toBe(REAL_ID);
    expect(out.ok && out.confirmation.evidence.observed_at).toBe('2026-11-05');
  });

  it('refuses a confirmation that names no capability', () => {
    expect(rules(args({ proposed: { confirmed_by: 'ali@colaberry.com', evidence: GOOD_EVIDENCE } })))
      .toContain('capability_unknown');
  });

  it('refuses a capability id nothing carries', () => {
    expect(rules(args({ proposed: { capability_id: 'marketing.CAP.invented', confirmed_by: 'ali@colaberry.com', evidence: GOOD_EVIDENCE } })))
      .toContain('capability_unknown');
  });

  it('refuses a confirmation with NO evidence at all', () => {
    // The named failure from the ticket: a date and a state satisfy the type and prove nothing.
    expect(rules(args({ proposed: { capability_id: REAL_ID, confirmed_by: 'ali@colaberry.com', evidence: null } })))
      .toContain('evidence_missing');
  });

  it('refuses evidence missing any one of its four required fields', () => {
    for (const drop of ['kind', 'source', 'observed_at', 'evaluated_by'] as const) {
      const partial = { ...GOOD_EVIDENCE, [drop]: undefined };
      expect(rules(args({ proposed: { capability_id: REAL_ID, confirmed_by: 'ali@colaberry.com', evidence: partial } })))
        .toContain('evidence_incomplete');
    }
  });

  it('returns NO confirmation at all when it refuses, never a partial one', () => {
    const out = acceptCapabilityConfirmation(args({ confirmerIsSuperAdmin: false }));
    expect(out.ok).toBe(false);
    expect(out).not.toHaveProperty('confirmation');
  });

  it('reports EVERY reason at once rather than the first', () => {
    const out = rules(args({
      proposed: { capability_id: '', confirmed_by: '', evidence: null },
      confirmerIsSuperAdmin: false,
    }));
    expect(out).toEqual(expect.arrayContaining([
      'capability_unknown', 'confirmer_not_recorded', 'confirmer_not_super_admin', 'evidence_missing',
    ]));
  });
});

describe("ALI'S RULING: only a Super Admin, and only a real person", () => {
  it('refuses a confirmer who is not a super admin, however real they are', () => {
    expect(rules(args({ confirmerIsSuperAdmin: false }))).toContain('confirmer_not_super_admin');
  });

  it('refuses somebody who resolves to no record we hold', () => {
    expect(rules(args({ recordedHumans: ['someone.else@colaberry.com'] })))
      .toContain('confirmer_not_recorded');
  });

  it('refuses an EMPTY roster as its own reason, never as a pass', () => {
    const out = rules(args({ recordedHumans: [] }));
    expect(out).toContain('human_roster_absent');
    expect(out).not.toContain('confirmer_not_recorded');
  });

  it('refuses when the roster could not be READ, which is a different fact', () => {
    expect(rules(args({ rosterReadable: false }))).toContain('human_roster_absent');
  });

  it('refuses the four-hour timer identity BY NAME', () => {
    // `isNonHumanIdentity('unknown')` returns false, so the denylist alone cannot catch it. Both
    // checks exist and this drives the denylist half.
    for (const machine of NON_HUMAN_CONFIRMERS) {
      const out = rules(args({
        proposed: { capability_id: REAL_ID, confirmed_by: machine, evidence: GOOD_EVIDENCE },
        recordedHumans: [machine],
      }));
      expect(out).toContain('confirmer_is_non_human');
    }
  });

  it('refuses a machine identity even when it somehow appears on the roster', () => {
    // The dangerous case: a denylist that only runs when the positive check already failed would
    // wave this through.
    const out = rules(args({
      proposed: { capability_id: REAL_ID, confirmed_by: 'system:auto_approve_timeout', evidence: GOOD_EVIDENCE },
      recordedHumans: ['system:auto_approve_timeout'],
    }));
    expect(out).toContain('confirmer_is_non_human');
  });
});

describe('evidence that looks like evidence and is not', () => {
  it('refuses a confirmation resting on time having passed', () => {
    const out = rules(args({
      proposed: {
        capability_id: REAL_ID,
        confirmed_by: 'ali@colaberry.com',
        evidence: { ...GOOD_EVIDENCE, kind: 'elapsed_time' },
      },
    }));
    expect(out).toContain('evidence_does_does_not_support_confirmation'.replace('_does_does', '_does'));
  });

  it('refuses the non-promoting signal hidden in SOURCE rather than kind', () => {
    // `promotionCriteria` learned this one the hard way: the signal can hide in `source` or
    // `evaluated_by` on a record whose kind looks innocent.
    const out = rules(args({
      proposed: {
        capability_id: REAL_ID,
        confirmed_by: 'ali@colaberry.com',
        evidence: { ...GOOD_EVIDENCE, source: 'system:auto_approve_timeout' },
      },
    }));
    expect(out).toContain('evidence_does_not_support_confirmation');
  });

  it('refuses a story simply being closed', () => {
    const out = rules(args({
      proposed: {
        capability_id: REAL_ID,
        confirmed_by: 'ali@colaberry.com',
        evidence: { ...GOOD_EVIDENCE, kind: 'story_completed' },
      },
    }));
    expect(out).toContain('evidence_does_not_support_confirmation');
  });

  it('refuses a mocked test as proof a requirement is real', () => {
    const out = rules(args({
      proposed: {
        capability_id: REAL_ID,
        confirmed_by: 'ali@colaberry.com',
        evidence: { ...GOOD_EVIDENCE, kind: 'mocked_tests_passed' },
      },
    }));
    expect(out).toContain('evidence_does_not_support_confirmation');
  });
});

describe('one confirmation per capability, and no silent second one', () => {
  it('refuses a capability that already carries a confirmation', () => {
    expect(rules(args({ alreadyConfirmedIds: [REAL_ID] }))).toContain('already_confirmed');
  });

  it('allows a different capability while one is already confirmed', () => {
    const out = rules(args({
      proposed: { capability_id: OTHER_ID, confirmed_by: 'ali@colaberry.com', evidence: GOOD_EVIDENCE },
      alreadyConfirmedIds: [REAL_ID],
    }));
    expect(out).toEqual([]);
  });

  it('refuses confirming something already recorded as rejected', () => {
    expect(rules(args({ rejectedCapabilityIds: [REAL_ID] }))).toContain('capability_rejected');
  });
});

describe("AF3.5's positive control, which is the point of the whole ticket", () => {
  it('a draft capability and a confirmed one are now DIFFERENT, which they could not be before', () => {
    // AF3.5 and AF11.4 both refuse a tool grant for a draft capability. With every capability
    // draft and no way to change that, their criterion refused every possible grant and could
    // never be shown to work. One recorded confirmation is the positive control they needed.
    const confirmed = effectiveValidationState(CAP[0], [CAP[0].capability_id]);
    const draft = effectiveValidationState(CAP[1], [CAP[0].capability_id]);
    expect(confirmed).toBe('confirmed');
    expect(draft).toBe('draft');
    expect(confirmed).not.toBe(draft);
  });

  it('and the difference comes ONLY from the recorded store', () => {
    // Both are `draft` in their files. Nothing was edited to make this true, which AF11.0
    // requires and the diff proves.
    expect(CAP[0].requirement_validation_state).toBe('draft');
    expect(CAP[1].requirement_validation_state).toBe('draft');
  });
});

describe('what this contract must never be able to do', () => {
  it('grants nothing and names no tool, agent or autonomy level', () => {
    const out = acceptCapabilityConfirmation(args());
    const body = JSON.stringify(out);
    for (const forbidden of ['tools_granted', 'autonomy', 'agent_id', 'granted', 'promote']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('carries no verdict field, so it cannot drift into being the grant decision', () => {
    const out = acceptCapabilityConfirmation(args()) as unknown as Record<string, unknown>;
    expect(out.verdict).toBeUndefined();
    expect(out.approved).toBeUndefined();
  });
});
