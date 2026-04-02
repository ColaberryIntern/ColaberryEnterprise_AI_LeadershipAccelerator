import React, { useEffect, useState } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL, getAdvisoryUrl, getDemoWalkthroughUrl } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import InlineDemoPlayer from '../components/InlineDemoPlayer';
import StrategyCallModal from '../components/StrategyCallModal';
import { UTILITY_SCENARIOS } from '../config/utilityScenarios';

const HERO_BG = 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1920&q=80';

function UtilityCoopLandingPage() {
  const [showBooking, setShowBooking] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

  const openBooking = () => setShowBooking(true);

  const painPoints = [
    { icon: 'bi-clock-history', title: 'Discovery Takes Too Long', problem: 'Getting past the discovery stage takes months, drastically increasing time to solution.', solution: 'Pre-built co-op data structures eliminate discovery. Input your data, get results.' },
    { icon: 'bi-database-x', title: 'Data Isn\'t Ready', problem: 'Most co-ops aren\'t data-ready or data-capable enough to start AI projects.', solution: 'We build the data pipeline to Azure and connect AI — whether your data is in spreadsheets or a warehouse.' },
    { icon: 'bi-exclamation-triangle', title: 'Risk, Cost & Buy-In', problem: 'Risk, cost, and internal buy-in are central to why co-ops drag their feet on AI.', solution: 'See the ROI before you commit. Our demo shows exactly what AI does for your co-op — with real numbers.' },
    { icon: 'bi-chat-square-dots', title: 'Talking, Not Adopting', problem: 'Most co-ops are talking about AI but not adopting AI or automation fully.', solution: 'Go from talk to production in 3 weeks. We\'ve built the playbook so you don\'t have to figure it out alone.' },
  ];

  return (
    <>
      <SEOHead
        title="AI for Electric Cooperatives | Colaberry Enterprise AI"
        description="See how AI predicts outages, automates dispatch, handles storm calls, and streamlines compliance — built for electric cooperative operations."
      />

      {/* ── Minimal Navbar ── */}
      <nav className="navbar navbar-light bg-white sticky-top shadow-sm" style={{ zIndex: 1030 }}>
        <div className="container d-flex justify-content-between align-items-center">
          <a href="/" className="navbar-brand d-flex align-items-center gap-2 text-decoration-none">
            <img src="/colaberry-logo.png" alt="Colaberry" style={{ height: 32 }} />
            <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 16 }}>Colaberry Enterprise AI</span>
          </a>
          <button className="btn btn-primary btn-sm fw-semibold" onClick={openBooking}>
            <i className="bi bi-calendar-check me-1" />Book a Strategy Call
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{
          background: `linear-gradient(rgba(15, 23, 42, 0.78), rgba(15, 23, 42, 0.85)), url("${HERO_BG}") center/cover no-repeat`,
          color: '#fff',
          minHeight: 480,
          display: 'flex',
          alignItems: 'center',
          textAlign: 'center',
          padding: '4rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <span className="badge rounded-pill px-3 py-2 mb-3" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', fontSize: 12 }}>
            <i className="bi bi-lightning-charge me-1" />Built for NRECA Member Cooperatives
          </span>
          <h1 className="fw-bold mb-3" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            AI for Electric Cooperatives
          </h1>
          <p className="mb-4" style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', maxWidth: 650, margin: '0 auto' }}>
            See how AI predicts outages, automates dispatch, handles storm calls, and streamlines compliance — built for co-op operations.
          </p>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <a href="#demo" className="btn btn-primary btn-lg fw-bold px-4">
              <i className="bi bi-play-circle me-2" />Watch the Demo
            </a>
            <button className="btn btn-outline-light btn-lg fw-bold px-4" onClick={openBooking}>
              <i className="bi bi-calendar-check me-2" />Book a Strategy Call
            </button>
          </div>
        </div>
      </section>

      {/* ── Social Proof Stats ── */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '2.5rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <div className="row g-3 text-center">
            {[
              { value: '$620K', label: 'Annual savings per co-op', color: 'var(--color-accent)' },
              { value: '290%', label: 'Average ROI in first year', color: 'var(--color-primary)' },
              { value: '10', label: 'AI agents running 24/7', color: 'var(--color-primary-light)' },
            ].map((s, i) => (
              <div key={i} className="col-md-4">
                <div style={{ fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div className="text-muted mt-1" style={{ fontSize: 13 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section className="section" style={{ padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>The Co-Op AI Challenge</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>Every co-op we talk to faces the same barriers. Here's how we solve them.</p>
          <div className="row g-3">
            {painPoints.map((p, i) => (
              <div key={i} className="col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                  <div className="card-body p-4">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className={`bi ${p.icon} fs-5`} style={{ color: 'var(--color-secondary)' }} />
                      <h5 className="fw-bold mb-0" style={{ fontSize: 16, color: 'var(--color-primary)' }}>{p.title}</h5>
                    </div>
                    <p className="text-muted mb-2" style={{ fontSize: 13 }}>{p.problem}</p>
                    <p className="mb-0" style={{ fontSize: 13, color: 'var(--color-accent)' }}><i className="bi bi-check-circle-fill me-1" />{p.solution}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Demo ── */}
      <section id="demo" style={{ background: 'var(--color-bg-alt)', padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>See AI Run a 380,000-Member Co-Op</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>Watch 10 AI agents predict outages, dispatch crews, and handle 42,000 storm calls — in seconds.</p>
          <InlineDemoPlayer allowedScenarios={['utility']} trackContext="utility_landing" />
        </div>
      </section>

      {/* ── 8 Utility Scenarios ── */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>8 Ways AI Transforms Co-Op Operations</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>Each scenario shows a specific AI capability built for cooperative utilities.</p>
          <div className="row g-3">
            {UTILITY_SCENARIOS.map(s => (
              <div key={s.id} className="col-md-6 col-lg-3">
                <a
                  href={getDemoWalkthroughUrl('utility')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card border-0 shadow-sm h-100 text-decoration-none"
                  data-track={`utility_scenario_${s.id}`}
                  style={{ borderRadius: 12, transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = ''; }}
                >
                  <div className="card-body p-3">
                    <i className={`bi ${s.icon} d-block mb-2`} style={{ fontSize: 24, color: 'var(--color-primary-light)' }} />
                    <h6 className="fw-bold mb-1" style={{ color: 'var(--color-primary)', fontSize: 14 }}>{s.title}</h6>
                    <p className="text-muted mb-2" style={{ fontSize: 12, lineHeight: 1.5 }}>{s.description}</p>
                    <div className="d-flex justify-content-between align-items-center">
                      <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600 }}>{s.kpi}</span>
                      <span className="text-muted" style={{ fontSize: 10 }}>{s.agentCount} agents</span>
                    </div>
                  </div>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Two Paths ── */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>Two Paths to AI at Your Co-Op</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>We can show your team how to build it, or we can build it for you.</p>
          <div className="row g-4">
            <div className="col-md-6">
              <div className="card border-0 shadow h-100" style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="card-header text-white fw-bold text-center py-3" style={{ background: 'var(--color-primary)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 1 — Your Team Builds It
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Enterprise AI Accelerator</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>3-week hands-on program. Your team deploys a production AI system.</p>
                  <ul className="list-unstyled mb-0">
                    {['3-week intensive, hands-on program', 'Your team deploys a production AI system', 'Built on your co-op data and use cases', 'Executive sponsorship kit included', 'Post-deployment support'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-accent)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-primary w-100 fw-semibold" onClick={openBooking}>
                    Discuss Training &rarr;
                  </button>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card border-0 shadow h-100" style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="card-header text-white fw-bold text-center py-3" style={{ background: 'var(--color-primary-light)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 2 — We Build It For You
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Advisory & Custom Build</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>We embed with your team and deliver a production AI system.</p>
                  <ul className="list-unstyled mb-0">
                    {['Dedicated AI architects on your project', 'Pre-built co-op data structures — skip discovery', 'Flex up/down with contracting support', 'Production system delivered in weeks', 'Ongoing managed AI operations available'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-primary-light)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-primary w-100 fw-semibold" onClick={openBooking}>
                    Discuss Custom Build &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Design Your Own ── */}
      <section style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: 600 }}>
          <h3 className="fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 24 }}>Want to See What AI Looks Like for YOUR Co-Op?</h3>
          <p className="text-muted mb-3" style={{ fontSize: 14 }}>Design your own AI organization in 5 minutes — free, no signup required.</p>
          <a href={advisoryUrl} className="btn btn-lg fw-bold px-4" target="_blank" rel="noopener noreferrer" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8 }}>
            Design My AI Organization &rarr;
          </a>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        className="text-light text-center"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '5rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 className="fw-bold mb-3" style={{ fontSize: 28 }}>Ready to Bring AI to Your Cooperative?</h2>
          <p className="mb-4" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15 }}>
            Schedule a 30-minute strategy call. We'll walk through your specific operations and show you what's possible.
          </p>
          <button className="btn btn-light btn-lg fw-bold px-5" onClick={openBooking} style={{ borderRadius: 8, fontSize: 18 }}>
            <i className="bi bi-calendar-check me-2" />Book a Strategy Call
          </button>
          <div className="mt-3">
            <a href={advisoryUrl} className="text-decoration-none" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} target="_blank" rel="noopener noreferrer">
              Or design your AI organization first &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: '2rem 1.5rem', textAlign: 'center', background: 'var(--color-bg-alt)', borderTop: '1px solid var(--color-border)' }}>
        <img src="/colaberry-logo.png" alt="Colaberry" style={{ height: 24, marginBottom: 8, opacity: 0.6 }} />
        <div className="text-muted" style={{ fontSize: 12 }}>
          Colaberry Enterprise AI Division — Boston &bull; St. Louis &bull; Dallas &bull; Hyderabad
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>
          AI Leadership &bull; Architecture &bull; Implementation &bull; Advisory
        </div>
      </footer>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/utility-ai"
      />
    </>
  );
}

export default UtilityCoopLandingPage;
