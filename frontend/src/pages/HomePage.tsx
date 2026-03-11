import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { PROGRAM_SCHEDULE } from '../config/programSchedule';
import { EnterpriseLead, toLeadPayload } from '../models/EnterpriseLead';
import { validateForm } from '../utils/formValidation';
import { getUTMParams } from '../services/utmService';
import ArtifactValueBlock from '../components/ArtifactValueBlock';
import CohortUrgencyBadge from '../components/CohortUrgencyBadge';
import ROIHighlightSection from '../components/ROIHighlightSection';
import api from '../utils/api';

function HomePage() {
  const navigate = useNavigate();
  const [showBooking, setShowBooking] = useState(false);
  const [briefingSubmitting, setBriefingSubmitting] = useState(false);
  const [briefingErrors, setBriefingErrors] = useState<Record<string, string>>({});
  const [briefingServerError, setBriefingServerError] = useState('');

  const [briefingForm, setBriefingForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
    title: '',
    companySize: '',
    evaluating90Days: false,
    primaryObjective: '',
    willSeekCorporateSponsorship: false,
    timeline: '',
  });

  const handleBriefingChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setBriefingForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (briefingErrors[name]) setBriefingErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBriefingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBriefingServerError('');

    const errs = validateForm(
      briefingForm as unknown as Record<string, unknown>,
      { required: ['fullName', 'email', 'company', 'title'], email: ['email'], phone: ['phone'] },
    );
    if (Object.keys(errs).length > 0) {
      setBriefingErrors(errs);
      return;
    }

    setBriefingSubmitting(true);
    try {
      const lead: EnterpriseLead = {
        fullName: briefingForm.fullName,
        email: briefingForm.email,
        phone: briefingForm.phone,
        company: briefingForm.company,
        title: briefingForm.title,
        companySize: briefingForm.companySize,
        willSeekCorporateSponsorship: briefingForm.willSeekCorporateSponsorship,
        primaryObjective: briefingForm.primaryObjective ? [briefingForm.primaryObjective] : undefined,
        timeline: briefingForm.timeline,
        formType: 'executive_overview_download',
        ...getUTMParams(),
        pageOrigin: window.location.href,
      };
      const payload = toLeadPayload(lead);
      payload.evaluating_90_days = briefingForm.evaluating90Days;
      payload.corporate_sponsorship_interest = briefingForm.willSeekCorporateSponsorship;
      payload.timeline = briefingForm.timeline;
      await api.post('/api/leads', payload);
      navigate('/executive-overview/thank-you', { state: { name: briefingForm.fullName, email: briefingForm.email, company: briefingForm.company, phone: briefingForm.phone } });
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.details) {
        const fieldErrors: Record<string, string> = {};
        err.response.data.details.forEach((d: { field: string; message: string }) => {
          fieldErrors[d.field] = d.message;
        });
        setBriefingErrors(fieldErrors);
      } else {
        setBriefingServerError('Something went wrong. Please try again later.');
      }
    } finally {
      setBriefingSubmitting(false);
    }
  };

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
        description={`Colaberry Enterprise AI Leadership Accelerator — ${PROGRAM_SCHEDULE.heroTagline} for Directors and Technical Leaders. Build POCs, 90-Day Roadmaps, and Executive Decks internally.`}
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
          <CohortUrgencyBadge className="mb-3" />
          <h1 className="display-4 fw-bold text-light mb-4">
            Build AI Solutions Inside Your Organization —<br />
            Without Hiring a Consulting Firm
          </h1>
          <p className="lead mb-4" style={{ maxWidth: '750px', margin: '0 auto' }}>
            {PROGRAM_SCHEDULE.heroTagline} designed for Directors and
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
                {PROGRAM_SCHEDULE.totalSessions} focused sessions over {PROGRAM_SCHEDULE.totalWeeks} weeks. Your team leaves with assets, not slides.
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

      <ROIHighlightSection
        headline="See the Financial Impact in 60 Seconds."
        subtext="Small workflow automation gains compound into enterprise-level financial results."
        presetValues={{ employees: 25, hours: 5 }}
      />

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
      <section className="section-alt py-5" id="download-overview" aria-label="Download Executive Overview">
        <div className="container" style={{ maxWidth: '1100px' }}>
          <div className="bg-white rounded-4 shadow p-4 p-md-5">

            {/* Section Header */}
            <div className="text-center mb-5">
              <span className="badge rounded-pill px-3 py-2 mb-3 d-inline-block" style={{ background: '#fff3cd', color: '#856404', fontSize: '0.85rem' }}>
                Next Cohort Enrollment Open
              </span>
              <h2 className="mb-3" style={{ fontSize: '2rem' }}>Executive AI Accelerator Briefing</h2>
              <p className="text-muted mb-0" style={{ maxWidth: '680px', margin: '0 auto', fontSize: '1.1rem' }}>
                Built for CTOs, CIOs, CDOs, and Directors ready to deploy internal AI capability within 30 days.
              </p>
            </div>

            {/* Value Preview Cards */}
            <div className="row g-4 mb-5">
              {[
                { icon: '📅', title: `${PROGRAM_SCHEDULE.totalWeeks}-Week Execution Roadmap`, description: 'Clear session-by-session transformation path' },
                { icon: '💰', title: 'ROI & Cost Framework', description: 'Internal build vs consulting math' },
                { icon: '🏢', title: 'Enterprise Case Studies', description: 'Documented deployment results' },
                { icon: '🧱', title: 'AI Architecture Blueprint', description: 'Learn / Build / Manage model' },
              ].map((item) => (
                <div className="col-md-6 col-lg-3" key={item.title}>
                  <div className="card card-lift h-100 border text-center p-3">
                    <div className="fs-2 mb-2" aria-hidden="true">{item.icon}</div>
                    <div className="fw-bold small mb-1">{item.title}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>{item.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <ArtifactValueBlock />

            {/* Structured Briefing Form */}
            {briefingServerError && (
              <div className="alert alert-danger" role="alert">{briefingServerError}</div>
            )}
            <form onSubmit={handleBriefingSubmit} noValidate>
              {/* Identity */}
              <p className="fw-semibold small text-muted text-uppercase mb-3">Contact Information</p>
              <div className="row g-3 mb-4">
                <div className="col-md-4">
                  <label htmlFor="bp-fullName" className="form-label small fw-medium">Full Name <span className="text-danger">*</span></label>
                  <input type="text" className={`form-control form-control-sm ${briefingErrors.fullName ? 'is-invalid' : ''}`} id="bp-fullName" name="fullName" value={briefingForm.fullName} onChange={handleBriefingChange} required />
                  {briefingErrors.fullName && <div className="invalid-feedback">{briefingErrors.fullName}</div>}
                </div>
                <div className="col-md-4">
                  <label htmlFor="bp-email" className="form-label small fw-medium">Work Email <span className="text-danger">*</span></label>
                  <input type="email" className={`form-control form-control-sm ${briefingErrors.email ? 'is-invalid' : ''}`} id="bp-email" name="email" value={briefingForm.email} onChange={handleBriefingChange} required />
                  {briefingErrors.email && <div className="invalid-feedback">{briefingErrors.email}</div>}
                </div>
                <div className="col-md-4">
                  <label htmlFor="bp-phone" className="form-label small fw-medium">Phone</label>
                  <input type="tel" className={`form-control form-control-sm ${briefingErrors.phone ? 'is-invalid' : ''}`} id="bp-phone" name="phone" value={briefingForm.phone} onChange={handleBriefingChange} />
                  {briefingErrors.phone && <div className="invalid-feedback">{briefingErrors.phone}</div>}
                </div>
              </div>

              {/* Company */}
              <p className="fw-semibold small text-muted text-uppercase mb-3">Organization</p>
              <div className="row g-3 mb-4">
                <div className="col-md-4">
                  <label htmlFor="bp-company" className="form-label small fw-medium">Company <span className="text-danger">*</span></label>
                  <input type="text" className={`form-control form-control-sm ${briefingErrors.company ? 'is-invalid' : ''}`} id="bp-company" name="company" value={briefingForm.company} onChange={handleBriefingChange} required />
                  {briefingErrors.company && <div className="invalid-feedback">{briefingErrors.company}</div>}
                </div>
                <div className="col-md-4">
                  <label htmlFor="bp-title" className="form-label small fw-medium">Title <span className="text-danger">*</span></label>
                  <input type="text" className={`form-control form-control-sm ${briefingErrors.title ? 'is-invalid' : ''}`} id="bp-title" name="title" value={briefingForm.title} onChange={handleBriefingChange} required />
                  {briefingErrors.title && <div className="invalid-feedback">{briefingErrors.title}</div>}
                </div>
                <div className="col-md-4">
                  <label htmlFor="bp-companySize" className="form-label small fw-medium">Company Size</label>
                  <select className="form-select form-select-sm" id="bp-companySize" name="companySize" value={briefingForm.companySize} onChange={handleBriefingChange}>
                    <option value="">Select...</option>
                    <option value="1-49">1-49</option>
                    <option value="50-249">50-249</option>
                    <option value="250-999">250-999</option>
                    <option value="1000-4999">1,000-4,999</option>
                    <option value="5000+">5,000+</option>
                  </select>
                </div>
              </div>

              {/* AI Initiative */}
              <p className="fw-semibold small text-muted text-uppercase mb-3">AI Initiative</p>
              <div className="row g-3 mb-4">
                <div className="col-md-4">
                  <label htmlFor="bp-primaryObjective" className="form-label small fw-medium">Primary Objective</label>
                  <select className="form-select form-select-sm" id="bp-primaryObjective" name="primaryObjective" value={briefingForm.primaryObjective} onChange={handleBriefingChange}>
                    <option value="">Select...</option>
                    <option value="Build internal AI capability">Build internal AI capability</option>
                    <option value="Evaluate AI vendors">Evaluate AI vendors</option>
                    <option value="Deploy AI POC">Deploy AI POC</option>
                    <option value="Train leadership team">Train leadership team</option>
                    <option value="AI governance">AI governance & compliance</option>
                  </select>
                </div>
                <div className="col-md-4">
                  <label htmlFor="bp-timeline" className="form-label small fw-medium">Timeline</label>
                  <select className="form-select form-select-sm" id="bp-timeline" name="timeline" value={briefingForm.timeline} onChange={handleBriefingChange}>
                    <option value="">Select...</option>
                    <option value="immediate">Next 30 days</option>
                    <option value="quarter">This quarter</option>
                    <option value="6months">Within 6 months</option>
                    <option value="exploring">Just exploring</option>
                  </select>
                </div>
                <div className="col-md-4 d-flex flex-column justify-content-end gap-2">
                  <div className="form-check">
                    <input type="checkbox" className="form-check-input" id="bp-evaluating" name="evaluating90Days" checked={briefingForm.evaluating90Days} onChange={handleBriefingChange} />
                    <label className="form-check-label small" htmlFor="bp-evaluating">Evaluating within 90 days</label>
                  </div>
                  <div className="form-check">
                    <input type="checkbox" className="form-check-input" id="bp-sponsorship" name="willSeekCorporateSponsorship" checked={briefingForm.willSeekCorporateSponsorship} onChange={handleBriefingChange} />
                    <label className="form-check-label small" htmlFor="bp-sponsorship">Seeking corporate sponsorship</label>
                  </div>
                </div>
              </div>

              <p className="text-muted small text-center mb-3">
                Organizations evaluating AI deployment within 90 days receive priority strategy sessions.
              </p>
              <button type="submit" className="btn btn-hero-primary btn-lg w-100" disabled={briefingSubmitting}>
                {briefingSubmitting ? 'Submitting...' : 'Download Executive Briefing & Schedule Strategy Call →'}
              </button>
            </form>

            {/* Enterprise Trust Strip */}
            <div className="text-center mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="fw-semibold small mb-1">
                Enterprise Data Respect Policy
              </p>
              <p className="text-muted small mb-0">
                We never sell your information. Your data is used solely to deliver requested materials.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Strategy Call CTA */}
      <section
        className="text-light text-center"
        aria-label="Schedule Strategy Call"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '5rem 0',
        }}
      >
        <div className="container" style={{ maxWidth: '750px' }}>
          <h2 className="text-light mb-3" style={{ fontSize: '2rem' }}>
            Ready to Deploy AI in the Next 30 Days?
          </h2>
          <p className="mb-4" style={{ opacity: 0.85, fontSize: '1.1rem' }}>
            Schedule a 30-minute executive strategy session to align roadmap,
            architecture, and internal capability.
          </p>
          <p className="mb-4 small" style={{ opacity: 0.6 }}>
            Most executives schedule this call immediately after reviewing the briefing.
          </p>
          <button
            className="btn btn-hero-primary btn-lg px-5"
            onClick={() => setShowBooking(true)}
          >
            Schedule Executive Strategy Call →
          </button>
          <div className="d-flex justify-content-center gap-4 mt-4 flex-wrap" style={{ opacity: 0.7 }}>
            <span className="small">✓ 30-minute focused session</span>
            <span className="small">✓ No obligation</span>
            <span className="small">✓ Architecture-first discussion</span>
          </div>
        </div>
      </section>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/" />
    </>
  );
}

export default HomePage;
