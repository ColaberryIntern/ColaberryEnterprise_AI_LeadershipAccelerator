import React, { useState } from 'react';
import SEOHead from '../components/SEOHead';
import LeadCaptureForm from '../components/LeadCaptureForm';
import { Button } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import { Table } from '../colaberry/components/core/Table';
import EmployerDashboardPreview from '../components/visuals/EmployerDashboardPreview';
import CohortUrgency from '../components/visuals/CohortUrgency';
import PartnerStrip from '../components/visuals/PartnerStrip';
import MermaidDiagram from '../components/visuals/MermaidDiagram';
import SectionFigure from '../components/visuals/SectionFigure';
import StrategyCallModal from '../components/StrategyCallModal';
import OpenHouseModal from '../components/membership/OpenHouseModal';

/* ------------------------------------------------------------------ *
 * Sponsor Your Team — The AI Builder Challenge
 * Flagship employer page (Door B of "One Class, Many Doors").
 * The corporate value prop is TALENT DISCOVERY, not training.
 * Built entirely on the Colaberry design system: DS components +
 * semantic tokens only (never raw hex), so a re-pointed brand palette
 * flows through automatically.
 * ------------------------------------------------------------------ */

const S = {
  /* Page sections */
  page: { background: 'var(--surface-page)', color: 'var(--text-body)' } as React.CSSProperties,
  hero: {
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--surface-inverse)',
    color: 'var(--text-on-inverse)',
    padding: 'var(--space-24) var(--space-6) var(--space-20)',
  } as React.CSSProperties,
  section: { padding: 'var(--space-20) var(--space-6)' } as React.CSSProperties,
  sectionAlt: {
    padding: 'var(--space-20) var(--space-6)',
    background: 'var(--surface-subtle)',
  } as React.CSSProperties,
  inner: { maxWidth: 'var(--container-lg)', margin: '0 auto' } as React.CSSProperties,
  innerNarrow: { maxWidth: 'var(--container-md)', margin: '0 auto' } as React.CSSProperties,

  /* Type roles */
  eyebrow: {
    fontSize: 'var(--fs-overline)',
    fontWeight: 'var(--fw-bold)',
    letterSpacing: 'var(--ls-overline)',
    textTransform: 'uppercase',
    color: 'var(--brand-accent)',
    margin: '0 0 var(--space-4)',
  } as React.CSSProperties,
  h2: {
    fontSize: 'var(--fs-h2)',
    fontWeight: 'var(--fw-bold)',
    color: 'var(--text-strong)',
    letterSpacing: 'var(--ls-tight)',
    margin: '0 0 var(--space-4)',
  } as React.CSSProperties,
  lead: {
    fontSize: 'var(--fs-body-lg)',
    lineHeight: 'var(--lh-relaxed)',
    color: 'var(--text-muted)',
    margin: '0 0 var(--space-12)',
  } as React.CSSProperties,
  cardTitle: {
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
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 'var(--space-6)',
  } as React.CSSProperties,
  iconTile: {
    display: 'grid',
    placeItems: 'center',
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--surface-brand-subtle)',
    color: 'var(--brand-accent)',
    fontSize: '22px',
    marginBottom: 'var(--space-4)',
  } as React.CSSProperties,
};

interface Step {
  n: string;
  title: string;
  body: string;
}

const HOW_IT_WORKS: Step[] = [
  {
    n: '1',
    title: 'Buy annual seats',
    body: 'Sponsor a block of seats for the year at a volume-discounted rate. One PO, one invoice, no per-person procurement.',
  },
  {
    n: '2',
    title: 'Distribute redemption codes',
    body: 'You receive codes to hand to whoever you choose. Reassign any unused code at any time — seats follow the talent, not the headcount.',
  },
  {
    n: '3',
    title: 'They learn on their own time',
    body: 'Employees join the cohort and build with Claude after hours and on weekends. Nobody comes off the job. No backfill, no lost output.',
  },
  {
    n: '4',
    title: 'Watch the leaderboard',
    body: 'A company-scoped leaderboard ranks your people by what they actually ship — not by who volunteered loudest. Real signal, in real time.',
  },
  {
    n: '5',
    title: 'They present at Demo Day',
    body: 'Top builders demo working systems they built on your real workflows. You see exactly who can turn AI into deployed value.',
  },
];

interface Benefit {
  icon: string;
  title: string;
  body: string;
}

const WHAT_YOU_GET: Benefit[] = [
  {
    icon: '\u{1F5FA}\u{FE0F}',
    title: 'A ranked talent map',
    body: 'Find out who your real AI builders are. Walk away with a defensible, evidence-based ranking of who can actually build — across every team you sponsored.',
  },
  {
    icon: '\u{1F6E0}\u{FE0F}',
    title: 'Projects shipped on your workflows',
    body: 'Participants build against your real processes and data patterns. You get working prototypes, not slideware — capability that lands inside the business.',
  },
  {
    icon: '\u{1F517}',
    title: 'Retention that pays for itself',
    body: 'Your highest-potential people get invested in, recognized, and promoted from within. Growth is the cheapest retention lever you have.',
  },
  {
    icon: '\u{1F4CA}',
    title: 'A board-ready story',
    body: '"Here is who in our org can build with AI, here is what they shipped, here is our plan." A concrete answer to the question every board is now asking.',
  },
];

interface ZeroRisk {
  icon: string;
  title: string;
  body: string;
}

const ZERO_RISK: ZeroRisk[] = [
  {
    icon: '\u{23F0}',
    title: 'On their own time',
    body: 'Learning happens after hours. Zero hit to current output — nobody is pulled off billable or operational work.',
  },
  {
    icon: '\u{1F501}',
    title: 'Reassignable seats',
    body: '"What if they quit?" Reassign the seat. The investment stays with the company, never walks out the door with one person.',
  },
  {
    icon: '\u{1F4B0}',
    title: 'Cheaper than a bad hire',
    body: 'One mis-hired senior AI engineer costs six figures. A full block of seats costs a fraction — and tells you who to promote instead.',
  },
];

interface Objection {
  concern: string;
  answer: string;
}

const OBJECTIONS: Objection[] = [
  {
    concern: '"I can’t take people off the job to train them."',
    answer: 'You don’t. Everyone learns on their own time. Current output is untouched — that’s the entire point of the model.',
  },
  {
    concern: '"What if we invest and they leave?"',
    answer: 'Seats are reassignable, so the investment stays with the company. And the people you invest in and promote are the ones who stay.',
  },
  {
    concern: '"We already pay for AI tool licenses."',
    answer: 'Most people consume AI. Very few learn to build with it. Licenses give access; this tells you who can actually turn that access into shipped systems.',
  },
  {
    concern: '"How do I know it’s working?"',
    answer: 'A live, company-scoped leaderboard ranks people by what they ship, and Demo Day puts working builds in front of you. The signal is objective.',
  },
  {
    concern: '"My team isn’t technical enough."',
    answer: 'The challenge surfaces builders you didn’t know you had — often outside IT. That discovery is the value, not a prerequisite for entry.',
  },
  {
    concern: '"I don’t have budget approval yet."',
    answer: 'Start with a small block to prove the signal, then scale. Volume pricing means the next block is cheaper, not a fresh negotiation.',
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
    badge: 'Pilot the signal',
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
    badge: 'Org-wide talent map',
  },
];

/* The sponsorship flow, as a Mermaid flowchart. Buy seats → redeem codes →
   learn on own time → climb the leaderboard → Demo Day → certified. */
const SPONSOR_FLOW = `flowchart LR
  A([Buy seats]) --> B([Redeem codes])
  B --> C([Learn on own time])
  C --> D([Company leaderboard])
  D --> E([Demo Day])
  E --> F([Certified Anthropic<br/>AI Systems Architect])
  classDef step fill:#FFE7E8,stroke:#FB2832,stroke-width:1.5px,color:#1A1A1A;
  classDef win fill:#1A1A1A,stroke:#FB2832,stroke-width:2px,color:#FFFFFF;
  class A,B,C,D,E step;
  class F win;`;

/* Scoped: an outline button that stays legible on the dark (inverse)
   surfaces. Pure DS tokens — no raw hex — so a re-pointed palette flows
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

function SponsorshipPage() {
  const [submitted, setSubmitted] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showInfoSession, setShowInfoSession] = useState(false);

  return (
    <>
      <style>{SCOPED_CSS}</style>
      <SEOHead
        title="Sponsor Your Team — The AI Builder Challenge"
        description="Find out who your real AI builders are — without taking anyone off the job. Sponsor annual seats; your people learn on their own time, climb a company leaderboard, and present working systems at Demo Day."
      />

      <div id="sponsor-team-page" style={S.page}>
        {/* ============================ HERO ============================ */}
        <section style={S.hero}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              backgroundImage:
                "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 76%, transparent), color-mix(in srgb, var(--surface-inverse) 90%, transparent)), url('/hero/hero-sponsor.jpg')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div style={{ ...S.innerNarrow, position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <Badge solid>The AI Builder Challenge</Badge>
            <h1
              className="cb-balance"
              style={{
                fontSize: 'var(--fs-hero-fluid)',
                fontWeight: 'var(--fw-black)',
                lineHeight: 'var(--lh-tight)',
                letterSpacing: 'var(--ls-tighter)',
                color: 'var(--text-on-inverse)',
                margin: 'var(--space-6) 0 var(--space-5)',
              }}
            >
              Find out who your real AI builders are.
            </h1>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'color-mix(in srgb, var(--text-on-inverse) 88%, transparent)',
                maxWidth: 'var(--container-sm)',
                margin: '0 auto var(--space-3)',
              }}
            >
              Without taking a single person off the job. Sponsor your team for the cohort,
              and watch who actually ships working systems with AI &mdash; trained hands-on
              with Claude Code, in Anthropic-partner hands.
            </p>
            <p
              style={{
                fontSize: 'var(--fs-body)',
                fontWeight: 'var(--fw-bold)',
                color: 'var(--neutral-0)',
                maxWidth: 'var(--container-sm)',
                margin: '0 auto var(--space-8)',
              }}
            >
              Most people consume AI. Very few learn to build with it.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Button variant="primary" size="lg" onClick={() => setShowBooking(true)} data-track="sponsor_hero_book_call">
                Book a Strategy Call
              </Button>
              <Button variant="outline" size="lg" className="cb-btn--on-dark" onClick={() => setShowInfoSession(true)} data-track="sponsor_hero_info_session">
                Attend a Live Info Session
              </Button>
            </div>
            <p
              style={{
                fontSize: 'var(--fs-caption)',
                color: 'color-mix(in srgb, var(--text-on-inverse) 72%, transparent)',
                margin: 'var(--space-4) 0 0',
              }}
            >
              Ready to sponsor?{' '}
              <a href="#sponsor-inquiry" style={{ color: 'var(--neutral-0)', fontWeight: 'var(--fw-bold)' }}>
                Jump to seat tiers &rarr;
              </a>
            </p>
            <p
              style={{
                fontSize: 'var(--fs-caption)',
                color: 'color-mix(in srgb, var(--text-on-inverse) 72%, transparent)',
                margin: 'var(--space-8) 0 0',
              }}
            >
              Learn With Claude. Build Through Colaberry. Deploy In The Real World.
            </p>
          </div>
        </section>

        {/* ===================== PARTNER TRUST BAND ===================== */}
        <section style={{ padding: 'var(--space-12) var(--space-6) 0' }}>
          <div style={S.inner}>
            <PartnerStrip />
          </div>
        </section>

        {/* ===================== THE PROBLEM A CEO FEELS ===================== */}
        <section style={S.section}>
          <div style={S.innerNarrow}>
            <p style={S.eyebrow}>The problem you can&rsquo;t see</p>
            <h2 style={S.h2}>You have no idea who in your company can actually build with AI.</h2>
            <p style={S.lead}>
              Every leadership meeting now has an AI line item. But ask the honest question and the
              room goes quiet: who here can turn AI into something deployed? You&rsquo;re guessing.
            </p>
            <div style={S.grid3}>
              {[
                {
                  icon: '\u{1F575}\u{FE0F}',
                  title: 'Tools, not talent',
                  body: 'You bought the licenses. Adoption dashboards look fine. But usage is not capability — and you can’t tell the difference from a seat count.',
                },
                {
                  icon: '\u{1F3AF}',
                  title: 'The loudest aren’t the best',
                  body: 'The people who talk about AI in meetings are rarely the ones quietly shipping it. Real builders are invisible to your org chart.',
                },
                {
                  icon: '\u{1F4B8}',
                  title: 'Hiring blind is expensive',
                  body: 'So you hire externally at a premium, hoping for a builder — while the person who could have done it sits two desks away, undiscovered.',
                },
              ].map((p) => (
                <Card key={p.title} padded accent="red">
                  <div style={S.iconTile} aria-hidden="true">{p.icon}</div>
                  <h3 style={S.cardTitle}>{p.title}</h3>
                  <p style={S.cardBody}>{p.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ========================= HOW IT WORKS ========================= */}
        <section id="how-it-works" style={S.sectionAlt}>
          <div style={S.inner}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto' }}>
              <p style={S.eyebrow}>How it works</p>
              <h2 style={S.h2}>One program. Two doors. You sponsor the door your team walks through.</h2>
              <p style={S.lead}>
                The same cohort individuals join — but entered as a company. Five steps from purchase
                order to a ranked roster of your real builders.
              </p>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-6)',
              }}
            >
              {HOW_IT_WORKS.map((step) => (
                <Card key={step.n} padded elevation="sm">
                  <div
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--surface-brand)',
                      color: 'var(--text-on-accent)',
                      fontWeight: 'var(--fw-black)',
                      fontSize: 'var(--fs-body)',
                      marginBottom: 'var(--space-3)',
                    }}
                    aria-hidden="true"
                  >
                    {step.n}
                  </div>
                  <h3 style={S.cardTitle}>{step.title}</h3>
                  <p style={S.cardBody}>{step.body}</p>
                </Card>
              ))}
            </div>

            {/* The same five steps as a single, scannable flow. */}
            <div style={{ maxWidth: 'var(--container-md)', margin: 'var(--space-10) auto 0' }}>
              <MermaidDiagram
                chart={SPONSOR_FLOW}
                caption="The sponsorship flow end to end: buy seats, redeem codes, your people learn on their own time, climb the company leaderboard, present at Demo Day, and graduate as a Certified Anthropic AI Systems Architect."
              />
            </div>
          </div>
        </section>

        {/* ================== EMPLOYER DASHBOARD PREVIEW ================== */}
        <section style={S.section}>
          <div style={S.inner}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto var(--space-10)' }}>
              <p style={S.eyebrow}>Your sponsor view</p>
              <h2 style={S.h2}>See exactly how your people build skills.</h2>
              <p style={{ ...S.lead, marginBottom: 0 }}>
                A live, company-scoped dashboard ranks your sponsored builders by what they actually
                ship &mdash; team readiness, skill mastery, and your Demo Day shortlist, in real time.
                This is the talent map you walk away with.
              </p>
            </div>
            <EmployerDashboardPreview
              companyName="Your Company"
              sponsoredCount={14}
              cohortLabel="Cohort 1"
            />
          </div>
        </section>

        {/* ========================= WHAT YOU GET ========================= */}
        <section style={S.section}>
          <div style={S.inner}>
            <div style={{ maxWidth: 'var(--container-md)' }}>
              <p style={S.eyebrow}>What you walk away with</p>
              <h2 style={S.h2}>This isn&rsquo;t training. It&rsquo;s talent discovery.</h2>
              <p style={S.lead}>
                You&rsquo;re not buying courses. You&rsquo;re buying the answer to who can build &mdash; backed by
                what they actually shipped.
              </p>
            </div>
            <div style={S.grid2}>
              {WHAT_YOU_GET.map((b) => (
                <Card key={b.title} padded accent="green">
                  <div
                    style={{ ...S.iconTile, background: 'var(--surface-green-subtle)', color: 'var(--status-success)' }}
                    aria-hidden="true"
                  >
                    {b.icon}
                  </div>
                  <h3 style={S.cardTitle}>{b.title}</h3>
                  <p style={S.cardBody}>{b.body}</p>
                </Card>
              ))}
            </div>

            {/* Real photo: the partnership + credential story. */}
            <div style={{ marginTop: 'var(--space-16)' }}>
              <SectionFigure
                src="/img/handshake-deal.jpg"
                alt="Two business leaders shaking hands to close a team-sponsorship agreement."
                side="right"
                eyebrow="Anthropic-partner hands"
                title="Put your people in Anthropic-partner hands."
                body={[
                  'Colaberry is an Anthropic / Claude Code partner. Your sponsored builders train hands-on with the same tools and workflows teams ship with in production — not slideware, and not a generic course library.',
                  'Graduates earn the Certified Anthropic AI Systems Architect credential (CCA-F prep) — a defensible, evidence-backed signal of who on your team can turn AI into deployed value.',
                ]}
                caption="One continuous 12-week program — four phases, one cohort, real shipped work."
                cta={{ label: 'Sponsor Your Team', to: '/sponsorship#sponsor-inquiry' }}
              />
            </div>
          </div>
        </section>

        {/* ========================= WHY ZERO RISK ========================= */}
        <section style={S.sectionAlt}>
          <div style={S.inner}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto' }}>
              <p style={S.eyebrow}>Why it&rsquo;s zero-risk</p>
              <h2 style={S.h2}>The three objections, already answered.</h2>
              <p style={S.lead}>
                The model is built so the easy "no" never lands. Own time. Reassignable seats.
                A fraction of a bad hire.
              </p>
            </div>
            <div style={S.grid3}>
              {ZERO_RISK.map((z) => (
                <Card key={z.title} padded accent="blue">
                  <div
                    style={{ ...S.iconTile, background: 'var(--surface-blue-subtle)', color: 'var(--status-info)' }}
                    aria-hidden="true"
                  >
                    {z.icon}
                  </div>
                  <h3 style={S.cardTitle}>{z.title}</h3>
                  <p style={S.cardBody}>{z.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== OBJECTION HANDLING ===================== */}
        <section style={S.section}>
          <div style={S.inner}>
            <div style={{ maxWidth: 'var(--container-md)' }}>
              <p style={S.eyebrow}>Straight answers</p>
              <h2 style={S.h2}>Every reason to say no — and why it doesn&rsquo;t hold.</h2>
              <p style={S.lead}>
                The questions a CFO and a CHRO will both raise, answered plainly.
              </p>
            </div>
            <Table
              hover
              columns={[
                {
                  key: 'concern',
                  header: 'The concern',
                  render: (v: string) => (
                    <span style={{ fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)' }}>{v}</span>
                  ),
                },
                {
                  key: 'answer',
                  header: 'The answer',
                  render: (v: string) => <span style={{ color: 'var(--text-body)' }}>{v}</span>,
                },
              ]}
              data={OBJECTIONS}
            />
          </div>
        </section>

        {/* ============================ PRICING ============================ */}
        <section style={S.sectionAlt}>
          <div style={S.inner}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto' }}>
              <p style={S.eyebrow}>Pricing</p>
              <h2 style={S.h2}>Annual seats, volume-discounted. One invoice.</h2>
              <p style={S.lead}>
                Buy a block, distribute codes, reassign anytime. The more builders you want to find,
                the less each seat costs.
              </p>
            </div>
            <div style={S.grid3}>
              {TIERS.map((t) => (
                <Card
                  key={t.name}
                  padded
                  elevation={t.featured ? 'md' : 'sm'}
                  accent={t.featured ? 'red' : undefined}
                  style={
                    t.featured
                      ? { boxShadow: 'var(--shadow-brand)', outline: '2px solid var(--brand-accent)' }
                      : undefined
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <h3 style={{ ...S.cardTitle, margin: 0 }}>{t.name}</h3>
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
                  >
                    {t.per === 'Custom' ? 'Talk to us' : 'Sponsor this block'}
                  </Button>
                </Card>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', marginTop: 'var(--space-6)' }}>
              Seats are reassignable across your organization for the full year. Demo Day access included for every sponsored seat.
            </p>
          </div>
        </section>

        {/* ========================= COHORT URGENCY ========================= */}
        <section style={S.section}>
          <div style={S.inner}>
            <CohortUrgency startDateISO="2026-07-23" seatsTotal={40} seatsLeft={7} />
          </div>
        </section>

        {/* ===================== FINAL CTA / INQUIRY ===================== */}
        <section id="sponsor-inquiry" style={{ ...S.section, background: 'var(--surface-inverse)' }}>
          <div style={{ maxWidth: 'var(--container-md)', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
              <Badge solid>Sponsor Your Team</Badge>
              <h2
                className="cb-balance"
                style={{
                  fontSize: 'var(--fs-h1)',
                  fontWeight: 'var(--fw-black)',
                  color: 'var(--text-on-inverse)',
                  letterSpacing: 'var(--ls-tight)',
                  margin: 'var(--space-5) 0 var(--space-4)',
                }}
              >
                See who can build. Before your competitors do.
              </h2>
              <p
                style={{
                  fontSize: 'var(--fs-body-lg)',
                  lineHeight: 'var(--lh-relaxed)',
                  color: 'var(--neutral-300)',
                  maxWidth: 'var(--container-sm)',
                  margin: '0 auto',
                }}
              >
                Tell us about your team. We&rsquo;ll send seat pricing, the Demo Day calendar, and a
                short plan for turning the challenge into your AI talent map.
              </p>
            </div>

            <Card padded elevation="md">
              {submitted ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }} role="status">
                  <div style={{ ...S.iconTile, margin: '0 auto var(--space-4)', background: 'var(--surface-green-subtle)', color: 'var(--status-success)' }} aria-hidden="true">
                    {'✓'}
                  </div>
                  <h3 style={S.cardTitle}>Your inquiry is in.</h3>
                  <p style={S.cardBody}>
                    Expect seat pricing and the Demo Day calendar within one business day. We&rsquo;ll
                    tailor the plan to the team size you told us about.
                  </p>
                </div>
              ) : (
                <LeadCaptureForm
                  formType="sponsor_inquiry"
                  fields={['name', 'email', 'company', 'title', 'company_size']}
                  submitLabel="Sponsor Your Team"
                  buttonClassName="cb-btn cb-btn--primary cb-btn--lg cb-btn--full"
                  successMessage="Your sponsor inquiry is in — we'll be in touch within one business day."
                  onSuccess={() => setSubmitted(true)}
                />
              )}
            </Card>

            <p style={{ textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--neutral-400)', marginTop: 'var(--space-6)' }}>
              Prefer to start small for one person?{' '}
              <a href="/enroll" style={{ color: 'var(--text-link)', fontWeight: 'var(--fw-bold)' }}>
                Join the Challenge as an individual
              </a>
              .
            </p>
          </div>
        </section>
      </div>

      {/* Employer first-touch: book a meeting (primary) or a live info session
          (secondary) — the info session registers to the SAME open-house event,
          employer-framed via an open_house_* lead formType. */}
      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} />
      <OpenHouseModal
        show={showInfoSession}
        onClose={() => setShowInfoSession(false)}
        personaSlug="employer_info_session"
        submitLabel="Reserve my info-session seat"
        title="Reserve your Live Info Session seat"
        subtitle="A free, live online session — see the program your team would join and how the talent-discovery works. No pitch."
        successMessage="You’re registered. We’ll email you the Live Info Session details shortly."
      />
    </>
  );
}

export default SponsorshipPage;
