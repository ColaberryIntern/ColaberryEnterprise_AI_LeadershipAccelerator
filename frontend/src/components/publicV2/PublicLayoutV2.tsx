import React, { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import PublicHeaderV2 from './PublicHeaderV2';
import PublicFooterV2 from './PublicFooterV2';
import ConsentBanner from './ConsentBanner';
import { initTracker } from '../../utils/tracker';
import { captureUTMFromURL } from '../../services/utmService';
import { captureCampaignFromURL } from '../../services/campaignAttributionService';
import { trackingAllowed } from '../../config/v2Consent';
import './publicV2.css';

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
 * Does NOT mount the Maya chat widget — a separate decision for the V2 site
 * rather than something to inherit by copy-paste.
 */
function PublicLayoutV2(): React.ReactElement {
  const [started, setStarted] = useState(false);

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
    </div>
  );
}

export default PublicLayoutV2;
