import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ToastProvider from './components/ui/ToastProvider';
import ScrollToTop from './components/ScrollToTop';
import PublicLayout from './components/Layout/PublicLayout';
import publicRoutes from './routes/publicRoutes';
import PublicLayoutV2 from './components/publicV2/PublicLayoutV2';
import HomeV2 from './pages/publicV2/HomeV2';
import { ServicesV2, ServiceDetailV2 } from './pages/publicV2/ServicesV2';
import PlatformV2 from './pages/publicV2/PlatformV2';
import ProofV2 from './pages/publicV2/ProofV2';
import OpportunityLabV2 from './pages/publicV2/OpportunityLabV2';
import TryV2 from './pages/publicV2/TryV2';
import adminRoutes from './routes/adminRoutes';
import portalRoutes from './routes/portalRoutes';
import referralRoutes from './routes/referralRoutes';
import AlumniChampionPage from './pages/AlumniChampionPage';
import UtilityCoopLandingPage from './pages/UtilityCoopLandingPage';
import UtilityIOULandingPage from './pages/UtilityIOULandingPage';
import FreightBrokerageLandingPage from './pages/FreightBrokerageLandingPage';
import AIXceleratorLandingPage from './pages/AIXceleratorLandingPage';
import AIPilotLandingPage from './pages/AIPilotLandingPage';
import AIPilotVerticalPage from './pages/AIPilotVerticalPage';
import PublicPortfolioPage from './pages/PublicPortfolioPage';
import ManagementPreviewPage from './pages/ManagementPreviewPage';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ScrollToTop />
      <Routes>
        <Route path="/alumni-ai-champion" element={<AlumniChampionPage />} />
        <Route path="/utility-ai" element={<UtilityCoopLandingPage />} />
        <Route path="/utility-iou" element={<UtilityIOULandingPage />} />
        <Route path="/iou-demo" element={<UtilityIOULandingPage forcePresenter defaultRole="ceo" />} />
        <Route path="/freight-ai" element={<FreightBrokerageLandingPage />} />
        <Route path="/aixcelerator" element={<AIXceleratorLandingPage />} />
        <Route path="/ai-pilot" element={<AIPilotLandingPage />} />
        <Route path="/ai-pilot/transport" element={<AIPilotVerticalPage variantKey="transport" />} />
        <Route path="/ai-pilot/construction" element={<AIPilotVerticalPage variantKey="construction" />} />
        <Route path="/ai-pilot/care" element={<AIPilotVerticalPage variantKey="care" />} />
        <Route path="/portfolio/share/:token" element={<PublicPortfolioPage />} />
        <Route path="/try" element={<ManagementPreviewPage />} />
        {adminRoutes}
        {portalRoutes}
        {referralRoutes}
        {/* Website V2 preview. Mounted at /v2 so the rebuild is reviewable
            without replacing the live public site. The cutover that makes this
            the real "/" happens once V2 is complete and approved. */}
        <Route path="/v2" element={<PublicLayoutV2 />}>
          <Route index element={<HomeV2 />} />
          <Route path="services" element={<ServicesV2 />} />
          <Route path="services/:slug" element={<ServiceDetailV2 />} />
          <Route path="platform" element={<PlatformV2 />} />
          <Route path="proof" element={<ProofV2 />} />
          <Route path="lab" element={<OpportunityLabV2 />} />
          <Route path="try" element={<TryV2 />} />
        </Route>
        <Route element={<PublicLayout />}>
          {publicRoutes}
        </Route>
      </Routes>
      {/* GlobalCoryWidget removed — replaced by ArchitectChat on portal pages */}
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
