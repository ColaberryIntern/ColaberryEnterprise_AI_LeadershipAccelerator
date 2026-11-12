import React, { useEffect, useRef } from 'react';
import { Link, useLocation, type Location } from 'react-router-dom';
import OpenHouseSignedUp from './OpenHouseSignedUp';
import { trackLeadOnce } from '../services/metaPixel';
import { CBOH_CSS } from './openHouseStyles';
import type { OpenHouseSignupResult } from '../services/openHouseApi';

/**
 * `/open-house/lead` — the Open House confirmation, on a URL of its own.
 *
 * ## Why this page exists
 *
 * Sohail asked for a dedicated confirmation URL so Meta can count a registration.
 * Before this, a successful signup rendered the confirmation in place and the URL
 * stayed `/open-house`, which is also the URL of the empty form. Meta cannot tell
 * those apart: a rule built on "someone reached /open-house" counts everyone who
 * looked at the form, so the conversion number would have been roughly the traffic
 * number and the ad optimiser would have been trained on arriving rather than on
 * signing up.
 *
 * ## The Lead event fires here, and only on a real signup
 *
 * The signup page navigates here with the result in router state. That state is the
 * evidence a registration actually happened, and it is why Lead is safe to fire on
 * mount: it cannot be obtained by typing the URL.
 *
 * Someone who reloads this page, or opens it directly, has no state. That is NOT
 * treated as a conversion — they are shown a short note and a way back to the form,
 * and no Lead is sent. Sohail's third condition says the Lead must not fire when a
 * user simply visits, and a bare visit is exactly what a stateless load is.
 *
 * `trackLeadOnce` keys on the person, so a refresh after a genuine signup does not
 * report a second lead either. See `services/metaPixel.ts` for why that matters.
 *
 * ## It never blocks the confirmation
 *
 * The tracking call is fired and not awaited, and `trackLeadOnce` swallows its own
 * errors. Someone who has just handed us their details must see "your seat is
 * saved" whatever Meta's script is doing, so no ad pixel is on the path that
 * renders this page.
 */

type SignupState = {
  message: string;
  when: string;
  formatLabel?: string | null;
  access?: OpenHouseSignupResult['access'];
  /** Identifies the PERSON, so one human reports one Lead however often they reload. */
  leadKey?: string | null;
};

export const OPEN_HOUSE_LEAD_PATH = '/open-house/lead';

const OpenHouseLeadPage: React.FC<{ locationOverride?: Location }> = ({ locationOverride }) => {
  const routerLocation = useLocation();
  const location = locationOverride ?? routerLocation;
  const signup = (location.state as { signup?: SignupState } | null)?.signup ?? null;

  // React 18 StrictMode mounts effects twice in development. Without this the dev
  // build would call trackLeadOnce twice; it is idempotent per person, but relying
  // on that to paper over a double call would hide a real double-fire later.
  const reported = useRef(false);

  useEffect(() => {
    if (!signup || reported.current) return;
    reported.current = true;
    // Deliberately not awaited: the confirmation must not wait on an ad network.
    void trackLeadOnce(signup.leadKey ?? null);
  }, [signup]);

  if (!signup) {
    return (
      <div className="cboh-root">
        <style>{CBOH_CSS}</style>
        <main className="cboh-card">
          <div className="cboh-head">
            <span className="cboh-badge">Open House</span>
            <h1 className="cboh-title">Nothing to confirm here</h1>
          </div>
          <p>
            This page shows your confirmation straight after you sign up. If you have
            already signed up, your seat is saved and your confirmation email has the
            details. Otherwise you can sign up below.
          </p>
          <p><Link to="/open-house">Go to the Open House sign-up</Link></p>
        </main>
      </div>
    );
  }

  return (
    <div className="cboh-root">
      <style>{CBOH_CSS}</style>
      <main className="cboh-card">
        <OpenHouseSignedUp
          message={signup.message}
          when={signup.when}
          formatLabel={signup.formatLabel ?? null}
          access={signup.access ?? null}
        />
      </main>
    </div>
  );
};

export default OpenHouseLeadPage;
