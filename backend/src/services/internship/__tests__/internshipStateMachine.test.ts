/**
 * The lifecycle rules that must hold no matter who calls the service.
 *
 * These are not "does the function return true" tests. Each block below pins one
 * of the implementation contract's stated safety requirements, phrased so that a
 * failure names the requirement that broke rather than the helper that changed.
 */
import {
  INTERNSHIP_STATES,
  TERMINAL_STATES,
  InvalidInternshipTransitionError,
  type InternshipActor,
  type InternshipState,
  assertTransition,
  canTransition,
  isTerminal,
  isInternshipState,
  nextStates,
  stateAfterDocumentsVerified,
  REVIEWER_DECISIONS,
} from '../internshipStateMachine';

const ACTORS: InternshipActor[] = ['applicant', 'reviewer', 'system'];

describe('the human approval gate', () => {
  // "Do not automatically reject from an AI score." / "The AI produces a
  // recommendation, not the final admission decision."
  it.each(['approved', 'rejected', 'waitlisted'] as InternshipState[])(
    'only a reviewer can reach %s — never the system actor',
    (decision) => {
      expect(canTransition('under_review', decision, 'reviewer')).toBe(true);
      expect(canTransition('under_review', decision, 'system')).toBe(false);
      expect(canTransition('under_review', decision, 'applicant')).toBe(false);
    },
  );

  it('no state anywhere in the graph lets system or applicant reach an admission decision', () => {
    // Stronger than the row-level test above: proves there is no back door from
    // some other state that a future edit might quietly add.
    const admissionStates: InternshipState[] = ['approved', 'rejected', 'waitlisted'];
    for (const from of INTERNSHIP_STATES) {
      for (const to of admissionStates) {
        expect(canTransition(from, to, 'system')).toBe(false);
        expect(canTransition(from, to, 'applicant')).toBe(false);
      }
    }
  });

  it('an AI recommendation cannot activate an intern', () => {
    // The single most important assertion in this file.
    for (const from of INTERNSHIP_STATES) {
      if (from === 'activation_pending') continue;
      expect(canTransition(from, 'active', 'system')).toBe(false);
    }
    expect(canTransition('activation_pending', 'active', 'system')).toBe(true);
  });
});

describe('approval does not equal membership', () => {
  // "Approval creates an offer letter but not active membership."
  it('approved cannot jump to active, activation_pending, or documents_verified', () => {
    for (const actor of ACTORS) {
      expect(canTransition('approved', 'active', actor)).toBe(false);
      expect(canTransition('approved', 'activation_pending', actor)).toBe(false);
      expect(canTransition('approved', 'documents_verified', actor)).toBe(false);
    }
  });

  it('approved leads only to the offer letter', () => {
    expect(nextStates('approved', 'system')).toEqual(['offer_letter_ready']);
  });

  // "Unsigned/unverified documents block activation."
  it('an unverified upload cannot reach activation', () => {
    for (const actor of ACTORS) {
      expect(canTransition('offer_letter_ready', 'activation_pending', actor)).toBe(false);
      expect(canTransition('signed_documents_uploaded', 'activation_pending', actor)).toBe(false);
      expect(canTransition('signed_documents_uploaded', 'active', actor)).toBe(false);
    }
  });

  it('the only route into active is documents_verified -> (payment) -> activation_pending', () => {
    // `paused` also reaches `active`, but that is a reviewer resuming an intern
    // who was ALREADY activated — it is not a route through the application
    // pipeline, which is what this invariant is about.
    const intoActive = INTERNSHIP_STATES.filter((s) =>
      ACTORS.some((a) => canTransition(s, 'active', a)));
    expect(intoActive.sort()).toEqual(['activation_pending', 'paused']);
    // Nothing before activation_pending in the pipeline reaches active.
    expect(intoActive).not.toContain('approved');
    expect(intoActive).not.toContain('documents_verified');
    expect(intoActive).not.toContain('signed_documents_uploaded');

    const intoActivationPending = INTERNSHIP_STATES.filter((s) =>
      ACTORS.some((a) => canTransition(s, 'activation_pending', a)));
    expect(intoActivationPending.sort()).toEqual(['documents_verified', 'payment_pending']);
  });
});

describe('the payment gate (confirmed by Ali 2026-09-09)', () => {
  const gate = (o: Partial<Parameters<typeof stateAfterDocumentsVerified>[0]>) =>
    stateAfterDocumentsVerified({
      requiresSubscription: true, hasActiveSubscription: false, hasActiveComp: false, ...o,
    });

  it('requires the membership by default — $149/yr-term or $199 month-to-month', () => {
    expect(gate({})).toBe('payment_pending');
  });

  it('a student already paying Colaberry is already covered (membership inclusion)', () => {
    // The waiver rule: a current Data Analytics student or IPBC does not pay twice.
    expect(gate({ hasActiveSubscription: true })).toBe('activation_pending');
  });

  it('a comped intern skips payment without the internship becoming free for everyone', () => {
    // Ram referral / Ali approval, granted via subscriptionService.grantFreeAccess.
    expect(gate({ hasActiveComp: true })).toBe('activation_pending');
  });

  it('keeps "already paying" and "waived" distinct, so an audit can tell them apart', () => {
    expect(gate({ hasActiveSubscription: true, hasActiveComp: false })).toBe('activation_pending');
    expect(gate({ hasActiveSubscription: false, hasActiveComp: true })).toBe('activation_pending');
    // Both skip payment, but they are different facts and both are passed separately.
    expect(stateAfterDocumentsVerified.length).toBe(1);
  });

  it('a deliberately free internship is one setting, not a schema change', () => {
    expect(gate({ requiresSubscription: false })).toBe('activation_pending');
  });

  it('an unpaid application can be expired by the system but never activated by it', () => {
    expect(canTransition('payment_pending', 'withdrawn', 'system')).toBe(true);
    expect(canTransition('payment_pending', 'active', 'system')).toBe(false);
  });
});

describe('resuming an interview across channels', () => {
  // "Allow an applicant to begin in one channel and finish in the other."
  it('a failed or partial call continues online without leaving the interview', () => {
    expect(canTransition('interview_in_progress', 'interview_in_progress', 'applicant')).toBe(true);
    expect(canTransition('interview_in_progress', 'interview_in_progress', 'system')).toBe(true);
  });

  it('a partial online interview can be finished by phone', () => {
    expect(canTransition('interview_in_progress', 'interview_scheduled', 'applicant')).toBe(true);
  });

  it('a scheduled call can be rescheduled or cancelled back to the channel choice', () => {
    expect(canTransition('interview_scheduled', 'interview_scheduled', 'applicant')).toBe(true);
    expect(canTransition('interview_scheduled', 'interview_channel_selected', 'applicant')).toBe(true);
  });

  it('correcting the summary reopens the interview rather than editing a submitted one', () => {
    expect(canTransition('interview_complete', 'interview_in_progress', 'applicant')).toBe(true);
  });
});

describe('invalid transitions fail', () => {
  it('rejects the frontend shortcut from intake straight to active', () => {
    for (const actor of ACTORS) {
      expect(canTransition('started', 'active', actor)).toBe(false);
      expect(canTransition('administrative_intake_complete', 'approved', actor)).toBe(false);
      expect(canTransition('not_started', 'under_review', actor)).toBe(false);
    }
  });

  it('assertTransition throws a classified error naming from, to and actor', () => {
    expect(() => assertTransition('started', 'active', 'applicant'))
      .toThrow(InvalidInternshipTransitionError);
    try {
      assertTransition('started', 'active', 'applicant');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as InvalidInternshipTransitionError;
      expect(e.error_class).toBe('ContractViolation');
      expect(e.from).toBe('started');
      expect(e.to).toBe('active');
      expect(e.actor).toBe('applicant');
    }
  });

  it('a legal transition does not throw', () => {
    expect(() => assertTransition('not_started', 'started', 'applicant')).not.toThrow();
  });
});

describe('terminal states', () => {
  it.each(TERMINAL_STATES)('%s permits no further transition by anyone', (state) => {
    expect(isTerminal(state)).toBe(true);
    for (const actor of ACTORS) {
      expect(nextStates(state, actor)).toEqual([]);
    }
  });

  it('a rejected application is never revived — reapplying opens a new one', () => {
    for (const to of INTERNSHIP_STATES) {
      for (const actor of ACTORS) {
        expect(canTransition('rejected', to, actor)).toBe(false);
      }
    }
  });
});

describe('table integrity', () => {
  it('every state has a transition row, so an unknown state cannot silently allow anything', () => {
    for (const state of INTERNSHIP_STATES) {
      expect(() => nextStates(state, 'reviewer')).not.toThrow();
    }
  });

  it('every declared target is itself a real state', () => {
    for (const state of INTERNSHIP_STATES) {
      for (const actor of ACTORS) {
        for (const target of nextStates(state, actor)) {
          expect(isInternshipState(target)).toBe(true);
        }
      }
    }
  });

  it('every non-terminal state can still be exited', () => {
    for (const state of INTERNSHIP_STATES) {
      if (isTerminal(state)) continue;
      const anyExit = ACTORS.some((a) => nextStates(state, a).length > 0);
      expect(anyExit).toBe(true);
    }
  });

  it('every reviewer decision maps to a state reachable from under_review', () => {
    for (const target of Object.values(REVIEWER_DECISIONS)) {
      expect(canTransition('under_review', target, 'reviewer')).toBe(true);
    }
  });

  it('isInternshipState rejects a plausible near-miss', () => {
    expect(isInternshipState('activated')).toBe(false);
    expect(isInternshipState('APPROVED')).toBe(false);
    expect(isInternshipState(null)).toBe(false);
    expect(isInternshipState('approved')).toBe(true);
  });
});
