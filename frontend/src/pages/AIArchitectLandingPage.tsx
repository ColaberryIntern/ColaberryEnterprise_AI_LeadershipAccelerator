import React, { useState, useEffect, Suspense } from 'react'; // eslint-disable-line
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';

const IntelligenceDemoSection = React.lazy(() => import('../components/intelligence-demo/IntelligenceDemoSection'));
import { captureUTMFromURL, getAdvisoryUrl } from '../services/utmService';
import { initTracker, trackEvent } from '../utils/tracker';
import IndustryDemoGrid from '../components/IndustryDemoGrid';

const BG = '#F8FAFC';
const BG_ALT = '#F1F5F9';
const WHITE = '#FFFFFF';
const TEXT = '#0F172A';
const TEXT2 = '#1E293B';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const ACCENT = '#3b82f6';
const ACCENT2 = '#8b5cf6';
const GREEN = '#10b981';
const HERO_BG = '#0f172a';

const btnStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
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

function AIArchitectLandingPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [nextCohort, setNextCohort] = useState<{ name: string; start_date: string; seats_remaining: number } | null>(null);
  const [prefill, setPrefill] = useState<{ name: string; email: string; company: string; phone: string }>({ name: '', email: '', company: '', phone: '' });

  // Show sticky CTA after scrolling past the hero section
  useEffect(() => {
    const handleScroll = () => {
      setShowStickyCta(window.scrollY > 500 && !showBooking);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showBooking]);

  useEffect(() => {
    captureUTMFromURL();
    initTracker();
    // Bridge lid → lead_id so tracker can identify the visitor
    const params = new URLSearchParams(window.location.search);
    const lid = params.get('lid');
    if (lid) { try { localStorage.setItem('cb_lead_id', lid); } catch {} }
    if (lid) {
      fetch((process.env.REACT_APP_API_URL || '') + '/api/calendar/prefill/' + lid)
        .then(r => r.json())
        .then(data => {
          if (data.name || data.email) setPrefill(data);
        })
        .catch(() => {});
    }
    // Fetch next upcoming cohort for urgency section
    fetch((process.env.REACT_APP_API_URL || '') + '/api/cohorts')
      .then(r => r.json())
      .then(data => {
        const cohorts = data.cohorts || [];
        const today = new Date().toISOString().split('T')[0];
        const upcoming = cohorts
          .filter((c: any) => c.start_date >= today && c.seats_taken < c.max_seats)
          .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));
        if (upcoming.length > 0) {
          setNextCohort({
            name: upcoming[0].name,
            start_date: upcoming[0].start_date,
            seats_remaining: upcoming[0].max_seats - upcoming[0].seats_taken,
          });
        }
      })
      .catch(() => {});
  }, []);

  const openBooking = () => {
    trackEvent('cta_click', { cta_name: 'book_strategy_call', page: '/ai-architect' });
    setShowBooking(true);
  };

  return (
    <>
      <SEOHead
        title="Build & Deploy Real AI Systems in 3 Weeks"
        description="For Data Professionals and Leaders ready to 10X their productivity with AI. Book a strategy call."
      />

      <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO — dark section */}
        <section style={{ background: HERO_BG, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.15)', borderRadius: 20, padding: '6px 18px', fontSize: 13, color: ACCENT, marginBottom: 24, fontWeight: 500 }}>
              For Data Professionals & Leaders
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: '#fff' }}>
              Build & Deploy Real{' '}
              <span style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                AI Systems
              </span>
              {' '}in 3 Weeks
            </h1>
            <div style={{ maxWidth: 640, margin: '0 auto 36px' }}>
              <p style={{ fontSize: 'clamp(15px, 2.2vw, 18px)', color: '#cbd5e1', lineHeight: 1.7, marginBottom: 14 }}>
                AI is no longer a tool — it's becoming <strong style={{ color: '#fff' }}>how work gets done</strong>.
              </p>
              <p style={{ fontSize: 'clamp(15px, 2.2vw, 18px)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 14 }}>
                The professionals who understand how to <strong style={{ color: '#cbd5e1' }}>build systems</strong> — not just use tools — are the ones pulling ahead fast.
              </p>
              <p style={{ fontSize: 'clamp(15px, 2.2vw, 18px)', color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>
                In 3 weeks, you'll go from ideas {'\u2192'} a <strong style={{ color: ACCENT }}>real AI system</strong> inside your company.
              </p>
            </div>
            <button onClick={openBooking} style={{ ...btnStyle, padding: '18px 48px', fontSize: 20 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK YOUR STRATEGY CALL
            </button>
          </div>
        </section>

        {/* Design AI Org CTA */}
        <div className="text-center py-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 8 }}>Not ready to book? Design your AI organization first.</p>
          <a
            href={getAdvisoryUrl()}
            className="btn btn-sm text-white"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '6px 20px', fontSize: 13 }}
            data-track="ai_architect_design_first"
            target="_blank"
            rel="noopener noreferrer"
          >
            Design AI Org - Free &rarr;
          </a>
          <div style={{ maxWidth: 960, margin: '20px auto 0' }}>
            <IndustryDemoGrid trackContext="ai_architect" />
          </div>
        </div>

        {/* SYSTEM FRAMEWORK */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: TEXT }}>
              The Full-Stack AI System
            </h2>
            <div style={{ maxWidth: 700, margin: '0 auto 40px', textAlign: 'center' }}>
              <p style={{ color: TEXT2, fontSize: 16, lineHeight: 1.7, marginBottom: 16 }}>
                Most executives, tech leaders, developers, and data professionals already have experience in several of these areas.
              </p>
              <p style={{ color: TEXT2, fontSize: 16, lineHeight: 1.7, marginBottom: 16 }}>
                The shift isn't starting from scratch — it's learning how to <strong>connect what you already know</strong> into a complete AI system.
              </p>
              <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.7, marginBottom: 8 }}>
                This is the shift happening across the industry:
              </p>
              <p style={{ fontSize: 17, fontWeight: 700, color: ACCENT, lineHeight: 1.6, marginBottom: 12 }}>
                From specialized roles {'\u2192'} AI Systems Architect
              </p>
              <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
                The people who understand how these systems connect are the ones leading AI inside their organizations.
              </p>
              <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
                You don't need to learn everything. You need to understand how the pieces work together. That's exactly what we show you how to do.
              </p>
              <p style={{ color: TEXT2, fontSize: 16, lineHeight: 1.7, marginBottom: 12, fontStyle: 'italic' }}>
                You're not learning something new — you're stepping into the role your experience has already been preparing you for.
              </p>
              <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.7, marginBottom: 8 }}>
                This is why roles across BI, Data, Engineering, and Leadership are converging into one:
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: ACCENT, margin: 0 }}>
                AI Systems Architect
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
              {[
                { title: 'Product', desc: 'What to build', icon: '\u{1F4CB}' },
                { title: 'UX', desc: 'How it works for users', icon: '\u{1F3A8}' },
                { title: 'AI Systems', desc: 'How intelligence operates', icon: '\u{1F9E0}' },
                { title: 'Data', desc: 'What powers the system', icon: '\u{1F4CA}' },
                { title: 'Integrations', desc: 'How systems connect', icon: '\u{1F517}' },
                { title: 'Automation', desc: 'How work gets done', icon: '\u26A1' },
                { title: 'Deployment', desc: 'How it runs in production', icon: '\u{1F680}' },
              ].map((d, i) => (
                <div key={i} style={{
                  background: WHITE, borderRadius: 10, padding: '22px 14px', textAlign: 'center',
                  border: `1px solid ${BORDER}`, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'default',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{d.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT2, marginBottom: 4 }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.4 }}>{d.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <p style={{ fontSize: 15, color: TEXT2, lineHeight: 1.6, marginBottom: 6 }}>
                Most professionals already operate in 2–3 of these areas.
              </p>
              <p style={{ fontSize: 15, fontWeight: 600, color: ACCENT2, lineHeight: 1.6, margin: 0 }}>
                The advantage comes from understanding how all 7 connect into a working system.
              </p>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section style={{ background: BG_ALT, padding: '70px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32, textAlign: 'center', color: TEXT }}>
              Most People Are Using AI <span style={{ color: '#dc2626' }}>the Wrong Way</span>
            </h2>
            <div style={{ display: 'grid', gap: 14 }}>
              {[
                'Using tools instead of building systems',
                'No clear path to deploy AI inside their company',
                "Can't debug when AI workflows break",
                'Stuck at the prompt level, not the system level',
              ].map((point, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', background: WHITE, borderRadius: 8, borderLeft: '3px solid #dc2626', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <span style={{ color: '#dc2626', fontSize: 16, lineHeight: 1.4 }}>{'\u2717'}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.6, color: TEXT2 }}>{point}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <p style={{ color: '#94a3b8', fontSize: 14 }}>Start by seeing what your AI organization looks like</p>
              <a
                href={getAdvisoryUrl()}
                className="btn btn-outline-light btn-sm"
                data-track="ai_architect_see_org"
                target="_blank"
                rel="noopener noreferrer"
                style={{ borderRadius: 20, fontSize: 13 }}
              >
                Design Your AI Organization &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* OUTCOMES */}
        <section style={{ background: WHITE, padding: '70px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 32, textAlign: 'center', color: TEXT }}>
              What You Walk Away With
            </h2>
            <div style={{ display: 'grid', gap: 14 }}>
              {[
                'A real AI system scoped to YOUR company',
                'A working deployment — not just concepts',
                'A structured AI architecture you can replicate',
                'The ability to expand and lead AI initiatives internally',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', background: BG, borderRadius: 8, borderLeft: `3px solid ${GREEN}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <span style={{ color: GREEN, fontSize: 16, lineHeight: 1.4 }}>{'\u2713'}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.6, color: TEXT2 }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 32, padding: '16px 24px', background: 'rgba(139,92,246,0.06)', borderRadius: 8, border: `1px solid rgba(139,92,246,0.2)` }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: ACCENT2 }}>
                This is not a course — this is a build experience.
              </span>
            </div>
          </div>
        </section>

        {/* INTELLIGENCE DEMO */}
        <Suspense fallback={
          <section style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f7fafc 100%)', padding: '60px 20px' }}>
            <div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
              <div style={{ height: 400, background: BG_ALT, borderRadius: 12 }} />
            </div>
          </section>
        }>
          <IntelligenceDemoSection onOpenBooking={openBooking} ctaLabel="BOOK YOUR CALL NOW" />
        </Suspense>

        {/* SOCIAL PROOF */}
        <section style={{ background: BG_ALT, padding: '70px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 36, color: TEXT }}>
              Trusted Track Record
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {[
                { stat: '10,000+', label: 'Data professionals trained' },
                { stat: '$100M+', label: 'In wage impact generated' },
                { stat: '3 Weeks', label: 'From idea to deployed system' },
                { stat: 'Multi-Agent', label: 'AI systems built & running' },
              ].map((s, i) => (
                <div key={i} style={{ background: WHITE, borderRadius: 10, padding: '28px 16px', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT, marginBottom: 6 }}>{s.stat}</div>
                  <div style={{ fontSize: 13, color: MUTED }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COHORT URGENCY */}
        {nextCohort && (
          <section style={{ background: WHITE, padding: '70px 20px' }}>
            <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
              <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '36px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, marginBottom: 16, color: TEXT }}>
                  Next Cohort Starting Soon
                </h2>
                <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: '16px 20px', marginBottom: 20, border: `1px solid rgba(59,130,246,0.15)` }}>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>Next Cohort Starting</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: ACCENT }}>
                    {new Date(nextCohort.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
                    {nextCohort.seats_remaining} seats remaining
                  </div>
                </div>
                <div style={{ textAlign: 'left', marginBottom: 24 }}>
                  <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.7, marginBottom: 12 }}>
                    This is a guided, hands-on build experience — not a passive course.
                  </p>
                  <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.7, marginBottom: 12 }}>
                    Because of the level of support, we limit how many people can join each cohort.
                  </p>
                  <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.7, marginBottom: 12 }}>
                    Once this cohort fills, enrollment closes and the next start date moves out.
                  </p>
                  <p style={{ color: TEXT, fontSize: 15, lineHeight: 1.7, fontWeight: 600, margin: 0 }}>
                    If you're serious about building a real AI system, this is your window.
                  </p>
                </div>
                <button onClick={openBooking} style={{ ...btnStyle }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  APPLY FOR THIS COHORT
                </button>
              </div>
            </div>
          </section>
        )}

        {/* WHO THIS IS FOR */}
        <section style={{ background: BG_ALT, padding: '70px 20px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, marginBottom: 28, textAlign: 'center', color: TEXT }}>
              Who This Is For
            </h2>
            <div style={{ background: WHITE, borderRadius: 10, padding: '28px 28px', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.7, marginBottom: 20 }}>
                This is for you if:
              </p>
              {[
                "You're already working with data, systems, or technology",
                'You see AI changing how work gets done',
                'You want to move beyond tools \u2192 into building systems',
                'You want to lead AI initiatives, not follow them',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, fontSize: 15, lineHeight: 1.6, color: TEXT2 }}>
                  <span style={{ color: GREEN, marginTop: 2 }}>{'\u2713'}</span> {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, marginBottom: 12, color: '#fff' }}>
              Let's Map Your AI System
            </h2>
            <p style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
              This is not a sales call.
            </p>
            <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
              This is where we map your AI system. We'll walk through:
            </p>
            <div style={{ maxWidth: 420, margin: '0 auto 32px', textAlign: 'left' }}>
              {[
                'What you should build',
                'How the system should work',
                'Where AI creates the biggest impact',
                'What it would take to deploy it in 3 weeks',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, color: '#cbd5e1', marginBottom: 10, lineHeight: 1.5 }}>
                  <span style={{ color: GREEN, marginTop: 2 }}>{'\u2022'}</span> {item}
                </div>
              ))}
            </div>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 32 }}>
              If it makes sense, we'll show you exactly how to move forward.
            </p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
              No technical background in AI systems required — we guide you step-by-step.
            </p>
            <button onClick={openBooking} style={{ ...btnStyle, padding: '20px 56px', fontSize: 22 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              BOOK YOUR CALL NOW
            </button>
            <p style={{ color: '#475569', fontSize: 13, marginTop: 14 }}>
              Free 30-minute strategy session. No obligations.
            </p>
          </div>
        </section>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
          <IndustryDemoGrid trackContext="ai_architect_bottom" />
        </div>

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
        pageOrigin="/ai-architect"
        initialName={prefill.name}
        initialEmail={prefill.email}
        initialCompany={prefill.company}
        initialPhone={prefill.phone}
      />
    </>
  );
}

export default AIArchitectLandingPage;
