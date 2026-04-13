import React, { useEffect, useState, useCallback } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import InlineDemoPlayer from '../components/InlineDemoPlayer';
import StrategyCallModal from '../components/StrategyCallModal';
import { AIXCELERATOR_SCENARIOS } from '../config/aixceleratorScenarios';

const HERO_BG = 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1920&q=80';
const ADVISOR_URL = 'https://advisor.colaberry.ai/advisory/?utm_source=aixcelerator&utm_medium=coach_referral&utm_campaign=landing';

function AIXceleratorLandingPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [demoKey, setDemoKey] = useState(0);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [completedScenarios, setCompletedScenarios] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

  const openBooking = () => setShowBooking(true);

  const activeScenario = AIXCELERATOR_SCENARIOS.find(s => s.demoId === selectedScenario);

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
    { icon: 'bi-chat-dots', title: 'Every Client Is Asking About AI', problem: 'Your clients bring up AI at every session. You give a general answer and lose credibility.', solution: '0 coaches have a systematic AI answer. You will be the first in your network.' },
    { icon: 'bi-person-x', title: 'You Are Not an AI Expert', problem: 'You should not need to be. Your value is the relationship, not the technology.', solution: 'We deliver the Blueprint. You facilitate the discussion. Zero AI expertise required.' },
    { icon: 'bi-question-circle', title: 'Will My Clients Actually Pay?', problem: '$2,500 feels like a big ask on top of your coaching fees.', solution: '$2,500 is a fraction of a quarterly session fee. Clients paying $1,500-$2,000/month for coaching will not blink at this.' },
    { icon: 'bi-shield-check', title: 'What If It Does Not Work?', problem: 'You do not want to risk your reputation on an unproven tool.', solution: 'We co-deliver the first Blueprint together. You see it work before you commit. Risk-free.' },
  ];

  const steps = [
    { num: '01', title: 'Discovery Call', time: 'Week 1', desc: 'We learn about your practice, your clients, and which client to start with.' },
    { num: '02', title: 'First Blueprint - Co-Delivered', time: 'Week 2-3', desc: 'You introduce us to your client. We deliver the Blueprint together. You see exactly how it works.' },
    { num: '03', title: 'Revenue Share Agreement', time: 'Week 3-4', desc: 'After the first paid delivery, sign a simple 70/30 agreement. No exclusivity. No lock-in.' },
    { num: '04', title: 'You Run Independently', time: 'Month 2+', desc: 'You refer clients. We deliver Blueprints. You collect 70%. Pitch script, co-brand kit, and FAQ included.' },
    { num: '05', title: 'Network Expansion', time: 'Month 3+', desc: 'Successful coaches refer other coaches. Your channel grows without additional investment.' },
  ];

  const networks = [
    { name: 'Magna', size: '500+' },
    { name: 'EOS', size: '700+' },
    { name: 'Scaling Up', size: '300+' },
    { name: 'Vistage', size: '1,000+' },
    { name: 'Pinnacle', size: '100-200' },
    { name: 'C12 Group', size: '700+' },
    { name: 'TAB / ActionCOACH', size: '1,700+' },
  ];

  return (
    <>
      <SEOHead
        title="AIXcelerator Partner Program - Earn $1,750 Per AI Blueprint | Colaberry"
        description="Business coaches: your clients are asking about AI. Now you have a systematic answer that earns you $1,750 per delivery. 70% revenue share. Zero AI expertise required."
      />

      {/* Navbar */}
      <nav className="navbar navbar-light bg-white sticky-top shadow-sm" style={{ zIndex: 1030 }}>
        <div className="container d-flex justify-content-between align-items-center">
          <span className="navbar-brand d-flex align-items-center gap-2 mb-0">
            <img src="/colaberry-icon.png" alt="" width="30" height="30" />
            <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 16 }}>AIXcelerator</span>
          </span>
          <button className="btn btn-primary btn-sm fw-semibold" onClick={openBooking}>
            <i className="bi bi-calendar-check me-1" />Become a Partner
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(rgba(15, 23, 42, 0.78), rgba(15, 23, 42, 0.88)), url("${HERO_BG}") center/cover no-repeat`,
          color: '#fff', minHeight: 500, display: 'flex', alignItems: 'center', textAlign: 'center', padding: '4rem 1.5rem',
        }}
      >
        <div className="container" style={{ maxWidth: 800 }}>
          <span className="badge bg-warning text-dark mb-3" style={{ fontSize: 12, padding: '6px 14px' }}>
            <i className="bi bi-lightning-charge me-1" />For Business Coaches and Implementers
          </span>
          <h1 className="fw-bold mb-3 text-white" style={{ fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            Your Clients Are Asking About AI.<br />Now You Have the Answer<span style={{ color: '#facc15' }}> — And You Keep 70%</span>
          </h1>
          <p className="mb-3" style={{ fontSize: 18, color: '#e2e8f0', maxWidth: 650, margin: '0 auto', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            You introduce. We deliver the Blueprint. You earn $1,750 per client.
          </p>
          <ul className="list-unstyled mb-4" style={{ fontSize: 16, color: '#e2e8f0', maxWidth: 520, margin: '0 auto', textAlign: 'left', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            <li className="mb-2"><i className="bi bi-check-circle-fill text-warning me-2" />$1,750 per Blueprint (you keep 70% of $2,500)</li>
            <li className="mb-2"><i className="bi bi-check-circle-fill text-warning me-2" />2 referrals/month = $3,500 additional monthly income</li>
            <li className="mb-2"><i className="bi bi-check-circle-fill text-warning me-2" />Zero AI expertise required. We deliver, you facilitate.</li>
            <li className="mb-2"><i className="bi bi-check-circle-fill text-warning me-2" />Fits into your existing quarterly sessions</li>
          </ul>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <a href="#demo" className="btn btn-lg text-dark fw-semibold" style={{ background: '#facc15', border: 'none', borderRadius: 8, padding: '14px 36px', fontSize: 17, boxShadow: '0 4px 15px rgba(250, 204, 21, 0.4)' }}>
              <i className="bi bi-play-circle me-2" />See How Coaches Earn
            </a>
            <button className="btn btn-lg btn-outline-light fw-semibold" style={{ borderRadius: 8, padding: '14px 28px', fontSize: 17 }} onClick={openBooking}>
              Become a Partner
            </button>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-5" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container" style={{ maxWidth: 1100 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
            {activeScenario ? activeScenario.title : 'See How Coaches Earn With AIXcelerator'}
          </h2>
          <p className="text-center text-muted mb-4">
            {activeScenario ? activeScenario.description : 'Watch a coach refer a client, receive a Blueprint, and collect their 70% revenue share.'}
          </p>
          <InlineDemoPlayer
            key={demoKey}
            allowedScenarios={selectedScenario ? [selectedScenario] : ['aixcel-eos-blueprint', 'aixcel-vistage-group', 'aixcel-acceleration-upsell']}
            trackContext="aixcelerator-landing"
            onDemoComplete={onDemoComplete}
            autoPlay={!!selectedScenario}
          />
          {showPicker && (
            <div className="text-center mt-4">
              <p className="text-muted small mb-2">Watch another scenario:</p>
              <div className="d-flex flex-wrap justify-content-center gap-2">
                {AIXCELERATOR_SCENARIOS.filter(s => s.demoId !== selectedScenario).map(s => (
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
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>The Gap Every Coach Feels</h2>
          <p className="text-center text-muted mb-4">You are not alone. Every coach in every network is facing the same thing.</p>
          <div className="row g-3">
            {painPoints.map((p, i) => (
              <div key={i} className="col-md-6">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-body p-4">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className={`bi ${p.icon} fs-5`} style={{ color: '#f59e0b' }} />
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

      {/* 3 Demo Scenario Cards */}
      <section className="py-5" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container" style={{ maxWidth: 1100 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Three Ways Coaches Earn</h2>
          <p className="text-center text-muted mb-4">Click any card to watch that scenario play out.</p>
          <div className="row g-3 justify-content-center">
            {AIXCELERATOR_SCENARIOS.map(s => (
              <div key={s.demoId} className="col-md-4">
                <div className="card border-0 shadow-sm h-100" style={{ cursor: 'pointer', transition: 'all .2s', border: selectedScenario === s.demoId ? '2px solid var(--color-primary)' : undefined }} onClick={() => playScenario(s.demoId)}>
                  <div className="card-body p-3 text-center">
                    <div style={{ fontSize: 32 }}>{s.emoji}</div>
                    <h6 className="fw-bold mt-2 mb-1" style={{ fontSize: 15, color: 'var(--color-primary)' }}>{s.title}</h6>
                    <p className="text-muted mb-2" style={{ fontSize: 12 }}>{s.description}</p>
                    <span className="badge bg-warning text-dark" style={{ fontSize: 12 }}>{s.metric}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-5">
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>How It Works</h2>
          <p className="text-center text-muted mb-4">Five steps from first call to recurring revenue.</p>
          <div className="row g-3">
            {steps.map((s, i) => (
              <div key={i} className="col-12">
                <div className="d-flex align-items-start gap-3 p-3 rounded" style={{ background: i === 1 ? '#fffbeb' : 'transparent', border: i === 1 ? '1px solid #fcd34d' : '1px solid #e2e8f0' }}>
                  <div className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 24, minWidth: 40 }}>{s.num}</div>
                  <div>
                    <div className="fw-bold" style={{ fontSize: 15 }}>{s.title} <span className="text-muted fw-normal" style={{ fontSize: 12 }}>{s.time}</span></div>
                    <div className="text-muted" style={{ fontSize: 13 }}>{s.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commercial Model */}
      <section className="py-5" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>The Revenue Model</h2>
          <p className="text-center text-muted mb-4">Simple, transparent, and designed so coaches earn more than we do.</p>
          <div className="row g-3">
            <div className="col-md-4">
              <div className="card border-0 shadow-sm h-100 text-center p-4">
                <div className="fw-bold" style={{ fontSize: 28, color: '#f59e0b' }}>$2,500</div>
                <div className="text-muted small">Client pays for Business Blueprint</div>
                <hr />
                <div className="fw-bold" style={{ fontSize: 22, color: 'var(--color-accent)' }}>$1,750</div>
                <div className="small">Coach keeps (70%)</div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-0 shadow-sm h-100 text-center p-4">
                <div className="fw-bold" style={{ fontSize: 28, color: '#f59e0b' }}>$300-500</div>
                <div className="text-muted small">/month platform license</div>
                <hr />
                <div className="small text-muted">For active coaches. Recurring access to the platform, templates, and co-brand kit.</div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-0 shadow-sm h-100 text-center p-4">
                <div className="fw-bold" style={{ fontSize: 28, color: '#f59e0b' }}>$3-8K</div>
                <div className="text-muted small">/month Acceleration retainer</div>
                <hr />
                <div className="small text-muted">When clients move from Blueprint to implementation. Coach earns recurring referral bonus.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7 Networks */}
      <section className="py-5">
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>7 Coach Networks. 2,000+ Coaches. 20,000+ CEOs.</h2>
          <p className="text-center text-muted mb-4">We are building the partner channel across every major business coaching network.</p>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            {networks.map((n, i) => (
              <div key={i} className="text-center px-3 py-2" style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 120 }}>
                <div className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 14 }}>{n.name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{n.size} coaches</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-5" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <div className="row g-3 text-center">
            {[
              { value: '2,000+', label: 'Coaches Across 7 Networks', color: 'var(--color-primary)' },
              { value: '20,000+', label: 'CEO Clients Reachable', color: '#f59e0b' },
              { value: '$14B', label: 'AI Consulting Market', color: 'var(--color-accent)' },
              { value: '0', label: 'Competitors In This Space', color: '#dc3545' },
            ].map((s, i) => (
              <div key={i} className="col-6 col-md-3">
                <div className="card border-0 shadow-sm py-3">
                  <div className="fw-bold" style={{ fontSize: 24, color: s.color }}>{s.value}</div>
                  <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-5 text-center">
        <div className="container" style={{ maxWidth: 700 }}>
          <h2 className="fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>Ready to Be the AI Answer for Your Clients?</h2>
          <p className="text-muted mb-4">Book a 20-minute discovery call. We will show you exactly how it works and identify your first client to start with.</p>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <button className="btn btn-lg fw-semibold text-dark" onClick={openBooking} style={{ background: '#facc15', borderRadius: 8, padding: '14px 36px', fontSize: 17 }}>
              <i className="bi bi-calendar-check me-2" />Become a Partner
            </button>
            <a href={ADVISOR_URL} className="btn btn-lg btn-outline-primary fw-semibold" target="_blank" rel="noopener noreferrer" style={{ borderRadius: 8, padding: '14px 28px', fontSize: 17 }} data-track="aixcel_send_client">
              Send Your Client to Try It <i className="bi bi-arrow-right ms-1" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-3 text-center" style={{ background: '#f1f5f9', fontSize: 12, color: '#94a3b8' }}>
        &copy; {new Date().getFullYear()} Colaberry Inc. &middot; AIXcelerator &middot; enterprise.colaberry.ai
      </footer>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/aixcelerator" />
    </>
  );
}

export default AIXceleratorLandingPage;
