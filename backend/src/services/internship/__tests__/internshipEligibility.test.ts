/**
 * The card's behaviour rules, pinned as tests.
 *
 * Pure module, so these run without a database and cover the whole state table
 * exhaustively rather than the two or three states a fixture would reach.
 */
import { INTERNSHIP_STATES, type InternshipState } from '../internshipStateMachine';
import {
  cardCopy, cardStateFor, isStudentActionable, mayPulse, shouldRenderCard,
  type InternshipCardState,
} from '../internshipEligibility';

describe('every lifecycle state maps to a card state', () => {
  it.each(INTERNSHIP_STATES)('%s maps to something', (state) => {
    expect(typeof cardStateFor(state)).toBe('string');
  });

  it('shows no card for states the student has nothing to see', () => {
    expect(cardStateFor('completed')).toBe('none');
    expect(cardStateFor('withdrawn')).toBe('none');
    expect(cardStateFor('removed')).toBe('none');
  });

  it('a rejected applicant still sees their decision', () => {
    // "If rejected, receive a clear reason" — hiding the card would hide it.
    expect(cardStateFor('rejected')).toBe('rejected');
  });

  it('waiting on documents and waiting on payment are different cards', () => {
    // Telling someone "final activation in progress" when activation is waiting
    // on THEM would be a lie, which is why payment_pending is not folded in.
    expect(cardStateFor('payment_pending')).toBe('payment_pending');
    expect(cardStateFor('documents_verified')).toBe('activation_pending');
  });

  it('a paused intern still sees the active internship surface', () => {
    expect(cardStateFor('paused')).toBe('active');
  });
});

describe('what may ask for attention', () => {
  it('only pulses where the student can actually act', () => {
    expect(mayPulse('eligible')).toBe(true);
    expect(mayPulse('information_requested')).toBe(true);
  });

  it('never pulses while the student is waiting on us', () => {
    for (const card of ['under_review', 'documents_uploaded', 'activation_pending', 'waitlisted'] as InternshipCardState[]) {
      expect(mayPulse(card)).toBe(false);
    }
  });

  it('every pulsing state is also a student-actionable one', () => {
    const all = INTERNSHIP_STATES.map(cardStateFor);
    for (const card of all) {
      if (mayPulse(card)) expect(isStudentActionable(card)).toBe(true);
    }
  });

  it('a status-only card is never marked actionable', () => {
    expect(isStudentActionable('under_review')).toBe(false);
    expect(isStudentActionable('documents_uploaded')).toBe(false);
    expect(isStudentActionable('activation_pending')).toBe(false);
  });
});

describe('rendering and dismissal', () => {
  const NOW = 1_757_000_000_000;

  it('renders nothing at all when the flag is off', () => {
    for (const state of INTERNSHIP_STATES) {
      expect(shouldRenderCard({
        card: cardStateFor(state), flagEnabled: false, dismissedUntilMs: null, nowMs: NOW,
      })).toBe(false);
    }
  });

  it('hides the recruiting card until the reappearance date', () => {
    expect(shouldRenderCard({
      card: 'eligible', flagEnabled: true, dismissedUntilMs: NOW + 1000, nowMs: NOW,
    })).toBe(false);
  });

  it('brings it back once the date passes', () => {
    expect(shouldRenderCard({
      card: 'eligible', flagEnabled: true, dismissedUntilMs: NOW - 1000, nowMs: NOW,
    })).toBe(true);
  });

  it('a dismissal never hides something we owe the student an answer about', () => {
    // Dismissing the recruiting card must not silence "action required" or a
    // decision later on — those are not the thing the student said "not now" to.
    for (const card of ['information_requested', 'rejected', 'approved_documents_pending', 'payment_pending'] as InternshipCardState[]) {
      expect(shouldRenderCard({
        card, flagEnabled: true, dismissedUntilMs: NOW + 86_400_000, nowMs: NOW,
      })).toBe(true);
    }
  });

  it('never renders the none state', () => {
    expect(shouldRenderCard({
      card: 'none', flagEnabled: true, dismissedUntilMs: null, nowMs: NOW,
    })).toBe(false);
  });
});

describe('copy', () => {
  it('gives every renderable card a title', () => {
    for (const state of INTERNSHIP_STATES) {
      const card = cardStateFor(state);
      if (card === 'none') continue;
      expect(cardCopy(card, { state }).title.length).toBeGreaterThan(0);
    }
  });

  it('offers no CTA where there is nothing for the student to do', () => {
    for (const card of ['under_review', 'documents_uploaded', 'activation_pending', 'waitlisted'] as InternshipCardState[]) {
      expect(cardCopy(card).cta).toBeNull();
    }
  });

  it('does not promise admission to a waitlisted applicant', () => {
    const copy = cardCopy('waitlisted');
    expect(copy.title.toLowerCase()).toContain('waitlist');
    expect(copy.cta).toBeNull();
  });

  it('distinguishes "finish the interview" from "review your answers"', () => {
    // The collapsed interview_complete mapping must still read correctly.
    const during = cardCopy('interview_in_progress', { state: 'interview_in_progress' as InternshipState });
    const after = cardCopy('interview_in_progress', { state: 'interview_complete' as InternshipState });
    expect(during.cta).not.toEqual(after.cta);
    expect(after.title.toLowerCase()).toContain('review');
  });
});
