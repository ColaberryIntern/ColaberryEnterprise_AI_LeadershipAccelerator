import React, { useCallback, useEffect, useState } from 'react';
import {
  OnboardingView,
  fetchInternshipOnboarding,
  recordInternshipAcknowledgement,
} from '../../../services/internshipApi';

/**
 * The activation and first-week checklist.
 *
 * ── IT SAYS WHOSE TURN IT IS ───────────────────────────────────────────────
 *
 * Every step is labelled with who completes it. A checklist of ten identical
 * unticked boxes makes someone feel behind on things they cannot act on — three of
 * these are ours, and saying so is the difference between "you are blocked" and
 * "we are working on it".
 *
 * ── THE API-KEY STEP IS THE INTERESTING ONE ────────────────────────────────
 *
 * It offers two buttons, and they mean different things. "I have set it up" records
 * a claim. "The setup exercise worked" records that it was observed working, and is
 * the only one that completes the step.
 *
 * There is no input for the key, and the copy says so. A student conditioned by
 * other platforms will look for the box, so the absence has to be stated rather
 * than merely implemented.
 */

const InternshipOnboarding: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [view, setView] = useState<OnboardingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await fetchInternshipOnboarding());
      setError(null);
    } catch {
      setError('We could not load your checklist. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const acknowledge = useCallback(async (
    requirement_key: 'claude_code_account' | 'own_api_key_with_billing',
    state: 'self_attested_ready' | 'setup_verified_without_secret_collection',
  ) => {
    setBusy(requirement_key + state);
    setError(null);
    try {
      setView(await recordInternshipAcknowledgement({
        requirement_key,
        state,
        verification_method: state === 'setup_verified_without_secret_collection' ? 'setup_exercise' : null,
      }));
      onChanged?.();
    } catch {
      setError('We could not record that. Please try again.');
    } finally {
      setBusy(null);
    }
  }, [onChanged]);

  if (loading) return <p className="ip-muted">Loading your checklist…</p>;
  if (!view) return <p className="ip-muted">{error ?? 'Checklist unavailable.'}</p>;

  const blockers = view.checklist.filter((s) => s.blocking_activation && !s.complete);
  const claudeStep = view.checklist.find((s) => s.key === 'claude_code_ready');
  const apiStep = view.checklist.find((s) => s.key === 'api_key_setup_verified');

  return (
    <section className="ip-card" aria-labelledby="ip-onb">
      <h2 id="ip-onb">{view.is_active ? 'Your internship' : 'Getting you started'}</h2>

      <p className="ip-muted ip-sub" aria-live="polite">
        {view.is_active
          ? `You are in${view.week ? `, week ${view.week}` : ''}. ${view.progress.done} of ${view.progress.total} steps done.`
          : `${view.progress.done} of ${view.progress.total} steps done.`}
      </p>

      {error && <div className="ip-alert" role="alert">{error}</div>}

      {!view.is_active && blockers.length > 0 && (
        <div className="ip-confirm" role="status">
          <p>
            <strong>You start once these are done.</strong>{' '}
            {blockers.map((b) => b.label).join(' · ')}
          </p>
        </div>
      )}

      {!view.membership.ok && view.membership.requires_subscription && (
        <div className="ip-alert ip-alert--soft" role="status">
          <strong>Your membership is not active yet.</strong> The internship is included with
          membership — $149/month billed annually, or $199 month to month. If you already pay
          Colaberry as a student, tell us and we will waive it.
        </div>
      )}

      <ul className="ip-checklist">
        {view.checklist.map((step) => (
          <li key={step.key} className={`ip-cl${step.complete ? ' is-done' : ''}`}>
            <span className="ip-cl__mark" aria-hidden="true">{step.complete ? '✓' : ''}</span>
            <div className="ip-cl__body">
              <p className="ip-cl__label">
                {step.label}
                {/* Whose turn it is, stated rather than implied. */}
                {step.actor === 'colaberry' && <span className="ip-tag">our turn</span>}
                {step.blocking_activation && !step.complete && (
                  <span className="ip-tag ip-tag--warn">needed to start</span>
                )}
              </p>
              <p className="ip-muted ip-cl__detail">{step.detail}</p>
              {!step.complete && step.waiting_on && step.actor === 'colaberry' && (
                <p className="ip-muted ip-cl__waiting">{step.waiting_on}</p>
              )}

              {step.key === 'claude_code_ready' && !step.complete && (
                <div className="ip-cl__actions">
                  <button
                    type="button"
                    className="te-btn berry sm"
                    onClick={() => acknowledge('claude_code_account', 'self_attested_ready')}
                    disabled={busy !== null}
                  >
                    I have set up Claude Code
                  </button>
                </div>
              )}

              {step.key === 'api_key_setup_verified' && !step.complete && (
                <div className="ip-cl__actions">
                  {/* Two buttons, two different meanings — see the header. */}
                  <button
                    type="button"
                    className="te-btn ghost sm"
                    onClick={() => acknowledge('own_api_key_with_billing', 'self_attested_ready')}
                    disabled={busy !== null}
                  >
                    I have a key with billing
                  </button>
                  <button
                    type="button"
                    className="te-btn berry sm"
                    onClick={() => acknowledge('own_api_key_with_billing', 'setup_verified_without_secret_collection')}
                    disabled={busy !== null}
                  >
                    The setup exercise worked
                  </button>
                  <span className="ip-muted ip-cl__hint">
                    Only the second completes this step — we confirm it <em>works</em>, never what it is.
                  </span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {view.is_active && (
        <dl className="ip-terms">
          <dt>Weekly commitment</dt>
          <dd>At least {view.minimum_weekly_hours} hours</dd>
          <dt>Active projects</dt>
          <dd>Up to {view.max_active_projects} at a time</dd>
          <dt>Required meetings</dt>
          <dd>
            {view.required_meetings.length
              ? view.required_meetings.map((m) => `${m.day} ${m.kind}`).join(', ')
              : 'Your manager will confirm these'}
          </dd>
        </dl>
      )}

      <p className="ip-warn ip-warn--sm">
        <strong>There is no field on this page for your API key or password, and there never will be.</strong>{' '}
        We confirm your setup works by having you run an exercise — we never see the key itself.
      </p>
    </section>
  );
};

export default InternshipOnboarding;
