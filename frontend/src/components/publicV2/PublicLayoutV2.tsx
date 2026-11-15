import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import PublicHeaderV2 from './PublicHeaderV2';
import PublicFooterV2 from './PublicFooterV2';
import ConsentBanner from './ConsentBanner';
import { initTracker } from '../../utils/tracker';
import { captureUTMFromURL } from '../../services/utmService';
import { captureCampaignFromURL } from '../../services/campaignAttributionService';
import { trackingAllowed } from '../../config/v2Consent';
import useReveal from './useReveal';
import './publicV2.css';
import './cinematicV2.css';

/**
 * PublicLayoutV2 — the shell every V2 public page renders inside.
 *
 * TRACKING IS GATED ON CONSENT (changed in task 1.10)
 * This previously called initTracker() unconditionally, mirroring the live
 * PublicLayout. That meant every V2 page fingerprinted the visitor before asking
 * — and for anyone arriving from an email campaign, attached their address to the
 * record, because tracker.flush() reads `?email=` out of the URL. Nothing starts
 * now until `trackingAllowed()` is true.
 *
 * UTM and campaign capture are gated too. They are attribution rather than
 * analytics, but both write persistent identifiers to the visitor's browser, and
 * the distinction would not survive being explained to the person it is about.
 *
 * SCOPE: the live site's PublicLayout is untouched and still starts tracking
 * unconditionally. That is a pre-existing exposure for the cutover to resolve,
 * not something this task silently half-fixed.
 *
 * MAYA IS MOUNTED HERE, and this is the separate decision the previous version of
 * this comment asked for rather than a copy-paste of PublicLayout.
 *
 * The omission was not a small one: V2 has been the whole public site since
 * 3 Sep 2026, so she was absent from /, /services, /platform, /proof,
 * /how-it-works, /accelerator, /demo, /contact and /lab, and present only on the
 * dozen legacy-layout pages. Ali's decision of 13 Nov 2026 was to switch her on
 * across the site with every outbound message held for his approval.
 *
 * IT DOES NOT REOPEN THE PRE-CONSENT EXPOSURE THIS LAYOUT CLOSED, and that was
 * checked rather than assumed. The widget reads `cb_visitor_fp` out of
 * localStorage; it never mints one. Before consent that key does not exist,
 * because `initTracker()` is what writes it and it is gated above - so
 * `visitorId` is null, the proactive-check poll returns early at its first
 * guard, and opening the launcher renders a local greeting and starts no server
 * conversation. The launcher is therefore available to a visitor who wants it
 * while nothing is recorded about a visitor who does not, which is the same line
 * the tracking gate draws. `publicLayoutV2Maya.test.tsx` pins both halves.
 *
 * It is mounted OUTSIDE the consent gate on purpose: gating the launcher itself
 * would hide the one surface on which a visitor can ask a question, in the name
 * of a privacy protection the widget does not need.
 */

const MayaChatWidget = lazy(() => import('../MayaChatWidget'));
function PublicLayoutV2(): React.ReactElement {
  const [started, setStarted] = useState(false);
  useReveal();

  const startAttribution = useCallback(() => {
    if (started) return;
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
    setStarted(true);
  }, [started]);

  useEffect(() => {
    if (trackingAllowed()) startAttribution();
  }, [startAttribution]);

  return (
    <div className="cbv2-shell">
      <a className="cbv2-skip" href="#cbv2-main">
        Skip to main content
      </a>
      <PublicHeaderV2 />
      <main id="cbv2-main" className="cbv2-main" tabIndex={-1}>
        <Outlet />
      </main>
      <PublicFooterV2 />
      {/* Starts attribution on grant without requiring a reload; on decline the
          banner has already purged prior identifiers. */}
      <ConsentBanner onChoice={(granted) => granted && startAttribution()} />
      {/* Lazy and Suspense-wrapped, matching PublicLayout: the widget is 989 lines and must not
          be in the first bundle of a landing page. */}
      <Suspense fallback={null}>
        <MayaChatWidget />
      </Suspense>
    </div>
  );
}

export default PublicLayoutV2;
