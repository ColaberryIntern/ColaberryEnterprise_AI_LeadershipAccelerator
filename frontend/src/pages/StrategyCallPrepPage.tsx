import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';

export default function StrategyCallPrepPage() {
  return (
    <>
      <SEOHead
        title="Prepare for Your Strategy Call | Colaberry Enterprise AI"
        description="Prepare for your 30-minute executive AI strategy call. Review what we'll cover and how to make the most of your session."
      />

      {/* Hero */}
      <section
        className="text-light text-center"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '5rem 0',
        }}
      >
        <div className="container" style={{ maxWidth: '750px' }}>
          <h1 className="text-light mb-3" style={{ fontSize: '2.2rem' }}>
            Prepare for Your Executive AI Strategy Call
          </h1>
          <p className="lead mb-0" style={{ opacity: 0.85 }}>
            This 5-minute preparation will ensure we use your time effectively.
          </p>
          <hr className="my-4 mx-auto" style={{ opacity: 0.3, maxWidth: 120, borderColor: '#fff' }} />
        </div>
      </section>

      {/* What We'll Cover */}
      <section className="section">
        <div className="container">
          <h2 className="text-center mb-4">What We'll Cover</h2>
          <div className="row g-4">
            {[
              {
                num: 1,
                title: 'AI Deployment Priorities',
                desc: 'Identify 1\u20132 high-impact areas where AI can drive measurable results within your organization.',
              },
              {
                num: 2,
                title: 'Internal Capability Assessment',
                desc: 'Evaluate current technical capacity and governance readiness for enterprise AI adoption.',
              },
              {
                num: 3,
                title: '30-Day Roadmap Alignment',
                desc: 'Define the fastest path to internal AI capability deployment with clear milestones.',
              },
            ].map((item) => (
              <div className="col-md-4" key={item.num}>
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-body text-center py-4">
                    <div
                      className="rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center mb-3"
                      style={{ width: 36, height: 36, fontSize: '0.95rem', fontWeight: 600 }}
                    >
                      {item.num}
                    </div>
                    <h5 className="fw-semibold mb-2">{item.title}</h5>
                    <p className="text-muted mb-0 small">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preparation Questions */}
      <section className="section-alt">
        <div className="container">
          <h2 className="text-center mb-2">Preparation Questions</h2>
          <p className="text-center text-muted mb-4">Before the call, consider:</p>
          <div className="mx-auto" style={{ maxWidth: 700 }}>
            {[
              'What business function is under the most operational pressure?',
              'Where is manual work slowing decision-making?',
              'Do you have internal AI or engineering talent available?',
              'Are you evaluating consulting firms or internal build options?',
            ].map((q) => (
              <div className="d-flex align-items-start gap-3 mb-3" key={q}>
                <span className="text-primary fw-bold" style={{ fontSize: '1.1rem', lineHeight: 1.4 }}>
                  &#10003;
                </span>
                <p className="mb-0" style={{ lineHeight: 1.6 }}>{q}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Optional Materials */}
      <section className="section">
        <div className="container">
          <div className="card border shadow-sm mx-auto" style={{ maxWidth: 600 }}>
            <div className="card-body p-4">
              <h6 className="fw-semibold mb-3">If available, consider bringing:</h6>
              <ul className="mb-0" style={{ lineHeight: 2 }}>
                <li>Current AI initiatives or pilot programs</li>
                <li>Organizational chart (high level)</li>
                <li>Strategic priorities for the next 6 months</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Cohort Reminder */}
      <section className="section-alt">
        <div className="container text-center" style={{ maxWidth: 650 }}>
          <p className="mb-1" style={{ color: 'var(--color-primary)' }}>
            <strong>The March 31 Enterprise AI Cohort begins soon.</strong>
          </p>
          <p className="text-muted small mb-0">
            Many executives use this strategy call to determine if the cohort aligns
            with their deployment goals.
          </p>
        </div>
      </section>

      {/* Back CTA */}
      <section className="section text-center">
        <div className="container">
          <Link to="/" className="btn btn-hero-primary btn-lg px-5">
            Return to Homepage
          </Link>
          <br />
          <Link to="/advisory" className="btn btn-outline-secondary btn-sm mt-3">
            View Executive Briefing
          </Link>
        </div>
      </section>
    </>
  );
}
