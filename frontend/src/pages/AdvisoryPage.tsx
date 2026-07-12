import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import IndustryDemoGrid from '../components/IndustryDemoGrid';

// AdvisoryPage — /advisory
// REFRAME: dropped the standalone enterprise-retainer pitch. Advisory is now a
// slim note FOR SPONSORS — a light-touch wrap around the one class — that points
// employers to "Sponsor Your Team". DS-only, semantic tokens only.

// CtaButton: the DS Button only forwards href + on* handlers to its host element
// (it drops React Router's `to`), so we route via href + onClick — a real anchor
// for crawlers/focus, client-side nav without a full reload.
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

const CSS = `
.cbadv-root{font-family:var(--font-body);color:var(--text-body);background:var(--surface-page);line-height:var(--lh-relaxed);-webkit-font-smoothing:antialiased}
.cbadv-root *{box-sizing:border-box}
.cbadv-root h1,.cbadv-root h2,.cbadv-root h3,.cbadv-root h4{font-family:var(--font-display);color:var(--text-strong);margin:0;line-height:var(--lh-heading);letter-spacing:var(--ls-tight)}
.cbadv-wrap{max-width:var(--container-lg);margin:0 auto;padding:0 var(--space-6)}
.cbadv-narrow{max-width:var(--container-md)}
.cbadv-eyebrow{font-size:var(--fs-overline);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--brand-accent)}
.cbadv-sec{padding:var(--space-24) 0}
.cbadv-sec-sm{padding:var(--space-16) 0}
.cbadv-alt{background:var(--surface-subtle)}
.cbadv-h2{font-size:var(--fs-h2);font-weight:var(--fw-bold)}
.cbadv-lead{font-size:var(--fs-body-lg);line-height:var(--lh-normal);color:var(--text-muted)}
.cbadv-mt2{margin-top:var(--space-2)}
.cbadv-mt4{margin-top:var(--space-4)}
.cbadv-mt5{margin-top:var(--space-5)}

/* HERO */
.cbadv-hero{background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-24) 0 var(--space-20);position:relative;overflow:hidden}
.cbadv-hero h1{color:var(--text-on-inverse);font-size:var(--fs-hero-fluid);font-weight:var(--fw-black);max-width:18ch}
.cbadv-hero .cbadv-eyebrow{color:var(--red-300)}
.cbadv-hero .cbadv-lead{color:var(--neutral-300);max-width:60ch;margin-top:var(--space-5)}
.cbadv-hero-cta{display:flex;gap:var(--space-4);flex-wrap:wrap;margin-top:var(--space-10)}

/* POSITIONING */
.cbadv-frame{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-6);margin-top:var(--space-10)}
.cbadv-frame-step{padding:var(--space-8) var(--space-6);text-align:center;height:100%}
.cbadv-frame-step .ic{font-size:var(--fs-h1);line-height:1;margin-bottom:var(--space-4)}
.cbadv-frame-step h3{font-size:var(--fs-h5)}
.cbadv-frame-step p{margin:var(--space-2) 0 0;color:var(--text-muted);font-size:var(--fs-body-sm)}

/* SPONSOR ADVISORY NOTE */
.cbadv-note{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-6);margin-top:var(--space-10);align-items:start}
.cbadv-incl{padding:var(--space-8)}
.cbadv-incl h3{font-size:var(--fs-h4)}
.cbadv-incl ul{list-style:none;margin:var(--space-5) 0 0;padding:0;display:flex;flex-direction:column;gap:var(--space-4)}
.cbadv-incl li{display:flex;gap:var(--space-3);font-size:var(--fs-body-sm);color:var(--text-body)}
.cbadv-incl li .ck{color:var(--status-success);font-weight:var(--fw-bold);flex:none}
.cbadv-aside{background:var(--surface-inverse);color:var(--text-on-inverse);border-radius:var(--radius-xl);padding:var(--space-8);display:flex;flex-direction:column;height:100%}
.cbadv-aside h3{color:var(--text-on-inverse);font-size:var(--fs-h4);max-width:20ch}
.cbadv-aside p{color:var(--neutral-300);font-size:var(--fs-body-sm);margin:var(--space-4) 0 var(--space-8)}
.cbadv-aside .cbadv-cta{margin-top:auto;display:flex;gap:var(--space-3);flex-wrap:wrap}

/* INDUSTRIES */
.cbadv-inds{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-4);margin-top:var(--space-10)}
.cbadv-ind{padding:var(--space-6);text-align:center}
.cbadv-ind .ic{font-size:var(--fs-h2);line-height:1}
.cbadv-ind h3{font-size:var(--fs-body-sm);font-weight:var(--fw-medium);margin-top:var(--space-3)}

/* CLOSING */
.cbadv-closing{text-align:center}
.cbadv-closing h2{font-size:var(--fs-h1);max-width:22ch;margin:0 auto}
.cbadv-closing .cbadv-lead{max-width:56ch;margin:var(--space-5) auto var(--space-8)}
.cbadv-closing-cta{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}

@media(max-width:900px){
  .cbadv-frame,.cbadv-note{grid-template-columns:1fr}
  .cbadv-inds{grid-template-columns:1fr 1fr}
}
`;

const FRAME = [
  { ic: '🚪', title: 'One class, two doors', desc: 'Individuals self-serve a membership. Employers sponsor seat blocks. Everyone learns in the same program.' },
  { ic: '🛠️', title: 'They build on the job', desc: 'Your people learn on their own time and ship a real AI build scoped to their actual work — no one leaves their seat.' },
  { ic: '🔭', title: 'You discover talent', desc: 'A company leaderboard and Demo Day surface who your real AI builders are — without taking anyone off the job.' },
];

const SPONSOR_INCLUDES = [
  'A kickoff working session to map your seat block to the teams and problems that matter most',
  'A private company leaderboard so you can see who is building, not just who enrolled',
  'Demo Day seats where your sponsored builders present what they shipped to your leaders',
  'A light-touch check-in cadence — we keep momentum without adding a project to anyone’s plate',
];

const INDUSTRIES = [
  { ic: '💻', name: 'Technology' },
  { ic: '🏦', name: 'Finance & Banking' },
  { ic: '🏥', name: 'Healthcare' },
  { ic: '🏭', name: 'Manufacturing' },
  { ic: '⚡', name: 'Energy & Utilities' },
  { ic: '🛒', name: 'Retail & eCommerce' },
  { ic: '🏛️', name: 'Public Sector' },
  { ic: '🚚', name: 'Logistics' },
];

function AdvisoryPage() {
  return (
    <div className="cbadv-root">
      <style>{CSS}</style>
      <SEOHead
        title="Advisory for Sponsors"
        description="Light-touch advisory wrapped around the Colaberry AI Challenge. Sponsor a seat block, watch your real AI builders surface on a company leaderboard, and meet them at Demo Day — without taking anyone off the job."
      />

      {/* HERO */}
      <header className="cbadv-hero">
        <div className="cbadv-wrap">
          <div className="cbadv-eyebrow">Advisory for Sponsors</div>
          <h1 className="cb-balance cbadv-mt4">Find out who your real AI builders are — without taking anyone off the job.</h1>
          <p className="cbadv-lead">
            We no longer sell a separate enterprise retainer. Advisory is now a light-touch wrap around one
            program: you sponsor seats, your people build on their own time, and you discover the talent already
            inside your organization.
          </p>
          <div className="cbadv-hero-cta">
            <CtaButton to="/sponsorship" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Sponsor Your Team
            </CtaButton>
            <CtaButton to="/challenge" size="lg" variant="outline">
              See How It Works
            </CtaButton>
          </div>
        </div>
      </header>

      {/* POSITIONING */}
      <section className="cbadv-sec">
        <div className="cbadv-wrap">
          <div className="cbadv-eyebrow">The Model</div>
          <h2 className="cbadv-h2 cbadv-mt2">Talent discovery, not another training contract.</h2>
          <p className="cbadv-lead cbadv-mt4 cbadv-narrow">
            The old advisory engagement asked you to staff a project and run a months-long deployment. The new
            model asks for far less and tells you far more: who in your company can actually build with AI.
          </p>
          <div className="cbadv-frame">
            {FRAME.map((f) => (
              <Card key={f.title} elevation="sm" className="cbadv-frame-step">
                <div className="ic" aria-hidden>{f.ic}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* SPONSOR ADVISORY NOTE */}
      <section className="cbadv-sec cbadv-alt">
        <div className="cbadv-wrap">
          <div className="cbadv-eyebrow">What Sponsors Get</div>
          <h2 className="cbadv-h2 cbadv-mt2">A thin layer of advisory, wrapped around the one class.</h2>
          <div className="cbadv-note">
            <Card elevation="sm" className="cbadv-incl">
              <Badge tone="blue" outline>Included with a sponsored seat block</Badge>
              <h3 className="cbadv-mt4">Advisory that earns its keep</h3>
              <ul>
                {SPONSOR_INCLUDES.map((item) => (
                  <li key={item}><span className="ck" aria-hidden>✓</span><span>{item}</span></li>
                ))}
              </ul>
            </Card>
            <div className="cbadv-aside">
              <Badge tone="red" solid>For Employers</Badge>
              <h3 className="cbadv-mt4">Sponsor a seat block and let the leaderboard do the talking.</h3>
              <p>
                You buy annual seats, your employees redeem codes and climb a company leaderboard, and the
                strongest builders present at Demo Day. We stay close enough to keep momentum, light enough that
                no one has to leave their day job.
              </p>
              <div className="cbadv-cta">
                <CtaButton to="/sponsorship" tone="red" trailingIcon={<span aria-hidden>→</span>}>
                  Sponsor Your Team
                </CtaButton>
                <CtaButton to="/leaderboard" variant="ghost" tone="blue">
                  View a Leaderboard
                </CtaButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DEMO */}
      <section className="cbadv-sec-sm">
        <div className="cbadv-wrap cbadv-narrow">
          <div className="cbadv-eyebrow">See It In Action</div>
          <h2 className="cbadv-h2 cbadv-mt2">The kind of build your people will ship.</h2>
          <p className="cbadv-lead cbadv-mt4">
            Every door leads to the same outcome: a working AI build, not a certificate. Explore a few by industry.
          </p>
          <div className="cbadv-mt5">
            <IndustryDemoGrid trackContext="advisory" />
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="cbadv-sec cbadv-alt">
        <div className="cbadv-wrap">
          <div className="cbadv-eyebrow">Who Sponsors</div>
          <h2 className="cbadv-h2 cbadv-mt2">Builders surface in every industry.</h2>
          <div className="cbadv-inds">
            {INDUSTRIES.map((ind) => (
              <Card key={ind.name} elevation="flat" className="cbadv-ind">
                <div className="ic" aria-hidden>{ind.ic}</div>
                <h3>{ind.name}</h3>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="cbadv-sec">
        <div className="cbadv-wrap cbadv-closing">
          <div className="cbadv-eyebrow">Pick Your Door</div>
          <h2 className="cb-balance cbadv-mt4">Sponsor your team, or join the Challenge yourself.</h2>
          <p className="cbadv-lead">
            Employers sponsor seat blocks to discover their AI builders. Individuals join the same class on a
            membership. One program, two doors.
          </p>
          <div className="cbadv-closing-cta">
            <CtaButton to="/sponsorship" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Sponsor Your Team
            </CtaButton>
            <CtaButton to="/enroll" size="lg" variant="outline">
              Join the Challenge
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AdvisoryPage;
