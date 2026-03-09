import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ToastProvider from './components/ui/ToastProvider';
import ScrollToTop from './components/ScrollToTop';
import PublicLayout from './components/Layout/PublicLayout';
import publicRoutes from './routes/publicRoutes';
import adminRoutes from './routes/adminRoutes';
import portalRoutes from './routes/portalRoutes';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          {publicRoutes}
        </Route>
        {adminRoutes}
        {portalRoutes}
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
