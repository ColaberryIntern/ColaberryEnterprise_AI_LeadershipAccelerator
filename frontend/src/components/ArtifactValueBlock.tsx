import React from 'react';

const ARTIFACTS = [
  {
    icon: '\u{1F4CA}',
    title: 'AI Deployment Readiness Scan',
    desc: 'Evaluate your organization\'s AI deployment readiness across 6 dimensions',
  },
  {
    icon: '\u{1F5FA}\uFE0F',
    title: 'Enterprise AI Deployment Roadmap',
    desc: 'A 90-day prioritized deployment plan tailored to your organization',
  },
  {
    icon: '\u{1F6E1}\uFE0F',
    title: 'Governance Framework',
    desc: 'Enterprise AI governance policies, risk controls, and compliance templates',
  },
  {
    icon: '\u26A1',
    title: 'Claude Code Deployment Blueprint',
    desc: 'Production-ready AI coding workflows with security and audit controls',
  },
  {
    icon: '\u{1F680}',
    title: '90-Day Deployment Plan',
    desc: 'Week-by-week execution milestones with resource allocation and KPIs',
  },
];

function ArtifactValueBlock() {
  return (
    <section className="section-alt" aria-label="Program Deliverables">
      <div className="container">
        <h2 className="text-center mb-2">What You'll Walk Away With</h2>
        <p className="text-center text-muted mb-5" style={{ maxWidth: '650px', margin: '0 auto' }}>
          Every participant leaves with production-ready artifacts — not slide decks.
        </p>
        <div className="row g-4 justify-content-center">
          {ARTIFACTS.map((item) => (
            <div className="col-6 col-lg-4" key={item.title}>
              <div className="card card-lift h-100 border-0 shadow-sm text-center p-4">
                <div className="fs-1 mb-3" aria-hidden="true">{item.icon}</div>
                <h3 className="h6 fw-bold">{item.title}</h3>
                <p className="text-muted small mb-0">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ArtifactValueBlock;
