import React from 'react';
import SEOHead from '../components/SEOHead';
import LeadCaptureForm from '../components/LeadCaptureForm';
import { PROGRAM_SCHEDULE } from '../config/programSchedule';
import ROIHighlightSection from '../components/ROIHighlightSection';

function SponsorshipPage() {
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
                title: 'Quantify the Speed-to-Value Advantage',
                description: 'Months eliminated from typical AI initiative timeline × estimated monthly cost of delay.',
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
          <LeadCaptureForm
            formType="sponsorship_kit_download"
            fields={['name', 'email', 'company', 'role']}
            submitLabel="📥 Download Sponsorship Kit"
            successMessage="✅ Your Sponsorship Kit has been sent to your email. Expect it within minutes."
            className="text-dark"
            captureUtm
          />
          {/* TODO: Trigger automated email sequence via CRM (future) */}
        </div>
      </section>
    </>
  );
}

export default SponsorshipPage;
