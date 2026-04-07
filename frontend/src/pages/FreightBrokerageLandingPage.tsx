import React, { useEffect, useState, useCallback } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL, getAdvisoryUrl } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import InlineDemoPlayer from '../components/InlineDemoPlayer';
import StrategyCallModal from '../components/StrategyCallModal';
import { FREIGHT_SCENARIOS } from '../config/freightScenarios';

const HERO_BG = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1920&q=80';

function FreightBrokerageLandingPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [demoKey, setDemoKey] = useState(0);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [completedScenarios, setCompletedScenarios] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

  const openBooking = () => setShowBooking(true);

  const activeScenario = FREIGHT_SCENARIOS.find(s => s.demoId === selectedScenario);

  const onDemoComplete = useCallback((scenarioId: string) => {
    setCompletedScenarios(prev => new Set(prev).add(scenarioId));
    setShowPicker(true);
  }, []);

  const playScenario = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    setShowPicker(false);
    setDemoKey(prev => prev + 1);
    setTimeout(() => {
      document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const painPoints = [
    { icon: 'bi-file-earmark-x', title: 'Document-Driven Delays', problem: 'BOL, POD, and lumper receipts must be received and verified before billing starts. Missing paperwork delays invoicing by 3-5 days per shipment.', solution: 'AI classifies, extracts, and validates documents in seconds. Same-day billing instead of chasing emails for days.' },
    { icon: 'bi-exclamation-triangle', title: 'Accessorial Disputes', problem: 'Detention, layover, and TONU charges trigger manual review. Payers hold entire invoices over a single disputed line item.', solution: 'AI validates every accessorial against evidence requirements. Unbacked charges never reach the invoice.' },
    { icon: 'bi-cash-stack', title: 'Cash Flow Risk', problem: 'You pay carriers before collecting from customers. DSO averages 45+ days. Cash flow exposure grows with every load.', solution: 'Same-day invoicing with correct documentation. DSO drops from 45 to 30 days. Short-pays caught immediately.' },
    { icon: 'bi-shield-exclamation', title: 'Fraud & Identity Risk', problem: 'Double-brokering schemes and carrier identity theft create payment disputes and direct financial losses.', solution: 'AI verifies carrier identity against FMCSA, flags bank detail changes, and detects double-brokering before payment.' },
  ];

  return (
    <>
      <SEOHead
        title="AI-Powered Financial Operations for Freight Brokerages | Colaberry Enterprise AI"
        description="Automate billing, invoicing, disputes, and carrier settlement. Reduce DSO, prevent fraud, and eliminate revenue leakage."
      />

      {/* Navbar */}
      <nav className="navbar navbar-light bg-white sticky-top shadow-sm" style={{ zIndex: 1030 }}>
        <div className="container d-flex justify-content-between align-items-center">
          <span className="navbar-brand d-flex align-items-center gap-2 mb-0">
            <img src="/colaberry-icon.png" alt="" width="30" height="30" />
            <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 16 }}>Colaberry Enterprise AI</span>
          </span>
          <button className="btn btn-primary btn-sm fw-semibold" onClick={openBooking}>
            <i className="bi bi-calendar-check me-1" />Book a Strategy Call
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(rgba(15, 23, 42, 0.75), rgba(15, 23, 42, 0.85)), url("${HERO_BG}") center/cover no-repeat`,
          color: '#fff', minHeight: 480, display: 'flex', alignItems: 'center', textAlign: 'center', padding: '4rem 1.5rem',
        }}
      >
        <div className="container" style={{ maxWidth: 800 }}>
          <span className="badge bg-success mb-3" style={{ fontSize: 12, padding: '6px 14px' }}>
            <i className="bi bi-truck me-1" />Built for Freight Brokerages & 3PLs
          </span>
          <h1 className="fw-bold mb-3 text-white" style={{ fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            Is Your Billing Team Still Chasing Documents and Fighting Disputes?
          </h1>
          <p className="mb-3" style={{ fontSize: 19, color: '#ffffff', maxWidth: 650, margin: '0 auto', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            AI that handles the 95% so your team can focus on the 5% that actually needs a human:
          </p>
          <ul className="list-unstyled mb-4" style={{ fontSize: 17, color: '#e2e8f0', maxWidth: 500, margin: '0 auto', textAlign: 'left', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            <li className="mb-2"><i className="bi bi-check-circle-fill text-success me-2" />Reduce billing cycle from 5 days to same-day</li>
            <li className="mb-2"><i className="bi bi-check-circle-fill text-success me-2" />Cut dispute costs by 60%</li>
            <li className="mb-2"><i className="bi bi-check-circle-fill text-success me-2" />Prevent carrier fraud before payment executes</li>
          </ul>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <a href="#demo" className="btn btn-lg text-white fw-semibold" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: 8, padding: '14px 36px', fontSize: 17, boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)' }}>
              <i className="bi bi-play-circle me-2" />Watch the Demo
            </a>
            <button className="btn btn-lg btn-outline-light fw-semibold" style={{ borderRadius: 8, padding: '14px 28px', fontSize: 17 }} onClick={openBooking}>
              Book a Strategy Call
            </button>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-5" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container" style={{ maxWidth: 1100 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
            {activeScenario ? `See ${activeScenario.title} in Action` : 'See AI Automate Freight Financial Operations'}
          </h2>
          <p className="text-center text-muted mb-4">
            {activeScenario ? activeScenario.description : 'Watch AI agents validate rates, assemble evidence, send invoices, and settle carriers in seconds.'}
          </p>
          <InlineDemoPlayer
            key={demoKey}
            allowedScenarios={selectedScenario ? [selectedScenario] : ['freight-billing', 'freight-invoice', 'freight-dispute', 'freight-settlement']}
            trackContext="freight-landing"
            onDemoComplete={onDemoComplete}
            autoPlay={!!selectedScenario}
          />
          {showPicker && (
            <div className="text-center mt-4">
              <p className="text-muted small mb-2">Watch another module:</p>
              <div className="d-flex flex-wrap justify-content-center gap-2">
                {FREIGHT_SCENARIOS.filter(s => s.demoId !== selectedScenario).map(s => (
                  <button key={s.demoId} className="btn btn-sm btn-outline-primary rounded-pill px-3" onClick={() => playScenario(s.demoId)} style={{ fontSize: 12 }}>
                    <span className="me-1">{s.emoji}</span>{s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-5">
        <div className="container" style={{ maxWidth: 1100 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Where Freight Brokerages Lose Money</h2>
          <p className="text-center text-muted mb-4">These are not edge cases. They happen on every load, every day.</p>
          <div className="row g-3">
            {painPoints.map((p, i) => (
              <div key={i} className="col-md-6">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-body p-4">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className={`bi ${p.icon} fs-5`} style={{ color: 'var(--color-secondary)' }} />
                      <h5 className="fw-bold mb-0" style={{ fontSize: 16 }}>{p.title}</h5>
                    </div>
                    <p className="text-muted mb-2" style={{ fontSize: 13 }}>{p.problem}</p>
                    <p className="mb-0" style={{ fontSize: 13, color: 'var(--color-accent)' }}><i className="bi bi-check-circle me-1" />{p.solution}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 Module Cards */}
      <section className="py-5" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container" style={{ maxWidth: 1100 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>4 AI Systems That Close the Loop</h2>
          <p className="text-center text-muted mb-4">Quote to cash to carrier settlement. Each system is a fleet of specialized AI agents with human oversight.</p>
          <div className="row g-3">
            {FREIGHT_SCENARIOS.map(s => (
              <div key={s.demoId} className="col-md-6 col-lg-3">
                <div className="card border-0 shadow-sm h-100" style={{ cursor: 'pointer', transition: 'all .2s', border: selectedScenario === s.demoId ? '2px solid var(--color-primary)' : undefined }} onClick={() => playScenario(s.demoId)}>
                  <div className="card-body p-3 text-center">
                    <div style={{ fontSize: 28 }}>{s.emoji}</div>
                    <h6 className="fw-bold mt-2 mb-1" style={{ fontSize: 14, color: 'var(--color-primary)' }}>{s.title}</h6>
                    <p className="text-muted mb-2" style={{ fontSize: 12 }}>{s.description}</p>
                    <div className="d-flex justify-content-between" style={{ fontSize: 11 }}>
                      <span style={{ color: 'var(--color-accent)' }}>{s.metric}</span>
                      <span className="text-muted">{s.agents} agents</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two Paths */}
      <section className="py-5">
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Two Paths to AI at Your Brokerage</h2>
          <p className="text-center text-muted mb-4">We can show your team how to build it, or we can build it for you.</p>
          <div className="row g-4">
            <div className="col-md-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header text-center text-white fw-bold py-2" style={{ background: 'var(--color-primary)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 1 — Your Team Builds It
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Enterprise AI Accelerator</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>3-week corporate training program. Your team learns to design, build, and deploy AI systems for freight financial operations.</p>
                  <ul className="list-unstyled mb-0">
                    {['Deploy billing and settlement AI on your data', 'Document processing, rate validation, dispute automation', 'Executive sponsorship kit with ROI projections', 'Post-deployment support and optimization'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-accent)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-outline-primary w-100 fw-semibold" onClick={openBooking}>Discuss Training &rarr;</button>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card border-0 shadow h-100" style={{ border: '2px solid var(--color-primary)' }}>
                <div className="card-header text-center text-white fw-bold py-2" style={{ background: '#1a365d', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 2 — We Build It For You
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Advisory & Custom Build</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>We embed with your ops and accounting teams to deliver a complete freight financial operations AI system powered by the <strong>AIXcelerator</strong> platform.</p>
                  <ul className="list-unstyled mb-0">
                    {['Dedicated AI architects embedded with your team', 'AIXcelerator platform to augment delivery speed', 'TMS integration, EDI setup, document processing pipeline', 'Billing, invoicing, dispute, and settlement automation', 'Fraud detection and FMCSA compliance monitoring', 'Production system delivered in weeks'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-primary-light)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-primary w-100 fw-semibold" onClick={openBooking}>Discuss Custom Build &rarr;</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-5" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <div className="row g-3 text-center">
            {[
              { value: '$2M+', label: 'Annual Savings', color: 'var(--color-accent)' },
              { value: '640%', label: '3-Year ROI', color: 'var(--color-primary)' },
              { value: '32', label: 'Specialized AI Agents', color: '#8b5cf6' },
            ].map((s, i) => (
              <div key={i} className="col-md-4">
                <div className="card border-0 shadow-sm py-3">
                  <div className="fw-bold" style={{ fontSize: 28, color: s.color }}>{s.value}</div>
                  <div className="text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-5 text-center">
        <div className="container" style={{ maxWidth: 700 }}>
          <h2 className="fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>Ready to Close the Loop from Delivery to Cash?</h2>
          <p className="text-muted mb-4">See how AI transforms billing, invoicing, disputes, and settlement at your brokerage.</p>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <button className="btn btn-primary btn-lg fw-semibold" onClick={openBooking} style={{ borderRadius: 8, padding: '14px 36px' }}>
              <i className="bi bi-calendar-check me-2" />Book a Strategy Call
            </button>
            <a href={advisoryUrl} className="btn btn-outline-primary btn-lg fw-semibold" target="_blank" rel="noopener noreferrer" style={{ borderRadius: 8, padding: '14px 28px' }} data-track="freight_design_ai_org">
              Design My AI Organization &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-3 text-center" style={{ background: '#f1f5f9', fontSize: 12, color: '#94a3b8' }}>
        &copy; {new Date().getFullYear()} Colaberry Enterprise AI Division
      </footer>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/freight-ai" />
    </>
  );
}

export default FreightBrokerageLandingPage;
