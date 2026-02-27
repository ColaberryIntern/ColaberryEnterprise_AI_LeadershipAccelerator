import React from 'react';
import SEOHead from '../components/SEOHead';
import LeadCaptureForm from '../components/LeadCaptureForm';

function SponsorshipPage() {
  return (
    <>
      <SEOHead
        title="Corporate Sponsorship"
        description="Enterprise AI Accelerator Sponsorship Kit — ROI comparison, cost justification templates, internal approval checklist. Build AI capability internally at a fraction of consulting costs."
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

      {/* ROI Comparison */}
      <section className="section" aria-label="ROI Comparison">
        <div className="container">
          <h2 className="text-center mb-5">📊 The Cost of the Alternatives</h2>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="card card-lift h-100 border-0 shadow-sm p-4">
                <div className="text-center mb-3">
                  <span className="fs-1" aria-hidden="true">💸</span>
                </div>
                <h3 className="h5 text-center">External AI Consulting Firm</h3>
                <p className="text-muted text-center mb-3">"AI Strategy Engagement"</p>
                <ul className="list-unstyled">
                  <li className="mb-2"><strong>💰 Cost:</strong> $250,000 – $750,000</li>
                  <li className="mb-2"><strong>⏳ Timeline:</strong> 3–6 months</li>
                  <li className="mb-2"><strong>📄 Output:</strong> Slide deck + recommendations</li>
                  <li className="mb-2"><strong>🏗️ Internal capability built:</strong> ❌ None</li>
                </ul>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-lift h-100 border-0 shadow-sm p-4">
                <div className="text-center mb-3">
                  <span className="fs-1" aria-hidden="true">👤</span>
                </div>
                <h3 className="h5 text-center">Hire AI Architect</h3>
                <p className="text-muted text-center mb-3">"Senior AI/ML Engineer"</p>
                <ul className="list-unstyled">
                  <li className="mb-2"><strong>💰 Cost:</strong> $200,000–$350,000/year</li>
                  <li className="mb-2"><strong>⏳ Timeline:</strong> 6–18 months to hire</li>
                  <li className="mb-2"><strong>📄 Output:</strong> One person's capability</li>
                  <li className="mb-2"><strong>🏗️ Internal capability built:</strong> ⚠️ Limited to one hire</li>
                </ul>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-lift h-100 border-primary border-2 shadow p-4" style={{ borderTop: '4px solid var(--color-accent)', background: 'linear-gradient(135deg, rgba(56,161,105,0.03) 0%, transparent 100%)' }}>
                <div className="text-center mb-3">
                  <span className="fs-1" aria-hidden="true">⚡</span>
                </div>
                <h3 className="h5 text-center">Colaberry Executive Accelerator</h3>
                <p className="text-muted text-center mb-3">"Enterprise AI Accelerator"</p>
                <ul className="list-unstyled">
                  <li className="mb-2"><strong>💰 Cost:</strong> $4,500 per participant</li>
                  <li className="mb-2"><strong>⏳ Timeline:</strong> 5 days, 2 weeks</li>
                  <li className="mb-2"><strong>📄 Output:</strong> POC + Roadmap + Exec Deck + Templates</li>
                  <li className="mb-2"><strong>🏗️ Internal capability built:</strong> ✅ Entire leadership team</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Internal Capability Benefits */}
      <section className="section-alt" aria-label="Internal Capability Benefits">
        <div className="container">
          <h2 className="text-center mb-5">🏗️ Why Internal Capability Beats External Consulting</h2>
          <div className="row g-4">
            {[
              { icon: '🔒', title: 'You Own the Knowledge', description: 'Unlike consulting engagements that leave when the contract ends, the capability stays with your team permanently.' },
              { icon: '⚡', title: 'Speed of Execution', description: 'Internal teams can move faster than external engagements — no onboarding, no context-switching, no vendor coordination.' },
              { icon: '💡', title: 'Context Advantage', description: 'Your team understands your systems, culture, and constraints. External consultants spend weeks just learning your environment.' },
              { icon: '📈', title: 'Compound Returns', description: 'Skills and frameworks are applied repeatedly across initiatives. The ROI compounds with every new AI project your team leads.' },
              { icon: '🛡️', title: 'Data Sovereignty', description: 'No external party requires access to sensitive internal data. All POC work happens on your infrastructure.' },
              { icon: '💰', title: 'Fraction of the Cost', description: '10–100x more cost-effective per capability unit delivered. Train a team for less than one consulting engagement.' },
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
                title: 'Calculate the Consulting Avoidance Cost',
                description: 'If your organization was quoted $X for an AI strategy engagement, the accelerator delivers equivalent output at a fraction of the cost.',
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
              '☐ 2-week calendar block coordinated for participant availability',
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
          />
          {/* TODO: Trigger automated email sequence via CRM (future) */}
        </div>
      </section>
    </>
  );
}

export default SponsorshipPage;
