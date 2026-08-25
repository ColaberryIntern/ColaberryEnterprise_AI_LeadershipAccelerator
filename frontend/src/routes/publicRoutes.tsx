import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import ProgramPage from '../pages/ProgramPage';
import PricingPage from '../pages/PricingPage';
import SponsorshipPage from '../pages/SponsorshipPage';
import AdvisoryPage from '../pages/AdvisoryPage';
import EnrollPage from '../pages/EnrollPage';
import EnrollSuccessPage from '../pages/EnrollSuccessPage';
import EnrollCancelPage from '../pages/EnrollCancelPage';
import ExecOverviewThankYouPage from '../pages/ExecOverviewThankYouPage';
import ExecutiveROICalculatorPage from '../pages/ExecutiveROICalculatorPage';
import AIArchitectLandingPage from '../pages/AIArchitectLandingPage';
import InstructorPage from '../pages/InstructorPage';
import NotFoundPage from '../pages/NotFoundPage';
import AgencyPartnerPage from '../pages/AgencyPartnerPage';
import AIWorkforceDesignerPage from '../pages/AIWorkforceDesignerPage';
import WorkingProfessionalsPage from '../pages/membership/WorkingProfessionalsPage';
import BeginnersPage from '../pages/membership/BeginnersPage';
import BuildersPage from '../pages/membership/BuildersPage';
import SponsorChallengePage from '../pages/SponsorChallengePage';
import LeaderboardPage from '../pages/LeaderboardPage';
import DemoDayPage from '../pages/DemoDayPage';
import SponsorDashboardPage from '../pages/SponsorDashboardPage';
import ConsultingPage from '../pages/ConsultingPage';
import ClientSignIn from '../pages/refactored/ClientSignIn';

const publicRoutes = (
  <>
  {/*
      CUTOVER: V2 is the site now.

      These marketing paths were served by the old pages and are now owned by V2
      or redirected to their nearest equivalent. They REDIRECT rather than 404,
      because inbound links, the sitemap and search results still point at them.

      Everything below this block is deliberately untouched: /enroll and its
      success/cancel pair carry the payment flow, /sponsor/dashboard is how
      sponsors get in, and /challenge, /leaderboard, the pilot, membership and
      strategy-call pages are functional surfaces rather than marketing. Deleting
      those because "the old site is not needed" would break paying customers.
  */}
  <Route path="/program" element={<Navigate to="/platform" replace />} />
  <Route path="/case-studies" element={<Navigate to="/stories" replace />} />
  <Route path="/demo-day" element={<Navigate to="/stories" replace />} />
  <Route path="/advisory" element={<Navigate to="/services" replace />} />
  <Route path="/consulting" element={<Navigate to="/services" replace />} />
  <Route path="/about" element={<Navigate to="/" replace />} />
    <Route path="/sponsorship" element={<SponsorshipPage />} />
    <Route path="/enroll" element={<EnrollPage />} />
    <Route path="/enroll/success" element={<EnrollSuccessPage />} />
    <Route path="/enroll/cancel" element={<EnrollCancelPage />} />
    <Route path="/executive-overview/thank-you" element={<ExecOverviewThankYouPage />} />
    <Route path="/executive-roi-calculator" element={<ExecutiveROICalculatorPage />} />
    <Route path="/ai-architect" element={<AIArchitectLandingPage />} />
    <Route path="/ai-architect/instructor" element={<InstructorPage />} />
    <Route path="/sponsor/dashboard" element={<SponsorDashboardPage />} />
    {/* Retired enterprise-sales pages — folded into the sponsor-challenge model */}
    <Route path="/strategy-call-prep" element={<Navigate to="/sponsorship" replace />} />
    <Route path="/pilot/zero-risk" element={<Navigate to="/sponsorship" replace />} />
    <Route path="/pilot/ai-team" element={<Navigate to="/sponsorship" replace />} />
    <Route path="/pilot/exclusive" element={<Navigate to="/sponsorship" replace />} />
    <Route path="/partners" element={<AgencyPartnerPage />} />
    <Route path="/ai-workforce-designer" element={<AIWorkforceDesignerPage />} />
    <Route path="/membership/working-professionals" element={<WorkingProfessionalsPage />} />
    <Route path="/membership/beginners" element={<BeginnersPage />} />
    <Route path="/membership/builders" element={<BuildersPage />} />
    <Route path="/challenge" element={<SponsorChallengePage />} />
    <Route path="/leaderboard" element={<LeaderboardPage />} />
    {/* Client reviewer sign-in. The first genuinely client-facing (non-staff) surface:
        an external reviewer has no enrollment and no admin user, so this cannot live
        under /admin or /portal. Signing in grants nothing — the backend requires a
        delivery membership that already exists. */}
    <Route path="/client" element={<ClientSignIn />} />
    {/* /p/:slug (Capstone Record) is NOT here — it is defined under
        PublicLayoutV2 in App.tsx so it gets the current site header rather than
        this block's retired one. See the comment there. */}
    <Route path="*" element={<NotFoundPage />} />
  </>
);

export default publicRoutes;
