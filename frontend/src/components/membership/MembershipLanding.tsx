import React, { useState, useEffect } from 'react';
import SEOHead from '../SEOHead';
import { trackEvent } from '../../utils/tracker';
import OpenHouseModal from './OpenHouseModal';
import { PersonaContent } from './personaContent';

// Garage Labs-inspired editorial design: Playfair serif headlines + Inter body,
// warm-charcoal dark sections alternating with off-white, gold italic accent,
// uppercase eyebrows, pill CTAs, earthy cards. Styles are namespaced under
// .mlx-root so they never leak into the rest of the public site (which supplies
// its own PublicNavbar / PublicFooter via PublicLayout).

const CSS = `
.mlx-root{--dark:#1d1b18;--paper:#fff;--paper2:#f7f5f2;--ink:#1a1714;--muted:#6f6a63;--line:#e7e3dd;--lineD:rgba(255,255,255,.16);--gold:#cf9a3f;--terra:#b8502a;--green:#23362e;--teal:#1f3a3a;--clay:#5d3320;font-family:'Inter',-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--paper);line-height:1.65;font-size:17px;-webkit-font-smoothing:antialiased}
.mlx-root *{box-sizing:border-box}
.mlx-root h1,.mlx-root h2,.mlx-root h3{margin:0;font-family:'Playfair Display',Georgia,serif;line-height:1.12;letter-spacing:-.01em}
.mlx-root h2{font-size:clamp(30px,4vw,46px);font-weight:700}
.mlx-serif{font-family:'Playfair Display',Georgia,serif}
.mlx-wrap{max-width:1120px;margin:0 auto;padding:0 32px}
.mlx-narrow{max-width:760px}
.mlx-eyebrow{font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.mlx-lead{font-size:clamp(18px,2vw,21px);line-height:1.6}
.mlx-muted{color:var(--muted)}
.mlx-sec{padding:84px 0}
.mlx-alt{background:var(--paper2)}
.mlx-darksec{background:var(--dark);color:#fff}
.mlx-darksec .mlx-eyebrow{color:#a39c90}.mlx-darksec h2{color:#fff}
.mlx-btn{display:inline-flex;align-items:center;gap:9px;font-weight:600;font-size:15px;border-radius:999px;padding:14px 28px;cursor:pointer;border:1px solid transparent;transition:transform .15s;text-decoration:none;font-family:'Inter'}
.mlx-btn:hover{transform:translateY(-1px)}
.mlx-btn-dark{background:var(--ink);color:#fff}
.mlx-btn-light{background:#fff;color:var(--ink)}
.mlx-chips{display:flex;flex-wrap:wrap;gap:10px}
.mlx-chip{font-size:13px;font-weight:500;border:1px solid var(--lineD);border-radius:8px;padding:7px 14px;color:#e8e4dd}
.mlx-hero{background:var(--dark);color:#fff;padding:78px 0 88px}
.mlx-hero .mlx-eyebrow{color:#b9b2a6}
.mlx-gold{font-family:'Playfair Display',serif;font-style:italic;color:var(--gold);font-size:clamp(22px,3vw,30px);font-weight:500;margin:18px 0 8px}
.mlx-hero h1{color:#fff;font-size:clamp(38px,6vw,66px);font-weight:800;max-width:15ch}
.mlx-hero .mlx-lead{color:#d6d0c6;max-width:62ch;margin:22px 0 0}
.mlx-divider{height:1px;background:var(--lineD);margin:34px 0 26px;max-width:760px}
.mlx-stats{display:flex;gap:56px;flex-wrap:wrap}
.mlx-stat .n{font-family:'Playfair Display',serif;font-size:clamp(30px,3.4vw,42px);font-weight:700}
.mlx-stat .l{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#a39c90;margin-top:2px}
.mlx-herocta{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:38px}
.mlx-herocta .price{color:#cdbfa4;font-size:14px}
.mlx-callout{border:1px solid var(--line);border-radius:4px;padding:26px 28px;margin-top:30px;font-family:'Playfair Display',serif;font-size:clamp(19px,2.2vw,24px);font-style:italic;color:var(--ink);max-width:760px}
.mlx-twocol{display:grid;grid-template-columns:1fr 1fr;gap:18px 40px;margin-top:36px}
.mlx-ck{display:flex;gap:13px;align-items:flex-start;font-size:16px}
.mlx-ck .t{color:var(--gold);margin-top:2px;font-weight:700}
.mlx-darksec .mlx-ck{color:#e8e4dd}
.mlx-goal{margin-top:34px;font-family:'Playfair Display',serif;font-style:italic;font-size:20px;color:#f0e9dc}
.mlx-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:42px}
.mlx-ecard{border-radius:10px;padding:30px 26px;color:#fff;min-height:200px;display:flex;flex-direction:column}
.mlx-ecard .k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.72;margin-bottom:14px}
.mlx-ecard h3{font-size:23px;color:#fff;font-weight:700;margin-bottom:12px}
.mlx-ecard p{margin:0;font-size:15px;line-height:1.55;opacity:.86}
.mlx-ecard.green{background:var(--green)}.mlx-ecard.teal{background:var(--teal)}.mlx-ecard.clay{background:var(--clay)}
.mlx-phases{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:42px}
.mlx-phase{border:1px solid var(--line);border-radius:10px;padding:24px 22px;border-top:3px solid var(--terra)}
.mlx-phase .w{font-size:13px;font-weight:700;color:var(--terra);margin-bottom:6px}
.mlx-phase h3{font-size:19px;margin-bottom:10px}
.mlx-phase p{margin:0;font-size:14px;line-height:1.55;color:var(--muted)}
.mlx-roles{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.mlx-role{border:1px solid var(--line);background:#fff;border-radius:8px;padding:13px 18px;font-weight:600;font-size:15px}
.mlx-ba{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:40px}
.mlx-ba .c{border:1px solid var(--line);border-radius:8px;padding:30px;background:#fff}
.mlx-ba .lab{font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;margin-bottom:16px}
.mlx-ba .before .lab{color:var(--terra)}.mlx-ba .after .lab{color:#3f7d52}
.mlx-ba ul{margin:0;padding-left:20px}.mlx-ba li{margin-bottom:10px}
.mlx-ohgrid{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;margin-top:40px;align-items:start}
.mlx-incl{border:1px solid var(--lineD);border-radius:10px;padding:28px}
.mlx-incl .p{font-family:'Playfair Display',serif;font-size:30px;font-weight:700;margin:0 0 4px}
.mlx-incl .when{color:#cdbfa4;font-size:14px;margin-bottom:20px}
.mlx-closing{text-align:center;padding:96px 0}
.mlx-closing h2{font-size:clamp(32px,4.4vw,52px);max-width:20ch;margin:0 auto 22px}
.mlx-closing .mlx-lead{max-width:60ch;margin:0 auto 30px;color:var(--muted)}
.mlx-tagline{margin-top:40px;font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(18px,2.2vw,24px)}
.mlx-contact{margin-top:16px;color:var(--muted);font-size:14px}
@media(max-width:820px){.mlx-twocol,.mlx-cards,.mlx-phases,.mlx-ba,.mlx-ohgrid{grid-template-columns:1fr}.mlx-stats{gap:32px}}
`;

const META_CHIPS = ['Online', 'Free Open House', '$149 / month membership', 'Learn with Claude'];
const STATS = [
  { n: '10,000+', l: 'Professionals trained' },
  { n: '$100M+', l: 'In wage impact generated' },
  { n: '100%', l: 'Hands-on, real projects' },
];
const APPROACH = [
  { k: '01 · Learn', title: 'Learn With Claude', desc: 'Use Claude for real work: research, planning, and problem solving. Not just prompts and demos.', cls: 'green' },
  { k: '02 · Build', title: 'Build Through Colaberry', desc: 'Apply what you learn on real, guided projects. You learn by building, applying, and doing.', cls: 'teal' },
  { k: '03 · Deploy', title: 'Deploy In The Real World', desc: 'Put AI to work in your actual workflows, and keep improving every month as the tools evolve.', cls: 'clay' },
];
const OPEN_HOUSE_DATE = 'June 21, 2026 · Live Online';

interface MembershipLandingProps {
  content: PersonaContent;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mlx-eyebrow">{children}</div>;
}

function Checklist({ items }: { items: string[] }) {
  return (
    <div className="mlx-twocol">
      {items.map((i, k) => (
        <div className="mlx-ck" key={k}><span className="t">{'✓'}</span><span>{i}</span></div>
      ))}
    </div>
  );
}

function MembershipLanding({ content }: MembershipLandingProps) {
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const id = 'mlx-fonts';
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id;
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
  }, []);

  const openRegister = (ctaName: string) => {
    trackEvent('cta_click', { cta_name: ctaName, persona: content.slug, page: `/membership/${content.slug}` });
    setShowRegister(true);
  };

  const heroGold = content.hero.body[0];
  const heroLead = content.hero.body.slice(1).join(' ');
  const gap = content.gap;

  return (
    <div className="mlx-root">
      <style>{CSS}</style>
      <SEOHead title={content.seo.title} description={content.seo.description} />

      {/* HERO */}
      <header className="mlx-hero">
        <div className="mlx-wrap">
          <Eyebrow>Colaberry AI Membership &middot; Live Open House</Eyebrow>
          <div className="mlx-gold">{heroGold}</div>
          <h1>{content.hero.headline}</h1>
          {heroLead && <p className="mlx-lead">{heroLead}</p>}
          <div className="mlx-chips" style={{ marginTop: 30 }}>
            {META_CHIPS.map((c, i) => <span className="mlx-chip" key={i}>{c}</span>)}
          </div>
          <div className="mlx-divider" />
          <div className="mlx-stats">
            {STATS.map((s, i) => (
              <div className="mlx-stat" key={i}><div className="n mlx-serif">{s.n}</div><div className="l">{s.l}</div></div>
            ))}
          </div>
          <div className="mlx-herocta">
            <button className="mlx-btn mlx-btn-light" onClick={() => openRegister('open_house_hero')}>{content.hero.cta} {'→'}</button>
            <span className="price">{content.hero.price}</span>
          </div>
        </div>
      </header>

      {/* THE GAP */}
      <section className="mlx-sec">
        <div className="mlx-wrap mlx-narrow">
          <Eyebrow>The Gap</Eyebrow>
          <h2 style={{ marginTop: 16 }}>{gap.title}</h2>
          {gap.list ? (
            <>
              {gap.body.map((p, i) => (
                <p key={i} className={i === 0 ? 'mlx-lead' : 'mlx-muted'} style={{ marginTop: i === 0 ? 22 : 12 }}>{p}</p>
              ))}
              <div className="mlx-roles">
                {gap.list.map((r, i) => <span className="mlx-role" key={i}>{r}</span>)}
              </div>
            </>
          ) : (
            <>
              <p className="mlx-lead" style={{ marginTop: 22 }}>{gap.body[0]}</p>
              {gap.body.slice(1, -1).map((p, i) => <p key={i} className="mlx-muted" style={{ marginTop: 12 }}>{p}</p>)}
              {gap.body.length > 1 && <div className="mlx-callout">{gap.body[gap.body.length - 1]}</div>}
            </>
          )}
        </div>
      </section>

      {/* WHAT YOU'LL LEARN */}
      <section className="mlx-sec mlx-darksec">
        <div className="mlx-wrap">
          <Eyebrow>What You{'’'}ll Learn</Eyebrow>
          <h2 style={{ marginTop: 16, maxWidth: '18ch' }}>{content.learn.title}</h2>
          <p className="mlx-lead" style={{ color: '#d6d0c6', marginTop: 16 }}>{content.learn.intro}</p>
          <Checklist items={content.learn.items} />
          <p className="mlx-goal">{content.learn.goal}</p>
        </div>
      </section>

      {/* THE APPROACH (earthy cards) */}
      <section className="mlx-sec">
        <div className="mlx-wrap">
          <Eyebrow>The Approach</Eyebrow>
          <h2 style={{ marginTop: 16 }}>A path, not a pile of tutorials.</h2>
          <div className="mlx-cards">
            {APPROACH.map((c, i) => (
              <div className={`mlx-ecard ${c.cls}`} key={i}>
                <div className="k">{c.k}</div>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BUILD PATH (builders) or PRACTICE (others) */}
      {content.buildPath ? (
        <section className="mlx-sec mlx-alt">
          <div className="mlx-wrap">
            <Eyebrow>The Program</Eyebrow>
            <h2 style={{ marginTop: 16 }}>{content.buildPath.title}</h2>
            <div className="mlx-phases">
              {content.buildPath.phases.map((p, i) => (
                <div className="mlx-phase" key={i}>
                  <div className="w">{p.weeks}</div>
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : content.practice ? (
        <section className="mlx-sec mlx-alt">
          <div className="mlx-wrap mlx-narrow">
            <Eyebrow>How You{'’'}ll Build</Eyebrow>
            <h2 style={{ marginTop: 16 }}>{content.practice.title}</h2>
            {content.practice.body.map((p, i) => (
              <p key={i} className={i === 0 ? 'mlx-lead' : 'mlx-muted'} style={{ marginTop: i === 0 ? 22 : 12 }}>{p}</p>
            ))}
          </div>
        </section>
      ) : null}

      {/* BUILT FOR */}
      <section className="mlx-sec mlx-alt">
        <div className="mlx-wrap mlx-narrow">
          <Eyebrow>Who It{'’'}s For</Eyebrow>
          <h2 style={{ marginTop: 16 }}>{content.builtFor.title}</h2>
          {content.builtFor.intro && <p className="mlx-muted" style={{ marginTop: 18 }}>{content.builtFor.intro}</p>}
          <div className="mlx-roles">
            {content.builtFor.idealFor.map((r, i) => <span className="mlx-role" key={i}>{r}</span>)}
          </div>
          <p className="mlx-lead" style={{ marginTop: 30 }}>{content.builtFor.closing.join(' ')}</p>
        </div>
      </section>

      {/* TRANSFORMATION */}
      <section className="mlx-sec">
        <div className="mlx-wrap">
          <Eyebrow>The Transformation</Eyebrow>
          <h2 style={{ marginTop: 16 }}>Where you start, and where you land.</h2>
          <div className="mlx-ba">
            <div className="c before">
              <div className="lab">Before</div>
              <ul>{content.transformation.before.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
            <div className="c after">
              <div className="lab">After</div>
              <ul>{content.transformation.after.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* WHY DIFFERENT (optional) */}
      {content.different && (
        <section className="mlx-sec mlx-alt">
          <div className="mlx-wrap mlx-narrow">
            <Eyebrow>Why It{'’'}s Different</Eyebrow>
            <h2 style={{ marginTop: 16 }}>{content.different.title}</h2>
            {content.different.body.map((p, i) => (
              <p key={i} className={i === 0 ? 'mlx-lead' : 'mlx-muted'} style={{ marginTop: i === 0 ? 22 : 12 }}>{p}</p>
            ))}
          </div>
        </section>
      )}

      {/* OPEN HOUSE */}
      <section className="mlx-sec mlx-darksec">
        <div className="mlx-wrap">
          <Eyebrow>The Free Open House</Eyebrow>
          <h2 style={{ marginTop: 16, maxWidth: '20ch' }}>{content.openHouse.title}</h2>
          <p className="mlx-lead" style={{ color: '#d6d0c6', marginTop: 16 }}>{content.openHouse.intro}</p>
          <div className="mlx-ohgrid">
            <Checklist items={content.openHouse.items} />
            <div className="mlx-incl">
              <div className="p">$149<span style={{ fontSize: 16, fontFamily: 'Inter', fontWeight: 500 }}>/month</span></div>
              <div className="when">Next Open House: {OPEN_HOUSE_DATE}</div>
              <button className="mlx-btn mlx-btn-light" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openRegister('open_house_section')}>{content.openHouse.cta} {'→'}</button>
              <p className="mlx-muted" style={{ color: '#a39c90', fontSize: 13, marginTop: 16 }}>Free to attend. No obligation. See the membership in action and meet the team.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="mlx-sec mlx-alt mlx-closing">
        <div className="mlx-wrap">
          <Eyebrow>{content.finalCta.title}</Eyebrow>
          <h2 style={{ marginTop: 18 }}>{content.finalCta.body[0]}</h2>
          {content.finalCta.body.length > 1 && <p className="mlx-lead">{content.finalCta.body.slice(1).join(' ')}</p>}
          <button className="mlx-btn mlx-btn-dark" style={{ padding: '16px 34px', fontSize: 16 }} onClick={() => openRegister('open_house_final')}>{content.hero.cta} {'→'}</button>
          <div className="mlx-tagline">{content.finalCta.tagline}</div>
          <div className="mlx-contact">{content.finalCta.price} &middot; hello@colaberry.com</div>
        </div>
      </section>

      <OpenHouseModal
        show={showRegister}
        onClose={() => setShowRegister(false)}
        personaSlug={content.slug}
        submitLabel={content.openHouse.cta}
      />
    </div>
  );
}

export default MembershipLanding;
