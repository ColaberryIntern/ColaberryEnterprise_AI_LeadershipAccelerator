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
import ExecutiveROICalculatorPage from '../pages/ExecutiveROICalculatorPage';
import AIArchitectLandingPage from '../pages/AIArchitectLandingPage';
import InstructorPage from '../pages/InstructorPage';
import NotFoundPage from '../pages/NotFoundPage';
import PilotZeroRiskPage from '../pages/PilotZeroRiskPage';
import PilotAITeamPage from '../pages/PilotAITeamPage';
import PilotExclusivePage from '../pages/PilotExclusivePage';
import AgencyPartnerPage from '../pages/AgencyPartnerPage';
import AIWorkforceDesignerPage from '../pages/AIWorkforceDesignerPage';

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
    <Route path="/executive-roi-calculator" element={<ExecutiveROICalculatorPage />} />
    <Route path="/ai-architect" element={<AIArchitectLandingPage />} />
    <Route path="/ai-architect/instructor" element={<InstructorPage />} />
    <Route path="/pilot/zero-risk" element={<PilotZeroRiskPage />} />
    <Route path="/pilot/ai-team" element={<PilotAITeamPage />} />
    <Route path="/pilot/exclusive" element={<PilotExclusivePage />} />
    <Route path="/partners" element={<AgencyPartnerPage />} />
    <Route path="/ai-workforce-designer" element={<AIWorkforceDesignerPage />} />
    <Route path="/about" element={<Navigate to="/" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </>
);

export default publicRoutes;
