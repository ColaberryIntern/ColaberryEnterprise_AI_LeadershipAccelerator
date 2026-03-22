import React, { useEffect, lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import PublicNavbar from './PublicNavbar';
import PublicFooter from './PublicFooter';
import { initTracker } from '../../utils/tracker';
import { captureUTMFromURL } from '../../services/utmService';
import { captureCampaignFromURL } from '../../services/campaignAttributionService';

const MayaChatWidget = lazy(() => import('../MayaChatWidget'));

function PublicLayout() {
  useEffect(() => { initTracker(); captureUTMFromURL(); captureCampaignFromURL(); }, []);

  return (
    <div className="d-flex flex-column min-vh-100">
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      <PublicNavbar />
      <main id="main-content" className="flex-grow-1">
        <Outlet />
      </main>
      <PublicFooter />
      <Suspense fallback={null}>
        <MayaChatWidget />
      </Suspense>
    </div>
  );
}

export default PublicLayout;
