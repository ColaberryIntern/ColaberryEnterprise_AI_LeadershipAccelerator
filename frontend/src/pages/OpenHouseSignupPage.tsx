import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchNextOpenHouse,
  openHouseAcquisitionFields,
  signUpForOpenHouse,
  type NextOpenHouse,
} from '../services/openHouseApi';
import { identifyVisitor } from '../utils/tracker';
import { loadMetaPixel } from '../services/metaPixel';
import { CBOH_CSS } from './openHouseStyles';
import { OPEN_HOUSE_LEAD_PATH } from './OpenHouseLeadPage';
import { SIGNUP_CONSENT_TEXT, PHONE_CONSENT_TEXT } from '../config/consentText';
// The GATE and the WORDING are shared; the markup is not. PhoneConsentCheckbox renders
// Bootstrap, and this page has its own `cboh-*` sheet - so it calls the rule and renders
// with its own primitives, which is the path that component's own docs prescribe.
import { shouldAskPhoneConsent } from '../components/PhoneConsentCheckbox';
import ColaberryLockup from '../components/brand/ColaberryLockup';

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
  const navigate = useNavigate();

  // The PageView half of the Meta tracking. Sohail reported the pixel firing on
  // /lp/colaberry-training/... but not here, and this page loaded no pixel at all,
  // so there was nothing to detect. Not awaited and never thrown from: an ad script
  // must not sit between a visitor and the form they came to fill in.
  useEffect(() => { void loadMetaPixel(); }, []);

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

      // The confirmation now lives on its own URL so Meta can count a registration
      // without counting everyone who merely looked at the form. The result travels
      // in router state, which is also the proof a signup happened: that state cannot
      // be obtained by typing the URL, so the Lead event on the other side cannot be
      // triggered by a bare visit. `replace` keeps Back going to wherever they came
      // from rather than re-submitting the form they have just completed.
      navigate(OPEN_HOUSE_LEAD_PATH, {
        replace: true,
        state: {
          signup: {
            message: res.message,
            when: res.event ? whenLabel(res.event) : '',
            formatLabel: res.event?.format_label ?? null,
            access: res.access ?? null,
            // Keys the Lead on the PERSON. Anything per-visit here would report one
            // human as many leads; see services/metaPixel.ts.
            leadKey: email.trim().toLowerCase(),
          },
        },
      });
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
          {/* D14: artwork, not a hand-set logotype. The old markup also hardcoded the
              cherry and ink hex values rather than using tokens. */}
          <ColaberryLockup height={34} alt="Colaberry" />
        </div>

        {/* The confirmation used to render in place here, which left the URL on
            /open-house - the same URL as the empty form. It now lives on
            /open-house/lead (see OpenHouseLeadPage), reached by navigation on a
            successful signup, so the URL itself distinguishes "registered" from
            "looked at the form". C121's one-click account opening moved with it. */}
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
      </main>
    </div>
  );
}


export default OpenHouseSignupPage;
