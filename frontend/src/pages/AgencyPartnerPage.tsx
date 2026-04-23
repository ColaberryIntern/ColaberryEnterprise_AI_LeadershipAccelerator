import React, { useState, useEffect } from 'react'; // eslint-disable-line
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { captureUTMFromURL, getAdvisoryUrl } from '../services/utmService';
import { initTracker, trackEvent } from '../utils/tracker';

const HERO_BG = '#0a0e17';
const DARK = '#111827';
const WHITE = '#ffffff';
const BG = '#f8fafc';
const TEXT = '#0f172a';
const TEXT2 = '#1e293b';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const ACCENT = '#3b82f6';
const GREEN = '#38a169';
const GOLD = '#d4a574';
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

function AgencyPartnerPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [prefill, setPrefill] = useState<{ name: string; email: string; company: string; phone: string }>({ name: '', email: '', company: '', phone: '' });
  const advisoryUrl = getAdvisoryUrl();

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
    trackEvent('cta_click', { cta_name: 'partner_call_booking', page: '/partners' });
    setShowBooking(true);
  };

  return (
    <>
      <SEOHead
        title="White-Label AI Build Partner for Agency Owners"
        description="You sell AIOS. We build it. Enterprise-grade AI systems delivered in 14 days at wholesale pricing. White-label for your agency."
      />

      <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ background: `linear-gradient(135deg, ${HERO_BG} 0%, #1a2744 100%)`, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.15)', borderRadius: 20, padding: '6px 18px', fontSize: 13, color: ACCENT, marginBottom: 24, fontWeight: 600 }}>
              White-Label AI Build Partner
            </div>
            <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.08, marginBottom: 20, color: '#fff' }}>
              You Sell AI.{' '}
              <span style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PURPLE})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                We Build It.
              </span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 36, maxWidth: 660, margin: '0 auto 36px' }}>
              Enterprise-grade AI systems delivered in 14 days at wholesale pricing. You keep the client relationship. You set the margin. We white-label the build.
            </p>
            <button onClick={openBooking} style={{ ...btnPrimary, padding: '18px 48px', fontSize: 20 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK A PARTNER CALL
            </button>
          </div>
        </section>

        {/* THE DELIVERY GAP */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: TEXT }}>
              The Delivery Gap
            </h2>
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 16, marginBottom: 36, maxWidth: 600, margin: '0 auto 36px' }}>
              You can close $25K+ AIOS deals. But can your n8n workflow deliver enterprise results?
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
              {/* Without Us */}
              <div style={{ background: BG, borderRadius: 12, padding: '28px 24px', border: `2px solid #fecaca`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -14, left: 24, background: '#fef2f2', color: '#dc2626', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                  Without a Build Partner
                </div>
                <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
                  {[
                    'Clients outgrow your chatbot in 3 months',
                    'You turn down $50K+ deals you can\'t deliver',
                    'Referrals dry up because results are mediocre',
                    'You spend nights debugging instead of selling',
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ color: '#dc2626', fontSize: 16, flexShrink: 0, marginTop: 2 }}>{'\u2717'}</span>
                      <span style={{ fontSize: 14, color: TEXT2, lineHeight: 1.6 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* With Us */}
              <div style={{ background: HERO_BG, borderRadius: 12, padding: '28px 24px', border: `2px solid ${ACCENT}`, position: 'relative', boxShadow: `0 4px 24px rgba(59,130,246,0.15)` }}>
                <div style={{ position: 'absolute', top: -14, left: 24, background: `linear-gradient(135deg, ${ACCENT}, ${PURPLE})`, color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                  With Colaberry as Your Build Team
                </div>
                <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
                  {[
                    'Deliver enterprise-grade systems that retain clients for years',
                    'Say yes to every deal — we build it, you bill it',
                    'Every client becomes 4-6 referrals',
                    'You focus on sales while we handle delivery',
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ color: GREEN, fontSize: 16, flexShrink: 0, marginTop: 2 }}>{'\u2713'}</span>
                      <span style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHAT WE BUILD */}
        <section style={{ background: BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: TEXT }}>
              What We Build for You
            </h2>
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 15, marginBottom: 40 }}>
              Production systems your clients will pay premium for. Not demos. Not POCs.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {[
                { icon: '\u{1F9E0}', title: 'AI Operating Systems', desc: 'Full AIOS installs with multi-agent orchestration, context engines, and automated decision-making across departments.', color: ACCENT },
                { icon: '\u{1F4DE}', title: 'Voice Agent Infrastructure', desc: 'Production voice agents for inbound/outbound calls, appointment booking, lead qualification, and customer service at scale.', color: PURPLE },
                { icon: '\u{1F504}', title: 'Multi-Agent Workflows', desc: 'Complex workflows with 10+ coordinated agents handling real business processes. Not simple Zapier chains.', color: GREEN },
                { icon: '\u{1F4BB}', title: 'Custom AI Applications', desc: 'Full-stack AI-powered apps with custom backends, databases, APIs, and user interfaces built for production.', color: GOLD },
                { icon: '\u{1F4CA}', title: 'Data & Intelligence Layers', desc: 'Real-time dashboards, predictive analytics, anomaly detection, and business intelligence built on client data.', color: '#e53e3e' },
              ].map((item, i) => (
                <div key={i} style={{ background: WHITE, borderRadius: 12, padding: '28px 22px', border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'transform 0.2s', borderTop: `3px solid ${item.color}` }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{item.title}</h3>
                  <p style={{ fontSize: 13, color: TEXT2, lineHeight: 1.7, margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ background: `linear-gradient(135deg, ${HERO_BG} 0%, #1e3a5f 100%)`, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 40, color: '#fff' }}>
              How the Partnership Works
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
              {[
                { step: '1', title: 'You Close the Deal', desc: 'You run the sales process, do the audit, and close your client at your price. We never talk to your client unless you want us to.', color: ACCENT },
                { step: '2', title: 'We Scope & Build', desc: 'You send us the requirements. We build the production AI system in 14 days at wholesale pricing. Full white-label.', color: PURPLE },
                { step: '3', title: 'You Deliver Enterprise Quality', desc: 'Your client gets a system that actually works in production. They stay. They refer. You grow.', color: GREEN },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '32px 24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, margin: '0 auto 16px' }}>{s.step}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32, padding: '16px 24px', background: 'rgba(59,130,246,0.1)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', display: 'inline-block' }}>
              <span style={{ color: ACCENT, fontWeight: 700, fontSize: 15 }}>White-label delivery. Wholesale pricing. You set your margin.</span>
            </div>
          </div>
        </section>

        {/* CASE STUDIES */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: TEXT }}>
              What Your Clients Get
            </h2>
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 15, marginBottom: 40 }}>
              Real results from production AI systems we built.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {[
                {
                  stat: '$1.2M',
                  label: 'Annual Savings',
                  title: 'Route Planning AI',
                  desc: 'Logistics co-op with 200+ vehicles. AI optimizes fuel, driver hours, and delivery windows. Deployed in 11 days.',
                  color: GREEN,
                },
                {
                  stat: '4 min',
                  label: '200 Invoices',
                  title: 'Invoice Processing',
                  desc: '97% accuracy. Extracts vendor, amount, line items, PO numbers. Replaced 2 days of manual work per month.',
                  color: ACCENT,
                },
                {
                  stat: '42K',
                  label: 'Members Served',
                  title: 'Storm Response System',
                  desc: 'Electric cooperative. AI handles 15,000+ storm calls, dispatches 200 crews, sends proactive alerts. 60% fewer inbound calls.',
                  color: PURPLE,
                },
              ].map((cs, i) => (
                <div key={i} style={{ background: BG, borderRadius: 12, padding: '28px 24px', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${cs.color}` }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: cs.color, marginBottom: 4 }}>{cs.stat}</div>
                  <div style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{cs.label}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{cs.title}</h3>
                  <p style={{ fontSize: 13, color: TEXT2, lineHeight: 1.7, margin: 0 }}>{cs.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BEYOND BUILDS */}
        <section style={{ background: BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32, textAlign: 'center', color: TEXT }}>
              Beyond Builds
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              <div style={{ background: WHITE, borderRadius: 12, padding: '28px 24px', border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{'\u{1F393}'}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Train Your Team</h3>
                <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, margin: 0 }}>Want to build internal capacity? We train your developers and operators to manage, extend, and build AI systems themselves.</p>
              </div>
              <div style={{ background: WHITE, borderRadius: 12, padding: '28px 24px', border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{'\u{1F465}'}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Hire AI Talent</h3>
                <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, margin: 0 }}>Need AI engineers, architects, or operators? We source and place AI-capable talent so you can scale your agency with the right people.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FREE TOOL */}
        <section style={{ background: DARK, padding: '60px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{'\u{1F527}'}</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Free Tool for Your Discovery Calls</h3>
            <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.7, marginBottom: 24, maxWidth: 520, margin: '0 auto 24px' }}>
              Design your client's AI organization in 5 minutes. Maps agents, systems, and ROI. Use it on your next sales call to position yourself as the expert.
            </p>
            <a href={advisoryUrl} target="_blank" rel="noopener noreferrer"
              style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none', background: `linear-gradient(135deg, ${GREEN}, #2f855a)`, padding: '14px 36px', fontSize: 16 }}
              onClick={() => trackEvent('cta_click', { cta_name: 'advisor_tool', page: '/partners' })}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
              TRY THE AI WORKFORCE DESIGNER
            </a>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, marginBottom: 12, color: '#fff' }}>
              Let's Talk Partnership
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.7, marginBottom: 20 }}>
              30-minute call. We learn what you sell, what your clients need, and whether we're the right build team for your agency. No pitch. Just fit.
            </p>
            <p style={{ color: ACCENT, fontSize: 17, fontWeight: 600, lineHeight: 1.7, marginBottom: 32 }}>
              We work with a limited number of agency partners to maintain delivery quality.
            </p>
            <button onClick={openBooking} style={{ ...btnPrimary, padding: '20px 56px', fontSize: 22 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK A PARTNER CALL
            </button>
            <p style={{ color: '#475569', fontSize: 13, marginTop: 14 }}>
              Free 30-minute call. Zero obligations.
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
        pageOrigin="/partners"
        initialName={prefill.name}
        initialEmail={prefill.email}
        initialCompany={prefill.company}
        initialPhone={prefill.phone}
      />
    </>
  );
}

export default AgencyPartnerPage;
