import React, { useEffect, useState } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL, getAdvisoryUrl, getDemoWalkthroughUrl } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import InlineDemoPlayer from '../components/InlineDemoPlayer';
import StrategyCallModal from '../components/StrategyCallModal';
import { UTILITY_SCENARIOS } from '../config/utilityScenarios';

const C = {
  bg: '#0a0e17',
  bgCard: '#131a2b',
  bgAlt: '#0f1520',
  border: '#1e2d45',
  text: '#e2e8f0',
  muted: '#8b9ab5',
  accent: '#38bdf8',
  accentDark: '#0ea5e9',
  yellow: '#fbbf24',
  green: '#34d399',
  red: '#f87171',
};

function UtilityCoopLandingPage() {
  const [showBooking, setShowBooking] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

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
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>

        {/* ── Hero ── */}
        <section style={{ padding: '5rem 1.5rem 3rem', textAlign: 'center', background: `linear-gradient(180deg, ${C.bgAlt} 0%, ${C.bg} 100%)` }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <span className="badge rounded-pill px-3 py-2 mb-3" style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.accent, fontSize: 12 }}>
              <i className="bi bi-lightning-charge me-1" />Built for NRECA Member Cooperatives
            </span>
            <h1 className="fw-bold mb-3" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: 1.2 }}>
              AI for Electric Cooperatives
            </h1>
            <p style={{ fontSize: 18, color: C.muted, maxWidth: 650, margin: '0 auto 2rem' }}>
              See how AI predicts outages, automates dispatch, handles storm calls, and streamlines compliance — built for co-op operations.
            </p>
            <div className="d-flex flex-wrap justify-content-center gap-3">
              <a href="#demo" className="btn btn-lg fw-bold px-4" style={{ background: C.accent, color: '#0a0e17', borderRadius: 8 }}>
                <i className="bi bi-play-circle me-2" />Watch the Demo
              </a>
              <button className="btn btn-lg fw-bold px-4" onClick={() => setShowBooking(true)} style={{ background: 'transparent', border: `2px solid ${C.accent}`, color: C.accent, borderRadius: 8 }}>
                <i className="bi bi-calendar-check me-2" />Book a Strategy Call
              </button>
            </div>
          </div>
        </section>

        {/* ── Pain Points ── */}
        <section style={{ padding: '4rem 1.5rem', background: C.bgAlt }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <h2 className="text-center fw-bold mb-2" style={{ fontSize: 28 }}>The Co-Op AI Challenge</h2>
            <p className="text-center mb-4" style={{ color: C.muted, fontSize: 15 }}>Every co-op we talk to faces the same barriers. Here's how we solve them.</p>
            <div className="row g-3">
              {painPoints.map((p, i) => (
                <div key={i} className="col-md-6">
                  <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, height: '100%' }}>
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className={`bi ${p.icon} fs-5`} style={{ color: C.red }} />
                      <h5 className="fw-bold mb-0" style={{ fontSize: 16 }}>{p.title}</h5>
                    </div>
                    <p style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{p.problem}</p>
                    <p style={{ fontSize: 13, color: C.green, marginBottom: 0 }}><i className="bi bi-check-circle me-1" />{p.solution}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Live Demo ── */}
        <section id="demo" style={{ padding: '4rem 1.5rem' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="text-center fw-bold mb-2" style={{ fontSize: 28 }}>See AI Run a 380,000-Member Co-Op</h2>
            <p className="text-center mb-4" style={{ color: C.muted, fontSize: 15 }}>Watch 10 AI agents predict outages, dispatch crews, and handle 42,000 storm calls — in seconds.</p>
            <InlineDemoPlayer allowedScenarios={['utility']} trackContext="utility_landing" />
          </div>
        </section>

        {/* ── 8 Utility Scenarios ── */}
        <section style={{ padding: '4rem 1.5rem', background: C.bgAlt }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <h2 className="text-center fw-bold mb-2" style={{ fontSize: 28 }}>8 Ways AI Transforms Co-Op Operations</h2>
            <p className="text-center mb-4" style={{ color: C.muted, fontSize: 15 }}>Each scenario shows a specific AI capability built for cooperative utilities.</p>
            <div className="row g-3">
              {UTILITY_SCENARIOS.map(s => (
                <div key={s.id} className="col-md-6 col-lg-3">
                  <a
                    href={getDemoWalkthroughUrl('utility')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none"
                    data-track={`utility_scenario_${s.id}`}
                    style={{ display: 'block', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, height: '100%', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                  >
                    <i className={`bi ${s.icon} d-block mb-2`} style={{ fontSize: 24, color: C.accent }} />
                    <h6 className="fw-bold mb-1" style={{ color: C.text, fontSize: 14 }}>{s.title}</h6>
                    <p style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>{s.description}</p>
                    <div className="d-flex justify-content-between align-items-center">
                      <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>{s.kpi}</span>
                      <span style={{ fontSize: 10, color: C.muted }}>{s.agentCount} agents</span>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Two Paths ── */}
        <section style={{ padding: '4rem 1.5rem' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="text-center fw-bold mb-2" style={{ fontSize: 28 }}>Two Paths to AI at Your Co-Op</h2>
            <p className="text-center mb-4" style={{ color: C.muted, fontSize: 15 }}>We can show your team how to build it, or we can build it for you.</p>
            <div className="row g-4">
              <div className="col-md-6">
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, height: '100%' }}>
                  <span className="badge mb-3" style={{ background: C.accent, color: '#0a0e17', fontSize: 11 }}>PATH 1</span>
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20 }}>Enterprise AI Accelerator</h4>
                  <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>Your team builds it. We guide every step.</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {['3-week hands-on program', 'Your team deploys a production AI system', 'Built on your co-op data and use cases', 'Executive sponsorship kit included', 'Post-deployment support'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13, color: C.text }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: C.green, marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                  <button className="btn w-100 mt-3 fw-semibold" onClick={() => setShowBooking(true)} style={{ background: C.accent, color: '#0a0e17', borderRadius: 8 }}>
                    Discuss Training &rarr;
                  </button>
                </div>
              </div>
              <div className="col-md-6">
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, height: '100%' }}>
                  <span className="badge mb-3" style={{ background: C.yellow, color: '#0a0e17', fontSize: 11 }}>PATH 2</span>
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20 }}>Advisory & Custom Build</h4>
                  <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>We embed with your team and build it for you.</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {['Dedicated AI architects on your project', 'Pre-built co-op data structures — skip discovery', 'Flex up/down with contracting support', 'Production system delivered in weeks', 'Ongoing managed AI operations available'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13, color: C.text }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: C.yellow, marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                  <button className="btn w-100 mt-3 fw-semibold" onClick={() => setShowBooking(true)} style={{ background: C.yellow, color: '#0a0e17', borderRadius: 8 }}>
                    Discuss Custom Build &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Social Proof Stats ── */}
        <section style={{ padding: '3rem 1.5rem', background: C.bgAlt }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div className="row g-3 text-center">
              {[
                { value: '$620K', label: 'Annual savings per co-op from AI automation', color: C.green },
                { value: '290%', label: 'Average ROI in first year', color: C.accent },
                { value: '10', label: 'AI agents managing operations 24/7', color: C.yellow },
              ].map((s, i) => (
                <div key={i} className="col-md-4">
                  <div style={{ fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section style={{ padding: '5rem 1.5rem', textAlign: 'center' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h2 className="fw-bold mb-3" style={{ fontSize: 28 }}>Ready to Bring AI to Your Cooperative?</h2>
            <p style={{ color: C.muted, fontSize: 15, marginBottom: 24 }}>
              Schedule a 30-minute strategy call. We'll walk through your specific operations and show you what's possible.
            </p>
            <button className="btn btn-lg fw-bold px-5" onClick={() => setShowBooking(true)} style={{ background: C.accent, color: '#0a0e17', borderRadius: 8, fontSize: 18 }}>
              <i className="bi bi-calendar-check me-2" />Book a Strategy Call
            </button>
            <div className="mt-3">
              <a href={advisoryUrl} className="text-decoration-none" style={{ color: C.muted, fontSize: 13 }} target="_blank" rel="noopener noreferrer">
                Or design your AI organization first &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ padding: '2rem 1.5rem', textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            Colaberry Enterprise AI Division &mdash; Boston &bull; St. Louis &bull; Dallas &bull; Hyderabad
          </div>
          <div style={{ fontSize: 11, color: C.border, marginTop: 4 }}>
            AI Leadership &bull; Architecture &bull; Implementation &bull; Advisory
          </div>
        </footer>
      </div>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/utility-ai"
      />
    </>
  );
}

export default UtilityCoopLandingPage;
