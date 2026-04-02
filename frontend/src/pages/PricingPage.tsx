import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { PROGRAM_SCHEDULE, STANDARD_CTAS } from '../config/programSchedule';
import ArtifactValueBlock from '../components/ArtifactValueBlock';
import ExecutiveTestimonial from '../components/ExecutiveTestimonial';
import CohortUrgencyBadge from '../components/CohortUrgencyBadge';
import ROIHighlightSection from '../components/ROIHighlightSection';
import AdvisoryCTABlock from '../components/AdvisoryCTABlock';

function PricingPage() {
  return (
    <>
      <SEOHead
        title="Pricing"
        description="Executive Accelerator pricing - $4,500 per participant. Corporate group pricing and Enterprise Sponsorship pathways available for organizations deploying AI at scale."
      />

      {/* Header */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Page Header"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container text-center py-4">
          <img src="/colaberry-icon.png" alt="" width="44" height="44" className="mb-3 logo-hero" />
          <CohortUrgencyBadge className="mb-3" />
          <h1 className="display-5 fw-bold text-light">Executive Accelerator Pricing</h1>
          <p className="lead">
            Transparent, single-tier pricing with enterprise sponsorship pathways
          </p>
        </div>
      </section>

      <AdvisoryCTABlock
        headline="Not sure if this is right for you?"
        subtext="Design your AI organization first - free, no signup required. See the impact before you invest."
        buttonText="Design My AI Organization"
        trackLabel="pricing_design_first"
        variant="dark"
      />

      {/* Single Pricing Tier */}
      <section className="section" aria-label="Pricing">
        <div className="container" style={{ maxWidth: '650px' }}>
          <div className="card border-primary border-2 shadow">
            <div className="card-header text-white text-center fw-bold fs-5" style={{ background: 'linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)' }}>
              ⚡ Executive AI Build Accelerator
            </div>
            <div className="card-body p-5 text-center">
              <div className="mb-2">
                <span className="badge bg-secondary mb-3">Per Participant</span>
              </div>
              <h2 className="display-3 fw-bold mb-1">$4,500</h2>
              <p className="text-muted mb-4">per participant | corporate group pricing available</p>
              <ul className="list-unstyled text-start fs-5 mb-4">
                {[
                  `${PROGRAM_SCHEDULE.totalSessions}-Session Intensive Accelerator (${PROGRAM_SCHEDULE.shortDescription})`,
                  'Working AI Proof of Concept (POC)',
                  '90-Day AI Execution Roadmap',
                  'Executive AI Presentation Deck',
                  'Enterprise AI Architecture Templates',
                  'Ongoing Enterprise AI Advisory Labs access',
                  'Peer cohort — technical leaders across industries',
                  'Executive Sponsorship Support Kit',
                ].map((feature) => (
                  <li className="mb-2" key={feature}>
                    <span className="text-success me-2" aria-hidden="true">✅</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="d-flex justify-content-center gap-3 flex-wrap">
                <Link to="/enroll" className="btn btn-primary btn-lg">
                  Enroll Now
                </Link>
                <a href="/#download-overview" className="btn btn-outline-primary btn-lg">
                  {STANDARD_CTAS.primary}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ROIHighlightSection
        headline="Reframe Cost as Investment."
        subtext="See how quickly the program pays for itself."
        presetValues={{ employees: 20, hours: 4 }}
      />

      <ArtifactValueBlock />

      {/* Corporate Group Pricing */}
      <section className="section-alt" aria-label="Corporate Group Pricing">
        <div className="container">
          <h2 className="text-center mb-5">🏢 Corporate Group Enrollment</h2>
          <div className="row g-4 text-center">
            {[
              { icon: '👥', title: '2–4 Participants', desc: 'Custom group rate with shared cohort experience', color: '#3182ce' },
              { icon: '🏬', title: '5–9 Participants', desc: 'Cohort pricing with dedicated support sessions', color: '#805ad5' },
              { icon: '🏭', title: '10+ Participants', desc: 'Private corporate cohort — fully tailored to your organization', color: '#38a169' },
            ].map((tier) => (
              <div className="col-md-4" key={tier.title}>
                <div className="card card-lift h-100 border-0 shadow-sm p-4 text-center" style={{ borderTop: `4px solid ${tier.color}` }}>
                  <div className="fs-1 mb-3" aria-hidden="true">{tier.icon}</div>
                  <h3 className="h5">{tier.title}</h3>
                  <p className="text-muted">{tier.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-4">
            <Link to="/contact" className="btn btn-outline-primary btn-lg">
              Request Group Pricing
            </Link>
          </div>
        </div>
      </section>

      <ExecutiveTestimonial
        quote="This program gave our leadership team the confidence and concrete framework to move from AI experimentation to production deployment. We built our first internal AI tool during the accelerator."
        name="VP of Technology"
        title="Director-Level Participant"
        industry="Financial Services"
        companySize="1,000+ employees"
      />

      <AdvisoryCTABlock variant="compact" trackLabel="pricing_post_testimonial" />

      {/* Enterprise Sponsorship Pathway */}
      <section className="section" aria-label="Enterprise Sponsorship">
        <div className="container content-medium">
          <h2 className="text-center mb-4">🤝 Enterprise Sponsorship Pathway</h2>
          <p className="text-center text-muted mb-4">
            For organizations sponsoring participants from their teams or client organizations.
          </p>
          <ul className="list-unstyled fs-5">
            <li className="mb-3">📋 ROI justification templates and cost-benefit frameworks</li>
            <li className="mb-3">✅ Internal approval process guides and budget request templates</li>
            <li className="mb-3">📊 Sponsor visibility and recognition in cohort materials</li>
            <li className="mb-3">🔗 Direct access to Colaberry Enterprise AI Advisory team</li>
          </ul>
          <div className="text-center mt-4">
            <Link to="/sponsorship" className="btn btn-primary btn-lg">
              View Sponsorship Kit
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-alt" aria-label="Frequently Asked Questions">
        <div className="container content-medium">
          <h2 className="text-center mb-5">❓ Frequently Asked Questions</h2>
          {[
            {
              q: 'What is the time commitment for participants?',
              a: PROGRAM_SCHEDULE.pricingDescription,
            },
            {
              q: 'Can multiple team members enroll together?',
              a: 'Yes. Corporate group pricing is available for 2 or more participants from the same organization. Private cohort options are available for teams of 10 or more.',
            },
            {
              q: 'How does the Corporate Sponsorship Pathway work?',
              a: 'Organizations sponsoring participant enrollment receive the full Enterprise Sponsorship Kit — including ROI calculators, internal approval templates, and post-program advisory options. Contact us to discuss sponsorship structures.',
            },
            {
              q: 'What happens after the accelerator?',
              a: 'Participants retain ongoing access to the Enterprise AI Advisory Labs. Follow-on engagements — including AI Roadmap Workshops, Architecture Design, and AI Agent Implementation — are available through our Advisory services.',
            },
            {
              q: 'Is the program available for remote participants?',
              a: 'Yes. The program is delivered in a hybrid format. All sessions are accessible virtually. In-person cohort options are available in select markets.',
            },
          ].map((faq) => (
            <div className="mb-4" key={faq.q}>
              <h3 className="h5">{faq.q}</h3>
              <p className="text-muted">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default PricingPage;
