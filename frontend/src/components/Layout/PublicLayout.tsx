import React, { useEffect, lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import PublicNavbar from './PublicNavbar';
import PublicFooter from './PublicFooter';
import { initTracker } from '../../utils/tracker';
import { captureUTMFromURL } from '../../services/utmService';

const ChatWidget = lazy(() => import('../ChatWidget'));
const MarketingMonitorPanel = lazy(() => import('../MarketingMonitorPanel'));

function PublicLayout() {
  useEffect(() => { initTracker(); captureUTMFromURL(); }, []);

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
        <ChatWidget />
      </Suspense>
      <Suspense fallback={null}>
        <MarketingMonitorPanel />
      </Suspense>
    </div>
  );
}

export default PublicLayout;
