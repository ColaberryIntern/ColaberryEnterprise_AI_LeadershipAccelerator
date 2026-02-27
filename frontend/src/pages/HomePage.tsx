import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import LeadCaptureForm from '../components/LeadCaptureForm';

function HomePage() {
  const navigate = useNavigate();

  const industries = [
    { icon: '💻', name: 'Technology' },
    { icon: '🏦', name: 'Finance & Banking' },
    { icon: '🏥', name: 'Healthcare & Life Sciences' },
    { icon: '🏭', name: 'Manufacturing' },
    { icon: '⚡', name: 'Energy & Utilities' },
    { icon: '🛒', name: 'Retail & eCommerce' },
    { icon: '🏛️', name: 'Government & Public Sector' },
    { icon: '🚚', name: 'Logistics & Supply Chain' },
  ];

  return (
    <>
      <SEOHead
        title="Home"
        description="Colaberry Enterprise AI Leadership Accelerator — A 5-Day Executive AI Build Accelerator for Directors and Technical Leaders. Build POCs, 90-Day Roadmaps, and Executive Decks internally."
      />

      {/* Hero Section */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Hero"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container py-5 text-center">
          <img
            src="/colaberry-icon.png"
            alt="Colaberry"
            width="56"
            height="56"
            className="mb-4 logo-hero"
          />
          <h1 className="display-4 fw-bold text-light mb-4">
            Build AI Solutions Inside Your Organization —<br />
            Without Hiring a Consulting Firm
          </h1>
          <p className="lead mb-4" style={{ maxWidth: '750px', margin: '0 auto' }}>
            A 5-Day Executive AI Build Accelerator designed for Directors and
            Technical Leaders responsible for AI strategy and deployment.
          </p>
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            <a href="#download-overview" className="btn btn-lg btn-hero-primary">
              Get Executive Briefing
            </a>
            <Link to="/sponsorship" className="btn btn-lg btn-outline-light">
              🤝 Request Corporate Sponsorship Kit
            </Link>
          </div>
        </div>
      </section>

      {/* Executive Problem Section */}
      <section className="section-alt" aria-label="The Challenge">
        <div className="container content-medium">
          <h2 className="text-center mb-4">🏢 The AI Mandate Is Now a Leadership Responsibility</h2>
          <p className="text-center text-muted mb-4">
            Enterprise leaders are under mounting pressure to deliver AI results.
            The gap between expectation and execution is widening.
          </p>
          <ul className="list-unstyled fs-5">
            <li className="mb-3">📊 Board-level pressure to demonstrate AI ROI within 12 months</li>
            <li className="mb-3">💸 Enterprise consulting firms charging $500K+ for AI strategy engagements</li>
            <li className="mb-3">⏳ Hiring AI talent takes 6–18 months and costs $250K+ per senior hire</li>
            <li className="mb-3">🔄 Pilot projects stall without internal ownership and architectural clarity</li>
            <li className="mb-3">📋 Leadership teams lack the vocabulary to evaluate AI vendor proposals</li>
          </ul>
        </div>
      </section>

      {/* Enterprise Solution Section */}
      <section className="section" aria-label="The Solution">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-6">
              <h2 className="mb-3">⚡ An Internal Capability Alternative to Consulting Firms</h2>
              <p className="text-muted mb-4">
                5 focused days over 2 weeks. Your team leaves with assets, not slides.
              </p>
              {[
                '✅ A working AI Proof of Concept (POC) scoped to your organization',
                '✅ A 90-Day AI Roadmap with prioritized initiatives',
                '✅ An Executive Presentation Deck ready for board or C-suite review',
                '✅ Enterprise AI Architecture Templates and governance frameworks',
                '✅ Ongoing access to the Enterprise AI Advisory Labs',
              ].map((outcome) => (
                <div className="p-3 bg-white rounded shadow-sm text-start fs-5 mb-3" key={outcome}>
                  {outcome}
                </div>
              ))}
            </div>
            <div className="col-lg-6">
              <div className="img-accent-frame">
                <img
                  src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80"
                  alt="Executive team collaborating on AI strategy in a modern conference room"
                  className="img-feature img-feature-tall"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Enterprise Leaders Choose Colaberry */}
      <section className="section-alt" aria-label="Why Colaberry">
        <div className="container">
          <h2 className="text-center mb-5">Why Enterprise Leaders Choose Colaberry</h2>
          <div className="row g-4">
            {[
              {
                icon: '🏛️',
                title: 'Built for Technical Executives',
                description:
                  'Designed for Directors, VPs, and CTOs — not beginners. Every session addresses the strategic and architectural decisions leaders actually face.',
                color: '#1a365d',
              },
              {
                icon: '🏗️',
                title: 'Production-Ready Architecture',
                description:
                  'Participants build real POCs using enterprise-grade AI architecture patterns — not toy demos. Work is immediately deployable or presentable.',
                color: '#e53e3e',
              },
              {
                icon: '📦',
                title: 'Executive Sponsorship Support Kit',
                description:
                  'Includes cost justification templates, ROI calculators, vendor evaluation frameworks, and approval process guides for internal budget approval.',
                color: '#38a169',
              },
              {
                icon: '🌐',
                title: 'Ongoing Enterprise AI Advisory Ecosystem',
                description:
                  'Access to ongoing advisory engagements, peer cohort sessions, and Colaberry\'s enterprise AI architecture network beyond the accelerator.',
                color: '#805ad5',
              },
            ].map((item) => (
              <div className="col-md-6 col-lg-3" key={item.title}>
                <div className="card card-lift h-100 border-0 shadow-sm text-center p-4" style={{ borderTop: `4px solid ${item.color}` }}>
                  <div
                    className="fs-3 mb-3 d-inline-flex align-items-center justify-content-center mx-auto"
                    style={{ width: '56px', height: '56px', borderRadius: '50%', background: `${item.color}15` }}
                    aria-hidden="true"
                  >{item.icon}</div>
                  <h3 className="h5">{item.title}</h3>
                  <p className="text-muted">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Target Industries */}
      <section
        className="img-section-bg section"
        aria-label="Target Industries"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container text-center">
          <h2 className="mb-4">🌍 Deploying AI Across Industries</h2>
          <p className="text-muted mb-5" style={{ maxWidth: '650px', margin: '0 auto' }}>
            Our accelerator serves technical leaders in the sectors where
            enterprise AI is creating the most impact.
          </p>
          <div className="row g-4">
            {industries.map((industry) => (
              <div className="col-md-3 col-6" key={industry.name}>
                <div className="card card-lift border-0 shadow-sm p-4 text-center" style={{ borderTop: '3px solid var(--color-primary-light)' }}>
                  <div className="fs-1 mb-2" aria-hidden="true">{industry.icon}</div>
                  <h3 className="h6 mb-0">{industry.name}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Executive Overview Download */}
      <section className="section-alt" id="download-overview" aria-label="Download Executive Overview">
        <div className="container" style={{ maxWidth: '960px' }}>
          <div className="text-center mb-4">
            <h2 className="mb-3">Get the Executive AI Accelerator Briefing</h2>
            <p className="text-muted mb-0" style={{ maxWidth: '700px', margin: '0 auto' }}>
              Download the complete program brief — including the full ROI framework,
              enterprise case studies, and 21-day implementation roadmap.
              Delivered instantly to your inbox.
            </p>
          </div>

          {/* Benefit Grid */}
          <div className="row g-3 mb-4">
            {[
              { icon: '📋', title: '21-Day Roadmap' },
              { icon: '📊', title: 'ROI Framework' },
              { icon: '🏢', title: 'Enterprise Case Studies' },
              { icon: '🏗️', title: 'Architecture Blueprint' },
            ].map((item) => (
              <div className="col-6 col-md-3" key={item.title}>
                <div className="text-center p-3 rounded border bg-white">
                  <div className="fs-3 mb-1" aria-hidden="true">{item.icon}</div>
                  <div className="fw-semibold small">{item.title}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Urgency Badge */}
          <div className="text-center mb-4">
            <span className="badge px-3 py-2" style={{ background: '#fff3cd', color: '#856404', fontSize: '0.85rem' }}>
              March 31 Cohort Enrollment Now Open — Limited Seats
            </span>
          </div>

          <LeadCaptureForm
            formType="executive_overview_download"
            fields={['name', 'email', 'company', 'title', 'phone', 'company_size', 'evaluating_90_days']}
            submitLabel="Get Executive Briefing →"
            buttonClassName="btn btn-hero-primary btn-lg w-100"
            captureUtm={true}
            onSuccess={() => navigate('/executive-overview/thank-you')}
          />

          {/* Privacy Reassurance */}
          <p className="text-center text-muted small mt-3">
            Your information is secure. We never share your data with third parties.
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        className="cta-bg text-light text-center py-5"
        aria-label="Call to Action"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container py-4">
          <h2 className="text-light mb-3">🚀 Ready to Build AI Capability Inside Your Organization?</h2>
          <p className="mb-4">
            Schedule a 30-minute strategy call with our Enterprise AI team.
          </p>
          <Link to="/contact" className="btn btn-lg btn-hero-primary">
            Request a Strategy Call
          </Link>
          {/* TODO: Replace with Calendly/booking link */}
        </div>
      </section>
    </>
  );
}

export default HomePage;
