import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { safeNextPath } from '../../utils/safeNextPath';
import { mailApp, GMAIL_HREF, OUTLOOK_HREF } from './mailApp';
import { PORTAL_LOGIN_CSS } from './portalLoginStyles';

// Participant Portal sign-in (magic-link request), rebuilt to Aleem's design of
// 5 November 2026 (UX Team, "Re-Design Screens Colaberry Platforms"). Built from the
// standalone HTML he attached rather than from his screenshots, and he authored it on
// this repo's own design system, so every value is a `var(--*)` token and no hex is
// hardcoded here or in portalLoginStyles.ts.
//
// FOUR PLACES THIS DELIBERATELY DOES NOT FOLLOW THE MOCKUP. Each is somewhere the design
// states something the system does not do, and shipping it would put a false sentence in
// front of a learner who is already locked out.
//
//   1. "We sent a sign-in link to <address>."  ->  conditional wording. See the long
//      note on the sent state below; this one cost a student an evening of a live class.
//   2. "One-time link" / "One-time use"        ->  the token is reusable ON PURPOSE
//      (participantService.verifyMagicLink: "This lets users bookmark their portal
//      link"). Requesting a new link overwrites the old one, so what is true is "1 link
//      at a time", which is the same correction already shipped in the portal access
//      email.
//   3. "Expires in 15 min"                     ->  the token is written with a 24 hour
//      expiry (participantService: `Date.now() + 24 * 60 * 60 * 1000`).
//   4. "Check your inbox - it's valid for 15 minutes." (step 2 of the rail) -> same.
//
// Auth logic is unchanged: same endpoint, same `next` handling, same error surface.
function PortalLoginPage() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  const sent = sentTo !== '';

  // Where to land after verifying, e.g. the class check-in page a student reached by
  // scanning the room QR while signed out. Sanitized here and again server-side; an
  // unsafe value is dropped and the default landing page wins.
  const nextPath = safeNextPath(searchParams.get('next'));

  // One request path for the first send and for "Resend link", so the two can never
  // drift. `isResend` only changes which spinner runs and what the heading says.
  const requestLink = async (address: string, isResend: boolean) => {
    setError('');
    if (isResend) setResending(true); else setLoading(true);
    try {
      const res = await portalApi.post('/api/portal/request-link', {
        email: address,
        ...(nextPath ? { next: nextPath } : {}),
      });
      if (res.data.success === false) {
        setError(res.data.message || 'Unable to send access link.');
        return;
      }
      setSentTo(address);
      setResent(isResend);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send access link. Please try again.');
    } finally {
      setResending(false);
      setLoading(false);
    }
  };

  // VALIDATE ON SUBMIT, DO NOT DISABLE THE BUTTON. The old page greyed the action out
  // until something was typed, which on first paint renders the one call to action as a
  // washed-out bar and says nothing about why. Aleem's design keeps it solid and his own
  // script answers on submit, which is also the kinder behaviour: a disabled control with
  // no explanation is a dead end for whoever is already locked out.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) { setError('Enter the email you enrolled with.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Enter a valid email like you@company.com.');
      return;
    }
    requestLink(value, false);
  };

  const app = mailApp(sentTo);

  return (
    <div className="cbpl-root">
      <style>{PORTAL_LOGIN_CSS}</style>
      <span aria-hidden="true" className="cbpl-wash" />
      <Constellation />

      <header className="cbpl-header">
        <a className="cbpl-brand" href="https://colaberry.com">
          {/* THE FULL LOCKUP, not the bare mark. `colaberry-icon.png` is the glyph on its
              own, which left the first screen a learner sees carrying an unlabelled bike
              where Aleem's design has the wordmark. Caught by looking at the deployed
              page rather than in the diff. */}
          <img src="/colaberry-logo-transparent.png" alt="Colaberry" className="cbpl-mark" />
          <span className="cbpl-rule" aria-hidden="true" />
          <span className="cbpl-brandtext">
            Enterprise AI Leadership
            <br />
            Accelerator
          </span>
        </a>
        <a className="cbpl-back" href="https://colaberry.com">
          <Icon d="M19 12H5M12 19l-7-7 7-7" />
          Back to colaberry.com
        </a>
      </header>

      <main className="cbpl-main">
        <span className="cbpl-pill">
          <span className="cbpl-dot" aria-hidden="true" />
          Participant Portal
        </span>

        <h1 className="cbpl-h1">
          <span>Welcome back.</span>
          <span className="cbpl-h1-accent">No password needed.</span>
        </h1>
        <p className="cbpl-lede">
          Enter the email you enrolled with and we&rsquo;ll send a{' '}
          <strong>secure sign-in link</strong> that opens your portal.
        </p>

        <section className="cbpl-card">
          <span aria-hidden="true" className="cbpl-card-top" />

          <div className="cbpl-card-head">
            <span className="cbpl-card-icon" aria-hidden="true">
              <Icon d="M4 6h16v12H4zM4 7l8 6 8-6" size={19} />
            </span>
            <span className="cbpl-card-titles">
              <span className="cbpl-card-title">Sign in by email</span>
              {/* His subtitle read "One-time link - no password". It is not one-time. */}
              <span className="cbpl-card-sub">Secure link &middot; no password</span>
            </span>
            <span className="cbpl-step">{sent ? 'Step 2 of 3' : 'Step 1 of 3'}</span>
          </div>

          <div className="cbpl-card-body">
            {error && (
              <div className="cbpl-error" role="alert">
                <Icon d="M12 8v5M12 16h.01" circle size={17} />
                <span>{error}</span>
              </div>
            )}

            {sent ? (
              <div className="cbpl-sent">
                <div className="cbpl-sent-head">
                  <span className="cbpl-sent-icon" aria-hidden="true">
                    <Icon d="M4 6h16v12H4zM4 7l8 6 8-6" size={28} />
                  </span>
                  <h2 className="cbpl-sent-title">{resent ? 'Link resent' : 'Check your inbox'}</h2>
                  {/*
                    CONDITIONAL, because the send is conditional and this screen used to
                    pretend otherwise. Aleem's mockup says "We sent a sign-in link to
                    <address>", which is the exact sentence that was removed from this
                    page, so it is restated here rather than quietly re-accepted.

                    `requestMagicLink` returns `success: true` for an address it did not
                    recognise, on purpose: answering "no such account" here would turn the
                    login form into an email-enumeration oracle. It says so honestly in its
                    own message ("If an active enrollment exists for this email, a link has
                    been sent") and this page threw that sentence away, replacing it with
                    the flat assertion "We sent a secure access link to <address>".

                    So a student who typed the wrong address was told, as a statement of
                    fact, that mail was on its way to them. Nothing was sent, nothing could
                    arrive, and there was no signal anywhere on screen to explain it. On
                    2026-08-24 a student lost an evening of a live class to exactly this:
                    she reached the class check-in page, asked for a sign-in link, read this
                    screen, and waited for mail that had never been generated.

                    The wording below is the same promise the server actually makes, and it
                    leaks nothing: it is true and identical whether or not the address
                    matched. The follow-up line names the one cause a student can act on,
                    which is the only part that was ever missing.

                    WHAT IS PROVEN, as opposed to inferred: Mandrill holds no "[Accelerator]
                    Your Portal Access Link" to that student anywhere in the evening of
                    2026-08-24 (the only one that day was 13:10:55Z), and her enrollment's
                    `portal_token_expires_at` still read exactly 24h after that morning
                    link. `requestMagicLink` rewrites the token on every successful lookup,
                    so an unmoved expiry is proof that no evening request ever matched the
                    account. What is NOT established is the exact keystroke she typed, and
                    this copy deliberately does not need to know.

                    NOT FIXED HERE, and deliberately: `sendPortalMagicLink` also returns
                    normally when `transporter` is null, so a misconfigured SMTP env
                    produces this same screen for mail that was never attempted. That is a
                    server-contract change with its own blast radius (it would start
                    throwing in every environment without SMTP, including tests) and it
                    belongs in its own PR.
                  */}
                  <p className="cbpl-sent-text">
                    If <strong>{sentTo}</strong> is the address you enrolled with, a secure
                    sign-in link is on its way. Open it on this device to finish signing in.
                  </p>
                  <p className="cbpl-sent-text cbpl-sent-sub">
                    The link works for 24 hours. If nothing arrives, check spam, then try
                    again with the address your enrollment is under. We can only send to
                    that one.
                  </p>
                </div>

                {app.fallback ? (
                  <div className="cbpl-mailgrid">
                    <a className="cbpl-btn cbpl-btn-outline" href={GMAIL_HREF} target="_blank" rel="noopener noreferrer">
                      Open Gmail
                    </a>
                    <a className="cbpl-btn cbpl-btn-outline" href={OUTLOOK_HREF} target="_blank" rel="noopener noreferrer">
                      Open Outlook
                    </a>
                  </div>
                ) : (
                  <a className="cbpl-btn" href={app.href} target="_blank" rel="noopener noreferrer">
                    Open {app.name}
                    <Icon d="M14 5h5v5M19 5l-8 8M18 13v6H5V6h6" size={18} />
                  </a>
                )}

                <div className="cbpl-sent-actions">
                  <button
                    type="button"
                    className="cbpl-btn cbpl-btn-ghost"
                    onClick={() => requestLink(sentTo, true)}
                    disabled={resending}
                  >
                    {resending ? 'Resending…' : 'Resend link'}
                  </button>
                  <button
                    type="button"
                    className="cbpl-btn cbpl-btn-ghost"
                    onClick={() => {
                      setSentTo('');
                      setEmail('');
                      setResent(false);
                      setError('');
                    }}
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            ) : (
              <form className="cbpl-form" onSubmit={handleSubmit} noValidate>
                <div className="cbpl-field">
                  <label htmlFor="portal-email" className="cbpl-label">Email address</label>
                  <input
                    id="portal-email"
                    type="email"
                    className="cbpl-input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    required
                    autoFocus
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={error ? true : undefined}
                    aria-describedby="portal-email-help"
                  />
                  <span id="portal-email-help" className="cbpl-help">
                    Use the address on your enrollment confirmation.
                  </span>
                </div>

                <button type="submit" className="cbpl-btn" disabled={loading}>
                  {loading ? (
                    <><span className="cbpl-spin" aria-hidden="true" /> Sending&hellip;</>
                  ) : (
                    <>Send me an access link <Icon d="M5 12h14M12 5l7 7-7 7" size={18} /></>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* His assurance strip, with the two claims that were not true corrected. */}
          <div className="cbpl-assure">
            <span><Icon d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7z" size={14} /> Secure link</span>
            <span><Icon d="M12 7v5l3 2" circle size={14} /> Expires in 24 hours</span>
            <span><Icon d="M4 12h10M17 9l3 3-3 3" size={14} /> 1 link at a time</span>
          </div>
        </section>

        <ol className="cbpl-steps">
          {sent ? (
            <>
              <StepItem tone="done" label="Email entered" detail={sentTo} />
              <StepItem tone="on" n="2" label="Open the link we sent" detail="Check your inbox. The link works for 24 hours." />
              <StepItem n="3" label="You're in" detail="Sessions, assignments and cohort updates." />
            </>
          ) : (
            <>
              <StepItem tone="on" n="1" label="Enter your email" detail="The one you enrolled with." />
              <StepItem n="2" label="Open the link we send" detail="It arrives in your inbox within a minute." />
              <StepItem n="3" label="You're in" detail="Sessions, assignments and cohort updates." />
            </>
          )}
        </ol>

        <p className="cbpl-support">
          Enrolled with a different email, or no link after a few minutes?{' '}
          <a href="mailto:support@colaberry.com">Contact support</a>
        </p>
      </main>

      <footer className="cbpl-footer">
        <div className="cbpl-footer-in">
          <span>&copy; Colaberry Inc. &middot; Enterprise AI Leadership Accelerator</span>
          <span className="cbpl-footer-links">
            <a href="https://colaberry.com/privacy">Privacy</a>
            <a href="https://colaberry.com/terms">Terms</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * One line of the three-step rail. `done` is the green tick, `on` is the cherry ring on
 * the step the learner is in, and the default is the quiet state ahead of them.
 */
function StepItem({ n, label, detail, tone }: {
  n?: string; label: string; detail: string; tone?: 'on' | 'done';
}) {
  const cls = tone === 'done' ? 'cbpl-stepnum cbpl-stepnum-done'
    : tone === 'on' ? 'cbpl-stepnum cbpl-stepnum-on'
      : 'cbpl-stepnum';
  return (
    <li>
      <span className={cls} aria-hidden="true">
        {tone === 'done' ? <Icon d="M20 6L9 17l-5-5" size={16} /> : n}
      </span>
      <span className="cbpl-steptext">
        <b>{label}</b>
        <span>{detail}</span>
      </span>
    </li>
  );
}

/**
 * The faint network line art behind the hero.
 *
 * His mockup draws this on a canvas and animates it. Inline SVG instead, and static:
 * this is the page someone reaches when they are already locked out, so it should cost
 * no script, no request and no frames. Drawn once here rather than omitted, because the
 * wash alone left the page noticeably emptier than his reference at the same width.
 *
 * Decorative, so it is hidden from assistive technology and ignores pointers entirely.
 * It fades out below the hero via a mask, so it never competes with the card.
 */
function Constellation() {
  return (
    <svg
      className="cbpl-constellation"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 620"
      preserveAspectRatio="xMidYMin slice"
    >
      {/* FAINT. The first pass drew big bold triangles that pulled the eye off the card,
          which the side-by-side showed immediately: his is barely-there texture, not a
          graphic. Small clusters, hairlines, low opacity. */}
      <g stroke="var(--border-default)" strokeWidth="0.75" fill="none" opacity="0.3">
        <path d="M96 150 L168 112 L214 178 L130 206 Z" />
        <path d="M168 112 L130 206" />
        <path d="M214 178 L286 146" />
        <path d="M130 352 L206 318 L246 380 L164 404 Z" />
        <path d="M206 318 L164 404" />
        <path d="M1188 108 L1260 72 L1306 140 L1222 168 Z" />
        <path d="M1260 72 L1222 168" />
        <path d="M1306 140 L1356 212" />
        <path d="M1150 330 L1228 300 L1268 362" />
      </g>
      <g fill="var(--border-default)" opacity="0.42">
        {[
          [96, 150], [168, 112], [214, 178], [130, 206], [286, 146],
          [130, 352], [206, 318], [246, 380], [164, 404],
          [1188, 108], [1260, 72], [1306, 140], [1222, 168], [1356, 212],
          [1150, 330], [1228, 300], [1268, 362],
          [52, 268], [330, 254], [398, 94], [1086, 214], [1398, 384], [1024, 96],
        ].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" />)}
      </g>
    </svg>
  );
}

/**
 * Inline stroke icon. His mockup pulls Remix Icon from a CDN; a sign-in screen is the
 * one page that must render when a third-party font host is blocked or slow, so these
 * are drawn locally instead. `circle` adds the ring the alert and clock glyphs need.
 */
function Icon({ d, size = 16, circle }: { d: string; size?: number; circle?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {circle && <circle cx="12" cy="12" r="9" />}
      <path d={d} />
    </svg>
  );
}

export default PortalLoginPage;
