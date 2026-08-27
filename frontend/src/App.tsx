import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ContactPage from './pages/ContactPage';
import { AuthProvider } from './contexts/AuthContext';
import ToastProvider from './components/ui/ToastProvider';
import ScrollToTop from './components/ScrollToTop';
import RouteLoading from './components/ui/RouteLoading';
import PublicLayout from './components/Layout/PublicLayout';
import publicRoutes from './routes/publicRoutes';
import ClientSignIn from './pages/refactored/ClientSignIn';
import ClientPortal from './pages/refactored/ClientPortal';
import PublicLayoutV2 from './components/publicV2/PublicLayoutV2';
import HomeV2 from './pages/publicV2/HomeV2';
import { ServicesV2, ServiceDetailV2 } from './pages/publicV2/ServicesV2';
import PlatformV2 from './pages/publicV2/PlatformV2';
import ProofV2 from './pages/publicV2/ProofV2';
import OpportunityLabV2 from './pages/publicV2/OpportunityLabV2';
import TryV2 from './pages/publicV2/TryV2';
import PrivacyV2 from './pages/publicV2/PrivacyV2';
import PricingV2 from './pages/publicV2/PricingV2';
import StoriesV2 from './pages/publicV2/StoriesV2';
import StoryDetailV2 from './pages/publicV2/StoryDetailV2';
import CapstoneRecordPage from './pages/CapstoneRecordPage';
import PublicPortfolioProfilePage from './pages/PublicPortfolioProfilePage';
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
      <Suspense fallback={<RouteLoading />}>
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
          {/*
              CUTOVER, 2026-08-13: V2 IS the public site. It was mounted at /v2 as a
              preview; it now owns "/".

              The old marketing pages are retired in routes/publicRoutes.tsx, where
              their paths redirect to the nearest V2 equivalent rather than 404 --
              inbound links and search results still point at them. The functional
              public routes (enrolment and payment, sponsor dashboard, challenge,
              leaderboard, pilot and membership pages) are untouched.

              This block must stay ABOVE the PublicLayout block below, so that "/"
              resolves to V2 rather than to the old home page.
          */}
          <Route path="/" element={<PublicLayoutV2 />}>
            <Route index element={<HomeV2 />} />
            <Route path="services" element={<ServicesV2 />} />
            <Route path="services/:slug" element={<ServiceDetailV2 />} />
            <Route path="platform" element={<PlatformV2 />} />
            <Route path="proof" element={<ProofV2 />} />
            <Route path="lab" element={<OpportunityLabV2 />} />
            {/* NOT "try": /try is the real product workspace
                (ManagementPreviewPage, declared above). Mounting the V2 explainer
                there post-cutover would shadow the product itself. */}
            <Route path="free-workspace" element={<TryV2 />} />
            {/*
                /contact moved OUT of the legacy publicRoutes block and under
                PublicLayoutV2. Ali, 2026-08-21: "Talk to an Architect takes me
                to a page that needs the navigation updated. That's the case
                throughout the application."

                It was rendering the old Home / The Program / Contact nav purely
                because it sat outside this layout. ContactPage renders no header
                of its own, so it simply inherits PublicHeaderV2 here -- no
                double header.

                THE SAME FIX APPLIES to the other legacy marketing pages still in
                publicRoutes.tsx. They were left there deliberately (that block
                carries /enroll and the payment flow), but the ones that are
                purely marketing should move here too.
            */}
            <Route path="contact" element={<ContactPage />} />
            <Route path="privacy" element={<PrivacyV2 />} />
            {/*
                /start renders SignupV2 no longer. Ali, 2026-08-21, asked three
                times: "Startfree page should go to try page." Every "Start free"
                button now points at /try directly; this redirect catches the
                inbound links, the sitemap and anyone who typed it.

                SignupV2 is left in the tree ON PURPOSE -- it is the
                account-creation page, and /try's own "Make this real: create
                your free account" button is where that flow belongs. Check what
                that button does before calling SignupV2 dead code.
            */}
            <Route path="start" element={<Navigate to="/try" replace />} />
            <Route path="pricing" element={<PricingV2 />} />
            <Route path="stories" element={<StoriesV2 />} />
            {/*
                The published-record detail surface. Declared WITHOUT a leading
                slash, like every other child of this layout route -- a leading
                slash here would make it an absolute path and it would not nest.

                DELIBERATELY NOT LAZY. The shared cbv2- primitives this page
                leans on (.cbv2-pagehero, .cbv2-section, .cbv2-btn, .cbv2-rv)
                live in homeV2.css / servicesV2.css / publicV2.css /
                cinematicV2.css and are only in the bundle because these V2 pages
                are imported statically here. Splitting this route out would ship
                it without its own layout primitives -- see the warning at the
                top of proofV2.css.
            */}
            <Route path="stories/:slug" element={<StoryDetailV2 />} />
            {/*
                A student's shareable Capstone Record. Lives under PublicLayoutV2
                rather than in the legacy publicRoutes block, and the layout is the
                whole point rather than a detail:

                  - V2 is the site's real header. A page a student sends to a hiring
                    manager showing the retired navbar reads as a dead corner of the
                    site, which is the opposite of what the page is for.
                  - PublicLayout (V1) calls initTracker() UNCONDITIONALLY. That would
                    fingerprint the hiring manager opening someone's portfolio before
                    asking them anything. V2 gates all attribution on consent.
                  - V1 mounts the Maya chat widget. A marketing chat bot does not
                    belong on top of a person's credential.

                Same no-leading-slash rule as the route above, for the same reason.
            */}
            <Route path="p/:slug" element={<CapstoneRecordPage />} />
            {/*
                u/:slug is the PERSON; p/:slug is one project. Same layout and the
                same no-leading-slash rule, for the same reason: both are pages a
                stranger opens from a link a learner sent, so neither may sit behind
                a marketing chrome that implies they are selling something.
            */}
            <Route path="u/:slug" element={<PublicPortfolioProfilePage />} />
          </Route>
          {/*
              Client reviewer sign-in. Deliberately OUTSIDE both marketing layouts,
              for the same reasons that moved p/:slug out of the legacy block — and
              they are sharper here, because this page is the front door to a paying
              client's engagement:

                - PublicLayout (V1) calls initTracker() UNCONDITIONALLY. That would
                  fingerprint a client's executive reviewer before they have signed
                  in or consented to anything. They are not a lead.
                - V1 is the retired navbar and marketing footer, offering "Start free"
                  and "Book a walkthrough" to someone who is already a customer.
                - V1 mounts the Maya sales chat widget. A prospecting bot does not
                  belong on the door to a delivery review.

              V2 was not the answer either: it is still the marketing site. This surface
              wants no site chrome at all, so it gets none. The page supplies its own
              full-height centred layout.
          */}
          <Route path="/client" element={<ClientSignIn />} />
          {/*
              Where sign-in actually goes. Same standalone treatment and the same reason:
              a client reviewer is not a lead, so no marketing chrome and no tracker.
          */}
          <Route path="/client/projects" element={<ClientPortal />} />
          <Route element={<PublicLayout />}>
            {publicRoutes}
          </Route>
        </Routes>
      </Suspense>
      {/* GlobalCoryWidget removed — replaced by ArchitectChat on portal pages */}
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
