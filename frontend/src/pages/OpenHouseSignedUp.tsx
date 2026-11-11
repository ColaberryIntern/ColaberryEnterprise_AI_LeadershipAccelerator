import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { startPortalSession } from '../utils/startPortalSession';

/**
 * The Open House success screen (C121).
 *
 * Ali, 2026-11-11: "why even make them go to their email. Why don't we just put a button that says access your account
 * and that logs them in ... The email can be there as a way for them to come back." The C120 funnel showed why: 5
 * sign-ups, 5 welcome emails, 0 sign-ins in the first 14.6 hours, with the email landing in Gmail's Updates tab.
 *
 * Three states:
 * - NEW ACCOUNT (the server returned `access`): "Access your account" signs them in and opens the welcome video. The
 *   email is mentioned only as the way back.
 * - THE BUTTON COULD NOT SIGN THEM IN (storage blocked): say so and point to the email, which went out regardless.
 * - EXISTING ACCOUNT (no `access`): they get no email from this form, so they are sent to sign in, never told to wait.
 */
export interface SignedUpProps {
  message: string;
  when: string;
  formatLabel?: string | null;
  access?: { jwt: string; next: string } | null;
  /** Injected in tests; the real page performs a full navigation. */
  go?: (url: string) => void;
}

const OpenHouseSignedUp: React.FC<SignedUpProps> = ({ message, when, formatLabel, access, go }) => {
  const [blocked, setBlocked] = useState(false);
  const [opening, setOpening] = useState(false);

  const enter = () => {
    if (!access) return;
    setOpening(true);
    const ok = startPortalSession(access.jwt, access.next, go);
    if (!ok) { setOpening(false); setBlocked(true); }
  };

  const whenBox = when !== '' && (
    <div className="cboh-when" data-testid="cboh-done-when">
      <span className="cboh-when-main">{when}</span>
      {formatLabel && <span className="cboh-when-sub">{formatLabel}</span>}
    </div>
  );

  if (access && !blocked) {
    return (
      <div data-testid="cboh-done">
        <div className="cboh-head">
          <span className="cboh-badge">You are in</span>
          <h1 className="cboh-title">Your account is ready</h1>
          <p className="cboh-text" role="status">
            Your Open House seat is saved, and your $0 account is set up. Start with a 2-minute welcome from Ali.
          </p>
        </div>
        {whenBox}
        <button type="button" className="cboh-btn cboh-btn-block" onClick={enter} disabled={opening} data-testid="cboh-access">
          {opening ? 'Opening your account…' : 'Access your account'}
        </button>
        <p className="cboh-fine">We also emailed you a sign-in link, so you can come back any time.</p>
      </div>
    );
  }

  return (
    <div data-testid="cboh-done">
      <div className="cboh-head">
        <span className="cboh-badge">You are in</span>
        <h1 className="cboh-title">Your seat is saved</h1>
        <p className="cboh-text" role="status">
          {blocked
            ? 'Your account is ready, but this browser would not let us sign you in here. Open the sign-in link we just emailed you to start.'
            : message}
        </p>
      </div>
      {whenBox}
      {!blocked && (
        <Link className="cboh-btn cboh-btn-block" to="/portal/login" data-testid="cboh-signin">Sign in</Link>
      )}
    </div>
  );
};

export default OpenHouseSignedUp;
