import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';

function AdvisoryPage() {
  const services = [
    {
      icon: '🗺️',
      title: 'AI Roadmap Workshops',
      description:
        'Structured 2-day working sessions to refine and operationalize your 90-Day AI Roadmap. Includes resource planning, vendor evaluation, and governance checkpoints.',
      format: '2-day working session',
      idealFor: 'Teams 4–6 weeks post-accelerator',
    },
    {
      icon: '🏗️',
      title: 'Enterprise AI Architecture Design',
      description:
        'Colaberry architects work alongside your technical team to design the data pipelines, model serving infrastructure, and integration patterns for your priority AI initiative.',
      format: 'Engagement: 4–8 weeks',
      idealFor: 'Organizations preparing for first production AI deployment',
    },
    {
      icon: '🤖',
      title: 'AI Agent Implementation Projects',
      description:
        'End-to-end implementation support for AI agent and automation projects. From architecture review through deployment and monitoring setup.',
      format: 'Engagement: 8–16 weeks',
      idealFor: 'Organizations with approved AI initiative and allocated team',
    },
    {
      icon: '🛡️',
      title: 'AI Governance Advisory',
      description:
        'Design and implement AI governance frameworks appropriate to your industry and regulatory environment. Covers model risk, data governance, audit trails, and compliance posture.',
      format: 'Engagement: 3–6 weeks',
      idealFor: 'Finance, Healthcare, Government, and regulated industries',
    },
    {
      icon: '👥',
      title: 'AI Talent Deployment',
      description:
        'Access Colaberry\'s network of enterprise-trained AI practitioners for embedded or project-based engagements. Accelerator-trained talent who understand enterprise architecture.',
      format: 'Ongoing | project-based or embedded',
      idealFor: 'Organizations scaling AI teams faster than organic hiring allows',
    },
  ];

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
        title="Enterprise AI Advisory"
        description="Colaberry Enterprise AI Advisory Services — AI Roadmap Workshops, Architecture Design, Agent Implementation, Governance Advisory, and AI Talent Deployment for enterprise organizations."
      />

      {/* Header */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Page Header"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container text-center py-4">
          <img src="/colaberry-icon.png" alt="" width="44" height="44" className="mb-3 logo-hero" />
          <h1 className="display-5 fw-bold text-light">🌐 Enterprise AI Advisory Services</h1>
          <p className="lead">
            For organizations ready to move beyond the accelerator and deploy AI at scale.
          </p>
        </div>
      </section>

      {/* Advisory Context */}
      <section className="section" aria-label="Advisory Context">
        <div className="container text-center">
          <h2 className="mb-4">From Accelerator to Enterprise Execution</h2>
          <p className="text-muted mb-5" style={{ maxWidth: '700px', margin: '0 auto' }}>
            The Executive Accelerator gives your team the vocabulary, POC, and roadmap.
            Advisory services take you from roadmap to deployed, governed AI systems
            operating in production.
          </p>
          <div className="row g-4 justify-content-center align-items-center" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="col-md-4">
              <div className="p-4 bg-white rounded shadow-sm">
                <div className="fs-1 mb-2" aria-hidden="true">🎓</div>
                <h3 className="h6">Accelerator</h3>
                <p className="text-muted small mb-0">Build foundational capability, POC, roadmap</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-4 bg-white rounded shadow-sm">
                <div className="fs-1 mb-2" aria-hidden="true">🔧</div>
                <h3 className="h6">Advisory</h3>
                <p className="text-muted small mb-0">Architecture, implementation, governance</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-4 bg-white rounded shadow-sm">
                <div className="fs-1 mb-2" aria-hidden="true">🚀</div>
                <h3 className="h6">Scale</h3>
                <p className="text-muted small mb-0">Enterprise-wide AI deployment</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service Offerings */}
      <section className="section-alt" aria-label="Service Offerings">
        <div className="container">
          <h2 className="text-center mb-5">🔧 Advisory Service Offerings</h2>
          <div className="row g-4">
            {services.map((service) => (
              <div className="col-md-6" key={service.title}>
                <div className="card h-100 border-0 shadow-sm p-4">
                  <div className="d-flex align-items-center mb-3">
                    <span className="fs-1 me-3" aria-hidden="true">{service.icon}</span>
                    <h3 className="h5 mb-0">{service.title}</h3>
                  </div>
                  <p className="text-muted">{service.description}</p>
                  <div className="mt-auto">
                    <span className="badge bg-secondary me-2">📅 {service.format}</span>
                    <br className="d-md-none" />
                    <span className="badge bg-light text-dark mt-2">🎯 Ideal for: {service.idealFor}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Engagements Work */}
      <section className="section" aria-label="Engagement Process">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-5">
              <div className="img-accent-frame">
                <img
                  src="https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=800&q=80"
                  alt="Enterprise team engaged in AI architecture whiteboard session"
                  className="img-feature img-feature-tall"
                />
              </div>
            </div>
            <div className="col-lg-7">
              <h2 className="mb-5">🔄 How Advisory Engagements Work</h2>
              <div className="d-flex align-items-start mb-4">
                <div className="fs-1 me-3" aria-hidden="true">1️⃣</div>
                <div>
                  <h3 className="h5">Strategy Alignment Call</h3>
                  <p className="text-muted">
                    30-minute scoping call with our Enterprise AI team to understand
                    your roadmap, constraints, and objectives.
                  </p>
                </div>
              </div>
              <div className="d-flex align-items-start mb-4">
                <div className="fs-1 me-3" aria-hidden="true">2️⃣</div>
                <div>
                  <h3 className="h5">Engagement Design</h3>
                  <p className="text-muted">
                    Customized scope, timeline, and deliverables based on your
                    organization's specific AI roadmap and priorities.
                  </p>
                </div>
              </div>
              <div className="d-flex align-items-start mb-4">
                <div className="fs-1 me-3" aria-hidden="true">3️⃣</div>
                <div>
                  <h3 className="h5">Embedded Execution</h3>
                  <p className="text-muted mb-0">
                    Colaberry team works alongside yours — not for you.
                    We transfer capability, not just deliverables.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Industries Served */}
      <section className="section-alt" aria-label="Industries Served">
        <div className="container text-center">
          <h2 className="mb-4">🌍 Industries We Serve</h2>
          <div className="row g-4">
            {industries.map((industry) => (
              <div className="col-md-3 col-6" key={industry.name}>
                <div className="p-4 bg-white rounded shadow-sm">
                  <div className="fs-1 mb-2" aria-hidden="true">{industry.icon}</div>
                  <h3 className="h6 mb-0">{industry.name}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="cta-bg text-light text-center py-5"
        aria-label="Call to Action"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container py-4">
          <h2 className="text-light mb-3">🚀 Ready to Discuss an Advisory Engagement?</h2>
          <p className="mb-4">
            Most engagements begin with a 30-minute strategy call.
          </p>
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            <Link to="/contact" className="btn btn-accent btn-lg">
              Schedule a Strategy Call
            </Link>
            <Link to="/program" className="btn btn-outline-light btn-lg">
              View the Accelerator
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default AdvisoryPage;
