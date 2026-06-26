import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import { Avatar } from '../colaberry/components/core/Avatar';

// DemoDayPage — /demo-day
// DS-only, semantic tokens only. Capstone showcase + season winners.

// CtaButton: the DS Button only forwards href + on* handlers to its host
// element (it drops React Router's `to`), so we route via href + onClick —
// a real anchor for crawlers/focus, client-side nav without a full reload.
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
.cbdd-root{font-family:var(--font-body);color:var(--text-body);background:var(--surface-page);line-height:var(--lh-relaxed);-webkit-font-smoothing:antialiased}
.cbdd-root *{box-sizing:border-box}
.cbdd-root h1,.cbdd-root h2,.cbdd-root h3,.cbdd-root h4{font-family:var(--font-display);color:var(--text-strong);margin:0;line-height:var(--lh-heading);letter-spacing:var(--ls-tight)}
.cbdd-wrap{max-width:var(--container-lg);margin:0 auto;padding:0 var(--space-6)}
.cbdd-narrow{max-width:var(--container-md)}
.cbdd-eyebrow{font-size:var(--fs-overline);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--brand-accent)}
.cbdd-sec{padding:var(--space-24) 0}
.cbdd-sec-sm{padding:var(--space-16) 0}
.cbdd-alt{background:var(--surface-subtle)}
.cbdd-h2{font-size:var(--fs-h2);font-weight:var(--fw-bold)}
.cbdd-lead{font-size:var(--fs-body-lg);line-height:var(--lh-normal);color:var(--text-muted)}
.cbdd-mt2{margin-top:var(--space-2)}
.cbdd-mt4{margin-top:var(--space-4)}

/* HERO */
.cbdd-hero{background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-24) 0 var(--space-20);position:relative;overflow:hidden}
.cbdd-hero-bg{position:absolute;inset:0;z-index:0;background-image:linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 76%, transparent), color-mix(in srgb, var(--surface-inverse) 90%, transparent)), url('/hero/hero-home.jpg');background-size:cover;background-position:center}
.cbdd-hero .cbdd-wrap{position:relative;z-index:1}
.cbdd-hero h1{color:var(--text-on-inverse);font-size:var(--fs-hero-fluid);font-weight:var(--fw-black);max-width:16ch}
.cbdd-hero .cbdd-eyebrow{color:var(--red-300)}
.cbdd-hero .cbdd-lead{color:var(--neutral-300);max-width:58ch;margin-top:var(--space-5)}
.cbdd-hero-cta{display:flex;gap:var(--space-4);flex-wrap:wrap;margin-top:var(--space-10)}
.cbdd-when{display:flex;gap:var(--space-8);flex-wrap:wrap;margin-top:var(--space-12);padding-top:var(--space-8);border-top:var(--border-1) solid var(--border-default)}
.cbdd-when .lab{font-size:var(--fs-caption);text-transform:uppercase;letter-spacing:var(--ls-wide);color:var(--neutral-400)}
.cbdd-when .val{font-family:var(--font-display);font-weight:var(--fw-bold);font-size:var(--fs-h4);color:var(--text-on-inverse);margin-top:var(--space-1)}

/* WINNERS */
.cbdd-winners{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-6);margin-top:var(--space-10);align-items:start}
.cbdd-winner{padding:var(--space-8) var(--space-6);text-align:center}
.cbdd-winner.first{transform:translateY(calc(-1 * var(--space-5)))}
.cbdd-winner .place{font-size:var(--fs-caption);font-weight:var(--fw-bold);letter-spacing:var(--ls-wide);text-transform:uppercase;color:var(--brand-accent)}
.cbdd-winner .medal{font-size:var(--fs-h1);line-height:1;margin:var(--space-3) 0}
.cbdd-winner .av{display:flex;justify-content:center;margin-bottom:var(--space-4)}
.cbdd-winner h3{font-size:var(--fs-h4)}
.cbdd-winner .org{font-size:var(--fs-caption);color:var(--text-muted);margin-top:var(--space-1)}
.cbdd-winner .proj{font-weight:var(--fw-medium);color:var(--text-strong);margin:var(--space-4) 0 var(--space-2)}
.cbdd-winner .desc{font-size:var(--fs-body-sm);color:var(--text-muted);margin:0}
.cbdd-winner .pts{margin-top:var(--space-4)}

/* CAPSTONE SHOWCASE */
.cbdd-caps{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-6);margin-top:var(--space-10)}
.cbdd-cap{display:flex;flex-direction:column;height:100%}
.cbdd-cap-body{padding:var(--space-6);display:flex;flex-direction:column;gap:var(--space-3);flex:1}
.cbdd-cap-tags{display:flex;gap:var(--space-2);flex-wrap:wrap}
.cbdd-cap h3{font-size:var(--fs-h4)}
.cbdd-cap .by{display:flex;align-items:center;gap:var(--space-3);margin-top:auto;padding-top:var(--space-4);border-top:var(--border-1) solid var(--border-subtle)}
.cbdd-cap .by .nm{font-weight:var(--fw-bold);color:var(--text-strong);font-size:var(--fs-body-sm)}
.cbdd-cap .by .og{font-size:var(--fs-caption);color:var(--text-muted)}
.cbdd-cap p{margin:0;color:var(--text-muted);font-size:var(--fs-body-sm)}

/* HOW IT RUNS */
.cbdd-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-5);margin-top:var(--space-10)}
.cbdd-flow-step{padding:var(--space-6);border-top:var(--border-3) solid var(--brand-accent);background:var(--surface-card);border-radius:var(--radius-md);box-shadow:var(--shadow-sm)}
.cbdd-flow-step .n{font-family:var(--font-display);font-weight:var(--fw-black);color:var(--brand-accent);font-size:var(--fs-h4)}
.cbdd-flow-step h4{font-size:var(--fs-h5);margin:var(--space-2) 0}
.cbdd-flow-step p{margin:0;color:var(--text-muted);font-size:var(--fs-body-sm)}

/* JUDGES */
.cbdd-judges{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-5);margin-top:var(--space-10)}
.cbdd-judge{display:flex;gap:var(--space-4);align-items:center;padding:var(--space-5) var(--space-6)}
.cbdd-judge .nm{font-weight:var(--fw-bold);color:var(--text-strong)}
.cbdd-judge .role{font-size:var(--fs-caption);color:var(--text-muted)}

/* SPONSOR STRIP */
.cbdd-spons{background:var(--surface-inverse);color:var(--text-on-inverse);border-radius:var(--radius-xl);padding:var(--space-16);margin-top:var(--space-10);text-align:center}
.cbdd-spons h2{color:var(--text-on-inverse);font-size:var(--fs-h2);max-width:22ch;margin:0 auto}
.cbdd-spons p{color:var(--neutral-300);max-width:56ch;margin:var(--space-4) auto var(--space-8)}

/* CLOSING */
.cbdd-closing{text-align:center}
.cbdd-closing h2{font-size:var(--fs-h1);max-width:20ch;margin:0 auto}
.cbdd-closing .cbdd-lead{max-width:54ch;margin:var(--space-5) auto var(--space-8)}
.cbdd-closing-cta{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}

@media(max-width:900px){
  .cbdd-winners,.cbdd-caps,.cbdd-judges{grid-template-columns:1fr}
  .cbdd-winner.first{transform:none}
  .cbdd-flow{grid-template-columns:1fr 1fr}
}
@media(max-width:560px){.cbdd-flow{grid-template-columns:1fr}}
`;

interface Winner {
  place: string;
  medal: string;
  name: string;
  org: string;
  project: string;
  desc: string;
  points: number;
  cls: string;
}

const WINNERS: Winner[] = [
  {
    place: 'Season 2 Champion', medal: '🥇', name: 'Priya Nandakumar', org: 'Meridian Freight', cls: 'first',
    project: 'LoadMatch Copilot',
    desc: 'A Claude-powered agent that drafts and prices freight load matches from inbound emails, cutting dispatcher triage time by 60%.',
    points: 540,
  },
  {
    place: 'Runner-up', medal: '🥈', name: 'Marcus Bell', org: 'Self-funded', cls: 'second',
    project: 'ClauseScan',
    desc: 'A contract-review assistant that flags risky clauses and explains them in plain English for small-business owners.',
    points: 512,
  },
  {
    place: 'Third Place', medal: '🥉', name: 'Sofia Alvarez', org: 'Northstar Utilities', cls: 'third',
    project: 'OutageSense',
    desc: 'A grid-outage triage tool that clusters customer reports and drafts crew dispatch briefs in seconds.',
    points: 505,
  },
];

interface Capstone {
  title: string;
  tags: { label: string; tone: 'red' | 'green' | 'blue' | 'neutral' }[];
  desc: string;
  by: string;
  org: string;
}

const CAPSTONES: Capstone[] = [
  {
    title: 'OnboardIQ', tags: [{ label: 'HR', tone: 'blue' }, { label: 'Agent', tone: 'red' }],
    desc: 'Turns a messy stack of policy PDFs into an answer-anything onboarding assistant new hires actually use.',
    by: 'Hannah Liu', org: 'Cedar Health Group',
  },
  {
    title: 'ShelfSignal', tags: [{ label: 'Retail', tone: 'green' }, { label: 'Vision', tone: 'neutral' }],
    desc: 'Reads shelf photos and writes restock orders, catching out-of-stocks before the morning rush.',
    by: 'David Okafor', org: 'Self-funded',
  },
  {
    title: 'BriefBot', tags: [{ label: 'Ops', tone: 'blue' }, { label: 'Automation', tone: 'red' }],
    desc: 'Compiles a deterministic daily ops briefing from five data sources, with every claim traced to a source.',
    by: 'Grace Mwangi', org: 'Meridian Freight',
  },
  {
    title: 'CareNote Drafts', tags: [{ label: 'Healthcare', tone: 'green' }, { label: 'NLP', tone: 'neutral' }],
    desc: 'Drafts structured visit notes from clinician voice memos, leaving the human in the loop for sign-off.',
    by: 'Beatriz Santos', org: 'Cedar Health Group',
  },
];

const FLOW = [
  { n: '1', title: 'Submit', desc: 'Silver and Gold builders submit a capstone: a working build, a short writeup, and a 5-minute demo.' },
  { n: '2', title: 'Showcase', desc: 'Each finalist presents live to the room — peers, mentors, and sponsoring employers.' },
  { n: '3', title: 'Judge', desc: 'A panel scores on real-world impact, technical depth, and clarity. Audience votes count too.' },
  { n: '4', title: 'Crown', desc: 'Winners take the season title, bonus points, and a featured spot in the Builders directory.' },
];

const JUDGES = [
  { name: 'Ram Katamaraja', role: 'Founder & CEO, Colaberry' },
  { name: 'Aleem Mawji', role: 'Head of Product' },
  { name: 'Guest: Sponsoring CTO', role: 'Rotating enterprise sponsor seat' },
  { name: 'Alumni Builder Panel', role: 'Past season Gold-tier winners' },
];

function DemoDayPage() {
  return (
    <div className="cbdd-root">
      <style>{CSS}</style>
      <SEOHead
        title="Demo Day"
        description="Where the Colaberry AI Challenge ends: builders present real capstones live, judges crown the season winners, and employers meet the people who actually ship."
      />

      {/* HERO */}
      <header className="cbdd-hero">
        <div className="cbdd-hero-bg" aria-hidden="true" />
        <div className="cbdd-wrap">
          <div className="cbdd-eyebrow">Demo Day</div>
          <h1 className="cb-balance cbdd-mt4">The day builders stop talking about AI and show what they shipped.</h1>
          <p className="cbdd-lead">
            Every season of the Challenge ends on one stage. Top builders present their capstones live, a panel
            crowns the winners, and sponsoring employers meet the people who actually deliver.
          </p>
          <div className="cbdd-hero-cta">
            <CtaButton to="/enroll" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Join the Challenge
            </CtaButton>
            <CtaButton to="/sponsorship" size="lg" variant="outline">
              Sponsor Your Team
            </CtaButton>
          </div>
          <div className="cbdd-when">
            <div><div className="lab">Next Demo Day</div><div className="val">Season 3 Finale</div></div>
            <div><div className="lab">Format</div><div className="val">Live Online</div></div>
            <div><div className="lab">Who presents</div><div className="val">Silver &amp; Gold tier</div></div>
          </div>
        </div>
      </header>

      {/* WINNERS */}
      <section className="cbdd-sec">
        <div className="cbdd-wrap">
          <div className="cbdd-eyebrow">Season 2 Winners</div>
          <h2 className="cbdd-h2 cbdd-mt2">The builders who took the stage and won it.</h2>
          <div className="cbdd-winners">
            {WINNERS.map((w) => (
              <Card key={w.name} elevation={w.cls === 'first' ? 'md' : 'sm'} accent={w.cls === 'first' ? 'red' : undefined} className={`cbdd-winner ${w.cls}`}>
                <div className="place">{w.place}</div>
                <div className="medal" aria-hidden>{w.medal}</div>
                <div className="av"><Avatar name={w.name} size="xl" ring={w.cls === 'first'} /></div>
                <h3>{w.name}</h3>
                <div className="org">{w.org}</div>
                <div className="proj">{w.project}</div>
                <p className="desc">{w.desc}</p>
                <div className="pts"><Badge tone="red" solid={w.cls === 'first'}>{w.points} pts</Badge></div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CAPSTONE SHOWCASE */}
      <section className="cbdd-sec cbdd-alt">
        <div className="cbdd-wrap">
          <div className="cbdd-eyebrow">Capstone Showcase</div>
          <h2 className="cbdd-h2 cbdd-mt2">Real projects, deployed in real workflows.</h2>
          <p className="cbdd-lead cbdd-mt4 cbdd-narrow">
            These are not slide decks. Each capstone is a working build solving a problem its maker actually
            faces at work or in their field.
          </p>
          <div className="cbdd-caps">
            {CAPSTONES.map((c) => (
              <Card key={c.title} elevation="sm" hoverable className="cbdd-cap">
                <div className="cbdd-cap-body">
                  <div className="cbdd-cap-tags">
                    {c.tags.map((t, i) => <Badge key={i} tone={t.tone} outline>{t.label}</Badge>)}
                  </div>
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                  <div className="by">
                    <Avatar name={c.by} size="sm" />
                    <span className="cb-min0">
                      <div className="nm">{c.by}</div>
                      <div className="og">{c.org}</div>
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT RUNS */}
      <section className="cbdd-sec">
        <div className="cbdd-wrap">
          <div className="cbdd-eyebrow">How Demo Day Runs</div>
          <h2 className="cbdd-h2 cbdd-mt2">Four steps from submission to crown.</h2>
          <div className="cbdd-flow">
            {FLOW.map((f) => (
              <div className="cbdd-flow-step" key={f.n}>
                <div className="n">{f.n}</div>
                <h4>{f.title}</h4>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JUDGES */}
      <section className="cbdd-sec cbdd-alt">
        <div className="cbdd-wrap">
          <div className="cbdd-eyebrow">The Panel</div>
          <h2 className="cbdd-h2 cbdd-mt2">Who scores the room.</h2>
          <div className="cbdd-judges">
            {JUDGES.map((j) => (
              <Card key={j.name} elevation="sm" className="cbdd-judge">
                <Avatar name={j.name} size="lg" />
                <span className="cb-min0">
                  <div className="nm">{j.name}</div>
                  <div className="role">{j.role}</div>
                </span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* SPONSOR STRIP */}
      <section className="cbdd-sec-sm">
        <div className="cbdd-wrap">
          <div className="cbdd-spons">
            <Badge solid>For Employers</Badge>
            <h2 className="cbdd-mt4">Demo Day is the best hour of talent discovery you will run all year.</h2>
            <p>
              Watch your sponsored team present real builds, side by side. Find out who your real AI builders are —
              without ever taking anyone off the job. Reassignable seats mean a departure never wastes your spend.
            </p>
            <CtaButton to="/sponsorship" variant="solid" tone="red" trailingIcon={<span aria-hidden>→</span>}>
              Sponsor Your Team
            </CtaButton>
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="cbdd-sec cbdd-closing">
        <div className="cbdd-wrap">
          <div className="cbdd-eyebrow">Your Capstone Starts Now</div>
          <h2 className="cb-balance cbdd-mt4">The next stage is open. Earn your slot.</h2>
          <p className="cbdd-lead">
            Demo Day belongs to the people who built all season. Join the Challenge, climb to Silver, and the
            stage is yours.
          </p>
          <div className="cbdd-closing-cta">
            <CtaButton to="/enroll" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Join the Challenge
            </CtaButton>
            <CtaButton to="/leaderboard" size="lg" variant="outline">
              View the Leaderboard
            </CtaButton>
            <CtaButton to="/challenge" size="lg" variant="ghost">
              How the Challenge works
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DemoDayPage;
