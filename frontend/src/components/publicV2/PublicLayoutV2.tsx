import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import PublicHeaderV2 from './PublicHeaderV2';
import PublicFooterV2 from './PublicFooterV2';
import { initTracker } from '../../utils/tracker';
import { captureUTMFromURL } from '../../services/utmService';
import { captureCampaignFromURL } from '../../services/campaignAttributionService';
import './publicV2.css';

/**
 * PublicLayoutV2 — the shell every V2 public page renders inside.
 *
 * Mirrors the existing PublicLayout's attribution wiring deliberately: the audit
 * found that the 11 campaign landing pages which bypass the shared layout also
 * silently lose initTracker/UTM capture. Keeping that init here means a V2 page
 * cannot accidentally drop attribution by being added to the wrong route tree.
 *
 * Does NOT mount the Maya chat widget — that is a separate decision for the V2
 * site rather than something to inherit by copy-paste.
 */
function PublicLayoutV2(): React.ReactElement {
  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

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
    </div>
  );
}

export default PublicLayoutV2;
