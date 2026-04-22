import React, { useState, useEffect } from 'react'; // eslint-disable-line
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { captureUTMFromURL } from '../services/utmService';
import { initTracker, trackEvent } from '../utils/tracker';

const HERO_BG = '#0a0e17';
const DARK_CARD = '#111827';
const WHITE = '#ffffff';
const BG = '#f8fafc';
const TEXT = '#0f172a';
const TEXT2 = '#1e293b';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const GOLD = '#d4a574';
const GOLD_LIGHT = 'rgba(212,165,116,0.15)';
const GREEN = '#38a169';
const ACCENT = '#3b82f6';

const btnGreen: React.CSSProperties = {
  background: `linear-gradient(135deg, ${GREEN}, #2f855a)`,
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

function PilotExclusivePage() {
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
    trackEvent('cta_click', { cta_name: 'pilot_exclusive_booking', page: '/pilot/exclusive' });
    setShowBooking(true);
  };

  return (
    <>
      <SEOHead
        title="Exclusive AI Build Program - 10 Companies Selected"
        description="We're selecting 10 companies to build AI into from the inside. Long-term partnership, not a one-off project. Book a strategy call."
      />

      <div style={{ background: HERO_BG, color: WHITE, fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ background: HERO_BG, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'inline-block', background: GOLD_LIGHT, borderRadius: 20, padding: '6px 18px', fontSize: 13, color: GOLD, marginBottom: 24, fontWeight: 500, border: '1px solid rgba(212,165,116,0.3)' }}>
              Exclusive Build Program
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: '#fff' }}>
              We're Building 10 AI-Driven Companies{' '}
              <span style={{ color: GOLD }}>From the Inside</span>
              {' '}-- Want In?
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 36, maxWidth: 640, margin: '0 auto 36px' }}>
              This is not a one-off project. We embed with your team and build AI systems that compound over time. Long-term partnership, starting with a free 14-day build.
            </p>
            <button onClick={openBooking} style={{ ...btnGreen, padding: '18px 48px', fontSize: 20 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(56,161,105,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK A STRATEGY CALL
            </button>
          </div>
        </section>

        {/* PARTNERSHIP MODEL */}
        <section style={{ background: DARK_CARD, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: '#fff' }}>
              This Is Not a Service. It's a Partnership.
            </h2>
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 15, marginBottom: 40 }}>
              We are selecting companies, not accepting customers.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {[
                {
                  icon: '\u{1F3AF}',
                  title: 'We Embed With Your Team',
                  desc: 'Our engineers and AI architects work alongside your leadership. Not outsourced. Not consultants dropping off a report. Embedded partners who understand your business.',
                },
                {
                  icon: '\u{1F527}',
                  title: 'We Build Real AI Systems',
                  desc: 'Not POCs. Not demos. Production AI systems running on your infrastructure, solving your specific operational bottlenecks. Starting with a free 14-day build.',
                },
                {
                  icon: '\u{1F4C8}',
                  title: 'We Grow With You',
                  desc: 'AI is doubling in capability every 4 months. We keep improving your existing systems and building new ones so you stay ahead of the curve.',
                },
                {
                  icon: '\u{1F393}',
                  title: 'We Train + Hire',
                  desc: 'We train your employees to work with AI and offer hiring solutions for AI-capable talent. Build internal capability alongside external systems.',
                },
              ].map((item, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '32px 24px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT STARTS */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: '#fff' }}>
              How It Starts
            </h2>
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 15, marginBottom: 40 }}>
              A 30-minute conversation to see if there's a fit. Then we build.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { step: '1', title: 'Strategy Call', desc: '30-minute conversation. We learn your business, identify the highest-impact AI opportunities, and see if there is a mutual fit.', color: ACCENT },
                { step: '2', title: 'Free 14-Day Build', desc: 'We build your first AI system at zero cost. Real data, real workflows, real results. You see it working before any commitment.', color: GOLD },
                { step: '3', title: 'Prove the Value', desc: 'The system runs in your environment. You measure the impact. If it delivers, we scope a long-term partnership. If not, you walk away.', color: GREEN },
                { step: '4', title: 'Long-Term Partnership', desc: 'Founding partners get their first year locked in at the cost of a junior developer. We keep building AI systems that compound your competitive advantage.', color: '#e53e3e' },
              ].map((s, i) => (
                <div key={i} style={{ background: DARK_CARD, borderRadius: 12, padding: '28px 20px', border: '1px solid rgba(255,255,255,0.08)', borderTop: `3px solid ${s.color}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{s.step}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOUNDER STORY */}
        <section style={{ background: DARK_CARD, padding: '70px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ background: 'rgba(212,165,116,0.05)', borderRadius: 12, padding: '40px 32px', border: '1px solid rgba(212,165,116,0.2)', borderLeft: `4px solid ${GOLD}` }}>
              <div style={{ fontSize: 48, color: GOLD, marginBottom: 16, lineHeight: 1, fontFamily: 'Georgia, serif' }}>"</div>
              <p style={{ fontSize: 18, color: '#e2e8f0', lineHeight: 1.8, marginBottom: 20, fontStyle: 'italic' }}>
                We started with a single AI system that automated route planning. It saved us $1.2M in the first year. That success turned into a long-term partnership where we've now deployed AI across quoting, exception handling, and customer operations. The compounding effect has been transformative.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, #b8956a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  J
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Logistics CEO</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>200-person company, Southeast US</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHO WE'RE LOOKING FOR */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32, textAlign: 'center', color: '#fff' }}>
              Who We're Looking For
            </h2>
            <div style={{ display: 'grid', gap: 14 }}>
              {[
                { text: 'CEOs and founders who want AI built into their company, not bolted on' },
                { text: 'Companies with $5M-$50M in revenue and 51-200 employees' },
                { text: 'Leaders who think in terms of long-term competitive advantage, not quick fixes' },
                { text: 'Teams with real operational processes that AI can transform' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: DARK_CARD, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${GREEN}, #2f855a)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                    {'\u2713'}
                  </div>
                  <span style={{ fontSize: 15, color: '#e2e8f0', lineHeight: 1.6 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section style={{ background: DARK_CARD, padding: '70px 20px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, marginBottom: 12, color: '#fff' }}>
              Let's See If There's a Fit
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.7, marginBottom: 20 }}>
              30-minute strategy call. We learn your business, identify the highest-impact AI opportunity, and determine if a long-term partnership makes sense for both sides.
            </p>
            <p style={{ color: GOLD, fontSize: 17, fontWeight: 600, lineHeight: 1.7, marginBottom: 32 }}>
              Only 10 founding partner spots. 3 remaining.
            </p>
            <button onClick={openBooking} style={{ ...btnGreen, padding: '20px 56px', fontSize: 22 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(56,161,105,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK A STRATEGY CALL
            </button>
            <p style={{ color: '#475569', fontSize: 13, marginTop: 14 }}>
              Free 30-minute conversation. Zero obligations.
            </p>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: '24px 20px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>
            Colaberry Enterprise AI Division
          </p>
        </footer>
      </div>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/pilot/exclusive"
        initialName={prefill.name}
        initialEmail={prefill.email}
        initialCompany={prefill.company}
        initialPhone={prefill.phone}
      />
    </>
  );
}

export default PilotExclusivePage;
