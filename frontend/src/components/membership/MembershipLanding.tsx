import React, { useState } from 'react';
import SEOHead from '../SEOHead';
import { trackEvent } from '../../utils/tracker';
import OpenHouseModal from './OpenHouseModal';
import { PersonaContent } from './personaContent';
import { Button } from '../../colaberry/components/core/Button';
import { Card } from '../../colaberry/components/core/Card';
import { Badge } from '../../colaberry/components/core/Badge';

/* ------------------------------------------------------------------ *
 * MembershipLanding — shared renderer for the 3 persona pages
 * (/membership/working-professionals, /beginners, /builders).
 *
 * Rebuilt on the Colaberry design system to match HomePage and
 * SponsorshipPage: DS components (Button, Card, Badge) + semantic
 * tokens only (never raw hex), so a re-pointed brand palette flows
 * through automatically. Roboto loads globally via the DS styles.css;
 * no per-page font injection. The PersonaContent data contract is
 * frozen — only presentation changed.
 * ------------------------------------------------------------------ */

const META_CHIPS = ['Online', 'Free Open House', '$149 / month membership', 'Learn with Claude'];

/* Self-hosted hero photo per persona, served from /public/hero/. Keyed on
   the frozen PersonaContent.slug union so the map stays exhaustive. */
const HERO_IMAGE_BY_SLUG: Record<PersonaContent['slug'], string> = {
  'working-professionals': '/hero/hero-professional.jpg',
  beginners: '/hero/hero-beginner.jpg',
  builders: '/hero/hero-builder.jpg',
};

const STATS = [
  { n: '10,000+', l: 'Professionals trained' },
  { n: '$100M+', l: 'In wage impact generated' },
  { n: '100%', l: 'Hands-on, real projects' },
];

interface Approach {
  k: string;
  title: string;
  desc: string;
  tone: 'green' | 'blue' | 'red';
}

const APPROACH: Approach[] = [
  {
    k: '01 · Learn',
    title: 'Learn With Claude',
    desc: 'Use Claude for real work: research, planning, and problem solving. Not just prompts and demos.',
    tone: 'green',
  },
  {
    k: '02 · Build',
    title: 'Build Through Colaberry',
    desc: 'Apply what you learn on real, guided projects. You learn by building, applying, and doing.',
    tone: 'blue',
  },
  {
    k: '03 · Deploy',
    title: 'Deploy In The Real World',
    desc: 'Put AI to work in your actual workflows, and keep improving every month as the tools evolve.',
    tone: 'red',
  },
];

const OPEN_HOUSE_DATE = 'July 16, 2026 · Live Online';

/* Shared token-only style roles, mirroring SponsorshipPage's `S` map.
   No raw hex anywhere — a re-pointed palette flows through. */
const S = {
  hero: {
    position: 'relative',
    overflow: 'hidden',
    background:
      'radial-gradient(1200px 600px at 70% -10%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 60%), var(--surface-inverse)',
    color: 'var(--text-on-inverse)',
    padding: 'var(--space-24) var(--space-6) var(--space-20)',
  } as React.CSSProperties,
  section: { padding: 'var(--space-20) var(--space-6)', background: 'var(--surface-page)' } as React.CSSProperties,
  sectionAlt: {
    padding: 'var(--space-20) var(--space-6)',
    background: 'var(--surface-subtle)',
  } as React.CSSProperties,
  sectionInverse: {
    padding: 'var(--space-20) var(--space-6)',
    background: 'var(--surface-inverse)',
    color: 'var(--text-on-inverse)',
  } as React.CSSProperties,
  inner: { maxWidth: 'var(--container-lg)', margin: '0 auto' } as React.CSSProperties,
  innerNarrow: { maxWidth: 'var(--container-md)', margin: '0 auto' } as React.CSSProperties,
  eyebrow: {
    fontSize: 'var(--fs-overline)',
    fontWeight: 'var(--fw-bold)',
    letterSpacing: 'var(--ls-overline)',
    textTransform: 'uppercase',
    color: 'var(--brand-accent)',
    margin: '0 0 var(--space-4)',
  } as React.CSSProperties,
  eyebrowOnDark: {
    fontSize: 'var(--fs-overline)',
    fontWeight: 'var(--fw-bold)',
    letterSpacing: 'var(--ls-overline)',
    textTransform: 'uppercase',
    color: 'color-mix(in srgb, var(--text-on-inverse) 72%, transparent)',
    margin: '0 0 var(--space-4)',
  } as React.CSSProperties,
  h2: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--fs-h2)',
    fontWeight: 'var(--fw-bold)',
    color: 'var(--text-strong)',
    letterSpacing: 'var(--ls-tight)',
    lineHeight: 'var(--lh-heading)',
    margin: 0,
  } as React.CSSProperties,
  h2OnDark: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--fs-h2)',
    fontWeight: 'var(--fw-bold)',
    color: 'var(--text-on-inverse)',
    letterSpacing: 'var(--ls-tight)',
    lineHeight: 'var(--lh-heading)',
    margin: 0,
  } as React.CSSProperties,
  lead: {
    fontSize: 'var(--fs-body-lg)',
    lineHeight: 'var(--lh-relaxed)',
    color: 'var(--text-muted)',
    margin: 'var(--space-5) 0 0',
  } as React.CSSProperties,
  leadOnDark: {
    fontSize: 'var(--fs-body-lg)',
    lineHeight: 'var(--lh-relaxed)',
    color: 'color-mix(in srgb, var(--text-on-inverse) 80%, transparent)',
    margin: 'var(--space-5) 0 0',
  } as React.CSSProperties,
  body: {
    fontSize: 'var(--fs-body)',
    lineHeight: 'var(--lh-relaxed)',
    color: 'var(--text-muted)',
    margin: 'var(--space-3) 0 0',
  } as React.CSSProperties,
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--fs-h4)',
    fontWeight: 'var(--fw-bold)',
    color: 'var(--text-strong)',
    margin: '0 0 var(--space-2)',
  } as React.CSSProperties,
  cardBody: {
    fontSize: 'var(--fs-body-sm)',
    lineHeight: 'var(--lh-relaxed)',
    color: 'var(--text-muted)',
    margin: 0,
  } as React.CSSProperties,
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 'var(--space-6)',
    marginTop: 'var(--space-10)',
  } as React.CSSProperties,
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 'var(--space-6)',
    marginTop: 'var(--space-10)',
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 'var(--space-6)',
    marginTop: 'var(--space-10)',
  } as React.CSSProperties,
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
  } as React.CSSProperties,
};

/* Scoped helpers — token-only, no raw hex. Scoped under #membership-page
   so nothing leaks to the rest of the public site. */
const SCOPED_CSS = `
#membership-page .ml-chip {
  display: inline-flex;
  align-items: center;
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  color: color-mix(in srgb, var(--text-on-inverse) 88%, transparent);
  border: var(--border-1) solid color-mix(in srgb, var(--text-on-inverse) 24%, transparent);
  border-radius: var(--radius-pill);
  padding: var(--space-2) var(--space-4);
  min-height: var(--target-min);
}
#membership-page .ml-role {
  display: inline-flex;
  align-items: center;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-bold);
  color: var(--text-body);
  background: var(--surface-card);
  border: var(--border-1) solid var(--border-default);
  border-radius: var(--radius-pill);
  padding: var(--space-3) var(--space-5);
}
`;

interface MembershipLandingProps {
  content: PersonaContent;
}

/** Two-column checklist used by Learn + Open House sections. `onDark`
 *  switches text + check colors for inverse surfaces. */
function Checklist({ items, onDark }: { items: string[]; onDark?: boolean }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 'var(--space-8) 0 0',
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 'var(--space-3) var(--space-8)',
      }}
    >
      {items.map((item) => (
        <li
          key={item}
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'flex-start',
            fontSize: 'var(--fs-body-sm)',
            lineHeight: 'var(--lh-normal)',
            color: onDark
              ? 'color-mix(in srgb, var(--text-on-inverse) 88%, transparent)'
              : 'var(--text-body)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flex: '0 0 auto',
              marginTop: '2px',
              fontWeight: 'var(--fw-bold)',
              color: onDark ? 'var(--green-400)' : 'var(--status-success)',
            }}
          >
            {'✓'}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MembershipLanding({ content }: MembershipLandingProps) {
  const [showRegister, setShowRegister] = useState(false);

  const openRegister = (ctaName: string) => {
    trackEvent('cta_click', {
      cta_name: ctaName,
      persona: content.slug,
      page: `/membership/${content.slug}`,
    });
    setShowRegister(true);
  };

  const heroAccent = content.hero.body[0];
  const heroLead = content.hero.body.slice(1).join(' ');
  const gap = content.gap;
  const heroImage = HERO_IMAGE_BY_SLUG[content.slug];

  return (
    <>
      <style>{SCOPED_CSS}</style>
      <SEOHead title={content.seo.title} description={content.seo.description} />

      <div id="membership-page" style={{ background: 'var(--surface-page)', color: 'var(--text-body)' }}>
        {/* ============================ HERO ============================ */}
        <header style={S.hero}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              backgroundImage: `linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 76%, transparent), color-mix(in srgb, var(--surface-inverse) 90%, transparent)), url('${heroImage}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div style={{ ...S.inner, position: 'relative', zIndex: 1 }}>
            <Badge solid style={{ marginBottom: 'var(--space-5)' }}>
              Colaberry AI Membership · Live Open House
            </Badge>
            <p
              style={{
                fontSize: 'var(--fs-h4)',
                fontWeight: 'var(--fw-medium)',
                color: 'var(--brand-accent)',
                margin: '0 0 var(--space-4)',
              }}
            >
              {heroAccent}
            </p>
            <h1
              className="cb-balance"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-hero-fluid)',
                fontWeight: 'var(--fw-black)',
                lineHeight: 'var(--lh-tight)',
                letterSpacing: 'var(--ls-tighter)',
                color: 'var(--text-on-inverse)',
                margin: 0,
                maxWidth: '18ch',
              }}
            >
              {content.hero.headline}
            </h1>
            {heroLead && (
              <p style={{ ...S.leadOnDark, maxWidth: 'var(--container-sm)' }}>{heroLead}</p>
            )}

            <div style={{ ...S.pillRow, marginTop: 'var(--space-8)' }}>
              {META_CHIPS.map((c) => (
                <span className="ml-chip" key={c}>
                  {c}
                </span>
              ))}
            </div>

            <div
              style={{
                height: 'var(--border-1)',
                background: 'color-mix(in srgb, var(--text-on-inverse) 16%, transparent)',
                margin: 'var(--space-10) 0 var(--space-8)',
                maxWidth: 'var(--container-md)',
              }}
              aria-hidden="true"
            />

            <dl
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-12)',
                margin: 0,
              }}
            >
              {STATS.map((s) => (
                <div key={s.l}>
                  <dt
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-h2)',
                      fontWeight: 'var(--fw-black)',
                      lineHeight: 'var(--lh-tight)',
                      color: 'var(--text-on-inverse)',
                    }}
                  >
                    {s.n}
                  </dt>
                  <dd
                    style={{
                      margin: 'var(--space-1) 0 0',
                      fontSize: 'var(--fs-overline)',
                      letterSpacing: 'var(--ls-overline)',
                      textTransform: 'uppercase',
                      color: 'color-mix(in srgb, var(--text-on-inverse) 64%, transparent)',
                    }}
                  >
                    {s.l}
                  </dd>
                </div>
              ))}
            </dl>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-5)',
                marginTop: 'var(--space-10)',
              }}
            >
              <Button size="lg" onClick={() => openRegister('open_house_hero')}>
                {content.hero.cta}
              </Button>
              <span
                style={{
                  fontSize: 'var(--fs-caption)',
                  color: 'color-mix(in srgb, var(--text-on-inverse) 70%, transparent)',
                  maxWidth: 'var(--container-sm)',
                }}
              >
                {content.hero.price}
              </span>
            </div>
          </div>
        </header>

        {/* ============================ THE GAP ============================ */}
        <section style={S.section}>
          <div style={S.innerNarrow}>
            <p style={S.eyebrow}>The Gap</p>
            <h2 style={S.h2}>{gap.title}</h2>
            {gap.list ? (
              <>
                {gap.body.map((p, i) => (
                  <p key={p} style={i === 0 ? S.lead : S.body}>
                    {p}
                  </p>
                ))}
                <div style={{ ...S.pillRow, marginTop: 'var(--space-8)' }}>
                  {gap.list.map((r) => (
                    <span className="ml-role" key={r}>
                      {r}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p style={S.lead}>{gap.body[0]}</p>
                {gap.body.slice(1, -1).map((p) => (
                  <p key={p} style={S.body}>
                    {p}
                  </p>
                ))}
                {gap.body.length > 1 && (
                  <Card
                    accent="red"
                    padded
                    elevation="sm"
                    style={{ marginTop: 'var(--space-8)' }}
                  >
                    <p
                      style={{
                        fontSize: 'var(--fs-h4)',
                        fontWeight: 'var(--fw-medium)',
                        lineHeight: 'var(--lh-snug)',
                        color: 'var(--text-strong)',
                        margin: 0,
                      }}
                    >
                      {gap.body[gap.body.length - 1]}
                    </p>
                  </Card>
                )}
              </>
            )}
          </div>
        </section>

        {/* ====================== WHAT YOU'LL LEARN ====================== */}
        <section style={S.sectionInverse}>
          <div style={S.inner}>
            <p style={S.eyebrowOnDark}>What You{'’'}ll Learn</p>
            <h2 style={{ ...S.h2OnDark, maxWidth: '20ch' }}>{content.learn.title}</h2>
            <p style={{ ...S.leadOnDark, maxWidth: 'var(--container-md)' }}>{content.learn.intro}</p>
            <Checklist items={content.learn.items} onDark />
            <p
              style={{
                margin: 'var(--space-8) 0 0',
                fontSize: 'var(--fs-h5)',
                fontWeight: 'var(--fw-medium)',
                lineHeight: 'var(--lh-snug)',
                color: 'color-mix(in srgb, var(--text-on-inverse) 92%, transparent)',
                maxWidth: 'var(--container-md)',
              }}
            >
              {content.learn.goal}
            </p>
          </div>
        </section>

        {/* ========================= THE APPROACH ========================= */}
        <section style={S.section}>
          <div style={S.inner}>
            <p style={S.eyebrow}>The Approach</p>
            <h2 style={S.h2}>A path, not a pile of tutorials.</h2>
            <div style={S.grid3}>
              {APPROACH.map((c) => (
                <Card key={c.title} accent={c.tone} padded elevation="sm">
                  <p
                    style={{
                      fontSize: 'var(--fs-overline)',
                      letterSpacing: 'var(--ls-overline)',
                      textTransform: 'uppercase',
                      fontWeight: 'var(--fw-bold)',
                      color: 'var(--brand-accent)',
                      margin: '0 0 var(--space-3)',
                    }}
                  >
                    {c.k}
                  </p>
                  <h3 style={S.cardTitle}>{c.title}</h3>
                  <p style={S.cardBody}>{c.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============== BUILD PATH (builders) or PRACTICE ============== */}
        {content.buildPath ? (
          <section style={S.sectionAlt}>
            <div style={S.inner}>
              <p style={S.eyebrow}>The Program</p>
              <h2 style={S.h2}>{content.buildPath.title}</h2>
              <div style={S.grid4}>
                {content.buildPath.phases.map((p) => (
                  <Card key={p.title} accent="red" padded elevation="sm">
                    <p
                      style={{
                        fontSize: 'var(--fs-body-sm)',
                        fontWeight: 'var(--fw-bold)',
                        color: 'var(--brand-accent)',
                        margin: '0 0 var(--space-2)',
                      }}
                    >
                      {p.weeks}
                    </p>
                    <h3 style={{ ...S.cardTitle, fontSize: 'var(--fs-h5)' }}>{p.title}</h3>
                    <p style={S.cardBody}>{p.desc}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        ) : content.practice ? (
          <section style={S.sectionAlt}>
            <div style={S.innerNarrow}>
              <p style={S.eyebrow}>How You{'’'}ll Build</p>
              <h2 style={S.h2}>{content.practice.title}</h2>
              {content.practice.body.map((p, i) => (
                <p key={p} style={i === 0 ? S.lead : S.body}>
                  {p}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {/* ============================ BUILT FOR ============================ */}
        <section style={content.buildPath || content.practice ? S.section : S.sectionAlt}>
          <div style={S.innerNarrow}>
            <p style={S.eyebrow}>Who It{'’'}s For</p>
            <h2 style={S.h2}>{content.builtFor.title}</h2>
            {content.builtFor.intro && <p style={S.body}>{content.builtFor.intro}</p>}
            <div style={{ ...S.pillRow, marginTop: 'var(--space-8)' }}>
              {content.builtFor.idealFor.map((r) => (
                <span className="ml-role" key={r}>
                  {r}
                </span>
              ))}
            </div>
            <p style={{ ...S.lead, marginTop: 'var(--space-8)' }}>
              {content.builtFor.closing.join(' ')}
            </p>
          </div>
        </section>

        {/* ======================== TRANSFORMATION ======================== */}
        <section style={content.buildPath || content.practice ? S.sectionAlt : S.section}>
          <div style={S.inner}>
            <p style={S.eyebrow}>The Transformation</p>
            <h2 style={S.h2}>Where you start, and where you land.</h2>
            <div style={S.grid2}>
              <Card accent="red" padded elevation="sm">
                <p
                  style={{
                    fontSize: 'var(--fs-overline)',
                    letterSpacing: 'var(--ls-overline)',
                    textTransform: 'uppercase',
                    fontWeight: 'var(--fw-bold)',
                    color: 'var(--status-danger)',
                    margin: '0 0 var(--space-4)',
                  }}
                >
                  Before
                </p>
                <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--text-body)' }}>
                  {content.transformation.before.map((b) => (
                    <li key={b} style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-normal)' }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card accent="green" padded elevation="sm">
                <p
                  style={{
                    fontSize: 'var(--fs-overline)',
                    letterSpacing: 'var(--ls-overline)',
                    textTransform: 'uppercase',
                    fontWeight: 'var(--fw-bold)',
                    color: 'var(--status-success)',
                    margin: '0 0 var(--space-4)',
                  }}
                >
                  After
                </p>
                <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--text-body)' }}>
                  {content.transformation.after.map((a) => (
                    <li key={a} style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-normal)' }}>
                      {a}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </section>

        {/* ===================== WHY DIFFERENT (optional) ===================== */}
        {content.different && (
          <section style={S.sectionAlt}>
            <div style={S.innerNarrow}>
              <p style={S.eyebrow}>Why It{'’'}s Different</p>
              <h2 style={S.h2}>{content.different.title}</h2>
              {content.different.body.map((p, i) => (
                <p key={p} style={i === 0 ? S.lead : S.body}>
                  {p}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* =========================== OPEN HOUSE =========================== */}
        <section style={S.sectionInverse}>
          <div style={S.inner}>
            <p style={S.eyebrowOnDark}>The Free Open House</p>
            <h2 style={{ ...S.h2OnDark, maxWidth: '22ch' }}>{content.openHouse.title}</h2>
            <p style={{ ...S.leadOnDark, maxWidth: 'var(--container-md)' }}>{content.openHouse.intro}</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 'var(--space-10)',
                alignItems: 'start',
                marginTop: 'var(--space-8)',
              }}
            >
              <Checklist items={content.openHouse.items} onDark />
              <Card padded elevation="md">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-h1)',
                      fontWeight: 'var(--fw-black)',
                      lineHeight: 1,
                      color: 'var(--text-strong)',
                    }}
                  >
                    $149
                  </span>
                  <span style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--text-muted)' }}>
                    /month
                  </span>
                </div>
                <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', margin: 'var(--space-3) 0 var(--space-5)' }}>
                  Next Open House: {OPEN_HOUSE_DATE}
                </p>
                <Button fullWidth onClick={() => openRegister('open_house_section')}>
                  {content.openHouse.cta}
                </Button>
                <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', margin: 'var(--space-4) 0 0' }}>
                  Free to attend. No obligation. See the membership in action and meet the team.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* ============================ CLOSING ============================ */}
        <section style={{ ...S.sectionAlt, padding: 'var(--space-24) var(--space-6)' }}>
          <div style={{ ...S.innerNarrow, textAlign: 'center' }}>
            <p style={{ ...S.eyebrow, margin: '0 0 var(--space-4)' }}>{content.finalCta.title}</p>
            <h2 className="cb-balance" style={{ ...S.h2, maxWidth: '20ch', margin: '0 auto' }}>
              {content.finalCta.body[0]}
            </h2>
            {content.finalCta.body.length > 1 && (
              <p style={{ ...S.lead, maxWidth: 'var(--container-sm)', margin: 'var(--space-5) auto 0' }}>
                {content.finalCta.body.slice(1).join(' ')}
              </p>
            )}
            <div style={{ marginTop: 'var(--space-10)' }}>
              <Button size="lg" onClick={() => openRegister('open_house_final')}>
                {content.hero.cta}
              </Button>
            </div>
            <p
              style={{
                margin: 'var(--space-10) 0 0',
                fontSize: 'var(--fs-h5)',
                fontWeight: 'var(--fw-medium)',
                color: 'var(--text-body)',
              }}
            >
              {content.finalCta.tagline}
            </p>
            <p style={{ margin: 'var(--space-4) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
              {content.finalCta.price} · hello@colaberry.com
            </p>
          </div>
        </section>
      </div>

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
