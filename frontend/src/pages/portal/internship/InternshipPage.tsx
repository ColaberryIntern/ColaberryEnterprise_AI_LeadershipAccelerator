import React, { useCallback, useEffect, useState } from 'react';
import PortalShell from '../today/PortalShell';
import './InternshipPage.css';
import {
  InternshipStatus,
  fetchInternshipStatus,
  saveInternshipIntake,
  selectInternshipChannel,
  startInternshipApplication,
} from '../../../services/internshipApi';
import InternshipInterview from './InternshipInterview';
import InternshipSummary from './InternshipSummary';
import InternshipDocuments from './InternshipDocuments';
import InternshipOnboarding from './InternshipOnboarding';

/**
 * The AI Internship application surface.
 *
 * The overview, Group A (administrative intake), the channel choice, then the
 * interview itself and the review-and-submit screen. The interview surface carries
 * the call panel beside the questions, so choosing a channel is never a commitment
 * — an applicant can start online, take a call, and come back, and the server
 * recomputes what is left rather than tracking a per-channel cursor.
 *
 * ── THE FORM ASKS NO INTERVIEW QUESTIONS ───────────────────────────────────
 *
 * Every field below is identity, contact, a file, a consent, or scheduling. That
 * is the contract's "ask once" rule, and it is enforced three deep: this form has
 * no such input, `administrativeIntakeSchema` is `.strict()` so one could not be
 * submitted anyway, and `internship_administrative_intakes` has no column to
 * store one.
 *
 * ── AND IT NEVER ASKS FOR A KEY ────────────────────────────────────────────
 *
 * The Claude Code / API requirement is stated on this page because the brief
 * requires it on the internship overview. It is an ACKNOWLEDGEMENT — a checkbox
 * saying "I understand I need my own account and key" — and there is deliberately
 * no field to paste either one into. The copy says so explicitly, because a
 * student who has been asked for keys by other platforms will look for the box.
 */

type Saving = 'idle' | 'saving' | 'saved' | 'error';

const WORK_AUTH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None needed — I can work in the US without sponsorship' },
  { value: 'cpt', label: 'CPT' },
  { value: 'opt', label: 'OPT' },
  { value: 'ead', label: 'EAD' },
  { value: 'university_placement', label: 'University placement paperwork' },
  { value: 'other', label: 'Other' },
  { value: 'unsure', label: 'I am not sure' },
];

const InternshipPage: React.FC = () => {
  const [status, setStatus] = useState<InternshipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Saving>('idle');
  const [error, setError] = useState<string | null>(null);
  // Lets the summary be reached from the interview without a lifecycle change,
  // and lets 'go back to the interview' undo it.
  const [forceSummary, setForceSummary] = useState(false);

  const [form, setForm] = useState({
    legal_name: '',
    preferred_name: '',
    phone: '',
    time_zone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '',
    country: '',
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
    work_auth_category: '',
    permission_to_call: false,
    permission_ai_interviewer: false,
    consent_recording: false,
    accommodation_request: '',
    attests_not_employed_fulltime: false,
    commitment_acknowledged: false,
    tools_acknowledged: false,
  });

  const reload = useCallback(async () => {
    try {
      const s = await fetchInternshipStatus();
      setStatus(s);
    } catch {
      setError('We could not load your application. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Landing here with no application yet means the student arrived by URL rather
  // than through the card. Start one, so the page is never a dead end.
  useEffect(() => {
    if (loading || !status || status.application) return;
    startInternshipApplication().then(reload).catch(() => { /* reload shows the real state */ });
  }, [loading, status, reload]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submitIntake = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setSaving('saving');
    setError(null);
    try {
      // `tools_acknowledged` gates the button here; it is not a field the API takes,
      // and sending it would fail `.strict()` — the schema doing its job. The
      // durable acknowledgement is captured by the interview's three tools
      // questions (tools_required_ack, tools_ready_or_will_obtain,
      // tools_secrets_ack), which are answers of record. The
      // InternshipRequirementAcknowledgement row that mirrors them for the
      // activation checklist lands with Phase 6.
      const { tools_acknowledged, work_auth_category, ...rest } = form;
      await saveInternshipIntake({
        ...rest,
        ...(work_auth_category ? { work_auth_category } : {}),
        completes: true,
      });
      setSaving('saved');
      await reload();
    } catch {
      setSaving('error');
      setError('We could not save that. Please check the highlighted fields and try again.');
    }
  };

  const chooseChannel = async (channel: 'form' | 'phone') => {
    try {
      await selectInternshipChannel(channel);
      await reload();
    } catch {
      setError('We could not record that choice. Please try again.');
    }
  };

  if (loading) {
    return (
      <PortalShell>
        <div className="ip-root"><p className="ip-muted">Loading…</p></div>
      </PortalShell>
    );
  }

  const state = status?.application?.state ?? 'not_started';
  const showIntake = ['started', 'not_started'].includes(state);
  // The channel choice is offered once, then the interview surface takes over —
  // which itself carries the call panel, so switching channels never means
  // coming back here.
  const showChannel = state === 'administrative_intake_complete';
  const showInterview = ['interview_channel_selected', 'interview_scheduled', 'interview_in_progress'].includes(state)
    && !forceSummary;
  const showSummary = state === 'interview_complete' || forceSummary;
  // The offer-letter package. Shown from approval through to verification, so a
  // correction request keeps the upload control in reach rather than hiding it.
  const showDocuments = ['approved', 'offer_letter_ready', 'signed_documents_uploaded', 'documents_verified']
    .includes(state);
  // The checklist runs alongside the documents and stays after activation — it is
  // the first-week list too, not just an activation gate.
  const showOnboarding = ['approved', 'offer_letter_ready', 'signed_documents_uploaded',
    'documents_verified', 'payment_pending', 'activation_pending', 'active', 'paused']
    .includes(state);

  return (
    <PortalShell>
      <div className="ip-root">
        <header className="ip-head">
          <h1>AI Internship</h1>
          <p className="ip-lede">
            Work on real Colaberry AI projects alongside your training — two active projects,
            your own manager, and KPIs you track yourself.
          </p>
        </header>

        {error && <div className="ip-alert" role="alert">{error}</div>}

        {/* Two columns, matching Today and Classroom: the application flow on the
            left, the requirements in a sticky rail on the right. The rail collapses
            below the flow on a narrow screen (see .te-grid at max-width:1300px). */}
        <div className="te-grid ip-layout">
          <div className="ip-flow">

        {showIntake && (
          <form className="ip-card" onSubmit={submitIntake} aria-labelledby="ip-intake">
            <h2 id="ip-intake">Your details</h2>
            <p className="ip-muted ip-sub">
              Just the administrative basics. We ask about your goals and experience once, in the
              interview — not twice.
            </p>

            <div className="ip-grid">
              <label className="ip-field">
                <span>Legal name</span>
                <input
                  value={form.legal_name}
                  onChange={(e) => set('legal_name', e.target.value)}
                  required
                  maxLength={255}
                />
              </label>
              <label className="ip-field">
                <span>Preferred name</span>
                <input
                  value={form.preferred_name}
                  onChange={(e) => set('preferred_name', e.target.value)}
                  maxLength={255}
                />
              </label>
              <label className="ip-field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  maxLength={50}
                />
              </label>
              <label className="ip-field">
                <span>Time zone</span>
                <input
                  value={form.time_zone}
                  onChange={(e) => set('time_zone', e.target.value)}
                  maxLength={64}
                />
              </label>
              <label className="ip-field">
                <span>Country</span>
                <input
                  value={form.country}
                  onChange={(e) => set('country', e.target.value)}
                  maxLength={80}
                />
              </label>
              <label className="ip-field">
                <span>Work authorisation</span>
                <select
                  value={form.work_auth_category}
                  onChange={(e) => set('work_auth_category', e.target.value)}
                >
                  <option value="">Select…</option>
                  {WORK_AUTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="ip-field ip-field--wide">
                <span>LinkedIn</span>
                <input
                  type="url"
                  placeholder="https://www.linkedin.com/in/…"
                  value={form.linkedin_url}
                  onChange={(e) => set('linkedin_url', e.target.value)}
                />
              </label>
              <label className="ip-field ip-field--wide">
                <span>GitHub</span>
                <input
                  type="url"
                  placeholder="https://github.com/…"
                  value={form.github_url}
                  onChange={(e) => set('github_url', e.target.value)}
                />
              </label>
              <label className="ip-field ip-field--wide">
                <span>Portfolio (optional)</span>
                <input
                  type="url"
                  value={form.portfolio_url}
                  onChange={(e) => set('portfolio_url', e.target.value)}
                />
              </label>
              <label className="ip-field ip-field--wide">
                <span>Anything we should know to make this accessible for you? (optional)</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={form.accommodation_request}
                  onChange={(e) => set('accommodation_request', e.target.value)}
                />
              </label>
            </div>

            <fieldset className="ip-fieldset">
              <legend>Permissions</legend>
              {/* Three separate boxes. Agreeing to an AI interviewer is not
                  agreeing to be recorded, so they are never combined. */}
              <label className="ip-check">
                <input
                  type="checkbox"
                  checked={form.permission_to_call}
                  onChange={(e) => set('permission_to_call', e.target.checked)}
                />
                <span>You may call me on the number above.</span>
              </label>
              <label className="ip-check">
                <input
                  type="checkbox"
                  checked={form.permission_ai_interviewer}
                  onChange={(e) => set('permission_ai_interviewer', e.target.checked)}
                />
                <span>I am willing to be interviewed by an AI interviewer.</span>
              </label>
              <label className="ip-check">
                <input
                  type="checkbox"
                  checked={form.consent_recording}
                  onChange={(e) => set('consent_recording', e.target.checked)}
                />
                <span>The call may be recorded and transcribed. (Separate from the above — you can say no and still take the call.)</span>
              </label>
            </fieldset>

            <fieldset className="ip-fieldset">
              <legend>Confirmations</legend>
              <label className="ip-check">
                <input
                  type="checkbox"
                  required
                  checked={form.attests_not_employed_fulltime}
                  onChange={(e) => set('attests_not_employed_fulltime', e.target.checked)}
                />
                <span>I am not currently employed full time.</span>
              </label>
              <label className="ip-check">
                <input
                  type="checkbox"
                  required
                  checked={form.commitment_acknowledged}
                  onChange={(e) => set('commitment_acknowledged', e.target.checked)}
                />
                <span>I can commit at least 25 hours a week and attend the required meetings.</span>
              </label>
              <label className="ip-check">
                <input
                  type="checkbox"
                  required
                  checked={form.tools_acknowledged}
                  onChange={(e) => set('tools_acknowledged', e.target.checked)}
                />
                <span>
                  I understand I need my own Claude Code account and my own API key with billing,
                  that I pay for them, and that I must never share those secrets with anyone at
                  Colaberry or enter them on this site.
                </span>
              </label>
            </fieldset>

            <div className="ip-actions">
              <button type="submit" className="te-btn berry" disabled={saving === 'saving'}>
                {saving === 'saving' ? 'Saving…' : 'Save and continue'}
              </button>
              {saving === 'saved' && <span className="ip-muted" role="status">Saved</span>}
            </div>
          </form>
        )}

        {showChannel && (
          <section className="ip-card" aria-labelledby="ip-channel">
            <h2 id="ip-channel">How would you like to interview?</h2>
            <p className="ip-muted ip-sub">
              Both take the same questions and count exactly the same. Pick whichever suits you —
              you can switch part-way through and you will not be asked anything twice.
            </p>
            <div className="ip-choices">
              <button
                type="button"
                className={`ip-choice${status?.application?.interview_channel === 'form' ? ' is-chosen' : ''}`}
                onClick={() => chooseChannel('form')}
              >
                <strong>Answer Interview Questions Online</strong>
                <span>A guided form, a few questions at a time. Saves as you go.</span>
              </button>
              <button
                type="button"
                className={`ip-choice${status?.application?.interview_channel === 'phone' ? ' is-chosen' : ''}`}
                onClick={() => chooseChannel('phone')}
              >
                <strong>Have AI Call Me</strong>
                <span>Our AI interviewer calls you. Now, or at a time you pick.</span>
              </button>
            </div>
            {status?.application?.interview_channel && (
              <p className="ip-muted ip-next" role="status">
                Noted. {status.application.interview_channel === 'phone'
                  ? 'Your questions are ready below — ask for the call whenever you are.'
                  : 'Your questions are ready below.'}
              </p>
            )}
          </section>
        )}

        {showInterview && (
          <InternshipInterview
            onProgressed={() => { void reload(); }}
            onComplete={() => { setForceSummary(true); void reload(); }}
          />
        )}

        {showSummary && (
          <InternshipSummary
            onSubmitted={() => { setForceSummary(false); void reload(); }}
            onEditRequested={() => setForceSummary(false)}
          />
        )}

        {showDocuments && (
          <InternshipDocuments onChanged={() => { void reload(); }} />
        )}

        {showOnboarding && (
          <InternshipOnboarding onChanged={() => { void reload(); }} />
        )}

        {!showIntake && !showChannel && !showInterview && !showSummary && !showDocuments && !showOnboarding && status && (
          <section className="ip-card">
            <h2>{status.title}</h2>
            <p className="ip-muted">
              {status.application?.state === 'under_review'
                ? 'A member of the team is reading your application. We will email you.'
                : 'We will keep this page up to date as your application moves along.'}
            </p>
          </section>
        )}
          </div>

          <aside className="te-side">
            {/* Requirements. Shown on the overview per the brief, and repeated
                later in the interview, the summary and the activation checklist. */}
            <section className="ip-card ip-railcard" aria-labelledby="ip-req">
              <h2 id="ip-req">Before you apply</h2>
              <ul className="ip-list">
                <li>You can commit at least <strong>25 hours a week</strong> and attend the required meetings.</li>
                <li>You are <strong>not currently employed full time</strong>.</li>
                <li>
                  You have, or will get, <strong>your own Claude Code account</strong> and
                  {' '}<strong>your own API key with billing available</strong>. These are required for
                  the class and the internship, and you pay for them directly — roughly $30/month.
                </li>
                <li>
                  The internship is included with membership: <strong>$149/month billed annually</strong>,
                  or <strong>$199 month to month</strong>. It is waived if you already pay Colaberry.
                </li>
              </ul>
              <p className="ip-warn">
                <strong>We will never ask for your password or API key.</strong> There is no field on this
                site to enter one, and no member of Colaberry staff will ask you for it. Keep those secret.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </PortalShell>
  );
};

export default InternshipPage;
