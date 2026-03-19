import React, { useState, useEffect } from 'react';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { captureUTMParams } from '../services/utmService';

const DARK = '#0f0f1a';
const DARK2 = '#161625';
const ACCENT = '#3b82f6';
const ACCENT2 = '#8b5cf6';
const GREEN = '#10b981';
const TEXT = '#e2e8f0';
const MUTED = '#94a3b8';

function AIArchitectLandingPage() {
  const [showBooking, setShowBooking] = useState(false);

  useEffect(() => {
    captureUTMParams();
  }, []);

  const openBooking = () => setShowBooking(true);

  return (
    <>
      <SEOHead
        title="Build & Deploy Real AI Systems in 3 Weeks"
        description="For Data Professionals and Leaders ready to 10X their productivity with AI. Book a strategy call."
      />

      <div style={{ background: DARK, color: TEXT, fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ padding: '80px 20px 60px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.15)', borderRadius: 20, padding: '6px 16px', fontSize: 13, color: ACCENT, marginBottom: 24, fontWeight: 500 }}>
            For Data Professionals & Leaders
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, background: `linear-gradient(135deg, ${TEXT}, ${ACCENT})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Build & Deploy Real AI Systems in 3 Weeks
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', color: MUTED, maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Turn your ideas into real AI systems inside your company — no theory, real implementation.
          </p>
          <button onClick={openBooking} style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: '#fff', border: 'none', borderRadius: 8, padding: '16px 40px', fontSize: 18, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}>
            BOOK YOUR STRATEGY CALL
          </button>

          {/* Flow Diagram */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 48, flexWrap: 'wrap' }}>
            {['Ideate', 'Plan', 'Build', 'Deploy'].map((step, i) => (
              <React.Fragment key={step}>
                <div style={{ background: DARK2, border: `1px solid ${i === 2 ? ACCENT : '#334155'}`, borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 600, color: i === 2 ? ACCENT : TEXT }}>
                  {step}
                </div>
                {i < 3 && <span style={{ color: '#475569', fontSize: 20 }}>&rarr;</span>}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* PROBLEM */}
        <section style={{ background: DARK2, padding: '60px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>
              Most People Are Using AI <span style={{ color: '#ef4444' }}>Completely Wrong</span>
            </h2>
            <div style={{ display: 'grid', gap: 16 }}>
              {[
                'Using tools instead of building systems',
                'No clear path to deploy AI inside their company',
                "Can't debug when AI workflows break",
                'Stuck at the prompt level, not the system level',
              ].map((point, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
                  <span style={{ color: '#ef4444', fontSize: 18, lineHeight: 1 }}>&#x2717;</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SOLUTION */}
        <section style={{ padding: '60px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
              This Is Where <span style={{ color: ACCENT }}>AI Architects</span> Separate From Everyone Else
            </h2>
            <p style={{ color: MUTED, textAlign: 'center', marginBottom: 32, fontSize: 15 }}>
              AI is not about tools — it's about systems. You need ~20% understanding across five critical disciplines.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { label: 'Web Dev', icon: '&#x2699;' },
                { label: 'Databases', icon: '&#x1F4BE;' },
                { label: 'QA & Testing', icon: '&#x2714;' },
                { label: 'Automation', icon: '&#x26A1;' },
                { label: 'System Design', icon: '&#x1F3D7;' },
              ].map((d, i) => (
                <div key={i} style={{ background: DARK2, borderRadius: 8, padding: '20px 16px', textAlign: 'center', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: d.icon }} />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>~20%</div>
                </div>
              ))}
            </div>
            <p style={{ color: MUTED, textAlign: 'center', marginTop: 24, fontSize: 14, lineHeight: 1.6 }}>
              This combination lets you diagnose failures, build real workflows, and lead AI initiatives at your company.
            </p>
          </div>
        </section>

        {/* OUTCOMES */}
        <section style={{ background: DARK2, padding: '60px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>
              What You Walk Away With
            </h2>
            <div style={{ display: 'grid', gap: 16 }}>
              {[
                'A real AI system scoped to YOUR company',
                'A working deployment — not just concepts',
                'A structured AI architecture you can replicate',
                'The ability to expand and lead AI initiatives internally',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', background: `rgba(16,185,129,0.06)`, borderRadius: 8, borderLeft: `3px solid ${GREEN}` }}>
                  <span style={{ color: GREEN, fontSize: 18, lineHeight: 1 }}>&#x2713;</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 32, padding: '16px 24px', background: 'rgba(139,92,246,0.1)', borderRadius: 8, border: `1px solid ${ACCENT2}` }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: ACCENT2 }}>
                This is not a course — this is a build experience.
              </span>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section style={{ padding: '60px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32 }}>
              Trusted Track Record
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
              {[
                { stat: '10,000+', label: 'Data professionals trained' },
                { stat: '$100M+', label: 'In wage impact generated' },
                { stat: '3 Weeks', label: 'From idea to deployed system' },
                { stat: 'Multi-Agent', label: 'AI systems built & running' },
              ].map((s, i) => (
                <div key={i} style={{ background: DARK2, borderRadius: 8, padding: '24px 16px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT, marginBottom: 4 }}>{s.stat}</div>
                  <div style={{ fontSize: 13, color: MUTED }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <section style={{ background: `linear-gradient(135deg, ${DARK2}, #1a1a3e)`, padding: '60px 20px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 16 }}>
              Let's Map Your AI System
            </h2>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
              On this call, we will identify your use case, show where AI creates the biggest impact,
              map your system architecture, and determine how to build it in 3 weeks.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 440, margin: '0 auto 32px', textAlign: 'left' }}>
              {[
                'Identify your use case',
                'Map your AI system',
                'Show where AI creates impact',
                'Plan a 3-week build path',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <span style={{ color: GREEN }}>&#x2713;</span> {item}
                </div>
              ))}
            </div>
            <button onClick={openBooking} style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: '#fff', border: 'none', borderRadius: 8, padding: '18px 48px', fontSize: 20, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}>
              BOOK YOUR CALL NOW
            </button>
            <p style={{ color: '#475569', fontSize: 12, marginTop: 12 }}>
              Free 30-minute strategy session. No obligations.
            </p>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: '24px 20px', textAlign: 'center', borderTop: '1px solid #1e293b' }}>
          <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>
            Colaberry Enterprise AI Division
          </p>
        </footer>
      </div>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/ai-architect" />
    </>
  );
}

export default AIArchitectLandingPage;
