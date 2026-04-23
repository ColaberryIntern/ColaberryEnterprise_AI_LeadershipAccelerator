import React, { useState, useEffect } from 'react'; // eslint-disable-line
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { captureUTMFromURL, getAdvisoryUrl } from '../services/utmService';
import { initTracker, trackEvent } from '../utils/tracker';

const HERO_BG = '#0a0e17';
const WHITE = '#ffffff';
const BG = '#f8fafc';
const TEXT = '#0f172a';
const TEXT2 = '#1e293b';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const ACCENT = '#3b82f6';
const GREEN = '#38a169';
const PURPLE = '#8b5cf6';

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
  textDecoration: 'none',
  display: 'inline-block',
};

function AIWorkforceDesignerPage() {
  const [showBooking, setShowBooking] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  useEffect(() => {
    captureUTMFromURL();
    initTracker();
  }, []);

  const openBooking = () => {
    trackEvent('cta_click', { cta_name: 'partner_call_from_designer', page: '/ai-workforce-designer' });
    setShowBooking(true);
  };

  return (
    <>
      <SEOHead
        title="AI Workforce Designer \u2014 Design Your Client's AI Org in 5 Minutes"
        description="Free tool for AI agency owners. Map your client's AI workforce \u2014 agents, systems, ROI \u2014 in one discovery call. Use it to close bigger deals."
      />

      <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ background: `linear-gradient(135deg, ${HERO_BG} 0%, #1a2744 100%)`, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ display: 'inline-block', background: 'rgba(56,161,105,0.15)', borderRadius: 20, padding: '6px 18px', fontSize: 13, color: GREEN, marginBottom: 24, fontWeight: 600 }}>
              Free Tool for Agency Owners
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 50px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: '#fff' }}>
              Design Your Client's AI Organization{' '}
              <span style={{ color: GREEN }}>in 5 Minutes</span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 36, maxWidth: 620, margin: '0 auto 36px' }}>
              Run this on your next discovery call. It maps agents, systems, and ROI for any business. Positions you as the expert before you even pitch.
            </p>
            <a href={advisoryUrl} target="_blank" rel="noopener noreferrer"
              style={{ ...btnGreen, padding: '18px 48px', fontSize: 20 }}
              onClick={() => trackEvent('cta_click', { cta_name: 'try_designer', page: '/ai-workforce-designer' })}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(56,161,105,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              TRY IT FREE
            </a>
            <p style={{ color: '#475569', fontSize: 13, marginTop: 12 }}>No signup. No cost. Just run it.</p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 40, textAlign: 'center', color: TEXT }}>
              How It Works
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
              {[
                { step: '1', title: 'Enter Their Business', desc: 'Type in the client\'s industry, company size, and main challenge. Takes 30 seconds.', color: ACCENT },
                { step: '2', title: 'Answer 10 Questions', desc: 'The AI advisor asks targeted questions about their operations, pain points, and goals. Walk through it with your client.', color: PURPLE },
                { step: '3', title: 'Get the Blueprint', desc: 'Receive a full AI workforce design: recommended agents, systems, estimated ROI, and implementation roadmap.', color: GREEN },
              ].map((s, i) => (
                <div key={i} style={{ background: BG, borderRadius: 12, padding: '28px 22px', border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, margin: '0 auto 14px' }}>{s.step}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* USE CASES */}
        <section style={{ background: BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: TEXT }}>
              Use It on Your Next Sales Call
            </h2>
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 15, marginBottom: 36 }}>
              Agency owners are using this to close bigger deals faster.
            </p>
            <div style={{ display: 'grid', gap: 16 }}>
              {[
                { industry: 'HVAC Company', problem: 'Dispatching 40 crews manually, losing $200K/year on inefficiency', result: 'AI designs a dispatch optimization + customer communication system. Client sees 3 agents, $195K savings, 28% faster response.', icon: '\u{1F527}' },
                { industry: 'Law Firm', problem: '60% of partner time spent on intake and document review', result: 'AI maps a document analysis agent + client intake bot + billing automation. $340K in recovered billable hours.', icon: '\u2696\uFE0F' },
                { industry: 'Logistics Company', problem: 'Route planning costs $1.2M/year in wasted fuel and overtime', result: 'AI designs a route optimization + load planning + exception handling system. 3 agents, $1.2M annual savings.', icon: '\u{1F69A}' },
              ].map((uc, i) => (
                <div key={i} style={{ background: WHITE, borderRadius: 12, padding: '24px', border: `1px solid ${BORDER}`, display: 'grid', gridTemplateColumns: '48px 1fr', gap: 16, alignItems: 'start' }}>
                  <div style={{ fontSize: 32, textAlign: 'center', paddingTop: 4 }}>{uc.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{uc.industry}</h3>
                    <p style={{ fontSize: 13, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>Problem: {uc.problem}</p>
                    <p style={{ fontSize: 13, color: GREEN, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>{uc.result}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ background: `linear-gradient(135deg, ${HERO_BG} 0%, #1e3a5f 100%)`, padding: '70px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 16, color: '#fff' }}>
              Try It Now
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.7, marginBottom: 32, maxWidth: 520, margin: '0 auto 32px' }}>
              Open it on your next call. Let the client see their AI workforce designed in real-time. Then offer to build it.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
              <a href={advisoryUrl} target="_blank" rel="noopener noreferrer"
                style={{ ...btnGreen, padding: '16px 40px', fontSize: 18 }}
                onClick={() => trackEvent('cta_click', { cta_name: 'try_designer_bottom', page: '/ai-workforce-designer' })}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                DESIGN AN AI ORG NOW
              </a>
              <button onClick={openBooking}
                style={{ background: 'transparent', color: '#fff', border: `2px solid ${ACCENT}`, borderRadius: 8, padding: '16px 40px', fontSize: 18, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                WANT US TO BUILD IT?
              </button>
            </div>
            <p style={{ color: '#475569', fontSize: 13, marginTop: 16 }}>
              The designer is free. If you want enterprise-grade delivery for your clients, book a partner call.
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
        pageOrigin="/ai-workforce-designer"
      />
    </>
  );
}

export default AIWorkforceDesignerPage;
