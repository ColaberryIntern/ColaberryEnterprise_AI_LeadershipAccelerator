import React, { useState, useEffect } from 'react';
import SEOHead from '../SEOHead';
import { captureUTMFromURL } from '../../services/utmService';
import { initTracker, trackEvent } from '../../utils/tracker';
import OpenHouseModal from './OpenHouseModal';
import { PersonaContent } from './personaContent';

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
};

const sectionH2: React.CSSProperties = {
  fontSize: 'clamp(24px, 3.5vw, 36px)',
  fontWeight: 700,
  marginBottom: 20,
  textAlign: 'center',
  color: TEXT,
};

interface MembershipLandingProps {
  content: PersonaContent;
}

function Paragraphs({ lines, color = TEXT2 }: { lines: string[]; color?: string }) {
  return (
    <>
      {lines.map((line, i) => (
        <p key={i} style={{ fontSize: 16, lineHeight: 1.7, color, marginBottom: 12 }}>{line}</p>
      ))}
    </>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 640, margin: '0 auto' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, lineHeight: 1.6, color: TEXT2 }}>
          <span style={{ color: GREEN, marginTop: 2 }}>{'✓'}</span> {item}
        </div>
      ))}
    </div>
  );
}

function MembershipLanding({ content }: MembershipLandingProps) {
  const [showRegister, setShowRegister] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    captureUTMFromURL();
    initTracker();
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowStickyCta(window.scrollY > 500 && !showRegister);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showRegister]);

  const openRegister = (ctaName: string) => {
    trackEvent('cta_click', { cta_name: ctaName, persona: content.slug, page: `/membership/${content.slug}` });
    setShowRegister(true);
  };

  return (
    <>
      <SEOHead title={content.seo.title} description={content.seo.description} />

      <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ background: HERO_BG, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 820, margin: '0 auto' }}>
            <h1 style={{ fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.12, marginBottom: 24, color: '#fff' }}>
              {content.hero.headline}
            </h1>
            <div style={{ maxWidth: 640, margin: '0 auto 28px' }}>
              {content.hero.body.map((line, i) => (
                <p key={i} style={{ fontSize: 'clamp(15px, 2.2vw, 18px)', color: '#cbd5e1', lineHeight: 1.7, marginBottom: 12 }}>{line}</p>
              ))}
            </div>
            <p style={{ color: ACCENT, fontWeight: 700, fontSize: 16, marginBottom: 24 }}>{content.hero.price}</p>
            <button onClick={() => openRegister('open_house_hero')} style={{ ...btnStyle, padding: '18px 48px', fontSize: 20 }}>
              {content.hero.cta}
            </button>
          </div>
        </section>

        {/* GAP */}
        <section style={{ background: WHITE, padding: '64px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={sectionH2}>{content.gap.title}</h2>
            <Paragraphs lines={content.gap.body} />
            {content.gap.list && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 16 }}>
                {content.gap.list.map((item, i) => (
                  <div key={i} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', fontSize: 14, color: TEXT2 }}>{item}</div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* BUILT FOR */}
        <section style={{ background: BG_ALT, padding: '64px 20px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={sectionH2}>{content.builtFor.title}</h2>
            {content.builtFor.intro && <Paragraphs lines={[content.builtFor.intro]} />}
            <p style={{ fontSize: 14, fontWeight: 600, color: MUTED, marginBottom: 16 }}>Ideal for:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
              {content.builtFor.idealFor.map((role, i) => (
                <div key={i} style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', fontSize: 14, fontWeight: 600, color: TEXT2 }}>{role}</div>
              ))}
            </div>
            <Paragraphs lines={content.builtFor.closing} />
          </div>
        </section>

        {/* LEARN */}
        <section style={{ background: WHITE, padding: '64px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={sectionH2}>{content.learn.title}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: TEXT2, marginBottom: 20 }}>{content.learn.intro}</p>
            <Checklist items={content.learn.items} />
            <p style={{ fontSize: 16, lineHeight: 1.7, color: ACCENT2, fontWeight: 600, marginTop: 20 }}>{content.learn.goal}</p>
          </div>
        </section>

        {/* PRACTICE (optional) */}
        {content.practice && (
          <section style={{ background: BG_ALT, padding: '64px 20px' }}>
            <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
              <h2 style={sectionH2}>{content.practice.title}</h2>
              <Paragraphs lines={content.practice.body} />
            </div>
          </section>
        )}

        {/* BUILD PATH (optional) */}
        {content.buildPath && (
          <section style={{ background: WHITE, padding: '64px 20px' }}>
            <div style={{ maxWidth: 880, margin: '0 auto' }}>
              <h2 style={sectionH2}>{content.buildPath.title}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
                {content.buildPath.phases.map((phase, i) => (
                  <div key={i} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '22px 20px', borderTop: `3px solid ${ACCENT}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>{phase.weeks}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{phase.title}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: MUTED }}>{phase.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* OPEN HOUSE */}
        <section style={{ background: BG_ALT, padding: '64px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={sectionH2}>{content.openHouse.title}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: TEXT2, marginBottom: 20 }}>{content.openHouse.intro}</p>
            <Checklist items={content.openHouse.items} />
            <button onClick={() => openRegister('open_house_section')} style={{ ...btnStyle, marginTop: 28 }}>
              {content.openHouse.cta}
            </button>
          </div>
        </section>

        {/* TRANSFORMATION */}
        <section style={{ background: WHITE, padding: '64px 20px' }}>
          <div style={{ maxWidth: 880, margin: '0 auto' }}>
            <h2 style={sectionH2}>The Transformation</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginTop: 20 }}>
              <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '24px 22px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 14 }}>Before</div>
                <Paragraphs lines={content.transformation.before} />
              </div>
              <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '24px 22px', borderTop: `3px solid ${GREEN}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: GREEN, marginBottom: 14 }}>After</div>
                <Paragraphs lines={content.transformation.after} />
              </div>
            </div>
          </div>
        </section>

        {/* WHY DIFFERENT (optional) */}
        {content.different && (
          <section style={{ background: BG_ALT, padding: '64px 20px' }}>
            <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
              <h2 style={sectionH2}>{content.different.title}</h2>
              <Paragraphs lines={content.different.body} />
            </div>
          </section>
        )}

        {/* FINAL CTA */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, marginBottom: 16, color: '#fff' }}>{content.finalCta.title}</h2>
            <div style={{ maxWidth: 560, margin: '0 auto 16px' }}>
              {content.finalCta.body.map((line, i) => (
                <p key={i} style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1.7, marginBottom: 10 }}>{line}</p>
              ))}
            </div>
            <p style={{ color: ACCENT, fontWeight: 700, fontSize: 16, marginBottom: 24 }}>{content.finalCta.price}</p>
            <button onClick={() => openRegister('open_house_final')} style={{ ...btnStyle, padding: '18px 48px', fontSize: 20 }}>
              {content.hero.cta}
            </button>
            <p style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600, lineHeight: 1.7, marginTop: 28 }}>{content.finalCta.tagline}</p>
          </div>
        </section>

        <footer style={{ padding: '24px 20px', textAlign: 'center', background: BG, borderTop: `1px solid ${BORDER}` }}>
          <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>Colaberry AI Membership</p>
        </footer>
      </div>

      {/* STICKY CTA */}
      {showStickyCta && !showRegister && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(15,23,42,0.97)',
          padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, flexWrap: 'wrap', zIndex: 900, boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
        }}>
          <span style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600 }}>{content.hero.price}</span>
          <button onClick={() => openRegister('open_house_sticky')} style={{ ...btnStyle, padding: '12px 28px', fontSize: 16 }}>
            {content.openHouse.cta}
          </button>
        </div>
      )}

      <OpenHouseModal
        show={showRegister}
        onClose={() => setShowRegister(false)}
        personaSlug={content.slug}
        submitLabel={content.openHouse.cta}
      />
    </>
  );
}

export default MembershipLanding;
