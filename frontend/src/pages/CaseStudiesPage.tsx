// Demo Day wins, AI Champion stories, and sponsor talent-discovery outcomes.
// Reframed for the "One Class, Many Doors" strategy: individuals join the
// Challenge (Door A) and employers sponsor teams to discover their real
// AI builders (Door B).
//
// NOTE: Stories below are realistic, specific placeholders pending client
// consent. No lorem ipsum. Replace attribution with real names + logos as
// consent is obtained (tracked for the CMS migration when volume > 10).

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { STANDARD_CTAS } from '../config/programSchedule';
import StrategyCallModal from '../components/StrategyCallModal';
import { Card } from '../colaberry/components/core/Card';
import { Badge } from '../colaberry/components/core/Badge';
import { Button } from '../colaberry/components/core/Button';
import { Avatar } from '../colaberry/components/core/Avatar';
import { Progress } from '../colaberry/components/core/Progress';
import SectionFigure from '../components/visuals/SectionFigure';
import PartnerStrip from '../components/visuals/PartnerStrip';
import { BarChart, StatCounter } from '../components/visuals/charts';

// ---------------------------------------------------------------------------
// Content models
// ---------------------------------------------------------------------------

// Brand palette for metric tiles — never flat grey. Each tile gets a real
// brand color (cherry / leaf / berry / amber) from the DS chart tokens.
type BrandTone = 'cherry' | 'leaf' | 'berry' | 'amber';

const BRAND_TONE: Record<BrandTone, string> = {
  cherry: 'var(--chart-2)', // #FB2832
  leaf: 'var(--chart-3)', //   #5BA63C
  berry: 'var(--chart-1)', //  #367895
  amber: 'var(--chart-4)', //  #E8920C
};

interface ChampionMetric {
  value: string;
  label: string;
  tone: BrandTone;
}

interface ChampionStory {
  name: string;
  role: string;
  cohort: string;
  shipped: string;
  /** Self-hosted champion photo (DS section image). */
  photo: string;
  photoAlt: string;
  /** Which side the SectionFigure photo sits on (alternates per story). */
  side: 'left' | 'right';
  summary: string;
  metrics: ChampionMetric[];
  /** The credential the graduate earned. */
  credential: string;
  quote: string;
}

interface SponsorOutcome {
  company: string;
  industry: string;
  seats: string;
  headline: string;
  summary: string;
  outcomes: string[];
  quote: string;
  attribution: string;
}

interface LeaderboardEntry {
  name: string;
  team: string;
  project: string;
  points: number;
}

const champions: ChampionStory[] = [
  {
    name: 'Priya Nair',
    role: 'Operations Analyst → AI Champion',
    cohort: 'Spring Cohort · Door A (Individual)',
    shipped: 'Claims Triage Copilot',
    photo: '/img/developer-code.jpg',
    photoAlt:
      'Priya Nair reviewing her claims-triage copilot on screen during the program',
    side: 'right',
    summary:
      'Priya joined the Challenge on her own as a $149/mo member while working full time. By Demo Day she had shipped a claims-triage copilot that reads incoming tickets, drafts a disposition, and routes edge cases to a human — built end to end with Claude during her own evenings.',
    metrics: [
      { value: '#2', label: 'Demo Day rank (of 47)', tone: 'cherry' },
      { value: '6 wks', label: 'Idea to working demo', tone: 'berry' },
      { value: '70%', label: 'Tickets auto-triaged', tone: 'leaf' },
    ],
    credential: 'Certified Anthropic AI Systems Architect',
    quote:
      'I went in thinking I would learn to use AI. I walked out having built something my team now runs every day. That is a different thing entirely.',
  },
  {
    name: 'Marcus Bell',
    role: 'Field Technician → AI Champion',
    cohort: 'Spring Cohort · Door A (Individual)',
    shipped: 'Maintenance Knowledge Agent',
    photo: '/img/mentor-coaching.jpg',
    photoAlt:
      'Marcus Bell presenting his maintenance knowledge agent at Demo Day',
    side: 'left',
    summary:
      'Marcus had no formal coding background. He used his redeemed seat to build a maintenance knowledge agent that turns 1,200 pages of equipment manuals into instant, cited answers in the field — the project that earned him the top spot on the cohort leaderboard.',
    metrics: [
      { value: '#1', label: 'Demo Day rank (of 47)', tone: 'cherry' },
      { value: '1,200', label: 'Pages made searchable', tone: 'amber' },
      { value: '3', label: 'Job offers after Demo Day', tone: 'leaf' },
    ],
    credential: 'Certified Anthropic AI Systems Architect',
    quote:
      'Most people consume AI. This was the first time anyone showed me how to actually build with it — and then proved I could.',
  },
];

const sponsorOutcomes: SponsorOutcome[] = [
  {
    company: 'Regional Financial Group',
    industry: 'Financial Services',
    seats: '25 sponsored seats',
    headline: 'Found three real AI builders nobody had on the radar',
    summary:
      'The CIO sponsored 25 annual seats to answer one question: who inside the company can actually build with AI? Employees redeemed codes and learned on their own time, climbing a company-scoped leaderboard. No one was pulled off their day job.',
    outcomes: [
      'Three "hidden" builders surfaced from operations and risk — none were on the IT team',
      'Top project (an automated loan-document summarizer) moved into a sanctioned internal pilot',
      'Two seats reassigned mid-year after attrition — zero sunk cost, the "what if they quit" objection gone',
      'Company leaderboard became the shortlist for the internal AI guild',
    ],
    quote:
      'We stopped guessing who our AI talent was. The leaderboard told us — and the projects they shipped were real, not slideware.',
    attribution: 'CIO, Regional Financial Group',
  },
  {
    company: 'Mid-Market Manufacturer',
    industry: 'Manufacturing',
    seats: '40 sponsored seats',
    headline: 'Talent discovery across four plants, on the team\'s own time',
    summary:
      'Sponsored 40 seats across four facilities. The goal was not training hours — it was talent discovery. Employees built against their own plant data, and a cross-site leaderboard surfaced the builders worth investing in.',
    outcomes: [
      'A predictive-maintenance prototype from a plant-floor engineer won Demo Day and is now scoped for production',
      'Eight employees identified as genuine builders and fast-tracked into the internal AI program',
      'Annual seat model meant new hires inherited reassigned codes — capacity never went idle',
      'Zero production downtime: everyone learned and built around their shifts',
    ],
    quote:
      'We learned more about our own people in eight weeks than in years of performance reviews. Our best AI builder was running a line, not sitting in IT.',
    attribution: 'VP of Operations, Mid-Market Manufacturer',
  },
  {
    company: 'Regional Health System',
    industry: 'Healthcare',
    seats: '30 sponsored seats',
    headline: 'Demo Day became the internal innovation pipeline',
    summary:
      'Sponsored 30 seats for clinical and administrative staff. Participants built against anonymized workflows and presented at Demo Day. The cohort doubled as a low-risk way to find which staff could carry AI work forward.',
    outcomes: [
      'A documentation-drafting assistant from a nurse informaticist topped the leaderboard and entered a governed pilot',
      'Five AI Champions named across clinical and revenue-cycle teams',
      'Demo Day projects fed directly into the AI governance committee\'s 2026 roadmap',
      'Reassignable seats let the system rotate participants across departments through the year',
    ],
    quote:
      'Demo Day turned into our innovation pipeline. We are no longer waiting for a vendor to tell us what is possible.',
    attribution: 'Director of Clinical Informatics, Regional Health System',
  },
];

const leaderboard: LeaderboardEntry[] = [
  { name: 'Marcus Bell', team: 'Manufacturing', project: 'Maintenance Knowledge Agent', points: 980 },
  { name: 'Priya Nair', team: 'Financial Services', project: 'Claims Triage Copilot', points: 910 },
  { name: 'Dana Whitfield', team: 'Healthcare', project: 'Documentation Assistant', points: 870 },
  { name: 'Hiroshi Tan', team: 'Manufacturing', project: 'Predictive Maintenance Prototype', points: 845 },
  { name: 'Lena Ortiz', team: 'Financial Services', project: 'Loan-Doc Summarizer', points: 800 },
];

const heroStats: { value: string; label: string }[] = [
  { value: '140+', label: 'Projects shipped at Demo Day' },
  { value: '32', label: 'AI Champions named by sponsors' },
  { value: '11', label: 'Projects moved into internal pilots' },
  { value: '100%', label: 'Learned on their own time' },
];

// Outcomes row — premium StatCounter tiles (brand-accented) summarizing the
// program's measurable results across cohorts.
const outcomeStats: { value: string; label: string; accent: string }[] = [
  { value: '140+', label: 'Working AI projects shipped at Demo Day', accent: BRAND_TONE.cherry },
  { value: '32', label: 'Graduates certified as AI Systems Architects', accent: BRAND_TONE.berry },
  { value: '11', label: 'Projects promoted into sanctioned internal pilots', accent: BRAND_TONE.leaf },
  { value: '12 wks', label: 'One continuous program — idea to deployed build', accent: BRAND_TONE.amber },
];

// Where the shipped projects landed — a real outcomes BarChart (leaf-green),
// proving these were not slideware.
const projectOutcomes: { label: string; value: number }[] = [
  { label: 'Shipped a working demo at Demo Day', value: 100 },
  { label: 'Named an AI Champion by their sponsor', value: 64 },
  { label: 'Earned the Certified AI Systems Architect credential', value: 58 },
  { label: 'Project advanced into an internal pilot', value: 41 },
  { label: 'Built entirely on their own time', value: 100 },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function CaseStudiesPage() {
  const [showBooking, setShowBooking] = useState(false);
  const maxPoints = leaderboard[0].points;

  return (
    <>
      <SEOHead
        title="Demo Day Wins & AI Champion Stories"
        description="Real outcomes from the Challenge: individuals who shipped working AI at Demo Day, and employers who discovered their real AI builders through sponsored seats. One class, many doors."
      />

      {/* Hero */}
      <section
        aria-label="Page header"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-24) var(--space-5) var(--space-20)',
        }}
      >
        {/* Hero photo + dark overlay (decorative) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            backgroundImage:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 72%, transparent), color-mix(in srgb, var(--surface-inverse) 92%, transparent)), url('/img/presentation.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 'var(--container-lg)', margin: '0 auto', textAlign: 'center' }}>
          <Badge solid style={{ marginBottom: 'var(--space-5)' }}>
            Demo Day Wins · AI Champion Stories
          </Badge>
          <h1
            className="cb-balance"
            style={{
              color: 'var(--text-on-inverse)',
              fontSize: 'var(--fs-display)',
              fontWeight: 'var(--fw-black)' as React.CSSProperties['fontWeight'],
              margin: '0 0 var(--space-5)',
            }}
          >
            Most people consume AI. These people learned to build with it.
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              color: 'var(--text-on-inverse)',
              opacity: 0.85,
              maxWidth: '60ch',
              margin: '0 auto var(--space-8)',
            }}
          >
            One program. Two doors. Individuals join the Challenge and ship real projects.
            Employers sponsor seats and discover who their real AI builders are — without
            taking anyone off the job. Here is what came out the other side.
          </p>

          {/* Hero stat band */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'var(--space-5)',
              maxWidth: '880px',
              margin: '0 auto',
              textAlign: 'left',
            }}
          >
            {heroStats.map((s) => (
              <div
                key={s.label}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-5)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h2)',
                    fontWeight: 'var(--fw-black)' as React.CSSProperties['fontWeight'],
                    color: 'var(--brand-accent)',
                    lineHeight: 1.1,
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-on-inverse)', opacity: 0.8 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Champion stories — Door A (individuals) */}
      <section
        aria-label="AI Champion stories"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-20) var(--space-5)' }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          <header style={{ maxWidth: '64ch', marginBottom: 'var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-3)' }}>
              Door A · Individuals
            </Badge>
            <h2 style={{ fontSize: 'var(--fs-h1)', margin: '0 0 var(--space-3)' }}>
              AI Champion stories
            </h2>
            <p style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-muted)', margin: 0 }}>
              Members who joined the Challenge on their own, learned with Claude, and
              shipped something real by Demo Day. No prior title required — only what
              they built.
            </p>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-10)' }}>
            {champions.map((c) => (
              <Card key={c.name} accent="blue" elevation="md" padded>
                {/* Champion visual band — a real photo per story via SectionFigure,
                    alternating sides. The copy column carries the identity,
                    narrative, and credential. */}
                <SectionFigure
                  src={c.photo}
                  alt={c.photoAlt}
                  side={c.side}
                  eyebrow={c.cohort}
                  title={`${c.name} shipped the ${c.shipped}`}
                  body={c.summary}
                />

                {/* Identity strip */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    marginTop: 'var(--space-8)',
                    paddingTop: 'var(--space-6)',
                    borderTop: 'var(--border-1, 1px) solid var(--border-subtle)',
                  }}
                >
                  <Avatar src={c.photo} name={c.name} size="lg" ring />
                  <div className="cb-min0">
                    <h3 style={{ fontSize: 'var(--fs-h4)', margin: '0 0 2px' }}>{c.name}</h3>
                    <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>{c.role}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  <Badge tone="green" dot>Shipped: {c.shipped}</Badge>
                  <Badge solid>Credential: {c.credential}</Badge>
                </div>

                {/* Brand-palette metric tiles — colored, not flat grey. Each tile
                    is a full-bleed brand-color moment with the number on the
                    accent and the label beneath in the same hue. */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 'var(--space-4)',
                    marginTop: 'var(--space-5)',
                  }}
                >
                  {c.metrics.map((m) => (
                    <div
                      key={m.label}
                      style={{
                        background: `color-mix(in srgb, ${BRAND_TONE[m.tone]} 12%, var(--surface-card))`,
                        borderTop: `var(--border-3, 3px) solid ${BRAND_TONE[m.tone]}`,
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-5)',
                        textAlign: 'center',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 'var(--fs-h3)',
                          fontWeight: 'var(--fw-black)' as React.CSSProperties['fontWeight'],
                          lineHeight: 'var(--lh-tight)',
                          color: BRAND_TONE[m.tone],
                        }}
                      >
                        {m.value}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--fs-body-sm)',
                          fontWeight: 'var(--fw-medium)' as React.CSSProperties['fontWeight'],
                          color: 'var(--text-strong)',
                          marginTop: 'var(--space-1)',
                        }}
                      >
                        {m.label}
                      </div>
                    </div>
                  ))}
                </div>

                <blockquote
                  style={{
                    borderLeft: 'var(--border-3, 3px) solid var(--brand-accent)',
                    paddingLeft: 'var(--space-5)',
                    margin: 'var(--space-6) 0 0',
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h5)',
                    fontStyle: 'italic',
                    lineHeight: 'var(--lh-snug)',
                    color: 'var(--text-strong)',
                  }}
                >
                  &ldquo;{c.quote}&rdquo;
                </blockquote>
              </Card>
            ))}
          </div>

          {/* Outcomes row — premium StatCounter tiles in the brand palette */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-5)',
              marginTop: 'var(--space-12)',
            }}
          >
            {outcomeStats.map((s) => (
              <StatCounter key={s.label} value={s.value} label={s.label} accent={s.accent} />
            ))}
          </div>

          {/* Outcomes BarChart — proof the projects were real, not slideware */}
          <Card elevation="md" padded style={{ marginTop: 'var(--space-8)' }}>
            <div
              style={{
                fontSize: 'var(--fs-overline)',
                letterSpacing: 'var(--ls-overline)',
                textTransform: 'uppercase',
                color: 'var(--brand-accent)',
                fontWeight: 'var(--fw-bold)' as React.CSSProperties['fontWeight'],
                marginBottom: 'var(--space-2)',
              }}
            >
              What happened to the people who shipped
            </div>
            <h3 style={{ fontSize: 'var(--fs-h3)', margin: '0 0 var(--space-5)' }}>
              Outcomes across recent cohorts
            </h3>
            <BarChart data={projectOutcomes} unit="%" />
            <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>
              Share of participants reaching each milestone. Graduates earn the
              Certified Anthropic AI Systems Architect credential (CCA-F prep).
              Illustrative aggregate pending per-cohort consent.
            </p>
          </Card>
        </div>
      </section>

      {/* Anthropic / Claude Code partner band — context for the credential */}
      <section aria-label="Anthropic partnership" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-12) var(--space-5)' }}>
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          <PartnerStrip />
        </div>
      </section>

      {/* Demo Day leaderboard snapshot */}
      <section
        aria-label="Demo Day leaderboard"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-20) var(--space-5)' }}
      >
        <div style={{ maxWidth: 'var(--container-md)', margin: '0 auto' }}>
          <header style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <Badge tone="warning" style={{ marginBottom: 'var(--space-3)' }}>
              Demo Day Leaderboard
            </Badge>
            <h2 style={{ fontSize: 'var(--fs-h1)', margin: '0 0 var(--space-3)' }}>
              Ranked by what they shipped
            </h2>
            <p style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-muted)', margin: '0 auto', maxWidth: '56ch' }}>
              Every participant climbs a points leaderboard for the projects they build.
              Sponsors get a company-scoped view of exactly who their builders are.
            </p>
          </header>

          <Card elevation="md" padded>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {leaderboard.map((entry, i) => (
                <div key={entry.name}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 'var(--fw-black)' as React.CSSProperties['fontWeight'],
                        fontSize: 'var(--fs-h5)',
                        color: i === 0 ? 'var(--brand-accent)' : 'var(--text-muted)',
                        minWidth: '2ch',
                      }}
                    >
                      {i + 1}
                    </span>
                    <Avatar name={entry.name} size="sm" />
                    <div className="cb-min0" style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'var(--fw-medium)' as React.CSSProperties['fontWeight'], color: 'var(--text-strong)' }}>
                        {entry.name}
                      </div>
                      <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
                        {entry.project}
                      </div>
                    </div>
                    <Badge tone="blue">{entry.team}</Badge>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 'var(--fw-bold)' as React.CSSProperties['fontWeight'],
                        color: 'var(--text-strong)',
                        minWidth: '4ch',
                        textAlign: 'right',
                      }}
                    >
                      {entry.points}
                    </span>
                  </div>
                  <Progress
                    value={Math.round((entry.points / maxPoints) * 100)}
                    tone={i === 0 ? 'red' : 'blue'}
                    label={`${entry.name} — ${entry.points} points`}
                  />
                </div>
              ))}
            </div>
          </Card>
          <p style={{ textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>
            Illustrative snapshot. Live cohort leaderboards are scoped per sponsor.
          </p>
        </div>
      </section>

      {/* Sponsor outcomes — Door B (employers) */}
      <section
        aria-label="Sponsor outcomes"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-20) var(--space-5)' }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          <header style={{ maxWidth: '64ch', marginBottom: 'var(--space-12)' }}>
            <Badge tone="red" style={{ marginBottom: 'var(--space-3)' }}>
              Door B · Employers
            </Badge>
            <h2 style={{ fontSize: 'var(--fs-h1)', margin: '0 0 var(--space-3)' }}>
              Sponsor outcomes: talent discovery, not training
            </h2>
            <p style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-muted)', margin: 0 }}>
              Employers sponsor annual seats; employees redeem codes and build on their
              own time. The value is finding out who your real AI builders are — and
              reassignable seats mean attrition never wastes a seat.
            </p>
          </header>

          {/* Premium sponsor visual band — sets up the talent-discovery story
              with a real photo before the per-company outcome cards. */}
          <div style={{ marginBottom: 'var(--space-12)' }}>
            <SectionFigure
              src="/img/handshake-deal.jpg"
              alt="A sponsor leader and a newly identified AI builder shaking hands after Demo Day"
              side="left"
              eyebrow="Talent discovery, on the team's own time"
              title="Your best AI builder may not be in IT"
              body={[
                'Sponsors put their people in Anthropic-partner hands. Employees train hands-on with Claude Code and ship against their own real data — no one is pulled off the day job.',
                'By Demo Day, a company-scoped leaderboard shows you exactly who can build, and your champions graduate as Certified Anthropic AI Systems Architects.',
              ]}
              cta={{ label: 'Sponsor Your Team', to: '/sponsorship' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            {sponsorOutcomes.map((s) => (
              <Card key={s.company} accent="red" elevation="md" padded>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)',
                    gap: 'var(--space-8)',
                    alignItems: 'start',
                  }}
                  className="cs-sponsor-grid"
                >
                  {/* Left: identity + narrative */}
                  <div className="cb-min0">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                      <Badge tone="neutral">{s.industry}</Badge>
                      <Badge solid>{s.seats}</Badge>
                    </div>
                    <h3 style={{ fontSize: 'var(--fs-h3)', margin: '0 0 var(--space-2)' }}>{s.company}</h3>
                    <p
                      style={{
                        fontSize: 'var(--fs-body-lg)',
                        fontWeight: 'var(--fw-medium)' as React.CSSProperties['fontWeight'],
                        color: 'var(--text-strong)',
                        margin: '0 0 var(--space-3)',
                      }}
                    >
                      {s.headline}
                    </p>
                    <p style={{ color: 'var(--text-body)', margin: 0 }}>{s.summary}</p>

                    <blockquote
                      style={{
                        borderLeft: '3px solid var(--brand-accent)',
                        paddingLeft: 'var(--space-4)',
                        margin: 'var(--space-5) 0 0',
                        color: 'var(--text-body)',
                      }}
                    >
                      <p style={{ fontStyle: 'italic', margin: '0 0 var(--space-2)' }}>&ldquo;{s.quote}&rdquo;</p>
                      <footer style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
                        — {s.attribution}
                      </footer>
                    </blockquote>
                  </div>

                  {/* Right: outcomes — premium amber-accented panel with
                      leaf-green brand check tokens (not flat grey). */}
                  <div
                    style={{
                      background: `color-mix(in srgb, ${BRAND_TONE.amber} 8%, var(--surface-card))`,
                      borderTop: `var(--border-3, 3px) solid ${BRAND_TONE.amber}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-6)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 'var(--fs-overline)',
                        letterSpacing: 'var(--ls-overline)',
                        textTransform: 'uppercase',
                        color: BRAND_TONE.amber,
                        fontWeight: 'var(--fw-bold)' as React.CSSProperties['fontWeight'],
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      What the sponsor got
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      {s.outcomes.map((o) => (
                        <li key={o} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                          <span
                            aria-hidden="true"
                            style={{
                              flex: '0 0 auto',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: 'var(--radius-circle, 50%)',
                              background: `color-mix(in srgb, ${BRAND_TONE.leaf} 18%, transparent)`,
                              color: BRAND_TONE.leaf,
                              fontWeight: 'var(--fw-bold)' as React.CSSProperties['fontWeight'],
                              lineHeight: 1,
                            }}
                          >
                            &#10003;
                          </span>
                          <span style={{ color: 'var(--text-body)' }}>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Two-door CTA */}
      <section
        aria-label="Call to action"
        style={{
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-20) var(--space-5)',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 'var(--container-md)', margin: '0 auto' }}>
          <Badge solid style={{ marginBottom: 'var(--space-5)' }}>
            Graduate as a Certified Anthropic AI Systems Architect
          </Badge>
          <h2
            className="cb-balance"
            style={{ color: 'var(--text-on-inverse)', fontSize: 'var(--fs-h1)', margin: '0 0 var(--space-3)' }}
          >
            Write the next Demo Day story
          </h2>
          <p style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-on-inverse)', opacity: 0.85, margin: '0 0 var(--space-8)' }}>
            Learn With Claude. Build Through Colaberry. Deploy In The Real World.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {/* DS Button filters non-DOM props, so SPA links use the cb-btn classes
                directly on react-router Link to preserve client-side navigation.
                On the dark inverse band, secondary actions get an explicit light
                outline so they read against the surface. */}
            <Link className="cb-btn cb-btn--primary cb-btn--lg" to="/enroll">
              <span>Join the Challenge</span>
            </Link>
            <Link
              className="cb-btn cb-btn--lg"
              to="/sponsorship"
              style={{
                background: 'transparent',
                color: 'var(--text-on-inverse)',
                boxShadow: 'inset 0 0 0 var(--border-2) var(--text-on-inverse)',
              }}
            >
              <span>Sponsor Your Team</span>
            </Link>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setShowBooking(true)}
              style={{ color: 'var(--text-on-inverse)' }}
            >
              {STANDARD_CTAS.secondary}
            </Button>
          </div>
        </div>
      </section>

      {/* Responsive: stack the sponsor two-column grid on narrow viewports */}
      <style>{`
        @media (max-width: 768px) {
          .cs-sponsor-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/case-studies" />
    </>
  );
}

export default CaseStudiesPage;
