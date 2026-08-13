import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent } from '../../config/v2Consent';
import './consentBanner.css';

/**
 * ConsentBanner -- asked before any tracking starts, not after.
 *
 * Design decisions that are deliberate rather than stylistic:
 *   - Decline is a real button of equal weight, not a link hidden in small text.
 *     A decline that is harder to find than accept is a dark pattern.
 *   - Nothing is pre-selected and there is no dismiss-without-choosing affordance,
 *     because dismissing is not consent.
 *   - It says what is collected, in plain words, rather than "we value your
 *     privacy". A visitor cannot consent to something they were not told.
 */

export interface ConsentBannerProps {
  /** Fired after a choice so the layout can start tracking without a reload. */
  onChoice?: (granted: boolean) => void;
}

function ConsentBanner({ onChoice }: ConsentBannerProps): React.ReactElement | null {
  /* Resolved during the first render rather than in an effect. An effect would
     paint the page once without the banner and then drop it in, which flashes
     content and briefly shows the site as though no question were being asked. */
  const [visible, setVisible] = useState(() => getConsent() === 'unset');

  const choose = (granted: boolean) => {
    setConsent(granted ? 'granted' : 'denied');
    setVisible(false);
    if (onChoice) onChoice(granted);
  };

  if (!visible) return null;

  return (
    <div
      className="cbv2-consent-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cbv2-consent-title"
      aria-describedby="cbv2-consent-body"
    >
      <div className="cbv2-consent-banner__inner">
        <div>
          <h2 id="cbv2-consent-title" className="cbv2-consent-banner__title">
            Before we measure anything
          </h2>
          <p id="cbv2-consent-body" className="cbv2-consent-banner__body">
            We can record which pages you visit and what device you are on, kept against an
            id stored in your browser. If you followed a link from one of our emails, that
            record includes your email address, so it is not anonymous. Decline and none of
            it starts, and anything already stored is deleted.{' '}
            <Link to="/v2/privacy">What we collect, in detail</Link>.
          </p>
        </div>
        <div className="cbv2-consent-banner__actions">
          <button
            type="button"
            className="cbv2-btn cbv2-btn--primary"
            onClick={() => choose(true)}
          >
            Allow
          </button>
          <button
            type="button"
            className="cbv2-btn cbv2-btn--ghost"
            onClick={() => choose(false)}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConsentBanner;
