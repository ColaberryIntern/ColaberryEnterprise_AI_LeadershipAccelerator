import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ToastProvider from './components/ui/ToastProvider';
import ScrollToTop from './components/ScrollToTop';
import PublicLayout from './components/Layout/PublicLayout';
import publicRoutes from './routes/publicRoutes';
import adminRoutes from './routes/adminRoutes';
import portalRoutes from './routes/portalRoutes';
import AlumniChampionPage from './pages/AlumniChampionPage';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ScrollToTop />
      <Routes>
        <Route path="/alumni-ai-champion" element={<AlumniChampionPage />} />
        {adminRoutes}
        {portalRoutes}
        <Route element={<PublicLayout />}>
          {publicRoutes}
        </Route>
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
