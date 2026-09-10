import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './InternshipOpportunityCard.css';
import { OnboardingView, fetchInternshipOnboarding } from '../../../services/internshipApi';

/**
 * The active-intern command card, which replaces the recruiting card once someone
 * is in.
 *
 * ── IT HAS TO ANSWER ONE QUESTION ──────────────────────────────────────────
 *
 * "What is the most important internship action I should take now?" So the single
 * next action is the loudest thing on the card, and everything else is context
 * underneath it. A card that listed status, week, projects, blockers, feedback,
 * curriculum and certification with equal weight would answer nothing.
 *
 * ── AND IT NEVER MANUFACTURES A TASK ───────────────────────────────────────
 *
 * `next_action` is null when there is genuinely nothing for the student to do —
 * because the outstanding steps are ours. The card then says so plainly instead of
 * inventing something to look busy, which is the same honesty rule the checklist's
 * `actor` field exists for.
 *
 * ── IT DOES NOT PULSE ──────────────────────────────────────────────────────
 *
 * Deliberately no animation. The recruiting card pulses because it is asking for
 * attention from someone who has not engaged; this one belongs to someone who is
 * already in, and nagging them daily about their own job would be noise.
 */

const InternshipCommandCard: React.FC = () => {
  const [view, setView] = useState<OnboardingView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchInternshipOnboarding()
      .then((v) => { if (alive) setView(v); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // No card rather than a broken one: the rail simply has one fewer entry, which
  // is the correct degraded state for a status surface.
  if (failed || !view) return null;

  const next = view.next_action;
  const blockers = view.checklist.filter((s) => s.blocking_activation && !s.complete);

  return (
    <section className="te-card te-scard te-intern accent-berry" aria-labelledby="te-intern-cmd">
      <span className="te-intern__badge">AI Internship</span>
      <h3 id="te-intern-cmd">
        {view.is_active
          ? `Week ${view.week ?? 1}`
          : blockers.length
            ? 'Almost in'
            : 'Starting soon'}
      </h3>

      {/* The one thing that matters, first and loudest. */}
      {next ? (
        <>
          <p className="te-intern__body">
            <strong>{next.label}</strong>
            {next.detail ? ` — ${next.detail}` : ''}
          </p>
          <div className="te-intern__actions">
            <Link className="te-btn berry te-intern__cta" to="/portal/internship">
              {view.is_active ? 'Open your internship' : 'Continue'}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="te-intern__status">
            <span className="te-intern__dot" aria-hidden="true" />
            <span aria-live="polite">
              {blockers.length
                ? 'Nothing for you to do — we are working through the last steps.'
                : 'You are all set. Your manager will be in touch about your projects.'}
            </span>
          </p>
          <div className="te-intern__actions">
            <Link className="te-btn ghost sm" to="/portal/internship">View details</Link>
          </div>
        </>
      )}

      {/* Context, deliberately quieter than the action above. */}
      <dl className="te-intern__facts">
        <div>
          <dt>Checklist</dt>
          <dd>{view.progress.done}/{view.progress.total}</dd>
        </div>
        <div>
          <dt>Hours/week</dt>
          <dd>{view.minimum_weekly_hours}</dd>
        </div>
        <div>
          <dt>Projects</dt>
          <dd>up to {view.max_active_projects}</dd>
        </div>
      </dl>

      {!view.membership.ok && view.membership.requires_subscription && (
        <p className="te-intern__warn">
          Your membership is not active yet — that is the last thing holding up your start.
        </p>
      )}
    </section>
  );
};

export default InternshipCommandCard;
