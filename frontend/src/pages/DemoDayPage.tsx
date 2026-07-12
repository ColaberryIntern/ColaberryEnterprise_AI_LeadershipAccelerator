import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import { Avatar } from '../colaberry/components/core/Avatar';
import SectionFigure from '../components/visuals/SectionFigure';
import { StatCounter } from '../components/visuals/charts';

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
.cbdd-when .lab{font-size:var(--fs-caption);text-transform:uppercase;letter-spacing:var(--ls-wide);color:var(--neutral-300)}
.cbdd-when .val{font-family:var(--font-display);font-weight:var(--fw-bold);font-size:var(--fs-h4);color:var(--text-on-inverse);margin-top:var(--space-1)}

/* OUTCOMES STAT ROW */
.cbdd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-5);margin-top:var(--space-10)}

/* FIGURE BAND */
.cbdd-figure{margin-top:var(--space-10)}

/* CREDENTIAL TIE-IN */
.cbdd-cred{display:flex;align-items:center;gap:var(--space-6);flex-wrap:wrap;margin-top:var(--space-8);padding:var(--space-6) var(--space-8);background:var(--surface-card);border:var(--border-1) solid var(--border-subtle);border-left:var(--border-3) solid var(--brand-accent);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)}
.cbdd-cred .seal{font-size:var(--fs-h1);line-height:1;flex:0 0 auto}
.cbdd-cred .ct h3{font-size:var(--fs-h5);margin-bottom:var(--space-1)}
.cbdd-cred .ct p{margin:0;color:var(--text-muted);font-size:var(--fs-body-sm)}

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
.cbdd-cap{display:flex;flex-direction:column;height:100%;overflow:hidden}
.cbdd-cover{position:relative;display:block;width:100%;aspect-ratio:16/9;border-top-left-radius:inherit;border-top-right-radius:inherit;overflow:hidden}
.cbdd-cover svg{display:block;width:100%;height:100%}
.cbdd-cover-chip{position:absolute;top:var(--space-3);left:var(--space-3);display:inline-flex;align-items:center;font-family:var(--font-display);font-size:var(--fs-caption);font-weight:var(--fw-bold);letter-spacing:var(--ls-wide);text-transform:uppercase;color:var(--text-on-inverse);background:color-mix(in srgb, var(--surface-inverse) 55%, transparent);padding:var(--space-1) var(--space-3);border-radius:var(--radius-pill);backdrop-filter:blur(2px)}
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
  .cbdd-flow,.cbdd-stats{grid-template-columns:1fr 1fr}
}
@media(max-width:560px){.cbdd-flow,.cbdd-stats{grid-template-columns:1fr}}
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

// ProjectCover — a self-contained, branded 16:9 cover for each capstone card.
// Reads as a mini product screenshot: a category-keyed gradient behind a faint
// inline-SVG "app UI" wireframe (rounded window, bars, a sparkline). No external
// image files. Color is keyed to the project's primary category so the showcase
// reads like a real portfolio wall.
const COVER_TONES: Record<string, string> = {
  HR: '#367895',          // berry
  Retail: '#FB2832',      // cherry
  Ops: '#5BA63C',         // leaf
  Healthcare: '#E8920C',  // amber
};
const COVER_DEFAULT = '#367895'; // berry

// Deterministically darken a brand hex for the gradient's far stop.
function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

interface ProjectCoverProps {
  title: string;
  category: string;
}

function ProjectCover({ title, category }: ProjectCoverProps) {
  const base = COVER_TONES[category] ?? COVER_DEFAULT;
  const deep = shadeHex(base, 0.62);
  // Unique IDs so multiple covers' gradients/clips never collide.
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const gradId = `cbdd-cover-g-${slug}`;
  const clipId = `cbdd-cover-c-${slug}`;
  return (
    <div className="cbdd-cover" role="img" aria-label={`${title} — ${category} project cover`}>
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={base} />
            <stop offset="100%" stopColor={deep} />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x="40" y="36" width="240" height="108" rx="10" />
          </clipPath>
        </defs>
        {/* gradient field */}
        <rect x="0" y="0" width="320" height="180" fill={`url(#${gradId})`} />
        {/* faint app-window wireframe */}
        <g fill="none" stroke="#ffffff" strokeOpacity="0.5">
          <rect x="40" y="36" width="240" height="108" rx="10" strokeWidth="1.5" />
        </g>
        <g clipPath={`url(#${clipId})`}>
          {/* window title bar */}
          <rect x="40" y="36" width="240" height="20" fill="#ffffff" fillOpacity="0.16" />
          <circle cx="52" cy="46" r="2.6" fill="#ffffff" fillOpacity="0.7" />
          <circle cx="61" cy="46" r="2.6" fill="#ffffff" fillOpacity="0.5" />
          <circle cx="70" cy="46" r="2.6" fill="#ffffff" fillOpacity="0.35" />
          {/* sidebar */}
          <rect x="40" y="56" width="46" height="88" fill="#ffffff" fillOpacity="0.08" />
          <rect x="48" y="66" width="30" height="4" rx="2" fill="#ffffff" fillOpacity="0.35" />
          <rect x="48" y="76" width="22" height="4" rx="2" fill="#ffffff" fillOpacity="0.25" />
          <rect x="48" y="86" width="26" height="4" rx="2" fill="#ffffff" fillOpacity="0.25" />
          {/* stat bars */}
          <rect x="98" y="66" width="74" height="8" rx="3" fill="#ffffff" fillOpacity="0.30" />
          <rect x="98" y="80" width="120" height="6" rx="3" fill="#ffffff" fillOpacity="0.18" />
          <rect x="98" y="92" width="96" height="6" rx="3" fill="#ffffff" fillOpacity="0.18" />
          {/* mini bar chart */}
          <rect x="98" y="124" width="10" height="12" rx="2" fill="#ffffff" fillOpacity="0.32" />
          <rect x="114" y="116" width="10" height="20" rx="2" fill="#ffffff" fillOpacity="0.32" />
          <rect x="130" y="120" width="10" height="16" rx="2" fill="#ffffff" fillOpacity="0.32" />
          <rect x="146" y="110" width="10" height="26" rx="2" fill="#ffffff" fillOpacity="0.32" />
          {/* sparkline */}
          <polyline
            points="178,128 196,118 210,124 226,108 244,114 262,100"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.85"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="262" cy="100" r="3" fill="#ffffff" fillOpacity="0.9" />
        </g>
      </svg>
      <span className="cbdd-cover-chip">{category}</span>
    </div>
  );
}

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

interface Outcome {
  value: string;
  label: string;
  accent?: string;
}

// Demo Day outcomes — what crossing the stage actually produces.
const OUTCOMES: Outcome[] = [
  { value: '38', label: 'Capstones shipped on stage last season' },
  { value: '100%', label: 'Finalists built hands-on with Claude Code', accent: 'var(--chart-1)' },
  { value: '14', label: 'Builds deployed into a real employer workflow', accent: 'var(--chart-3)' },
  { value: '9', label: 'Sponsoring employers in the judging room', accent: 'var(--chart-4)' },
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

          {/* CREDENTIAL TIE-IN — what every finalist walks away holding */}
          <div className="cbdd-cred">
            <div className="seal" aria-hidden>🏅</div>
            <div className="ct">
              <h3>Every finalist earns the Certified Anthropic AI Systems Architect path.</h3>
              <p>
                Crossing the Demo Day stage is the capstone of the 12-week program. Winners and finalists
                graduate as Certified Anthropic AI Systems Architects (CCA-F prep) — proof they can design and
                ship production AI in Anthropic-partner hands, not just talk about it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* OUTCOMES + FIGURE */}
      <section className="cbdd-sec cbdd-alt">
        <div className="cbdd-wrap">
          <div className="cbdd-eyebrow">Demo Day By The Numbers</div>
          <h2 className="cbdd-h2 cbdd-mt2">One stage. Real builds. Measurable outcomes.</h2>
          <div className="cbdd-stats">
            {OUTCOMES.map((o) => (
              <StatCounter key={o.label} value={o.value} label={o.label} accent={o.accent} />
            ))}
          </div>

          <div className="cbdd-figure">
            <SectionFigure
              src="/img/presentation.jpg"
              alt="A Colaberry builder presenting their AI capstone live on Demo Day to a room of peers, mentors, and sponsoring employers."
              eyebrow="On The Stage"
              title="Five minutes to show what you shipped."
              body={[
                'Each finalist gets the room: peers, mentors, and the sponsoring employers who funded their seat. No slideware — a working build, a live demo, and the story of the real problem it solves.',
                'It is the moment the 12-week program pays off. The people who present here trained hands-on with Claude Code and graduate on the Certified Anthropic AI Systems Architect path.',
              ]}
              caption="Season 2 finals — capstone presentations, live online."
              side="right"
              cta={{ label: 'Join the Challenge', to: '/enroll' }}
            />
          </div>
        </div>
      </section>

      {/* CAPSTONE SHOWCASE */}
      <section className="cbdd-sec">
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
                <ProjectCover title={c.title} category={c.tags[0].label} />
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
      <section className="cbdd-sec cbdd-alt">
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
      <section className="cbdd-sec">
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
