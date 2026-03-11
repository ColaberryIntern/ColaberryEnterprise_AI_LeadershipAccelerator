import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import api from '../utils/api';

interface LocationState {
  name?: string;
  email?: string;
  company?: string;
  phone?: string;
}

function ExecOverviewThankYouPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [kitRequested, setKitRequested] = useState(false);
  const [kitLoading, setKitLoading] = useState(false);
  const [kitError, setKitError] = useState('');
  const location = useLocation();
  const leadData = (location.state as LocationState) || {};

  const handleSponsorshipKit = async () => {
    if (!leadData.email) {
      setKitError('Email not available. Please complete the Executive Briefing form first.');
      return;
    }
    setKitLoading(true);
    setKitError('');
    try {
      await api.post('/api/sponsorship-kit-request', { email: leadData.email });
      setKitRequested(true);
      window.open('/assets/The_AI_Execution_Engine.pdf', '_blank');
    } catch (err: any) {
      setKitError(err.response?.data?.error || 'Failed to process request. Please try again.');
    } finally {
      setKitLoading(false);
    }
  };

  return (
    <>
      <SEOHead
        title="You're All Set"
        description="Your Executive AI Overview has been sent. Schedule a strategy call to discuss how the program fits your organization."
      />

      <section className="section" aria-label="Thank You">
        <div className="container text-center content-narrow">
          <div className="mb-4">
            <div className="display-1 mb-3" aria-hidden="true">&#x2705;</div>
            <h1 className="display-5 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
              You're All Set
            </h1>
            <p className="lead text-muted">
              Your Executive AI Overview + ROI Framework is on its way to your inbox.
              Check your email in the next few minutes.
            </p>
          </div>

          <div className="card border-0 shadow-sm p-4 mb-4 text-start">
            <h2 className="h5 fw-bold mb-3">What's Inside Your Executive Overview</h2>
            <ul className="mb-0">
              <li className="mb-2">Full program curriculum — day-by-day breakdown</li>
              <li className="mb-2">ROI framework — quantify savings vs. consulting engagements</li>
              <li className="mb-2">Enterprise case studies with measurable outcomes</li>
              <li className="mb-2">Executive templates — board deck, budget justification, vendor evaluation</li>
            </ul>
          </div>

          <div className="card border-0 shadow p-4 mb-4" style={{ background: 'var(--color-primary)', color: '#fff' }}>
            <h2 className="h4 fw-bold text-light mb-3">
              Ready to Discuss How This Fits Your Organization?
            </h2>
            <p className="mb-3 text-light opacity-75">
              Schedule a complimentary 30-minute strategy call with our Enterprise AI team.
              We'll review your AI priorities and show you how the accelerator maps to your goals.
            </p>
            <button onClick={() => setShowBooking(true)} className="btn btn-lg btn-accent">
              Schedule a 30-Minute Strategy Call
            </button>
          </div>

          {/* Corporate Sponsorship Kit */}
          <div className="card border-0 shadow-sm p-4 mb-4 text-start" style={{ background: '#f7fafc', borderLeft: '4px solid var(--color-primary)' }}>
            <h2 className="h5 fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
              Ready to Move Forward? Download the Corporate Sponsorship Kit.
            </h2>
            <p className="text-muted mb-3">
              Get the internal justification framework — ROI analysis, budget templates,
              and executive positioning — to secure corporate sponsorship for your team's participation.
            </p>
            {kitRequested ? (
              <div className="alert alert-success mb-0">
                Your sponsorship kit has been sent to your email. The PDF should open in a new tab.
              </div>
            ) : (
              <>
                <button
                  onClick={handleSponsorshipKit}
                  disabled={kitLoading}
                  className="btn btn-outline-primary"
                >
                  {kitLoading ? 'Processing...' : 'Download Sponsorship Kit & Begin Internal Approval'}
                </button>
                {kitError && (
                  <div className="alert alert-danger mt-2 mb-0 small">{kitError}</div>
                )}
              </>
            )}
          </div>

          <div className="card border-0 shadow-sm p-4 text-start" style={{ background: 'var(--color-warning-bg, #fff3cd)' }}>
            <div className="d-flex align-items-start">
              <span className="fs-4 me-3" aria-hidden="true">&#x23F3;</span>
              <div>
                <h3 className="h6 fw-bold mb-1">Limited Cohort Seats Available</h3>
                <p className="mb-0 small">
                  Each cohort is capped at 15 participants to ensure personalized instruction
                  and hands-on mentoring. Seats are filling — don't wait to{' '}
                  <Link to="/enroll" className="fw-bold">secure your spot</Link>.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Link to="/" className="text-decoration-none text-muted small">
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </section>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        initialName={leadData.name}
        initialEmail={leadData.email}
        initialCompany={leadData.company}
        initialPhone={leadData.phone}
      />
    </>
  );
}

export default ExecOverviewThankYouPage;
