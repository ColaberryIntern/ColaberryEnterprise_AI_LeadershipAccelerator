/**
 * The activation checklist. Pure, so the whole table is covered without fixtures.
 *
 * The rule these tests defend: "Do not award progress merely for opening a card.
 * Progress must reflect a submitted or verified action."
 */
import {
  CHECKLIST,
  activationBlockers,
  checklistProgress,
  nextStudentAction,
  resolveChecklist,
  type ChecklistEvidence,
} from '../internshipOnboarding';
import type { AcknowledgementState, RequirementKey } from '../../../models/InternshipRequirementAcknowledgement';

const acks = (entries: Partial<Record<RequirementKey, AcknowledgementState>> = {}) =>
  new Map(Object.entries(entries) as Array<[RequirementKey, AcknowledgementState]>);

const evidence = (over: Partial<ChecklistEvidence> = {}): ChecklistEvidence => ({
  offer_letter_generated: false,
  signed_documents_uploaded: false,
  all_documents_verified: false,
  membership_ok: false,
  orientation_attended: false,
  acknowledgements: acks(),
  joined_community: false,
  active_project_count: 0,
  first_week_checkin_submitted: false,
  ...over,
});

/** Everything that must be true before someone can be activated. */
const readyToActivate = (over: Partial<ChecklistEvidence> = {}) => evidence({
  offer_letter_generated: true,
  signed_documents_uploaded: true,
  all_documents_verified: true,
  membership_ok: true,
  ...over,
});

describe('the checklist itself', () => {
  it('covers the contract\'s nine post-approval steps, plus the payment gate', () => {
    expect(CHECKLIST).toHaveLength(10);
    const keys = CHECKLIST.map((s) => s.key);
    expect(keys).toContain('sign_offer_letter');
    expect(keys).toContain('upload_signed_documents');
    expect(keys).toContain('documents_verified');
    expect(keys).toContain('orientation');
    expect(keys).toContain('claude_code_ready');
    expect(keys).toContain('api_key_setup_verified');
    expect(keys).toContain('join_community');
    expect(keys).toContain('first_project_assigned');
    expect(keys).toContain('first_week_checkin');
    // The one the contract's list predates.
    expect(keys).toContain('membership_active');
  });

  it('says who completes each step, so nobody feels behind on our work', () => {
    for (const step of CHECKLIST) {
      expect(['student', 'colaberry']).toContain(step.actor);
      expect(step.label.length).toBeGreaterThan(5);
      expect(step.detail.length).toBeGreaterThan(10);
    }
  });

  it('has unique, ordered keys', () => {
    expect(new Set(CHECKLIST.map((s) => s.key)).size).toBe(CHECKLIST.length);
    expect(new Set(CHECKLIST.map((s) => s.order)).size).toBe(CHECKLIST.length);
  });

  it('resolves in order every time', () => {
    const steps = resolveChecklist(evidence());
    const orders = steps.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('nothing completes without evidence', () => {
  it('starts with every step incomplete', () => {
    const steps = resolveChecklist(evidence());
    expect(steps.every((s) => !s.complete)).toBe(true);
    expect(checklistProgress(steps)).toEqual({ done: 0, total: 10 });
  });

  it('completes each step only when its own evidence is present', () => {
    const cases: Array<[keyof ChecklistEvidence, string]> = [
      ['offer_letter_generated', 'sign_offer_letter'],
      ['signed_documents_uploaded', 'upload_signed_documents'],
      ['all_documents_verified', 'documents_verified'],
      ['membership_ok', 'membership_active'],
      ['orientation_attended', 'orientation'],
      ['joined_community', 'join_community'],
      ['first_week_checkin_submitted', 'first_week_checkin'],
    ];
    for (const [field, key] of cases) {
      const steps = resolveChecklist(evidence({ [field]: true } as Partial<ChecklistEvidence>));
      expect(steps.find((s) => s.key === key)!.complete).toBe(true);
      // And nothing else came along for the ride.
      expect(steps.filter((s) => s.complete)).toHaveLength(1);
    }
  });

  it('completes the project step from a real assignment count', () => {
    expect(resolveChecklist(evidence({ active_project_count: 1 }))
      .find((s) => s.key === 'first_project_assigned')!.complete).toBe(true);
    expect(resolveChecklist(evidence({ active_project_count: 0 }))
      .find((s) => s.key === 'first_project_assigned')!.complete).toBe(false);
  });
});

describe('the API-key step needs verification, not a claim', () => {
  const step = (state?: AcknowledgementState) => resolveChecklist(
    evidence({ acknowledgements: state ? acks({ own_api_key_with_billing: state }) : acks() }),
  ).find((s) => s.key === 'api_key_setup_verified')!;

  it('is not complete on a bare acknowledgement', () => {
    expect(step('acknowledged_requirement').complete).toBe(false);
  });

  it('is NOT complete on self-attestation — "I have a key" is a claim', () => {
    // The distinction the three states exist for. If this ever passes on
    // self_attested_ready, the verification state has stopped meaning anything.
    expect(step('self_attested_ready').complete).toBe(false);
  });

  it('is complete only when the setup was verified without collecting the secret', () => {
    expect(step('setup_verified_without_secret_collection').complete).toBe(true);
  });

  it('tells the student what to do differently at each stage', () => {
    expect(step().waiting_on).toMatch(/set up your API key/i);
    expect(step('self_attested_ready').waiting_on).toMatch(/run the setup exercise/i);
  });
});

describe('the Claude Code step accepts their word', () => {
  // We cannot check somebody's subscription exists, so attestation IS the evidence
  // available — unlike the API key, where a probe can actually observe it working.
  const step = (state?: AcknowledgementState) => resolveChecklist(
    evidence({ acknowledgements: state ? acks({ claude_code_account: state }) : acks() }),
  ).find((s) => s.key === 'claude_code_ready')!;

  it('completes on self-attestation', () => {
    expect(step('self_attested_ready').complete).toBe(true);
  });

  it('also completes on verification', () => {
    expect(step('setup_verified_without_secret_collection').complete).toBe(true);
  });

  it('does not complete on a bare acknowledgement', () => {
    expect(step('acknowledged_requirement').complete).toBe(false);
  });
});

describe('what blocks activation', () => {
  it('blocks on documents and membership, never on first-week tasks', () => {
    const blockers = activationBlockers(resolveChecklist(evidence())).map((b) => b.key);
    expect(blockers.sort()).toEqual([
      'documents_verified', 'membership_active', 'sign_offer_letter', 'upload_signed_documents',
    ]);
    // An intern must not be held up by orientation or a first-week check-in.
    expect(blockers).not.toContain('orientation');
    expect(blockers).not.toContain('first_week_checkin');
    expect(blockers).not.toContain('api_key_setup_verified');
  });

  it('unblocks once documents are verified and membership is in order', () => {
    expect(activationBlockers(resolveChecklist(readyToActivate()))).toEqual([]);
  });

  it('still blocks when the membership is not active, even with documents done', () => {
    // The payment gate, from the checklist's side.
    const blockers = activationBlockers(resolveChecklist(readyToActivate({ membership_ok: false })));
    expect(blockers.map((b) => b.key)).toEqual(['membership_active']);
  });

  it('still blocks when documents are unverified, even with membership paid', () => {
    const blockers = activationBlockers(resolveChecklist(readyToActivate({ all_documents_verified: false })));
    expect(blockers.map((b) => b.key)).toEqual(['documents_verified']);
  });
});

describe('the next action', () => {
  it('never tells the student to wait for us', () => {
    // With nothing done, documents_verified is outstanding but is OUR step.
    const next = nextStudentAction(resolveChecklist(evidence()));
    expect(next!.actor).toBe('student');
    expect(next!.key).toBe('sign_offer_letter');
  });

  it('skips our steps to find theirs', () => {
    const steps = resolveChecklist(evidence({
      offer_letter_generated: true,
      signed_documents_uploaded: true,
    }));
    // documents_verified (ours) is next in order but must be skipped.
    expect(nextStudentAction(steps)!.key).toBe('membership_active');
  });

  it('returns null when there is genuinely nothing for them to do', () => {
    const steps = resolveChecklist(evidence({
      offer_letter_generated: true,
      signed_documents_uploaded: true,
      all_documents_verified: true,
      membership_ok: true,
      orientation_attended: true,
      acknowledgements: acks({
        claude_code_account: 'self_attested_ready',
        own_api_key_with_billing: 'setup_verified_without_secret_collection',
      }),
      joined_community: true,
      first_week_checkin_submitted: true,
    }));
    expect(nextStudentAction(steps)).toBeNull();
  });
});
