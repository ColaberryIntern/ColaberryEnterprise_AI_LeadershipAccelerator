import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchNextOpenHouse,
  openHouseAcquisitionFields,
  signUpForOpenHouse,
  type NextOpenHouse,
  type OpenHouseSignupResult,
  type SignedUpEvent,
} from '../services/openHouseApi';
import OpenHouseSignedUp from './OpenHouseSignedUp';
import { identifyVisitor } from '../utils/tracker';
import { SIGNUP_CONSENT_TEXT, PHONE_CONSENT_TEXT } from '../config/consentText';
// The GATE and the WORDING are shared; the markup is not. PhoneConsentCheckbox renders
// Bootstrap, and this page has its own `cboh-*` sheet - so it calls the rule and renders
// with its own primitives, which is the path that component's own docs prescribe.
import { shouldAskPhoneConsent } from '../components/PhoneConsentCheckbox';

/**
 * The Open House front door (OH-3) — where the ads actually land people.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * The ads say "sign up for the Open House". Every CTA on the landing page they
 * reach pointed at `/portal/signup`, which is headed "Start for $0" and creates
 * an account. Nothing in that flow took an Open House seat. So the page answered
 * a question nobody had asked, and the thing they came for did not happen.
 *
 * ── WHAT THIS PAGE DOES ─────────────────────────────────────────────────────
 *
 * One form, one request, three outcomes: a seat on our own attendee list, a $0
 * Explorer account, and the welcome email carrying a login link that lands on
 * their first lesson (OH-4). The visitor is told all three before they type
 * anything, because being given an account you did not ask for is a surprise
 * unless it was offered.
 *
 * ── WHY NOT JUST EDIT /portal/signup ────────────────────────────────────────
 *
 * That page is a live paid-ad funnel measured at 41.6% conversion with its own
 * welcome-back path, phone-consent handling and acquisition fallbacks. Adding a
 * second purpose to it would put all of that in the blast radius of a marketing
 * change. It keeps its job; this page has one of its own and is reached from the
 * landing page instead. The duplication is the scoped CSS block, deliberately
 * accepted rather than refactoring the live page's styles out from under it.
 *
 * ── COPY RULE ───────────────────────────────────────────────────────────────
 *
 * The word barred by 40 TAC 807.172(d) never appears on this page. That rule
 * governs how a licensed career school may advertise, so the approved wording in
 * this repo is "$0 to start" and "No card needed". Same rule, same reason, as
 * PortalFreeSignupPage - and the word is kept out of these comments too, so that
 * whether this file passes the copy lint does not depend on the scanner
 * correctly classifying a comment.
 *
 * ── NEVER AN INVENTED DATE ──────────────────────────────────────────────────
 *
 * The event comes from GET /api/v1/open-house/event. If it is unknown, the page
 * says so and still takes the signup — it does not guess, and it does not go
 * blank. That is the same rule the landing-page filler script follows.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Why the phone number is mandatory here (Ali, 2026-11-11).
 *
 * The landing page's CTAs used to point at /portal/signup, which asks for a phone
 * number. OH-3 pointed them here instead, and this page asked for a name and an email
 * only - so from the day it shipped, the funnel stopped collecting phone numbers.
 * This puts the field back and makes it required.
 *
 * Counted in DIGITS, matching `PHONE_MIN_DIGITS` on the route, so the page never
 * accepts something the backend will refuse.
 */
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;
// The route caps the raw string at 50 characters as well as the digit count. Without
// this line a long entry passed here and came back a 400 - the visitor told the number
// was fine and then refused. Caught by running both rules against one table of inputs
// before shipping, which is the only reason it is not a bug report.
const PHONE_MAX_CHARS = 50;

export function phoneProblem(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return 'Please enter your phone number.';
  if (raw.trim().length > PHONE_MAX_CHARS) return 'That number is too long. Please enter just the number.';
  if (digits.length < PHONE_MIN_DIGITS) return 'That number looks too short. Please include the area code.';
  if (digits.length > PHONE_MAX_DIGITS) return 'That number has too many digits.';
  return null;
}

/** "394 seats left", or nothing at all. 0 and null both mean "do not claim a number". */
export function seatsLabel(seatsRemaining: number | null | undefined): string {
  if (typeof seatsRemaining !== 'number' || !Number.isFinite(seatsRemaining) || seatsRemaining <= 0) return '';
  return seatsRemaining === 1 ? '1 seat left' : `${seatsRemaining} seats left`;
}

/** The one-line "when" for an event, or '' when neither half is known. */
export function whenLabel(ev: Pick<NextOpenHouse, 'date_label' | 'time_label'> | null): string {
  if (!ev) return '';
  const parts = [ev.date_label, ev.time_label].filter((p) => typeof p === 'string' && p.trim() !== '');
  return parts.join(' · ');
}

function OpenHouseSignupPage(): React.ReactElement {
  const [event, setEvent] = useState<NextOpenHouse | null>(null);
  // Separate from `event === null`: "still asking" and "asked, nothing announced"
  // read the same in state and must not read the same on screen.
  const [eventLoaded, setEventLoaded] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // Required. See phoneProblem above.
  const [phone, setPhone] = useState('');
  // The NUMBER is mandatory; PERMISSION TO RING IT IS NOT. Unticked on arrival, never
  // a condition of submitting, and no grant is recorded unless it is ticked.
  const [phoneConsent, setPhoneConsent] = useState(false);
  // UNCHECKED, and NOT required to submit. A pre-ticked box is not an affirmative
  // act, and this becomes the consent of record for every marketing email after.
  // Their seat, their account and their login link are all transactional and need
  // no marketing consent, so blocking the signup on it would trade signups for
  // permissions - not a trade this page gets to make.
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ message: string; event: SignedUpEvent | null; access: OpenHouseSignupResult['access'] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchNextOpenHouse()
      .then((ev) => { if (alive) { setEvent(ev); setEventLoaded(true); } })
      // fetchNextOpenHouse never rejects; this is belt-and-braces so a future
      // change there cannot leave the page stuck on "loading" for ever.
      .catch(() => { if (alive) setEventLoaded(true); });
    return () => { alive = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) { setError('Please enter your name.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email.'); return; }
    const phoneErr = phoneProblem(phone);
    if (phoneErr) { setError(phoneErr); return; }
    setLoading(true);
    try {
      const person = {
        name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        marketing_opt_in: marketingOptIn,
        // Sent ONLY when ticked. An absent key records nothing, which is not the same
        // as recording a refusal - and a `false` would be a grant row saying "no".
        ...(phoneConsent ? { phone_consent: true } : {}),
      };
      const acquisition = openHouseAcquisitionFields();
      let res;
      try {
        res = await signUpForOpenHouse({ ...person, ...acquisition });
      } catch (first: any) {
        // Attribution must never cost a signup. The route is `.strict()`, so a
        // backend older than these keys - or one that rejects a value in them -
        // answers 400 for the whole request; retry once without them. A 400 that
        // was really about the person (a bad email) fails the retry identically
        // and shows the same message.
        if (first?.response?.status !== 400 || Object.keys(acquisition).length === 0) throw first;
        res = await signUpForOpenHouse(person);
      }

      // Ties the anonymous visitor to the person who just signed up, so the ad
      // click that brought them is attributed to this signup. Deliberately not
      // awaited and wrapped: instrumentation must never delay or break a signup.
      try {
        identifyVisitor(email.trim(), {
          name: fullName.trim(),
          metadata: { source_form: 'open_house_signup' },
        });
      } catch { /* instrumentation is never load-bearing */ }

      setDone({ message: res.message, event: res.event, access: res.access ?? null });
      setLoading(false);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 429
          ? 'That is a few too many tries from here. Please wait a few minutes and try again.'
          : err?.response?.data?.error || 'Could not sign you up just now. Please try again.',
      );
      setLoading(false);
    }
  };

  const when = whenLabel(event);
  const seats = seatsLabel(event?.seats_remaining);

  return (
    <div className="cboh-root">
      <style>{CBOH_CSS}</style>
      <main className="cboh-card">
        <div className="cboh-brand">
          <img src="/colaberry-icon.png" alt="" width={38} height={38} className="cboh-mark" />
          <span className="cboh-wordmark" aria-hidden="true"><span className="cboh-c">C</span>olaberry</span>
        </div>

        {done ? (
          // C121: a new account opens with one click ("Access your account"); an existing one is sent to sign in.
          <OpenHouseSignedUp
            message={done.message}
            when={done.event ? whenLabel(done.event) : ''}
            formatLabel={done.event?.format_label ?? null}
            access={done.access}
          />
        ) : (
          <>
            <div className="cboh-head">
              <span className="cboh-badge">Open House</span>
              <h1 className="cboh-title">Sign up for our Open House</h1>
              <p className="cboh-text">
                Save your seat and start learning AI for $0 today. We will set up your account the
                moment you sign up and email you the link. No card needed.
              </p>
            </div>

            {/*
              Three states, deliberately distinct. Still asking: nothing, rather than a
              skeleton that flashes on a fast connection. Known: the real date. Asked and
              nothing announced: said plainly. Never a guessed date.
            */}
            {eventLoaded && when !== '' && (
              <div className="cboh-when" data-testid="cboh-when">
                <span className="cboh-when-main">{when}</span>
                <span className="cboh-when-sub">
                  {[event?.format_label, seats].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
            {eventLoaded && when === '' && (
              <div className="cboh-when cboh-when--tbd" data-testid="cboh-when-tbd">
                <span className="cboh-when-main">Next date being confirmed</span>
                <span className="cboh-when-sub">Sign up now and we will email you as soon as it is set.</span>
              </div>
            )}

            <form className="cboh-form" onSubmit={handleSubmit}>
              <label className="cboh-label" htmlFor="cboh-name">Full name</label>
              <input
                id="cboh-name" className="cboh-input" type="text" autoComplete="name"
                placeholder="Your name" value={fullName}
                onChange={(e) => setFullName(e.target.value)} disabled={loading}
              />
              <label className="cboh-label" htmlFor="cboh-email">Email</label>
              <input
                id="cboh-email" className="cboh-input" type="email" autoComplete="email"
                placeholder="you@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} disabled={loading}
              />

              {/* Required, and said so on the label rather than only in the error after a
                  failed submit. `type="tel"` brings up the numeric keypad on a phone, which
                  is where most of this traffic arrives from. */}
              <label className="cboh-label" htmlFor="cboh-phone">Phone number</label>
              <input
                id="cboh-phone" className="cboh-input" type="tel" autoComplete="tel"
                inputMode="tel" placeholder="(555) 555-5555" value={phone}
                onChange={(e) => setPhone(e.target.value)} disabled={loading}
                aria-describedby="cboh-phone-why" required
              />
              <p className="cboh-why" id="cboh-phone-why">
                So we can reach you about your seat and the joining link.
              </p>

              {/* Asked only once a number is typed: permission to call somebody we have
                  no number for grants nothing, and a box sitting above an empty field
                  reads as a condition of submitting, which it is not. */}
              {shouldAskPhoneConsent(phone) && (
                <label className="cboh-consent" htmlFor="cboh-phone-consent">
                  <input
                    id="cboh-phone-consent" className="cboh-check" type="checkbox"
                    checked={phoneConsent} onChange={(e) => setPhoneConsent(e.target.checked)}
                    disabled={loading}
                  />
                  <span>{PHONE_CONSENT_TEXT}</span>
                </label>
              )}

              {/* Beside the field it is about, which is where PortalFreeSignupPage moved
                  its own to after measuring 59 ticks on 347 signups with it sitting last. */}
              <label className="cboh-consent" htmlFor="cboh-consent">
                <input
                  id="cboh-consent" className="cboh-check" type="checkbox"
                  checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}
                  disabled={loading}
                />
                <span>{SIGNUP_CONSENT_TEXT}</span>
              </label>

              {error && <div className="cboh-error" role="alert">{error}</div>}

              <button className="cboh-btn" type="submit" disabled={loading}>
                {loading ? 'Saving your seat…' : 'Save my seat'}
              </button>
              <p className="cboh-fine">
                You will get your account and your first lesson as soon as you sign up.
              </p>
            </form>

            <p className="cboh-foot">
              Already have an account? <Link className="cboh-link" to="/portal/login">Sign in</Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

const CBOH_CSS = `
.cboh-root{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:#F8F8F7;font-family:'Roboto',system-ui,-apple-system,'Segoe UI',sans-serif;color:#2B2B2B}
.cboh-card{width:100%;max-width:440px;background:#fff;border:1px solid #E4E4E3;border-radius:24px;
  box-shadow:0 12px 30px rgba(26,26,26,.10),0 3px 8px rgba(26,26,26,.06);padding:34px 32px;box-sizing:border-box}
.cboh-brand{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.cboh-mark{border-radius:9px;display:block}
.cboh-wordmark{font-family:'Quicksand',system-ui,sans-serif;font-weight:700;font-size:22px;color:#1A1A1A}
.cboh-c{color:#FB2832}
.cboh-head{margin-bottom:18px}
.cboh-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:#C20E1E;background:rgba(251,40,50,.12);border-radius:999px;padding:4px 11px;margin-bottom:10px}
.cboh-title{font-size:27px;font-weight:700;color:#1A1A1A;margin:0 0 8px;letter-spacing:-.01em}
.cboh-text{font-size:14.5px;color:#6B6B6B;line-height:1.55;margin:0}
.cboh-when{display:flex;flex-direction:column;gap:3px;padding:13px 15px;border-radius:14px;
  background:#F4F7F8;border:1px solid #DCE6EA;margin-bottom:4px}
.cboh-when--tbd{background:#F8F8F7;border-color:#E4E4E3}
.cboh-when-main{font-size:15.5px;font-weight:700;color:#1F4E63}
.cboh-when-sub{font-size:13px;color:#6B6B6B}
.cboh-form{display:flex;flex-direction:column;margin-top:8px}
.cboh-label{font-size:13px;font-weight:700;color:#2B2B2B;margin:12px 0 6px}
.cboh-input{border:1px solid #D8D8D8;border-radius:12px;padding:12px 15px;font-size:15px;font-family:inherit;
  background:#fff;color:#2B2B2B;outline:none;transition:border-color .15s,box-shadow .15s}
.cboh-input:focus{border-color:#367895;box-shadow:0 0 0 3px rgba(54,120,149,.22)}
.cboh-input:disabled{background:#F1F1F0}
.cboh-why{margin:6px 0 0;font-size:12.5px;color:#8A8A8A;line-height:1.45}
.cboh-consent{display:flex;align-items:flex-start;gap:9px;margin:16px 0 0;font-size:13px;
  line-height:1.5;color:#6B6B6B;cursor:pointer}
.cboh-check{width:16px;height:16px;margin:1px 0 0;flex:0 0 auto;accent-color:#FB2832;cursor:pointer}
.cboh-check:focus-visible{outline:3px solid #367895;outline-offset:2px}
.cboh-error{margin-top:12px;font-size:13.5px;color:#C20E1E;background:rgba(251,40,50,.08);
  border:1px solid rgba(251,40,50,.28);border-radius:10px;padding:9px 12px}
.cboh-btn{margin-top:18px;background:#FB2832;color:#fff;border:none;border-radius:999px;padding:13px 22px;
  font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:filter .15s;min-height:48px}
.cboh-btn:hover:not(:disabled){filter:brightness(.95)}
.cboh-btn:disabled{opacity:.6;cursor:default}
.cboh-btn-block{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none}
.cboh-btn:focus-visible{outline:3px solid #367895;outline-offset:2px}
.cboh-fine{margin:10px 0 0;font-size:12.5px;color:#8A8A8A;text-align:center;line-height:1.45}
.cboh-foot{margin:20px 0 0;text-align:center;font-size:14px;color:#6B6B6B}
.cboh-link{color:#2E6A86;font-weight:700;text-decoration:none}
.cboh-link:hover{text-decoration:underline}
@media (max-width:420px){.cboh-card{padding:26px 20px;border-radius:18px}.cboh-title{font-size:24px}}
`;

export default OpenHouseSignupPage;
