import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SEOHead from '../components/SEOHead';
import LeadCaptureForm from '../components/LeadCaptureForm';
import Modal from '../components/ui/Modal';
import { PROGRAM_SCHEDULE } from '../config/programSchedule';
import ROIHighlightSection from '../components/ROIHighlightSection';
import api from '../utils/api';
import kitMarkdownUrl from '../docs/CorporateSponsorshipKit.md';

function SponsorshipPage() {
  const [showKitModal, setShowKitModal] = useState(false);
  const [submittedName, setSubmittedName] = useState('');
  const [kitContent, setKitContent] = useState('');

  useEffect(() => {
    fetch(kitMarkdownUrl)
      .then((res) => res.text())
      .then(setKitContent)
      .catch(() => setKitContent('Failed to load kit content.'));
  }, []);

  const handleFormSuccess = (data?: { name: string; email: string; company: string; phone: string }) => {
    if (data) {
      setSubmittedName(data.name.split(' ')[0] || data.name);
      // Fire-and-forget: trigger sponsorship kit email + scoring
      api.post('/api/sponsorship-kit-request', { email: data.email }).catch((err) =>
        console.warn('[SponsorshipPage] Kit email trigger failed (non-blocking):', err)
      );
    }
    setShowKitModal(true);
  };

  return (
    <>
      <SEOHead
        title="Corporate Sponsorship"
        description="Enterprise AI Accelerator Sponsorship Kit — ROI framework, cost justification templates, internal approval checklist. Build permanent AI capability across your leadership team."
      />

      {/* Header */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Page Header"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container text-center py-4">
          <img src="/colaberry-icon.png" alt="" width="44" height="44" className="mb-3 logo-hero" />
          <h1 className="display-5 fw-bold text-light">🤝 Corporate Sponsorship Kit</h1>
          <p className="lead">
            Everything your organization needs to justify, approve, and deploy the
            Executive AI Accelerator internally.
          </p>
        </div>
      </section>

      {/* What You Get */}
      <section className="section" aria-label="What You Get">
        <div className="container">
          <h2 className="text-center mb-5">📊 What Your Organization Gets</h2>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="card card-lift h-100 border-0 shadow-sm p-4 text-center">
                <div className="fs-1 mb-3" aria-hidden="true">⚡</div>
                <h3 className="h5">Speed to Production</h3>
                <p className="text-muted mb-0">Go from AI strategy to a working system in {PROGRAM_SCHEDULE.sponsorshipTimeline} — not quarters. Your team deploys a real POC during the program.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-lift h-100 border-0 shadow-sm p-4 text-center">
                <div className="fs-1 mb-3" aria-hidden="true">🏗️</div>
                <h3 className="h5">Permanent Team Capability</h3>
                <p className="text-muted mb-0">Your entire leadership team gains hands-on AI architecture skills they apply repeatedly — across every future initiative.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-lift h-100 border-0 shadow-sm p-4 text-center">
                <div className="fs-1 mb-3" aria-hidden="true">📦</div>
                <h3 className="h5">Production-Ready Deliverables</h3>
                <p className="text-muted mb-0">POC + 90-Day Roadmap + Executive Deck + Architecture Templates — everything needed for board approval and deployment.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Organizations Choose the Accelerator */}
      <section className="section-alt" aria-label="Why Organizations Choose the Accelerator">
        <div className="container">
          <h2 className="text-center mb-5">🏗️ Why Organizations Choose the Accelerator</h2>
          <div className="row g-4">
            {[
              { icon: '🔒', title: 'You Own the Knowledge', description: 'The capability stays with your team permanently. Every participant gains skills they apply across future initiatives.' },
              { icon: '⚡', title: 'Speed to Deployment', description: 'Move from strategy to a working system in weeks, not quarters. No lengthy ramp-up or extended timelines.' },
              { icon: '💡', title: 'Built on Your Context', description: 'Your team works on your actual challenges, data patterns, and infrastructure — not generic demos.' },
              { icon: '📈', title: 'Compound Returns', description: 'Skills and frameworks are applied repeatedly across initiatives. The ROI compounds with every new AI project your team leads.' },
              { icon: '🛡️', title: 'Data Sovereignty', description: 'All POC work happens on your infrastructure. No sensitive data leaves your environment.' },
              { icon: '💰', title: 'Efficient Investment', description: '$4,500 per participant delivers production-ready output, permanent team capability, and board-ready deliverables.' },
            ].map((item) => (
              <div className="col-md-4" key={item.title}>
                <div className="card card-lift h-100 border-0 shadow-sm text-center p-4">
                  <div className="fs-1 mb-3" aria-hidden="true">{item.icon}</div>
                  <h3 className="h5">{item.title}</h3>
                  <p className="text-muted mb-0">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ROIHighlightSection
        headline="Run Your Organization's ROI Scenario."
        subtext="Quantify the return of building internal execution capability."
        presetValues={{ employees: 75, hours: 6 }}
      />

      {/* Security Overview */}
      <section className="section" aria-label="Security and Governance">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-6">
              <h2 className="mb-4">🔐 Security & Data Governance</h2>
              <p className="text-muted mb-4">
                We understand that enterprise organizations have strict data governance requirements.
              </p>
              <ul className="list-unstyled fs-5">
                <li className="mb-3">🔒 No proprietary data leaves your environment during the program</li>
                <li className="mb-3">📋 All POC work is conducted on participant-controlled infrastructure</li>
                <li className="mb-3">✅ Program content and templates comply with enterprise security policies</li>
                <li className="mb-3">🏛️ AI governance frameworks align with common regulatory environments (SOC 2, HIPAA, FedRAMP contexts)</li>
              </ul>
              {/* TODO: Add formal security attestation document when available */}
            </div>
            <div className="col-lg-6">
              <div className="img-accent-frame">
                <img
                  src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80"
                  alt="Secure enterprise data center infrastructure"
                  className="img-feature img-feature-tall"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cost Justification Template */}
      <section className="section-alt" aria-label="Cost Justification">
        <div className="container">
          <h2 className="text-center mb-5">📝 Cost Justification Framework</h2>
          <p className="text-center text-muted mb-5" style={{ maxWidth: '700px', margin: '0 auto' }}>
            Use this framework to build your internal approval request.
          </p>
          <div className="row g-4">
            {[
              {
                step: 'Step 1',
                title: 'Calculate the Speed-to-Value Gain',
                description: 'Estimate months saved by deploying in 3 weeks vs. typical 6-12 month timelines. Multiply by monthly cost of delay.',
              },
              {
                step: 'Step 2',
                title: 'Quantify the Capability Multiplier',
                description: 'Number of future AI initiatives your trained team can lead independently × estimated value per initiative.',
              },
              {
                step: 'Step 3',
                title: 'Estimate Internal Capability ROI',
                description: 'Number of participants × number of future AI initiatives they will lead × estimated value per initiative.',
              },
            ].map((item) => (
              <div className="col-md-4" key={item.step}>
                <div className="card h-100 border-0 shadow-sm p-4">
                  <span className="badge bg-primary mb-3">{item.step}</span>
                  <h3 className="h5">{item.title}</h3>
                  <p className="text-muted mb-0">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Approval Checklist */}
      <section className="section" aria-label="Approval Checklist">
        <div className="container" style={{ maxWidth: '800px' }}>
          <h2 className="text-center mb-4">✅ Internal Approval Checklist</h2>
          <div className="list-group">
            {[
              '☐ Executive sponsor identified (CTO, CIO, or CDO)',
              '☐ Budget line confirmed (Learning & Development or Technology Innovation)',
              '☐ Participants nominated (recommend 2+ for peer reinforcement)',
              `☐ ${PROGRAM_SCHEDULE.totalWeeks}-week calendar block coordinated for participant availability`,
              '☐ IT pre-approval obtained for POC infrastructure access',
              '☐ Success metrics defined (what does success look like in 90 days?)',
            ].map((item) => (
              <div className="list-group-item border-0 fs-5" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sponsorship Kit Download Form */}
      <section className="bg-dark text-light py-5" aria-label="Download Sponsorship Kit">
        <div className="container text-center" style={{ maxWidth: '700px' }}>
          <h2 className="text-light mb-3">📥 Download the Full Sponsorship Kit</h2>
          <p className="mb-4">
            Includes: ROI templates, approval letter templates, executive briefing
            document, vendor comparison matrix.
          </p>
          <div className="bg-white rounded shadow p-4 text-start">
            <LeadCaptureForm
              formType="sponsorship_kit_download"
              fields={['name', 'email', 'company', 'role']}
              submitLabel="📥 Download Sponsorship Kit"
              successMessage="✅ Your Sponsorship Kit has been sent to your email. Expect it within minutes."
              className="text-dark"
              captureUtm
              onSuccess={handleFormSuccess}
            />
          </div>
          {/* TODO: Trigger automated email sequence via CRM (future) */}
        </div>
      </section>

      {/* Sponsorship Kit Modal */}
      <Modal
        show={showKitModal}
        onClose={() => setShowKitModal(false)}
        title="Your Executive AI Investment Kit is Ready"
        size="xl"
        footer={
          <div className="d-flex gap-2 flex-wrap">
            <a
              href="/strategy-call-prep"
              className="btn btn-primary"
            >
              Schedule an Executive AI Strategy Call
            </a>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => window.open('/assets/The_AI_Execution_Engine.pdf', '_blank')}
            >
              Download PDF
            </button>
          </div>
        }
      >
        <p className="text-muted mb-3">
          {submittedName ? `${submittedName}, we` : 'We'}'ve also sent a copy to your email.
        </p>

        {/* Quick Value */}
        <div className="alert alert-light border mb-4">
          <ul className="mb-0 list-unstyled">
            <li className="mb-2"><strong>Build</strong> a production AI system in 3 weeks</li>
            <li className="mb-2"><strong>Save</strong> months vs traditional consulting</li>
            <li className="mb-0"><strong>Enable</strong> internal AI capability that scales permanently</li>
          </ul>
        </div>

        {/* Kit Content */}
        <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 0.5rem' }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children, ...props }) => (
                <div className="table-responsive">
                  <table className="table table-hover table-sm" {...props}>{children}</table>
                </div>
              ),
              thead: ({ children, ...props }) => (
                <thead className="table-light" {...props}>{children}</thead>
              ),
              h1: ({ children, ...props }) => <h2 className="h4 mt-4 mb-3" style={{ color: 'var(--color-primary)' }} {...props}>{children}</h2>,
              h2: ({ children, ...props }) => <h3 className="h5 mt-3 mb-2" style={{ color: 'var(--color-primary)' }} {...props}>{children}</h3>,
              h3: ({ children, ...props }) => <h4 className="h6 mt-3 mb-2" {...props}>{children}</h4>,
              hr: () => <hr className="my-4" />,
              blockquote: ({ children, ...props }) => (
                <blockquote className="border-start border-3 border-primary ps-3 my-3 fst-italic text-muted" {...props}>{children}</blockquote>
              ),
              a: ({ children, href, ...props }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-decoration-none" {...props}>{children}</a>
              ),
            }}
          >
            {kitContent}
          </ReactMarkdown>
        </div>
      </Modal>
    </>
  );
}

export default SponsorshipPage;
