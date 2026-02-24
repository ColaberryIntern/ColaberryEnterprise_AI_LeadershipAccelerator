import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import PublicLayout from './components/Layout/PublicLayout';
import AdminLayout from './components/Layout/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import ProgramPage from './pages/ProgramPage';
import PricingPage from './pages/PricingPage';
import ContactPage from './pages/ContactPage';
import SponsorshipPage from './pages/SponsorshipPage';
import AdvisoryPage from './pages/AdvisoryPage';
import CaseStudiesPage from './pages/CaseStudiesPage';
import EnrollPage from './pages/EnrollPage';
import EnrollSuccessPage from './pages/EnrollSuccessPage';
import EnrollCancelPage from './pages/EnrollCancelPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminCohortDetailPage from './pages/admin/AdminCohortDetailPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/program" element={<ProgramPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/sponsorship" element={<SponsorshipPage />} />
          <Route path="/advisory" element={<AdvisoryPage />} />
          <Route path="/case-studies" element={<CaseStudiesPage />} />
          <Route path="/enroll" element={<EnrollPage />} />
          <Route path="/enroll/success" element={<EnrollSuccessPage />} />
          <Route path="/enroll/cancel" element={<EnrollCancelPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/about" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/cohorts/:id" element={<AdminCohortDetailPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
