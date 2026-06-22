import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ToastProvider from './components/ui/ToastProvider';
import ScrollToTop from './components/ScrollToTop';
import PublicLayout from './components/Layout/PublicLayout';
import publicRoutes from './routes/publicRoutes';
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
import GlobalCoryWidget from './components/GlobalCoryWidget';

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
        {adminRoutes}
        {portalRoutes}
        {referralRoutes}
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
