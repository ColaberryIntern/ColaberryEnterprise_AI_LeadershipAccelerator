import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import IndustryDemoGrid from '../components/IndustryDemoGrid';
import { captureUTMFromURL } from '../services/utmService';
import { initTracker, trackEvent } from '../utils/tracker';

const IntelligenceDemoSection = React.lazy(() => import('../components/intelligence-demo/IntelligenceDemoSection'));

// AIArchitectLandingPage — /ai-architect
// REFRAME: this is now a ROLE DOOR into the one class. Data professionals and
// tech leaders enter the same Challenge as everyone else ("Join the Challenge"),
// learn on their own time, ship a real AI build, and climb the leaderboard.
// DS-only, semantic tokens only. Default export + component name preserved.

// CtaButton: the DS Button only forwards href + on* handlers to its host element
// (it drops React Router's `to`), so we route via href + onClick.
interface CtaButtonProps extends Omit<ButtonProps, 'href' | 'onClick'> {
  to: string;
}
function CtaButton({ to, children, onClick, ...rest }: CtaButtonProps & { onClick?: () => void }) {
  const navigate = useNavigate();
  return (
    <Button
      href={to}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        if (onClick) onClick();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}

const CSS = `
.cbaa-root{font-family:var(--font-body);color:var(--text-body);background:var(--surface-page);line-height:var(--lh-relaxed);-webkit-font-smoothing:antialiased}
.cbaa-root *{box-sizing:border-box}
.cbaa-root h1,.cbaa-root h2,.cbaa-root h3,.cbaa-root h4{font-family:var(--font-display);color:var(--text-strong);margin:0;line-height:var(--lh-heading);letter-spacing:var(--ls-tight)}
.cbaa-wrap{max-width:var(--container-lg);margin:0 auto;padding:0 var(--space-6)}
.cbaa-narrow{max-width:var(--container-md)}
.cbaa-eyebrow{font-size:var(--fs-overline);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--brand-accent)}
.cbaa-sec{padding:var(--space-24) 0}
.cbaa-sec-sm{padding:var(--space-16) 0}
.cbaa-alt{background:var(--surface-subtle)}
.cbaa-h2{font-size:var(--fs-h2);font-weight:var(--fw-bold)}
.cbaa-lead{font-size:var(--fs-body-lg);line-height:var(--lh-normal);color:var(--text-muted)}
.cbaa-mt2{margin-top:var(--space-2)}
.cbaa-mt4{margin-top:var(--space-4)}
.cbaa-mt5{margin-top:var(--space-5)}

/* HERO */
.cbaa-hero{background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-24) 0 var(--space-20);position:relative;overflow:hidden}
.cbaa-hero h1{color:var(--text-on-inverse);font-size:var(--fs-hero-fluid);font-weight:var(--fw-black);max-width:18ch}
.cbaa-hero .cbaa-eyebrow{color:var(--red-300)}
.cbaa-hero .cbaa-lead{color:var(--neutral-300);max-width:60ch;margin-top:var(--space-5)}
.cbaa-hero-cta{display:flex;gap:var(--space-4);flex-wrap:wrap;margin-top:var(--space-10)}
.cbaa-hero-meta{font-size:var(--fs-body-sm);color:var(--neutral-400);margin-top:var(--space-5)}

/* STACK GRID */
.cbaa-stack{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-4);margin-top:var(--space-10)}
.cbaa-tile{padding:var(--space-6);text-align:center;height:100%}
.cbaa-tile .ic{font-size:var(--fs-h2);line-height:1}
.cbaa-tile h3{font-size:var(--fs-body-sm);font-weight:var(--fw-bold);margin-top:var(--space-3)}
.cbaa-tile p{font-size:var(--fs-caption);color:var(--text-muted);margin:var(--space-1) 0 0}

/* TWO-COL LISTS */
.cbaa-two{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-6);margin-top:var(--space-10);align-items:start}
.cbaa-list{padding:var(--space-8)}
.cbaa-list h3{font-size:var(--fs-h4)}
.cbaa-list ul{list-style:none;margin:var(--space-5) 0 0;padding:0;display:flex;flex-direction:column;gap:var(--space-3)}
.cbaa-list li{display:flex;gap:var(--space-3);font-size:var(--fs-body-sm);color:var(--text-body)}
.cbaa-list li .mk{flex:none;font-weight:var(--fw-bold)}
.cbaa-list.bad li .mk{color:var(--status-danger)}
.cbaa-list.good li .mk{color:var(--status-success)}

/* COHORT CARD */
.cbaa-cohort{max-width:var(--container-sm);margin:var(--space-10) auto 0}
.cbaa-cohort-body{padding:var(--space-10) var(--space-8);text-align:center}
.cbaa-cohort .date{font-family:var(--font-display);font-weight:var(--fw-black);color:var(--brand-accent);font-size:var(--fs-h2);margin:var(--space-3) 0 var(--space-1)}
.cbaa-cohort .seats{font-size:var(--fs-body-sm);color:var(--text-muted)}
.cbaa-cohort p{color:var(--text-muted);font-size:var(--fs-body-sm);margin:var(--space-6) auto 0;max-width:48ch}

/* CTA SECTION */
.cbaa-cta{background:var(--surface-inverse);color:var(--text-on-inverse);border-radius:var(--radius-xl);padding:var(--space-16);margin:var(--space-10) auto 0;text-align:center}
.cbaa-cta h2{color:var(--text-on-inverse);font-size:var(--fs-h2);max-width:22ch;margin:0 auto}
.cbaa-cta p{color:var(--neutral-300);max-width:54ch;margin:var(--space-4) auto var(--space-8)}
.cbaa-cta-row{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}

/* CLOSING */
.cbaa-closing{text-align:center}
.cbaa-closing h2{font-size:var(--fs-h1);max-width:20ch;margin:0 auto}
.cbaa-closing .cbaa-lead{max-width:54ch;margin:var(--space-5) auto var(--space-8)}
.cbaa-closing-cta{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}

/* STICKY CTA */
.cbaa-sticky{position:fixed;left:0;right:0;bottom:0;z-index:var(--z-sticky);background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-3) var(--space-6);display:flex;align-items:center;justify-content:center;gap:var(--space-4);flex-wrap:wrap;box-shadow:var(--shadow-lg)}
.cbaa-sticky span{font-weight:var(--fw-medium);font-size:var(--fs-body-sm)}

/* DEMO SKELETON */
.cbaa-skel{height:400px;background:var(--surface-subtle);border-radius:var(--radius-lg)}

@media(max-width:900px){.cbaa-two{grid-template-columns:1fr}}
`;

const STACK = [
  { ic: '📋', title: 'Product', desc: 'What to build' },
  { ic: '🎨', title: 'UX', desc: 'How it works for users' },
  { ic: '🧠', title: 'AI Systems', desc: 'How intelligence operates' },
  { ic: '📊', title: 'Data', desc: 'What powers the system' },
  { ic: '🔗', title: 'Integrations', desc: 'How systems connect' },
  { ic: '⚡', title: 'Automation', desc: 'How work gets done' },
  { ic: '🚀', title: 'Deployment', desc: 'How it runs in production' },
];

const PROBLEMS = [
  'You use AI tools, but have never shipped an AI system',
  'No clear path to deploy AI inside your own work',
  'You can prompt, but can’t debug a workflow when it breaks',
  'You’re stuck at the prompt level, not the system level',
];

const OUTCOMES = [
  'A real AI build scoped to your actual work — not a toy demo',
  'A working deployment you can show, not just concepts',
  'A repeatable architecture you can apply to the next problem',
  'Points, a leaderboard rank, and a shot at presenting on Demo Day',
];

function AIArchitectLandingPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const navigate = useNavigate();
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

  const goJoin = () => {
    trackEvent('cta_click', { cta_name: 'join_the_challenge', page: '/ai-architect' });
    navigate('/enroll');
  };

  const openBooking = () => {
    trackEvent('cta_click', { cta_name: 'sponsor_strategy_call', page: '/ai-architect' });
    setShowBooking(true);
  };

  return (
    <div className="cbaa-root">
      <style>{CSS}</style>
      <SEOHead
        title="The AI Builder Door — Join the Challenge"
        description="For data professionals and tech leaders: enter the one Colaberry AI Challenge through the builder door. Ship a real AI system, climb the leaderboard, and present at Demo Day — learning on your own time."
      />

      {/* HERO */}
      <header className="cbaa-hero">
        <div className="cbaa-wrap">
          <div className="cbaa-eyebrow">The Builder Door · For Data &amp; Tech Professionals</div>
          <h1 className="cb-balance cbaa-mt4">Stop using AI tools. Start shipping AI systems.</h1>
          <p className="cbaa-lead">
            This is one class with many doors — and this is yours. Data professionals, engineers, and tech
            leaders enter the same Challenge as everyone else, then go from idea to a real, deployed AI system
            inside their own work. You learn on your own time and climb a public leaderboard as you build.
          </p>
          <div className="cbaa-hero-cta">
            <CtaButton to="/enroll" size="lg" onClick={goJoin} trailingIcon={<span aria-hidden>→</span>}>
              Join the Challenge
            </CtaButton>
            <CtaButton to="/challenge" size="lg" variant="outline">
              How the Challenge Works
            </CtaButton>
          </div>
          <p className="cbaa-hero-meta">Individuals join from $149/month (billed annually; $199/month month-to-month). Employers can sponsor a seat block instead.</p>
        </div>
      </header>

      {/* SYSTEM STACK */}
      <section className="cbaa-sec">
        <div className="cbaa-wrap">
          <div className="cbaa-eyebrow">What You’ll Connect</div>
          <h2 className="cbaa-h2 cbaa-mt2">You already work in part of the stack. The Challenge connects the rest.</h2>
          <p className="cbaa-lead cbaa-mt4 cbaa-narrow">
            Most data and tech professionals already operate in two or three of these areas. The advantage comes
            from understanding how all seven connect into one working system — and that is exactly what you build.
          </p>
          <div className="cbaa-stack">
            {STACK.map((s) => (
              <Card key={s.title} elevation="sm" className="cbaa-tile">
                <div className="ic" aria-hidden>{s.ic}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM / OUTCOME */}
      <section className="cbaa-sec cbaa-alt">
        <div className="cbaa-wrap">
          <div className="cbaa-eyebrow">Why This Door</div>
          <h2 className="cbaa-h2 cbaa-mt2">From tool user to system builder.</h2>
          <div className="cbaa-two">
            <Card elevation="sm" accent="red" className="cbaa-list bad">
              <Badge tone="red" outline>Where most people stall</Badge>
              <h3 className="cbaa-mt4">Using AI the shallow way</h3>
              <ul>
                {PROBLEMS.map((p) => (
                  <li key={p}><span className="mk" aria-hidden>✗</span><span>{p}</span></li>
                ))}
              </ul>
            </Card>
            <Card elevation="sm" accent="green" className="cbaa-list good">
              <Badge tone="green" outline>What you walk away with</Badge>
              <h3 className="cbaa-mt4">Building the real thing</h3>
              <ul>
                {OUTCOMES.map((o) => (
                  <li key={o}><span className="mk" aria-hidden>✓</span><span>{o}</span></li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* INTELLIGENCE DEMO */}
      <Suspense fallback={
        <section className="cbaa-sec-sm">
          <div className="cbaa-wrap cbaa-narrow"><div className="cbaa-skel" /></div>
        </section>
      }>
        <IntelligenceDemoSection onOpenBooking={goJoin} ctaLabel="JOIN THE CHALLENGE" />
      </Suspense>

      {/* COHORT URGENCY */}
      {nextCohort && (
        <section className="cbaa-sec">
          <div className="cbaa-wrap">
            <Card elevation="md" className="cbaa-cohort">
              <div className="cbaa-cohort-body">
                <Badge tone="blue" outline>Next Cohort</Badge>
                <div className="date">
                  {new Date(nextCohort.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="seats">{nextCohort.seats_remaining} seats remaining</div>
                <p>
                  Seats are limited so every builder gets real support. When this cohort fills, enrollment closes
                  and the next start date moves out. If you’re serious about shipping a real AI system, this is
                  your window.
                </p>
                <div className="cbaa-mt5">
                  <CtaButton to="/enroll" size="lg" onClick={goJoin} trailingIcon={<span aria-hidden>→</span>}>
                    Claim a Seat
                  </CtaButton>
                </div>
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* WHO THIS IS FOR + CTA */}
      <section className="cbaa-sec cbaa-alt">
        <div className="cbaa-wrap">
          <div className="cbaa-cta">
            <Badge tone="red" solid>Your Door Into The Challenge</Badge>
            <h2 className="cb-balance cbaa-mt4">If you already work with data, systems, or code — this door is built for you.</h2>
            <p>
              You see AI changing how work gets done, and you’d rather lead that change than follow it. Join the
              Challenge, build on your own time, and let the leaderboard show what you ship. Bringing a whole team?
              Have your employer sponsor a seat block instead.
            </p>
            <div className="cbaa-cta-row">
              <CtaButton to="/enroll" size="lg" tone="red" onClick={goJoin} trailingIcon={<span aria-hidden>→</span>}>
                Join the Challenge
              </CtaButton>
              <Button variant="outline" size="lg" onClick={openBooking}>
                Talk to Us About Sponsoring
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* DEMO BY INDUSTRY */}
      <section className="cbaa-sec-sm">
        <div className="cbaa-wrap cbaa-narrow">
          <div className="cbaa-eyebrow">See What Gets Built</div>
          <h2 className="cbaa-h2 cbaa-mt2">Real builds, by industry.</h2>
          <div className="cbaa-mt5">
            <IndustryDemoGrid trackContext="ai_architect" />
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="cbaa-sec">
        <div className="cbaa-wrap cbaa-closing">
          <div className="cbaa-eyebrow">Pick Your Door</div>
          <h2 className="cb-balance cbaa-mt4">One class. Your door is open.</h2>
          <p className="cbaa-lead">
            Join the Challenge as an individual builder, or have your employer sponsor your team. Either way, you
            end up in the same room — building, ranking, and presenting what you shipped.
          </p>
          <div className="cbaa-closing-cta">
            <CtaButton to="/enroll" size="lg" onClick={goJoin} trailingIcon={<span aria-hidden>→</span>}>
              Join the Challenge
            </CtaButton>
            <CtaButton to="/sponsorship" size="lg" variant="outline">
              Sponsor Your Team
            </CtaButton>
          </div>
        </div>
      </section>

      {/* STICKY CTA */}
      {showStickyCta && (
        <div className="cbaa-sticky">
          <span>One class, many doors — yours is the builder door.</span>
          <CtaButton to="/enroll" tone="red" onClick={goJoin} trailingIcon={<span aria-hidden>→</span>}>
            Join the Challenge
          </CtaButton>
        </div>
      )}

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/ai-architect"
        initialName={prefill.name}
        initialEmail={prefill.email}
        initialCompany={prefill.company}
        initialPhone={prefill.phone}
      />
    </div>
  );
}

export default AIArchitectLandingPage;
