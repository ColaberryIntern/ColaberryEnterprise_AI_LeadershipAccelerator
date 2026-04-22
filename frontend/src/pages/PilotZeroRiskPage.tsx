import React, { useState, useEffect } from 'react'; // eslint-disable-line
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { captureUTMFromURL } from '../services/utmService';
import { initTracker, trackEvent } from '../utils/tracker';

const HERO_BG = '#0f172a';
const WHITE = '#ffffff';
const BG = '#f8fafc';
const BG_ALT = '#f1f5f9';
const TEXT = '#0f172a';
const TEXT2 = '#1e293b';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const ACCENT = '#3b82f6';
const GREEN = '#38a169';
const RED = '#e53e3e';

const btnPrimary: React.CSSProperties = {
  background: `linear-gradient(135deg, ${ACCENT}, #2563eb)`,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '16px 44px',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: 0.5,
  transition: 'transform 0.2s, box-shadow 0.2s',
};

function PilotZeroRiskPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [prefill, setPrefill] = useState<{ name: string; email: string; company: string; phone: string }>({ name: '', email: '', company: '', phone: '' });

  useEffect(() => {
    captureUTMFromURL();
    initTracker();
    const params = new URLSearchParams(window.location.search);
    const lid = params.get('lid');
    if (lid) { try { localStorage.setItem('cb_lead_id', lid); } catch {} }
    if (lid) {
      fetch((process.env.REACT_APP_API_URL || '') + '/api/calendar/prefill/' + lid)
        .then(r => r.json())
        .then(data => { if (data.name || data.email) setPrefill(data); })
        .catch(() => {});
    }
  }, []);

  const openBooking = () => {
    trackEvent('cta_click', { cta_name: 'pilot_zero_risk_booking', page: '/pilot/zero-risk' });
    setShowBooking(true);
  };

  return (
    <>
      <SEOHead
        title="AI System Pilot - Deploy in 14 Days, Zero Risk"
        description="Test a real AI system before paying anything. 14-day build, zero cost until proven. 10 founding client spots."
      />

      <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ background: HERO_BG, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.15)', borderRadius: 20, padding: '6px 18px', fontSize: 13, color: ACCENT, marginBottom: 24, fontWeight: 500 }}>
              AI System Pilot Program -- 10 Founding Clients
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: '#fff' }}>
              Deploy a Real AI System in 14 Days{' '}
              <span style={{ background: `linear-gradient(135deg, ${GREEN}, #2f855a)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Before You Pay Anything
              </span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 36, maxWidth: 640, margin: '0 auto 36px' }}>
              We take all the risk. You don't commit until you see it working.
            </p>
            <button onClick={openBooking} style={{ ...btnPrimary, padding: '18px 48px', fontSize: 20 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK A DISCOVERY CALL
            </button>
          </div>
        </section>

        {/* PAIN SECTION */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32, textAlign: 'center', color: TEXT }}>
              Why Most AI Projects <span style={{ color: RED }}>Fail</span>
            </h2>
            <div style={{ display: 'grid', gap: 14 }}>
              {[
                { icon: '\u{1F4B8}', text: '$300K+ spent on consultants who deliver PowerPoints, not systems' },
                { icon: '\u231B', text: '6-12 month timelines that lose executive sponsorship before launch' },
                { icon: '\u{1F6AB}', text: 'Generic "AI strategy" that never touches real operations' },
                { icon: '\u{1F4C9}', text: 'POCs that demo well but never make it to production' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', background: BG, borderRadius: 8, borderLeft: `3px solid ${RED}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <span style={{ fontSize: 20, lineHeight: 1.4, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.6, color: TEXT2 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SOLUTION: 14-DAY TIMELINE */}
        <section style={{ background: BG_ALT, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: TEXT }}>
              The 14-Day Zero-Risk Build
            </h2>
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 15, marginBottom: 40 }}>
              From scoping call to working system in production.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {[
                {
                  phase: 'Days 1-3',
                  title: 'Scope',
                  desc: 'We identify the highest-impact process to automate. Map data sources, define success metrics, and design the system architecture.',
                  icon: '\u{1F50D}',
                  color: ACCENT,
                },
                {
                  phase: 'Days 4-10',
                  title: 'Build',
                  desc: 'Our team builds the AI system on your infrastructure, with your data, solving your specific problem. Daily progress updates.',
                  icon: '\u2699\uFE0F',
                  color: '#8b5cf6',
                },
                {
                  phase: 'Days 11-14',
                  title: 'Validate',
                  desc: 'Run the system on real workloads. Measure accuracy, speed, and impact. You only commit if you see it working.',
                  icon: '\u2705',
                  color: GREEN,
                },
              ].map((step, i) => (
                <div key={i} style={{ background: WHITE, borderRadius: 12, padding: '32px 24px', border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -12, left: 24, background: step.color, color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                    {step.phase}
                  </div>
                  <div style={{ fontSize: 32, marginBottom: 12, marginTop: 8 }}>{step.icon}</div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{step.title}</h3>
                  <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, margin: 0 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* STATS GRID */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {[
                { stat: '14 Days', label: 'To Deploy', color: ACCENT },
                { stat: '$180K', label: 'Avg. Savings', color: GREEN },
                { stat: '10', label: 'Founding Spots', color: '#8b5cf6' },
                { stat: '0', label: 'Risk', color: RED },
              ].map((s, i) => (
                <div key={i} style={{ background: BG, borderRadius: 10, padding: '28px 16px', textAlign: 'center', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, marginBottom: 6 }}>{s.stat}</div>
                  <div style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* URGENCY */}
        <section style={{ background: BG_ALT, padding: '70px 20px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, marginBottom: 20, color: TEXT }}>
              10 Founding Client Spots -- 7 Claimed
            </h2>
            <div style={{ background: WHITE, borderRadius: 12, padding: '32px 28px', border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ background: '#e2e8f0', borderRadius: 8, height: 12, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ background: `linear-gradient(135deg, ${RED}, #c53030)`, height: '100%', width: '70%', borderRadius: 8, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 14, color: MUTED }}>
                <span>7 of 10 claimed</span>
                <span style={{ color: RED, fontWeight: 600 }}>3 remaining</span>
              </div>
              <p style={{ fontSize: 15, color: TEXT2, lineHeight: 1.7, marginBottom: 8 }}>
                The founding rate locks in pricing that increases significantly at general availability.
              </p>
              <p style={{ fontSize: 15, color: TEXT2, lineHeight: 1.7, marginBottom: 24 }}>
                Once all 10 spots are filled, the next cohort opens at full price.
              </p>
              <button onClick={openBooking} style={{ ...btnPrimary }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                CLAIM YOUR SPOT
              </button>
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, marginBottom: 12, color: '#fff' }}>
              Let's Scope Your AI System
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
              20-minute scoping call. We identify the highest-impact process in your company to automate first. No pitch, no pressure. If there's a fit, we'll outline the 14-day build plan.
            </p>
            <button onClick={openBooking} style={{ ...btnPrimary, padding: '20px 56px', fontSize: 22 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK A DISCOVERY CALL
            </button>
            <p style={{ color: '#475569', fontSize: 13, marginTop: 14 }}>
              Free 20-minute scoping session. Zero obligations.
            </p>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: '24px 20px', textAlign: 'center', background: BG, borderTop: `1px solid ${BORDER}` }}>
          <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>
            Colaberry Enterprise AI Division
          </p>
        </footer>
      </div>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/pilot/zero-risk"
        initialName={prefill.name}
        initialEmail={prefill.email}
        initialCompany={prefill.company}
        initialPhone={prefill.phone}
      />
    </>
  );
}

export default PilotZeroRiskPage;
