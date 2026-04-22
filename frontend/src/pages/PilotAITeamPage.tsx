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
const PURPLE = '#8b5cf6';

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

function PilotAITeamPage() {
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
    trackEvent('cta_click', { cta_name: 'pilot_ai_team_booking', page: '/pilot/ai-team' });
    setShowBooking(true);
  };

  return (
    <>
      <SEOHead
        title="Replace Junior Hires With AI Systems That Work 24/7"
        description="AI agents cost less than junior hires, work 24/7, and deploy in 14 days. See the math."
      />

      <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ background: `linear-gradient(135deg, ${HERO_BG} 0%, #1a2744 100%)`, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'inline-block', background: 'rgba(139,92,246,0.15)', borderRadius: 20, padding: '6px 18px', fontSize: 13, color: PURPLE, marginBottom: 24, fontWeight: 500 }}>
              For Operations & Revenue Leaders
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: '#fff' }}>
              Replace a Junior Developer With an{' '}
              <span style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PURPLE})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                AI System That Works 24/7
              </span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 36, maxWidth: 640, margin: '0 auto 36px' }}>
              Lower cost. Higher output. Zero sick days. Deployed in 14 days.
            </p>
            <button onClick={openBooking} style={{ ...btnPrimary, padding: '18px 48px', fontSize: 20 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              SEE WHAT WE'D BUILD FOR YOU
            </button>
          </div>
        </section>

        {/* COMPARISON */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 36, textAlign: 'center', color: TEXT }}>
              The Comparison Is Not Even Close
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
              {/* Junior Dev Card */}
              <div style={{ background: BG, borderRadius: 12, padding: '32px 28px', border: `2px solid ${BORDER}`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -14, left: 24, background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                  Traditional Hire
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 20, marginTop: 8 }}>Junior Developer</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {[
                    { label: 'Annual Cost', value: '$65,000/yr', sub: 'Plus benefits, taxes, equipment' },
                    { label: 'Availability', value: '40 hrs/week', sub: 'Minus vacation, sick days, meetings' },
                    { label: 'Ramp Time', value: '3 months', sub: 'Before meaningful output' },
                    { label: 'Parallel Tasks', value: '1 at a time', sub: 'Context switching kills quality' },
                    { label: 'Retention', value: '~18 months', sub: 'Then you start over' },
                  ].map((row, i) => (
                    <div key={i} style={{ padding: '12px 0', borderBottom: i < 4 ? `1px solid ${BORDER}` : 'none' }}>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{row.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{row.value}</div>
                      <div style={{ fontSize: 12, color: MUTED }}>{row.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Agent Card */}
              <div style={{ background: HERO_BG, borderRadius: 12, padding: '32px 28px', border: `2px solid ${ACCENT}`, position: 'relative', boxShadow: `0 4px 24px rgba(59,130,246,0.15)` }}>
                <div style={{ position: 'absolute', top: -14, left: 24, background: `linear-gradient(135deg, ${ACCENT}, ${PURPLE})`, color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                  AI System
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 20, marginTop: 8 }}>AI Agent</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {[
                    { label: 'Annual Cost', value: '$36,000/yr', sub: 'All-in. No benefits, no overhead.' },
                    { label: 'Availability', value: '24/7/365', sub: 'No downtime. No breaks.' },
                    { label: 'Ramp Time', value: 'Instant', sub: 'Deployed in 14 days, productive Day 1' },
                    { label: 'Parallel Tasks', value: 'Unlimited', sub: 'Handles hundreds simultaneously' },
                    { label: 'Retention', value: 'Permanent', sub: 'Gets better over time, never leaves' },
                  ].map((row, i) => (
                    <div key={i} style={{ padding: '12px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{row.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: GREEN }}>{row.value}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{row.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* USE CASES */}
        <section style={{ background: BG_ALT, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: TEXT }}>
              What AI Agents Handle Today
            </h2>
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 15, marginBottom: 40 }}>
              High-volume, repetitive work that eats your team's time.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {[
                { icon: '\u{1F4C4}', title: 'Invoice Processing', desc: '200 invoices in 4 minutes. 97% accuracy. Extracts vendor, amount, line items, PO numbers.' },
                { icon: '\u{1F4DE}', title: 'Customer Routing', desc: 'Inbound requests triaged, categorized, and routed to the right team in seconds.' },
                { icon: '\u{1F4CA}', title: 'Report Generation', desc: 'Weekly ops reports, financial summaries, KPI dashboards. Auto-generated, always current.' },
                { icon: '\u{1F4DD}', title: 'Data Entry', desc: 'Forms, applications, records. Extracted from any format, validated, and entered clean.' },
                { icon: '\u{1F4C5}', title: 'Scheduling', desc: 'Appointments, resource allocation, shift management. Optimized across constraints.' },
              ].map((uc, i) => (
                <div key={i} style={{ background: WHITE, borderRadius: 12, padding: '28px 22px', border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'transform 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{uc.icon}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{uc.title}</h3>
                  <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, margin: 0 }}>{uc.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* STATS */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {[
                { stat: '$36K/yr', label: 'All-In Cost', color: GREEN },
                { stat: '24/7', label: 'Availability', color: ACCENT },
                { stat: '10x', label: 'Output vs Human', color: PURPLE },
                { stat: '0', label: 'Sick Days', color: RED },
              ].map((s, i) => (
                <div key={i} style={{ background: BG, borderRadius: 10, padding: '28px 16px', textAlign: 'center', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, marginBottom: 6 }}>{s.stat}</div>
                  <div style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* URGENCY + CTA */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, marginBottom: 12, color: '#fff' }}>
              See What We'd Build for Your Team
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.7, marginBottom: 20 }}>
              In a 20-minute scoping call, we identify the 2-3 processes in your company where an AI agent would have the highest impact. You'll walk away with a concrete plan, whether or not you move forward.
            </p>
            <p style={{ color: '#cbd5e1', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
              Founding rate: $3K/month. Full price after this round: $5K/month.
            </p>
            <button onClick={openBooking} style={{ ...btnPrimary, padding: '20px 56px', fontSize: 22 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              SEE WHAT WE'D BUILD FOR YOU
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
        pageOrigin="/pilot/ai-team"
        initialName={prefill.name}
        initialEmail={prefill.email}
        initialCompany={prefill.company}
        initialPhone={prefill.phone}
      />
    </>
  );
}

export default PilotAITeamPage;
