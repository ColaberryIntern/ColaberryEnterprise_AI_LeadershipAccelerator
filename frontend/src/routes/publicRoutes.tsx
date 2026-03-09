import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import ProgramPage from '../pages/ProgramPage';
import PricingPage from '../pages/PricingPage';
import ContactPage from '../pages/ContactPage';
import SponsorshipPage from '../pages/SponsorshipPage';
import AdvisoryPage from '../pages/AdvisoryPage';
import CaseStudiesPage from '../pages/CaseStudiesPage';
import EnrollPage from '../pages/EnrollPage';
import EnrollSuccessPage from '../pages/EnrollSuccessPage';
import EnrollCancelPage from '../pages/EnrollCancelPage';
import ExecOverviewThankYouPage from '../pages/ExecOverviewThankYouPage';
import StrategyCallPrepPage from '../pages/StrategyCallPrepPage';
import NotFoundPage from '../pages/NotFoundPage';

const publicRoutes = (
  <>
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
    <Route path="/executive-overview/thank-you" element={<ExecOverviewThankYouPage />} />
    <Route path="/strategy-call-prep" element={<StrategyCallPrepPage />} />
    <Route path="/about" element={<Navigate to="/" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </>
);

export default publicRoutes;
