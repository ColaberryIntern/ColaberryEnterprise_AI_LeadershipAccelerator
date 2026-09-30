import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './InternshipOpportunityCard.css';
import {
  InternshipStatus,
  dismissInternshipCard,
  recordInternshipCardImpression,
  recordInternshipCardOpened,
  startInternshipApplication,
} from '../../../services/internshipApi';

/**
 * The AI Internship card on Today.
 *
 * ── THE ATTENTION RULES, AND WHY THEY ARE HERE RATHER THAN IN CSS ──────────
 *
 * The brief asks for "a short, subtle pulse every few minutes, not continuous
 * blinking", stopped "for the session after interaction", never competing
 * continuously with the student's current learning next step.
 *
 * A pure-CSS loop cannot express that. `animation-iteration-count: infinite`
 * with a long delay is still a permanent animation, and it has no idea whether
 * the student has already engaged. So the cadence lives here: a timer adds the
 * pulse class for one two-breath burst every PULSE_INTERVAL_MS, and the first
 * interaction clears the timer for the rest of the session — permanently, not
 * until the next render.
 *
 * Reduced motion is checked BEFORE the timer is ever created, so a student who
 * asked for less motion does not merely get an animation that is immediately
 * overridden — they get no timer at all.
 *
 * ── WHY ONLY SOME STATES PULSE ─────────────────────────────────────────────
 *
 * `may_pulse` comes from the server (`internshipEligibility.mayPulse`) and is
 * true only for states where the student can actually do something. A card
 * reading "we are reviewing your application" has no business asking for
 * attention: there is nothing they could do about it, so a pulse would be
 * nagging rather than prompting.
 */

/** One burst every four minutes. Long enough to be a reminder, not a blink. */
const PULSE_INTERVAL_MS = 4 * 60 * 1000;
/** Slightly longer than the CSS animation (1200ms × 2) so the class outlives it. */
const PULSE_BURST_MS = 2600;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Props {
  status: InternshipStatus;
  /** Lets Today refresh its own copy after the student acts. */
  onChanged?: () => void;
}

const InternshipOpportunityCard: React.FC<Props> = ({ status, onChanged }) => {
  const navigate = useNavigate();
  const [pulsing, setPulsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Session-scoped: once true, the pulse never returns for this page life.
  const engagedRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Impression: fires once per mount, per card state.
  useEffect(() => {
    if (!status.render) return;
    recordInternshipCardImpression(status.card_state);
  }, [status.render, status.card_state]);

  // The pulse cadence.
  useEffect(() => {
    if (!status.render || !status.may_pulse) return undefined;
    if (prefersReducedMotion()) return undefined;

    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled || engagedRef.current) return;
      setPulsing(true);
      const off = setTimeout(() => setPulsing(false), PULSE_BURST_MS);
      timersRef.current.push(off);
    }, PULSE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimers();
    };
  }, [status.render, status.may_pulse, clearTimers]);

  const stopPulsingForSession = useCallback(() => {
    engagedRef.current = true;
    setPulsing(false);
    clearTimers();
  }, [clearTimers]);

  const handleOpen = useCallback(async () => {
    stopPulsingForSession();
    recordInternshipCardOpened(status.card_state);

    if (busy) return;
    setBusy(true);
    try {
      // The recruiting card is the only state that creates anything. Every
      // other state already has an application and just needs routing.
      if (status.card_state === 'eligible') {
        await startInternshipApplication();
      }
      navigate('/portal/internship');
      onChanged?.();
    } catch {
      // Navigate anyway: the destination re-reads status and will show the
      // real state, which is a better outcome than a dead button.
      navigate('/portal/internship');
    } finally {
      setBusy(false);
    }
  }, [busy, navigate, onChanged, status.card_state, stopPulsingForSession]);

  const handleDismiss = useCallback(async () => {
    stopPulsingForSession();
    setHidden(true);           // optimistic: the card goes now, not after a round trip
    try {
      await dismissInternshipCard(14);
      onChanged?.();
    } catch {
      setHidden(false);        // the server did not agree; put it back rather than lie
    }
  }, [onChanged, stopPulsingForSession]);

  if (!status.render || hidden || status.card_state === 'none') return null;

  const dismissible = status.card_state === 'eligible';
  const hasCta = !!status.cta;

  return (
    <section
      className={`te-card te-scard te-intern accent-berry${pulsing ? ' te-intern--pulse' : ''}`}
      // Announced as a named region so a screen-reader user can find it by
      // landmark instead of reading the whole rail.
      aria-labelledby="te-intern-title"
    >
      <span className="te-intern__badge">AI Internship</span>
      <h3 id="te-intern-title">{status.title}</h3>

      {!hasCta && (
        <p className="te-intern__status">
          <span className="te-intern__dot" aria-hidden="true" />
          {/* aria-live so a status change reaches a screen reader without a
              focus jump — this text is the whole content of these states. */}
          <span aria-live="polite">{statusBlurb(status.card_state)}</span>
        </p>
      )}

      {hasCta && (
        <p className="te-intern__body">{bodyBlurb(status.card_state)}</p>
      )}

      <div className="te-intern__actions">
        {hasCta && (
          <button
            type="button"
            className="te-btn berry te-intern__cta"
            onClick={handleOpen}
            disabled={busy}
          >
            {busy ? 'Opening…' : status.cta}
          </button>
        )}
        {dismissible && (
          <button
            type="button"
            className="te-intern__dismiss"
            onClick={handleDismiss}
            // Explicit label: "Not now" alone does not say what is being
            // deferred when read out of context.
            aria-label="Not now — hide the AI Internship card for two weeks"
          >
            Not now
          </button>
        )}
      </div>
    </section>
  );
};

/** Copy for the states where the student is waiting on us. */
function statusBlurb(card: InternshipStatus['card_state']): string {
  switch (card) {
    case 'under_review': return 'A member of the team is reading your application.';
    case 'documents_uploaded': return 'We are checking the documents you sent.';
    case 'activation_pending': return 'Almost there — we are setting up your place.';
    case 'waitlisted': return 'You are on the waitlist. We will be in touch if a place opens.';
    default: return '';
  }
}

/** Copy for the states where the student has something to do. */
function bodyBlurb(card: InternshipStatus['card_state']): string {
  switch (card) {
    case 'eligible':
      return 'Work on real Colaberry AI projects alongside the training, with your own manager and KPIs.';
    case 'started':
      return 'You started an application. Pick up where you left off.';
    case 'interview_choice':
      return 'Answer the questions online, or have our AI interviewer call you.';
    case 'call_scheduled':
      return 'Your interview call is booked. You can move it if you need to.';
    case 'interview_in_progress':
      return 'A few questions left. Your answers are saved as you go.';
    case 'information_requested':
      return 'We need one more thing from you before we can decide.';
    case 'approved_documents_pending':
      return 'You are approved. Download your offer letter, sign it, and upload it back.';
    case 'payment_pending':
      return 'Your place is held. Complete your membership to start — $149/mo billed annually, or $199 month to month.';
    case 'active':
      return 'Your current projects, meetings and this week’s commitment.';
    case 'rejected':
      return 'We have written back with the reason and what would change our answer.';
    default:
      return '';
  }
}

export default InternshipOpportunityCard;
