import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { freeSignup } from '../../services/onboardingApi';
import { identifyVisitor } from '../../utils/tracker';
import { getSignupAcquisitionFields } from '../../services/utmService';
import { SIGNUP_CONSENT_TEXT, PHONE_CONSENT_TEXT } from '../../config/consentText';

// Public "Start for $0" front door. Creates a $0 guest account (0 points), logs
// the visitor straight in, and drops them on the Today shell — the top of the
// onboarding funnel. Styled onto the Colaberry Design System to match
// PortalLoginPage (self-contained scoped `cbfs-*` classes).
//
// COPY RULE: the word "free" never appears on this page. Ali, 2026-10-05, on the
// landing page that fed it: "don't use free". TWC §807.172(d) governs how a career
// school may advertise, so the approved wording is "$0 to start" / "No card needed".
// The identifiers (`freeSignup`, the component name, the `cbfs-` class prefix) are
// internal and deliberately left alone - renaming them would churn every consumer
// without changing a word anybody reads.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function PortalFreeSignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // Optional. 270 signups in thirty days produced zero numbers because the form never asked, so
  // nobody could be called; requiring it would cost signups on a page converting at 41.6%.
  const [phone, setPhone] = useState('');
  const [phoneConsent, setPhoneConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // C103: set when the email already has an account and the server sent a sign-in link instead.
  const [notice, setNotice] = useState('');
  // UNCHECKED by default, and NOT required to submit.
  //
  // Unchecked because a pre-ticked box is not an affirmative act, and this value
  // becomes the consent of record for every email we later send. Not required
  // because this is the front door of a live paid-ad funnel: making it block
  // submission would trade signups for permissions, which is not a trade a
  // bug fix gets to make on its own. Someone who leaves it alone still gets their
  // account and still gets their sign-in link, which is transactional and needs no
  // marketing consent.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const { login } = useParticipantAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!fullName.trim()) { setError('Please enter your name.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email.'); return; }
    setLoading(true);
    try {
      const person = {
        full_name: fullName.trim(),
        email: email.trim(),
        marketing_opt_in: marketingOptIn,
        // Sent only when given. The route is `.strict()`, so a server deployed before these
        // fields existed would reject the whole signup rather than ignore the extra keys.
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(phone.trim() && phoneConsent ? { phone_consent: true } : {}),
      };
      // C94: the ad that brought them (source|medium, campaign, ad, placement, page). Only keys with a value the
      // strict route accepts are present. If the server still answers 400 (a backend older than this page, or a
      // value it rejects), sign them up once more WITHOUT the tracking keys: attribution must never cost a signup.
      // A 400 that was about the person (a bad email) fails the retry the same way and shows the same message.
      const acquisition = getSignupAcquisitionFields();
      let res;
      try {
        res = await freeSignup({ ...person, ...acquisition });
      } catch (first: any) {
        if (first?.response?.status !== 400 || Object.keys(acquisition).length === 0) throw first;
        res = await freeSignup(person);
      }

      /**
       * Tie the anonymous visitor to the person who just signed up.
       *
       * This is the step that answers "who clicked". Until now it did not happen anywhere in
       * this flow - not here, and not on the backend, which never reads a fingerprint during
       * signup. EnrollPage, ContactPage, LeadCaptureForm and StrategyCallModal all call this;
       * the page every landing-page CTA points at did not. So someone could arrive from a
       * campaign, read the page, click the button and create an account, and their visit stayed
       * an anonymous fingerprint for ever.
       *
       * Deliberately BEFORE `login`/`navigate` so the call is issued while this document is
       * still alive, and deliberately not awaited - attribution must never be able to delay or
       * fail someone's signup. `identifyVisitor` backfills their earlier anonymous sessions onto
       * the lead, so the landing-page view that brought them here is attributed too.
       */
      try {
        identifyVisitor(email.trim(), {
          name: fullName.trim(),
          metadata: { source_form: 'portal_free_signup' },
        });
      } catch { /* instrumentation must never break the signup */ }

      // C103: an existing account is not signed in from this form; its owner gets a link by email.
      if ('check_email' in res) {
        setNotice(res.message);
        setLoading(false);
        return;
      }
      login(res.jwt);
      navigate('/portal/today', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not create your account. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="cbfs-root">
      <style>{CBFS_CSS}</style>
      <main className="cbfs-card">
        <div className="cbfs-brand">
          <img src="/colaberry-icon.png" alt="" width={38} height={38} className="cbfs-mark" />
          <span className="cbfs-wordmark" aria-hidden="true"><span className="cbfs-c">C</span>olaberry</span>
        </div>

        <div className="cbfs-head">
          <span className="cbfs-badge">Preview access</span>
          <h1 className="cbfs-title">Start for $0</h1>
          <p className="cbfs-text">
            Create an account to explore the AI Systems Architect Accelerator, RSVP to the next open house,
            and see your project take shape. No card needed.
          </p>
        </div>

        <form className="cbfs-form" onSubmit={handleSubmit}>
          <label className="cbfs-label" htmlFor="cbfs-name">Full name</label>
          <input
            id="cbfs-name" className="cbfs-input" type="text" autoComplete="name"
            placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
          />
          <label className="cbfs-label" htmlFor="cbfs-email">Email</label>
          <input
            id="cbfs-email" className="cbfs-input" type="email" autoComplete="email"
            placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          {/*
            DIRECTLY UNDER THE EMAIL FIELD, which is the change rather than the wording.
            It previously sat last, below the optional phone block and immediately above the
            submit button - so it was read, if at all, at the moment attention had already moved
            to the button, and a person who typed a phone number met it as the SECOND of two
            stacked checkboxes. It belongs beside the thing it is about. Measured before moving
            it: 347 free_signup leads in thirty days, 59 ticked. Still unchecked, still optional;
            neither of those is a layout decision.
          */}
          <label className="cbfs-consent" htmlFor="cbfs-consent">
            <input
              id="cbfs-consent" className="cbfs-check" type="checkbox"
              checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}
              disabled={loading}
            />
            <span>{SIGNUP_CONSENT_TEXT}</span>
          </label>

          <label className="cbfs-label" htmlFor="cbfs-phone">Phone (optional)</label>
          <input
            id="cbfs-phone" className="cbfs-input" type="tel" autoComplete="tel"
            placeholder="(555) 555-5555" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
          />

          {/*
            Shown only once a number is typed. Permission to call somebody we have no number for
            grants nothing, and asking up front reads as a condition of signing up, which it is
            not. Never pre-ticked.
          */}
          {phone.trim() !== '' && (
            <label className="cbfs-consent" htmlFor="cbfs-phone-consent">
              <input
                id="cbfs-phone-consent" className="cbfs-check" type="checkbox"
                checked={phoneConsent} onChange={(e) => setPhoneConsent(e.target.checked)}
                disabled={loading}
              />
              <span>{PHONE_CONSENT_TEXT}</span>
            </label>
          )}

          {error && <div className="cbfs-error" role="alert">{error}</div>}
          {notice && <div className="cbfs-notice" role="status" data-testid="cbfs-check-email">{notice}</div>}
          <button className="cbfs-btn" type="submit" disabled={loading}>
            {loading ? 'Creating your account…' : 'Create my account'}
          </button>
        </form>

        <p className="cbfs-foot">
          Already enrolled? <Link className="cbfs-link" to="/portal/login">Sign in</Link>
        </p>
      </main>
    </div>
  );
}

const CBFS_CSS = `
.cbfs-root{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:#F8F8F7;font-family:'Roboto',system-ui,-apple-system,'Segoe UI',sans-serif;color:#2B2B2B}
.cbfs-card{width:100%;max-width:440px;background:#fff;border:1px solid #E4E4E3;border-radius:24px;
  box-shadow:0 12px 30px rgba(26,26,26,.10),0 3px 8px rgba(26,26,26,.06);padding:34px 32px}
.cbfs-brand{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.cbfs-mark{border-radius:9px;display:block}
.cbfs-wordmark{font-family:'Quicksand',system-ui,sans-serif;font-weight:700;font-size:22px;color:#1A1A1A}
.cbfs-c{color:#FB2832}
.cbfs-head{margin-bottom:20px}
.cbfs-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:#B5710A;background:rgba(232,146,12,.16);border-radius:999px;padding:4px 11px;margin-bottom:10px}
.cbfs-title{font-size:27px;font-weight:700;color:#1A1A1A;margin:0 0 8px;letter-spacing:-.01em}
.cbfs-text{font-size:14.5px;color:#6B6B6B;line-height:1.55;margin:0}
.cbfs-form{display:flex;flex-direction:column;margin-top:8px}
.cbfs-label{font-size:13px;font-weight:700;color:#2B2B2B;margin:12px 0 6px}
.cbfs-input{border:1px solid #D8D8D8;border-radius:12px;padding:12px 15px;font-size:15px;font-family:inherit;
  background:#fff;color:#2B2B2B;outline:none;transition:border-color .15s,box-shadow .15s}
.cbfs-input:focus{border-color:#367895;box-shadow:0 0 0 3px rgba(54,120,149,.22)}
.cbfs-input:disabled{background:#F1F1F0}
.cbfs-consent{display:flex;align-items:flex-start;gap:9px;margin:16px 0 0;font-size:13px;
  line-height:1.5;color:#6B6B6B;cursor:pointer}
.cbfs-check{width:16px;height:16px;margin:1px 0 0;flex:0 0 auto;accent-color:#FB2832;cursor:pointer}
.cbfs-check:focus-visible{outline:3px solid #367895;outline-offset:2px}
.cbfs-check:disabled{cursor:default}
.cbfs-error{margin-top:12px;font-size:13.5px;color:#C20E1E;background:rgba(251,40,50,.08);
  border:1px solid rgba(251,40,50,.28);border-radius:10px;padding:9px 12px}
.cbfs-notice{margin-top:12px;font-size:13.5px;color:#1F4E63;background:rgba(54,120,149,.08);
  border:1px solid rgba(54,120,149,.3);border-radius:10px;padding:9px 12px}
.cbfs-btn{margin-top:18px;background:#FB2832;color:#fff;border:none;border-radius:999px;padding:13px 22px;
  font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:filter .15s}
.cbfs-btn:hover:not(:disabled){filter:brightness(.95)}
.cbfs-btn:disabled{opacity:.6;cursor:default}
.cbfs-foot{margin:20px 0 0;text-align:center;font-size:14px;color:#6B6B6B}
.cbfs-link{color:#2E6A86;font-weight:700;text-decoration:none}
.cbfs-link:hover{text-decoration:underline}
`;

export default PortalFreeSignupPage;
