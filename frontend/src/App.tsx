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
import FreightBrokerageLandingPage from './pages/FreightBrokerageLandingPage';
import AIXceleratorLandingPage from './pages/AIXceleratorLandingPage';
import GlobalCoryWidget from './components/GlobalCoryWidget';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ScrollToTop />
      <Routes>
        <Route path="/alumni-ai-champion" element={<AlumniChampionPage />} />
        <Route path="/utility-ai" element={<UtilityCoopLandingPage />} />
        <Route path="/freight-ai" element={<FreightBrokerageLandingPage />} />
        <Route path="/aixcelerator" element={<AIXceleratorLandingPage />} />
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
