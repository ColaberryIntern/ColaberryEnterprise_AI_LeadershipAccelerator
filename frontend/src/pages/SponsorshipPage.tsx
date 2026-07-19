import React, { useState } from 'react';
import SEOHead from '../components/SEOHead';
import LeadCaptureForm from '../components/LeadCaptureForm';
import { Button } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import PartnerStrip from '../components/visuals/PartnerStrip';
import MaturityJourney from '../components/visuals/MaturityJourney';
import CompanyMomentumDashboard from '../components/capability/CompanyMomentumDashboard';
import CapabilityIndex from '../components/capability/CapabilityIndex';
import EcosystemPillars from '../components/capability/EcosystemPillars';
import EcosystemTimeline from '../components/capability/EcosystemTimeline';
import ArchitectNetwork from '../components/capability/ArchitectNetwork';
import StrategyCallModal from '../components/StrategyCallModal';
import OpenHouseModal from '../components/membership/OpenHouseModal';

/* ------------------------------------------------------------------ *
 * Roll it out to your organization: the org-rollout page for
 * enterprise.colaberry.ai. Single persona (a decision-maker who is also
 * the learner), reached AFTER they have tried the platform free. The
 * framing is "you tried it yourself, now bring it to your team."
 *
 * The value prop is a durable, measurable AI capability across your
 * workforce: self-paced learning, certification, real projects, a
 * network of AI Architects, weekly live events, and ONE live dashboard
 * leadership watches. Training is one part of the platform. Hero primary
 * CTA is "Start free" -> /try; the lead form, pricing tiers, and modals
 * all stay for when they are ready to roll it out.
 *
 * Design idiom mirrors HomePage: Colaberry DS components + semantic
 * tokens only (never raw hex), alternating page/sunken surfaces, so a
 * re-pointed brand palette flows through automatically.
 * ------------------------------------------------------------------ */

/** Single-persona destination: start a free account (learner + org view). */
const TRY_PATH = '/try';

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-h2)',
  lineHeight: 'var(--lh-heading)', letterSpacing: 'var(--ls-tight)', color: 'var(--text-strong)',
  margin: '0 0 var(--space-4)',
};
const leadStyle: React.CSSProperties = {
  fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0,
};
const cardTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h5)',
  lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', margin: '0 0 var(--space-2)',
};
const cardBodyStyle: React.CSSProperties = {
  fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0,
};
const iconTileStyle: React.CSSProperties = {
  display: 'grid', placeItems: 'center', width: 48, height: 48,
  borderRadius: 'var(--radius-md)', background: 'var(--surface-brand-subtle)',
  color: 'var(--brand-accent)', fontSize: 22, marginBottom: 'var(--space-4)',
};

type Tone = 'neutral' | 'red' | 'green' | 'blue' | 'warning';

/** Centered section header: eyebrow badge, balanced h2, lead paragraph. */
function SectionHead({ badge, tone, title, lead }: { badge: string; tone: Tone; title: string; lead: string }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
      <Badge tone={tone} style={{ marginBottom: 'var(--space-4)' }}>{badge}</Badge>
      <h2 className="cb-balance" style={h2Style}>{title}</h2>
      <p style={leadStyle}>{lead}</p>
    </div>
  );
}

interface Feature { icon: string; title: string; body: string; }

const PROBLEMS: Feature[] = [
  {
    icon: '\u{1F575}\u{FE0F}',
    title: 'Tools, not capability',
    body: 'You bought the licenses and adoption looks fine. But usage is not capability, and a seat count cannot tell you who can actually build.',
  },
  {
    icon: '\u{1F3AF}',
    title: 'The loudest are not the best',
    body: 'The people who talk about AI in meetings are rarely the ones quietly shipping it. Real builders are invisible on your org chart.',
  },
  {
    icon: '\u{1F4B8}',
    title: 'Hiring blind is expensive',
    body: 'So you hire externally at a premium, hoping for a builder, while the person who could have done it sits two desks away, undiscovered.',
  },
];

interface Step { n: string; title: string; body: string; }

const HOW_IT_WORKS: Step[] = [
  {
    n: '01',
    title: 'Give reassignable seats',
    body: 'Buy a block of annual seats and hand access to whoever you choose. Seats reassign across the org all year, so the capability stays with the company, not one person.',
  },
  {
    n: '02',
    title: 'They learn on their own time',
    body: 'Self-paced paths anyone can start any day, plus optional weekly live events and office hours. Nobody comes off the job. No backfill, no lost output.',
  },
  {
    n: '03',
    title: 'They build on your workflows',
    body: 'Every path ends in a real, deployed build on your own processes and data, guided hands-on in Anthropic-partner training. Working systems, not slideware.',
  },
  {
    n: '04',
    title: 'You watch one live dashboard',
    body: 'A company-scoped view ranks your people by what they ship and shows who is advancing from Aware to Builder to Architect, in real time.',
  },
  {
    n: '05',
    title: 'They get certified',
    body: 'Builders earn the Certified Anthropic AI Systems Architect credential and join a standing network of architects across companies and phases.',
  },
];

const WHAT_YOU_GET: Feature[] = [
  {
    icon: '\u{1F6E0}\u{FE0F}',
    title: 'Durable capability, not attendance',
    body: 'Real, deployed builds on your workflows. You get working systems and a workforce that keeps building after the program, not a stack of completion certificates.',
  },
  {
    icon: '\u{1F5FA}\u{FE0F}',
    title: 'A ranked talent map',
    body: 'An evidence-based ranking of who can actually build with AI, across every team you sponsored. Discover the builders already on your payroll.',
  },
  {
    icon: '\u{1F4CA}',
    title: 'One live leadership view',
    body: 'A single dashboard of readiness, adoption, and ROI. A concrete before-and-after story for the board, updated in real time.',
  },
  {
    icon: '\u{1F393}',
    title: 'A credential and a network',
    body: 'Graduates earn the Certified Anthropic AI Systems Architect credential and stay in a network of architects across companies and phases.',
  },
];

const ZERO_RISK: Feature[] = [
  {
    icon: '\u{23F0}',
    title: 'On their own time',
    body: 'Self-paced learning around the work they already do. Zero hit to current output, nobody pulled off billable or operational work.',
  },
  {
    icon: '\u{1F501}',
    title: 'Reassignable seats',
    body: 'If someone leaves, reassign the seat. The capability stays a company asset. It never walks out the door with one person.',
  },
  {
    icon: '\u{1F4B0}',
    title: 'Cheaper than a bad hire',
    body: 'One mis-hired senior AI engineer costs six figures. A block of annual seats costs a fraction, and tells you who to develop and promote instead.',
  },
];

interface Tier {
  name: string;
  seats: string;
  per: string;
  note: string;
  featured?: boolean;
  badge?: string;
}

const TIERS: Tier[] = [
  {
    name: 'Team',
    seats: '5–14 seats',
    per: '$1,200',
    note: 'per seat / year',
    badge: 'Start the capability',
  },
  {
    name: 'Department',
    seats: '15–49 seats',
    per: '$950',
    note: 'per seat / year',
    featured: true,
    badge: 'Most sponsored',
  },
  {
    name: 'Enterprise',
    seats: '50+ seats',
    per: 'Custom',
    note: 'volume pricing',
    badge: 'Org-wide capability',
  },
];

/* Scoped: an outline button that stays legible on the dark (inverse)
   hero surface. Pure DS tokens, no raw hex, so a re-pointed palette flows
   through. Scoped under #sponsor-team-page to avoid leaking globally. */
const SCOPED_CSS = `
#sponsor-team-page .cb-btn--on-dark {
  color: var(--neutral-0);
  box-shadow: inset 0 0 0 var(--border-2) var(--border-strong);
}
#sponsor-team-page .cb-btn--on-dark:hover {
  background: color-mix(in srgb, var(--neutral-0) 12%, transparent);
  color: var(--neutral-0);
  box-shadow: inset 0 0 0 var(--border-2) var(--neutral-0);
}
`;

const grid3: React.CSSProperties = {
  display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
};
const grid2: React.CSSProperties = {
  display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
};

function SponsorshipPage() {
  const [submitted, setSubmitted] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showInfoSession, setShowInfoSession] = useState(false);

  return (
    <>
      <style>{SCOPED_CSS}</style>
      <SEOHead
        title="Roll It Out to Your Organization"
        description="Tried the platform free? Roll it out across your organization: certification, real projects on your workflows, a network of AI Architects, weekly live events, and one live dashboard leadership watches. Reassignable annual seats. No one comes off the job."
      />

      <div id="sponsor-team-page" style={{ background: 'var(--surface-page)', color: 'var(--text-body)' }}>
        {/* ============================ HERO ============================ */}
        <section
          aria-label="Build a measurable AI capability across your team"
          style={{
            position: 'relative', overflow: 'hidden',
            background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)',
            padding: 'var(--space-32) 0 var(--space-20)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, zIndex: 0,
              backgroundImage:
                "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 78%, transparent), color-mix(in srgb, var(--surface-inverse) 92%, transparent)), url('/hero/hero-sponsor.jpg')",
              backgroundSize: 'cover', backgroundPosition: 'center',
            }}
          />
          <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 1000, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
            <Badge solid style={{ marginBottom: 'var(--space-6)' }}>Bring your team</Badge>
            <h1
              className="cb-balance"
              style={{
                fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-hero-fluid)',
                lineHeight: 'var(--lh-tight)', letterSpacing: 'var(--ls-tighter)',
                color: 'var(--text-on-inverse)', margin: '0 0 var(--space-6)',
              }}
            >
              Tried it yourself? Now bring it{' '}
              <span style={{ color: 'var(--brand-accent)' }}>to your whole team.</span>
            </h1>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)',
                color: 'color-mix(in srgb, var(--text-on-inverse) 86%, transparent)',
                maxWidth: 780, margin: '0 auto var(--space-6)',
              }}
            >
              You have explored the platform free. Now roll it out to your organization: your people learn
              on their own time, build real systems on your workflows, and get certified, while you watch
              capability climb on the same live dashboard you already know. No one comes off the job.
            </p>
            <p
              style={{
                fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-bold)', color: 'var(--neutral-0)',
                maxWidth: 780, margin: '0 auto var(--space-8)',
              }}
            >
              Training is one part. The capability is the point.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button as="a" href={TRY_PATH} size="lg" data-track="sponsor_hero_start_free">
                Start free
              </Button>
              <Button variant="outline" size="lg" className="cb-btn--on-dark" onClick={() => setShowBooking(true)} data-track="sponsor_hero_book_call">
                Book a walkthrough
              </Button>
            </div>
            <p style={{ fontSize: 'var(--fs-caption)', color: 'color-mix(in srgb, var(--text-on-inverse) 72%, transparent)', margin: 'var(--space-6) 0 0' }}>
              Already tried it free?{' '}
              <a href="#sponsor-inquiry" style={{ color: 'var(--neutral-0)', fontWeight: 'var(--fw-bold)' }}>
                Jump to seat tiers &rarr;
              </a>
              {' '}or{' '}
              <button
                type="button"
                onClick={() => setShowInfoSession(true)}
                data-track="sponsor_hero_info_session"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--neutral-0)', fontWeight: 'var(--fw-bold)', textDecoration: 'underline' }}
              >
                attend a live info session
              </button>
              .
            </p>
            <p style={{ fontSize: 'var(--fs-caption)', color: 'color-mix(in srgb, var(--text-on-inverse) 66%, transparent)', margin: 'var(--space-8) 0 0', fontWeight: 600, letterSpacing: 'var(--ls-wide)' }}>
              Learn With Claude. Build Through Colaberry. Deploy In The Real World.
            </p>
          </div>
        </section>

        {/* ===================== PARTNER TRUST BAND ===================== */}
        <section aria-label="Anthropic partnership and trust" style={{ background: 'var(--surface-page)', padding: 'var(--space-16) 0 0' }}>
          <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
            <PartnerStrip />
          </div>
        </section>

        {/* ================== THE PROBLEM LEADERSHIP FEELS ================== */}
        <section aria-label="The capability you cannot see" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="The problem you cannot see"
              tone="red"
              title="You cannot see who in your company can actually build with AI."
              lead="Every leadership meeting now has an AI line item. Ask the honest question and the room goes quiet: who here can turn AI into something deployed? Capability is invisible, so you are guessing."
            />
            <div style={grid3}>
              {PROBLEMS.map((p) => (
                <Card key={p.title} padded accent="red" style={{ height: '100%' }}>
                  <div style={iconTileStyle} aria-hidden="true">{p.icon}</div>
                  <h3 style={cardTitleStyle}>{p.title}</h3>
                  <p style={cardBodyStyle}>{p.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ====================== THE ECOSYSTEM ====================== */}
        <section aria-label="An AI systems capability ecosystem" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="More than training"
              tone="red"
              title="Access to an AI systems capability ecosystem"
              lead="Training is one part of it. Your team also gets certified, builds real projects on your workflows, joins a network of AI Architects, attends weekly live events, and stays current as the field moves."
            />
            <EcosystemPillars />
          </div>
        </section>

        {/* ====================== THE MATURITY CLIMB ====================== */}
        <section aria-label="From AI Aware to AI Architect" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1200, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="The climb"
              tone="blue"
              title="From AI Aware to AI Architect"
              lead="Five levels your people climb, and the platform measures every one. You build organizational maturity you can prove, not classes you hope stick."
            />
            <MaturityJourney />
          </div>
        </section>

        {/* ====================== AI CAPABILITY INDEX ====================== */}
        <section aria-label="The AI Capability Index baseline" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="Start with a baseline"
              tone="warning"
              title="One score for where your organization stands today"
              lead="Establish your AI Capability Index across seven dimensions before anyone starts. A concrete before-and-after story for the board, and the baseline every seat improves."
            />
            <CapabilityIndex ctaHref="#sponsor-inquiry" />
          </div>
        </section>

        {/* ========================= HOW IT WORKS ========================= */}
        <section aria-label="How it works, self-paced" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="How it works"
              tone="blue"
              title="Self-paced access, not a fixed cohort"
              lead="Give reassignable seats, your people learn on their own time plus weekly live events, they build on your workflows, you watch the dashboard, they get certified. Five steps, nobody off the job."
            />
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {HOW_IT_WORKS.map((step) => (
                <li key={step.n} className="cb-min0">
                  <Card elevation="sm" padded style={{ height: '100%' }}>
                    <span aria-hidden="true" style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
                      borderRadius: 'var(--radius-pill)', background: 'var(--surface-brand-subtle)', color: 'var(--brand-accent)',
                      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--fs-body-sm)', marginBottom: 'var(--space-4)',
                    }}>{step.n}</span>
                    <h3 style={cardTitleStyle}>{step.title}</h3>
                    <p style={cardBodyStyle}>{step.body}</p>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ==================== YOUR SPONSOR DASHBOARD ==================== */}
        <section aria-label="Your sponsor dashboard" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1080, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="Your sponsor dashboard"
              tone="blue"
              title="One live view leadership watches"
              lead="A company-scoped dashboard ranks your sponsored people by what they ship and shows who is advancing from Aware to Builder to Architect. The same live view every leader sees, in real time."
            />
            <CompanyMomentumDashboard />
          </div>
        </section>

        {/* ========================= WHAT YOU GET ========================= */}
        <section aria-label="What you walk away with" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="What you walk away with"
              tone="green"
              title="Durable capability, and a map of who can build"
              lead="You are not buying attendance. You are building a capability that stays with the company, and getting the evidence of who can turn AI into deployed value."
            />
            <div style={grid2}>
              {WHAT_YOU_GET.map((b) => (
                <Card key={b.title} padded accent="green" style={{ height: '100%' }}>
                  <div style={{ ...iconTileStyle, background: 'var(--surface-green-subtle)', color: 'var(--status-success)' }} aria-hidden="true">
                    {b.icon}
                  </div>
                  <h3 style={cardTitleStyle}>{b.title}</h3>
                  <p style={cardBodyStyle}>{b.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* =================== CERTIFICATION + NETWORK =================== */}
        <section aria-label="Certification and the architect network" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="Certification and network"
              tone="green"
              title="A credential your people earn, and a network they keep"
              lead="Graduates earn the Certified Anthropic AI Systems Architect credential, CCA-F prep, a defensible signal of who can build. They join a standing network of architects across companies and phases, where capability compounds long after any course ends."
            />
            <ArchitectNetwork />
          </div>
        </section>

        {/* ================= WEEKLY LIVE EVENTS / TIMELINE ================= */}
        <section aria-label="Weekly live events and staying current" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="Stay current"
              tone="blue"
              title="What is on the timeline this week"
              lead="AI changes weekly, so a one-time course goes stale. Every seat includes a rolling stream of weekly live events, new modules, and model updates, so your people never fall behind."
            />
            <EcosystemTimeline />
          </div>
        </section>

        {/* ========================= WHY ZERO-RISK ========================= */}
        <section aria-label="Why it is zero-risk" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="Why it is zero-risk"
              tone="green"
              title="The three objections, already answered"
              lead="The model is built so the easy no never lands. Own time, reassignable seats, a fraction of a bad hire."
            />
            <div style={grid3}>
              {ZERO_RISK.map((z) => (
                <Card key={z.title} padded accent="blue" style={{ height: '100%' }}>
                  <div style={{ ...iconTileStyle, background: 'var(--surface-blue-subtle)', color: 'var(--status-info)' }} aria-hidden="true">
                    {z.icon}
                  </div>
                  <h3 style={cardTitleStyle}>{z.title}</h3>
                  <p style={cardBodyStyle}>{z.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============================ PRICING ============================ */}
        <section aria-label="Ecosystem access pricing" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
            <SectionHead
              badge="Pricing"
              tone="warning"
              title="Ecosystem access, annual seats. One invoice."
              lead="Buy a block of reassignable seats and give access to whoever you choose. Every seat includes the full ecosystem: self-paced paths, weekly live events, real projects, the network, and certification prep. The more of your workforce you develop, the less each seat costs."
            />
            <div style={grid3}>
              {TIERS.map((t) => (
                <Card
                  key={t.name}
                  padded
                  elevation={t.featured ? 'md' : 'sm'}
                  accent={t.featured ? 'red' : undefined}
                  style={
                    t.featured
                      ? { height: '100%', boxShadow: 'var(--shadow-brand)', outline: '2px solid var(--brand-accent)' }
                      : { height: '100%' }
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <h3 style={{ ...cardTitleStyle, margin: 0 }}>{t.name}</h3>
                    {t.badge && (t.featured ? <Badge solid>{t.badge}</Badge> : <Badge tone="blue">{t.badge}</Badge>)}
                  </div>
                  <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-4)' }}>
                    {t.seats}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
                    <span style={{ fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-black)', color: 'var(--text-strong)', lineHeight: 1 }}>
                      {t.per}
                    </span>
                    <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>{t.note}</span>
                  </div>
                  <Button
                    as="a"
                    href="#sponsor-inquiry"
                    variant={t.featured ? 'primary' : 'outline'}
                    fullWidth
                    data-track={`sponsor_pricing_${t.name.toLowerCase()}`}
                  >
                    {t.per === 'Custom' ? 'Talk to us' : 'Bring your team'}
                  </Button>
                </Card>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', marginTop: 'var(--space-6)' }}>
              Seats are reassignable across your organization for the full year. Every sponsored seat includes the full ecosystem: weekly live events, the architect network, and certification prep.
            </p>
          </div>
        </section>

        {/* ===================== FINAL CTA / INQUIRY ===================== */}
        <section id="sponsor-inquiry" aria-label="Sponsor your team inquiry" style={{ background: 'var(--surface-inverse)', padding: 'var(--space-24) 0' }}>
          <div className="container" style={{ maxWidth: 820, paddingInline: 'var(--space-6)' }}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
              <Badge solid>Bring your team</Badge>
              <h2
                className="cb-balance"
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-black)',
                  color: 'var(--text-on-inverse)', letterSpacing: 'var(--ls-tight)',
                  margin: 'var(--space-5) 0 var(--space-4)',
                }}
              >
                Build the capability. Before your competitors do.
              </h2>
              <p
                style={{
                  fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)', color: 'var(--neutral-300)',
                  maxWidth: 'var(--container-sm)', margin: '0 auto',
                }}
              >
                Tell us about your team. We will send seat pricing, the live-event calendar, and a short
                plan for turning access into a measurable AI capability across your workforce.
              </p>
            </div>

            <Card padded elevation="md">
              {submitted ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }} role="status">
                  <div style={{ ...iconTileStyle, margin: '0 auto var(--space-4)', background: 'var(--surface-green-subtle)', color: 'var(--status-success)' }} aria-hidden="true">
                    {'✓'}
                  </div>
                  <h3 style={cardTitleStyle}>Your inquiry is in.</h3>
                  <p style={cardBodyStyle}>
                    Expect seat pricing and the live-event calendar within one business day. We will tailor
                    the plan to the team size you told us about.
                  </p>
                </div>
              ) : (
                <LeadCaptureForm
                  formType="sponsor_inquiry"
                  fields={['name', 'email', 'company', 'title', 'company_size']}
                  submitLabel="Bring your team"
                  buttonClassName="cb-btn cb-btn--primary cb-btn--lg cb-btn--full"
                  successMessage="Your rollout request is in, we'll be in touch within one business day."
                  onSuccess={() => setSubmitted(true)}
                />
              )}
            </Card>

            <p style={{ textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--neutral-400)', marginTop: 'var(--space-6)' }}>
              Want to try it yourself first?{' '}
              <a href={TRY_PATH} style={{ color: 'var(--text-link)', fontWeight: 'var(--fw-bold)' }}>
                Start free
              </a>
              .
            </p>
          </div>
        </section>
      </div>

      {/* Employer first-touch: book a meeting (primary) or a live info session
          (secondary). The info session registers to the SAME open-house event,
          employer-framed via an open_house_* lead formType. */}
      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} />
      <OpenHouseModal
        show={showInfoSession}
        onClose={() => setShowInfoSession(false)}
        personaSlug="employer_info_session"
        submitLabel="Reserve my info-session seat"
        title="Reserve your Live Info Session seat"
        subtitle="A free, live online session. See the ecosystem your team would join and how the capability builds. No pitch."
        successMessage="You're registered. We'll email you the Live Info Session details shortly."
      />
    </>
  );
}

export default SponsorshipPage;
