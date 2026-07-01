import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import MermaidDiagram from '../components/visuals/MermaidDiagram';
import CohortUrgency from '../components/visuals/CohortUrgency';
import SectionFigure from '../components/visuals/SectionFigure';
import { StatCounter } from '../components/visuals/charts';

// CtaButton: the DS Button only forwards href + on* handlers to its host
// element (it drops React Router's `to` prop), so we wire SPA navigation
// through href + onClick. href keeps it a real, crawlable, focusable anchor;
// onClick does client-side routing without a full reload.
interface CtaButtonProps extends Omit<ButtonProps, 'href' | 'onClick'> {
  to: string;
}
function CtaButton({ to, children, ...rest }: CtaButtonProps) {
  const navigate = useNavigate();
  return (
    <Button
      href={to}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}

// SponsorChallengePage — /challenge
// Built on the Colaberry Design System. SEMANTIC TOKENS ONLY (no raw hex);
// corporate colors get swapped later by re-pointing tokens. Page-specific
// layout lives in a single <style> block scoped under .cbc-root so it never
// leaks into the rest of the public site (PublicLayout supplies nav/footer).

const CSS = `
.cbc-root{font-family:var(--font-body);color:var(--text-body);background:var(--surface-page);line-height:var(--lh-relaxed);-webkit-font-smoothing:antialiased}
.cbc-root *{box-sizing:border-box}
.cbc-root h1,.cbc-root h2,.cbc-root h3,.cbc-root h4{font-family:var(--font-display);color:var(--text-strong);margin:0;line-height:var(--lh-heading);letter-spacing:var(--ls-tight)}
.cbc-wrap{max-width:var(--container-lg);margin:0 auto;padding:0 var(--space-6)}
.cbc-narrow{max-width:var(--container-md)}
.cbc-eyebrow{font-size:var(--fs-overline);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--brand-accent)}
.cbc-sec{padding:var(--space-24) 0}
.cbc-sec-sm{padding:var(--space-16) 0}
.cbc-alt{background:var(--surface-subtle)}
.cbc-lead{font-size:var(--fs-body-lg);line-height:var(--lh-normal);color:var(--text-muted)}
.cbc-h2{font-size:var(--fs-h2);font-weight:var(--fw-bold)}
.cbc-mt2{margin-top:var(--space-2)}
.cbc-mt4{margin-top:var(--space-4)}
.cbc-mt6{margin-top:var(--space-6)}
.cbc-mt10{margin-top:var(--space-10)}

/* HERO */
.cbc-hero{background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-24) 0 var(--space-20);position:relative;overflow:hidden}
.cbc-hero-bg{position:absolute;inset:0;z-index:0;background-image:linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 76%, transparent), color-mix(in srgb, var(--surface-inverse) 90%, transparent)), url('/hero/hero-ai.jpg');background-size:cover;background-position:center}
.cbc-hero .cbc-wrap{position:relative;z-index:1}
.cbc-hero h1{color:var(--text-on-inverse);font-size:var(--fs-hero-fluid);font-weight:var(--fw-black);max-width:16ch}
.cbc-hero .cbc-eyebrow{color:var(--text-on-inverse)}
.cbc-hero .cbc-lead{color:var(--text-on-inverse);opacity:.92;max-width:60ch;margin-top:var(--space-5)}
.cbc-hero-cta{display:flex;gap:var(--space-4);flex-wrap:wrap;margin-top:var(--space-10)}
.cbc-hero-stats{display:flex;gap:var(--space-12);flex-wrap:wrap;margin-top:var(--space-16);padding-top:var(--space-10);border-top:var(--border-1) solid color-mix(in srgb, var(--text-on-inverse) 28%, transparent)}
.cbc-stat .n{font-family:var(--font-display);font-size:var(--fs-h2);font-weight:var(--fw-black);color:var(--text-on-inverse)}
.cbc-stat .l{font-size:var(--fs-caption);color:var(--text-on-inverse);opacity:.78;letter-spacing:var(--ls-wide);text-transform:uppercase;margin-top:var(--space-1)}

/* DOORS */
.cbc-doors{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6);margin-top:var(--space-10)}
.cbc-door{padding:var(--space-8)}
.cbc-door h3{font-size:var(--fs-h3);margin-top:var(--space-3)}
.cbc-door p{color:var(--text-muted);margin:var(--space-3) 0 var(--space-6)}

/* STEP / MECHANICS GRID */
.cbc-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-6);margin-top:var(--space-10)}
.cbc-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-5);margin-top:var(--space-10)}
.cbc-step{padding:var(--space-6);height:100%}
.cbc-step .k{font-family:var(--font-display);font-size:var(--fs-h4);font-weight:var(--fw-black);color:var(--brand-accent)}
.cbc-step h4{font-size:var(--fs-h5);margin:var(--space-3) 0 var(--space-2)}
.cbc-step p{margin:0;color:var(--text-muted);font-size:var(--fs-body-sm)}

/* SCORING */
.cbc-score{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-5);margin-top:var(--space-10)}
.cbc-score-row{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-4);padding:var(--space-5) var(--space-6);background:var(--surface-card);border:var(--border-1) solid var(--border-subtle);border-radius:var(--radius-md)}
.cbc-score-row .pts{font-family:var(--font-display);font-weight:var(--fw-black);font-size:var(--fs-h4);color:var(--brand-accent);white-space:nowrap}
.cbc-score-row .lbl{font-weight:var(--fw-medium);color:var(--text-strong)}
.cbc-score-row .sub{display:block;font-size:var(--fs-caption);color:var(--text-muted);font-weight:var(--fw-regular);margin-top:var(--space-1)}

/* TIERS */
.cbc-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-6);margin-top:var(--space-10)}
.cbc-tier{padding:var(--space-8);text-align:center;position:relative}
.cbc-tier .medal{width:var(--space-16);height:var(--space-16);border-radius:var(--radius-circle);margin:0 auto var(--space-4);display:flex;align-items:center;justify-content:center;font-size:var(--fs-h3)}
.cbc-tier.bronze .medal{background:color-mix(in srgb, var(--amber-500) 18%, var(--surface-card));color:var(--amber-500)}
.cbc-tier.silver .medal{background:var(--surface-sunken);color:var(--text-muted)}
.cbc-tier.gold .medal{background:var(--surface-brand-subtle);color:var(--brand-accent)}
.cbc-tier h3{font-size:var(--fs-h3)}
.cbc-tier .req{font-size:var(--fs-caption);color:var(--text-muted);text-transform:uppercase;letter-spacing:var(--ls-wide);margin-top:var(--space-2)}
.cbc-tier ul{list-style:none;padding:0;margin:var(--space-5) 0 0;text-align:left}
.cbc-tier li{display:flex;gap:var(--space-2);padding:var(--space-2) 0;font-size:var(--fs-body-sm);color:var(--text-body);border-top:var(--border-1) solid var(--border-subtle)}
.cbc-tier li .c{color:var(--status-success);font-weight:var(--fw-bold)}

/* SEASONS TIMELINE */
.cbc-season{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-5);margin-top:var(--space-10);counter-reset:wk}
.cbc-week{padding:var(--space-6);border-top:var(--border-3) solid var(--brand-accent);background:var(--surface-card);border-radius:var(--radius-md);box-shadow:var(--shadow-sm)}
.cbc-week .w{font-size:var(--fs-caption);font-weight:var(--fw-bold);color:var(--brand-accent);letter-spacing:var(--ls-wide);text-transform:uppercase}
.cbc-week h4{font-size:var(--fs-h5);margin:var(--space-2) 0}
.cbc-week p{margin:0;color:var(--text-muted);font-size:var(--fs-body-sm)}

/* DEMO DAY BANNER */
.cbc-demo{background:var(--surface-inverse);color:var(--text-on-inverse);border-radius:var(--radius-xl);padding:var(--space-16);text-align:center;margin-top:var(--space-10)}
.cbc-demo h2{color:var(--text-on-inverse);font-size:var(--fs-h2)}
.cbc-demo p{color:var(--neutral-300);max-width:56ch;margin:var(--space-4) auto var(--space-8)}

/* FLOW DIAGRAM + STAT TILES */
.cbc-flow{margin-top:var(--space-10)}
.cbc-stat-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-5);margin-top:var(--space-10)}
.cbc-urgency{margin-top:var(--space-12)}

/* CLOSING */
.cbc-closing{text-align:center}
.cbc-closing h2{font-size:var(--fs-h1);max-width:20ch;margin:0 auto}
.cbc-closing .cbc-lead{max-width:56ch;margin:var(--space-5) auto var(--space-8)}
.cbc-closing-cta{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}
.cbc-tagline{margin-top:var(--space-10);font-family:var(--font-display);font-weight:var(--fw-medium);color:var(--text-muted);font-style:italic}

@media(max-width:900px){
  .cbc-doors,.cbc-score,.cbc-tiers{grid-template-columns:1fr}
  .cbc-grid3,.cbc-grid4,.cbc-season,.cbc-stat-tiles{grid-template-columns:1fr 1fr}
  .cbc-hero-stats{gap:var(--space-8)}
}
@media(max-width:560px){
  .cbc-grid3,.cbc-grid4,.cbc-season,.cbc-stat-tiles{grid-template-columns:1fr}
}
`;

interface Step {
  k: string;
  title: string;
  desc: string;
}

const HOW_IT_WORKS: Step[] = [
  { k: '01', title: 'Get in through a door', desc: 'Join as an individual on a $149/mo membership, or redeem a seat code your employer sponsored. Same class either way.' },
  { k: '02', title: 'Learn with Claude, build for real', desc: 'Work real projects on your own time. Every shipped build, review, and demo earns points toward your tier.' },
  { k: '03', title: 'Climb the leaderboard', desc: 'Points roll up to a public leaderboard and a private, company-scoped board your sponsor can see.' },
  { k: '04', title: 'Present at Demo Day', desc: 'Top builders each season showcase their capstone live. Winners are crowned and seats are reassigned for the next run.' },
];

const SCORING = [
  { pts: '+50', lbl: 'Ship a build', sub: 'A working project deployed and reviewed' },
  { pts: '+30', lbl: 'Pass a milestone review', sub: 'Mentor sign-off on a build checkpoint' },
  { pts: '+20', lbl: 'Help another builder', sub: 'Reviewed PR or answered a peer in the cohort' },
  { pts: '+15', lbl: 'Weekly streak', sub: 'Meaningful progress logged every week' },
  { pts: '+40', lbl: 'Demo Day submission', sub: 'A capstone accepted for showcase' },
  { pts: '+100', lbl: 'Season win', sub: 'Judged top capstone of the season' },
];

interface Tier {
  cls: string;
  medal: string;
  name: string;
  req: string;
  perks: string[];
}

const TIERS: Tier[] = [
  {
    cls: 'bronze', medal: '🥉', name: 'Bronze', req: '0 – 199 pts',
    perks: ['You are building, on the board, and visible', 'Access to every project track and template', 'Cohort channel + weekly office hours'],
  },
  {
    cls: 'silver', medal: '🥈', name: 'Silver', req: '200 – 499 pts',
    perks: ['Everything in Bronze', 'Priority mentor reviews on your builds', 'Eligible to submit a Demo Day capstone', 'Verified Silver Builder badge on your profile'],
  },
  {
    cls: 'gold', medal: '🥇', name: 'Gold', req: '500+ pts',
    perks: ['Everything in Silver', 'Guaranteed Demo Day showcase slot', 'Featured in the public Builders directory', 'Considered first for sponsored hiring intros'],
  },
];

// The Challenge as a single visual flow: how a builder moves from the door to
// the Certified Anthropic AI Systems Architect credential.
const CHALLENGE_FLOW = `flowchart LR
  A([Join / Redeem a seat]) --> B[Build with Claude]
  B --> C{{Climb the leaderboard}}
  C --> D[Demo Day]
  D --> E([Certified Anthropic<br/>AI Systems Architect])
  B -.points.-> C
  C -.top builders.-> D`;

const SEASON = [
  { w: 'Weeks 1–2', title: 'Onboard & ship #1', desc: 'Set up your environment with Claude and ship a first small build to get on the board.' },
  { w: 'Weeks 3–6', title: 'Build the core', desc: 'Take on a real project track. Milestone reviews bank steady points.' },
  { w: 'Weeks 7–10', title: 'Capstone', desc: 'Scope and build the project you will defend at Demo Day. Polish for review.' },
  { w: 'Weeks 11–12', title: 'Demo Day', desc: 'Present live, climb the final leaderboard, and earn your tier badge.' },
];

function SponsorChallengePage() {
  return (
    <div className="cbc-root">
      <style>{CSS}</style>
      <SEOHead
        title="The Challenge"
        description="One class, two doors. Learn with Claude, build through Colaberry, and climb the leaderboard. Bronze, Silver, Gold tiers, seasonal play, and a live Demo Day."
      />

      {/* HERO */}
      <header className="cbc-hero">
        <div className="cbc-hero-bg" aria-hidden="true" />
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">The Colaberry AI Challenge</div>
          <h1 className="cb-balance cbc-mt4">Most people consume AI. Very few learn to build with it.</h1>
          <p className="cbc-lead">
            The Challenge turns the cohort into a game with real stakes: ship real projects, earn points,
            climb the leaderboard, and present your capstone at Demo Day. Learn With Claude. Build Through
            Colaberry. Deploy In The Real World.
          </p>
          <div className="cbc-hero-cta">
            <CtaButton to="/enroll" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Join the Challenge
            </CtaButton>
            <CtaButton to="/sponsorship" size="lg" variant="outline">
              Sponsor Your Team
            </CtaButton>
          </div>
          <div className="cbc-hero-stats">
            <div className="cbc-stat"><div className="n">12 wks</div><div className="l">Per season</div></div>
            <div className="cbc-stat"><div className="n">3 tiers</div><div className="l">Bronze · Silver · Gold</div></div>
            <div className="cbc-stat"><div className="n">1 stage</div><div className="l">Live Demo Day</div></div>
            <div className="cbc-stat"><div className="n">100%</div><div className="l">Real, shipped projects</div></div>
          </div>
        </div>
      </header>

      {/* TWO DOORS */}
      <section className="cbc-sec">
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">One Class, Two Doors</div>
          <h2 className="cbc-h2 cbc-mt2">Same program. Two ways in.</h2>
          <p className="cbc-lead cbc-mt4 cbc-narrow">
            There is one Challenge. You enter it as an individual or as part of a team your employer sponsors.
            From there, everyone competes on the same field.
          </p>
          <div className="cbc-doors">
            <Card accent="red" elevation="md" className="cbc-door">
              <Badge solid>Door A — Individuals</Badge>
              <h3>Join on your own</h3>
              <p>
                Self-serve a $149/month membership and start building this week. Pick a track, ship your first
                project, and get on the public leaderboard. Cancel anytime.
              </p>
              <CtaButton to="/enroll" tone="red" trailingIcon={<span aria-hidden>→</span>}>
                Join the Challenge
              </CtaButton>
            </Card>
            <Card accent="blue" elevation="md" className="cbc-door">
              <Badge tone="blue">Door B — Employers</Badge>
              <h3>Sponsor your team</h3>
              <p>
                Buy annual seats and hand out redemption codes. Your people learn on their own time, climb a
                company-scoped leaderboard, and present at Demo Day. Seats are reassignable, so turnover never
                wastes a seat.
              </p>
              <CtaButton to="/sponsorship" variant="outline" tone="blue" trailingIcon={<span aria-hidden>→</span>}>
                Sponsor Your Team
              </CtaButton>
            </Card>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="cbc-sec cbc-alt">
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">How It Works</div>
          <h2 className="cbc-h2 cbc-mt2">From sign-up to the stage in four moves.</h2>
          <div className="cbc-grid4">
            {HOW_IT_WORKS.map((s) => (
              <Card key={s.k} elevation="sm" className="cbc-step">
                <div className="k">{s.k}</div>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* THE FLOW + STAT TILES */}
      <section className="cbc-sec">
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">The Challenge Flow</div>
          <h2 className="cbc-h2 cbc-mt2">One path. From your first build to a recognized credential.</h2>
          <p className="cbc-lead cbc-mt4 cbc-narrow">
            Join or redeem a seat, build hands-on with Claude Code, climb the leaderboard, and present at Demo
            Day. Finish the 12-week program and you walk away a <strong>Certified Anthropic AI Systems
            Architect</strong> (CCA-F prep) — trained in Anthropic-partner hands.
          </p>
          <div className="cbc-flow">
            <MermaidDiagram
              chart={CHALLENGE_FLOW}
              caption="The Challenge flow: Join/Redeem → Build with Claude → Leaderboard → Demo Day → Certified Anthropic AI Systems Architect."
            />
          </div>
          <div className="cbc-stat-tiles">
            <StatCounter value="12 wks" label="One continuous program, four phases" />
            <StatCounter value="100%" label="Hands-on building with Claude Code" />
            <StatCounter value="1 stage" label="Live Demo Day capstone showcase" />
            <StatCounter value="CCA-F" label="Certified Anthropic AI Systems Architect prep" />
          </div>
        </div>
      </section>

      {/* SCORING */}
      <section className="cbc-sec cbc-alt">
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">Scoring</div>
          <h2 className="cbc-h2 cbc-mt2">Points reward building, not watching.</h2>
          <p className="cbc-lead cbc-mt4 cbc-narrow">
            You earn points for the things that actually make you a builder: shipping, passing reviews, helping
            peers, and showing up week after week. No points for clicking play on a video.
          </p>
          <div className="cbc-score">
            {SCORING.map((s) => (
              <div className="cbc-score-row" key={s.lbl}>
                <div>
                  <div className="lbl">{s.lbl}</div>
                  <span className="sub">{s.sub}</span>
                </div>
                <div className="pts">{s.pts}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section className="cbc-sec">
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">Tiers</div>
          <h2 className="cbc-h2 cbc-mt2">Bronze, Silver, Gold.</h2>
          <p className="cbc-lead cbc-mt4 cbc-narrow">
            Your tier is a public, verifiable signal of how much you have actually built. It climbs with your
            points and resets ambition every season.
          </p>
          <div className="cbc-tiers">
            {TIERS.map((t) => (
              <Card key={t.name} elevation={t.cls === 'gold' ? 'md' : 'sm'} accent={t.cls === 'gold' ? 'red' : undefined} className={`cbc-tier ${t.cls}`}>
                <div className="medal" aria-hidden>{t.medal}</div>
                <h3>{t.name}</h3>
                <div className="req">{t.req}</div>
                <ul>
                  {t.perks.map((p, i) => (
                    <li key={i}><span className="c" aria-hidden>✓</span><span className="cb-min0">{p}</span></li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* SEASONS */}
      <section className="cbc-sec cbc-alt">
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">Seasons</div>
          <h2 className="cbc-h2 cbc-mt2">A 12-week arc, run on repeat.</h2>
          <p className="cbc-lead cbc-mt4 cbc-narrow">
            Each season is a fresh leaderboard with a clean slate. Miss one? The next one starts soon, and your
            tier badges carry forward.
          </p>
          <div className="cbc-season">
            {SEASON.map((w) => (
              <div className="cbc-week" key={w.w}>
                <div className="w">{w.w}</div>
                <h4>{w.title}</h4>
                <p>{w.desc}</p>
              </div>
            ))}
          </div>
          <div className="cbc-urgency">
            <CohortUrgency />
          </div>
        </div>
      </section>

      {/* THE OUTCOME — figure */}
      <section className="cbc-sec">
        <div className="cbc-wrap">
          <SectionFigure
            src="/img/workshop.jpg"
            alt="Builders working hands-on with Claude Code in a Colaberry workshop session."
            eyebrow="The Outcome"
            title="You don't finish with a certificate. You finish as a builder."
            body={[
              'Every points-earning move on the leaderboard is a real, shipped project built hands-on with Claude Code — reviewed by mentors, defended at Demo Day. This is what it means to put your people in Anthropic-partner hands.',
              'Complete the 12 weeks and you earn the Certified Anthropic AI Systems Architect credential (CCA-F prep): proof you can architect and deploy AI in the real world, not just talk about it.',
            ]}
            caption="Most people consume AI. Very few learn to build with it."
            side="right"
            cta={{ label: 'Join the Challenge', to: '/enroll' }}
          />
        </div>
      </section>

      {/* DEMO DAY BANNER */}
      <section className="cbc-sec-sm">
        <div className="cbc-wrap">
          <div className="cbc-demo">
            <Badge solid>The Finish Line</Badge>
            <h2 className="cbc-mt4">Demo Day is where it counts.</h2>
            <p>
              Every season ends on one stage. The top builders present their capstones live to peers, mentors,
              and sponsoring employers. It is the difference between saying you learned AI and showing what you
              built with it.
            </p>
            <CtaButton to="/demo-day" variant="solid" tone="red" trailingIcon={<span aria-hidden>→</span>}>
              See Demo Day
            </CtaButton>
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="cbc-sec cbc-alt cbc-closing">
        <div className="cbc-wrap">
          <div className="cbc-eyebrow">Ready When You Are</div>
          <h2 className="cb-balance cbc-mt4">Pick your door and start building.</h2>
          <p className="cbc-lead">
            Individuals start this week. Employers turn the Challenge into talent discovery: find out who your
            real AI builders are, without taking anyone off the job.
          </p>
          <div className="cbc-closing-cta">
            <CtaButton to="/enroll" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Join the Challenge
            </CtaButton>
            <CtaButton to="/sponsorship" size="lg" variant="outline">
              Sponsor Your Team
            </CtaButton>
            <CtaButton to="/leaderboard" size="lg" variant="ghost">
              View the Leaderboard
            </CtaButton>
          </div>
          <div className="cbc-tagline">Learn With Claude. Build Through Colaberry. Deploy In The Real World.</div>
        </div>
      </section>
    </div>
  );
}

export default SponsorChallengePage;
