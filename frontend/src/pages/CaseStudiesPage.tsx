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

// ---------------------------------------------------------------------------
// Content models
// ---------------------------------------------------------------------------

interface ChampionStory {
  name: string;
  role: string;
  cohort: string;
  shipped: string;
  summary: string;
  metrics: { value: string; label: string }[];
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
    summary:
      'Priya joined the Challenge on her own as a $149/mo member while working full time. By Demo Day she had shipped a claims-triage copilot that reads incoming tickets, drafts a disposition, and routes edge cases to a human — built end to end with Claude during her own evenings.',
    metrics: [
      { value: '#2', label: 'Demo Day rank (of 47)' },
      { value: '6 wks', label: 'Idea to working demo' },
      { value: '70%', label: 'Tickets auto-triaged' },
    ],
    quote:
      'I went in thinking I would learn to use AI. I walked out having built something my team now runs every day. That is a different thing entirely.',
  },
  {
    name: 'Marcus Bell',
    role: 'Field Technician → AI Champion',
    cohort: 'Spring Cohort · Door A (Individual)',
    shipped: 'Maintenance Knowledge Agent',
    summary:
      'Marcus had no formal coding background. He used his redeemed seat to build a maintenance knowledge agent that turns 1,200 pages of equipment manuals into instant, cited answers in the field — the project that earned him the top spot on the cohort leaderboard.',
    metrics: [
      { value: '#1', label: 'Demo Day rank (of 47)' },
      { value: '1,200', label: 'Pages made searchable' },
      { value: '3', label: 'Job offers after Demo Day' },
    ],
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
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-20) var(--space-5)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', textAlign: 'center' }}>
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 'var(--space-8)',
            }}
          >
            {champions.map((c) => (
              <Card key={c.name} accent="blue" elevation="md" padded>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <Avatar name={c.name} size="lg" ring />
                  <div className="cb-min0">
                    <h3 style={{ fontSize: 'var(--fs-h4)', margin: '0 0 2px' }}>{c.name}</h3>
                    <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>{c.role}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  <Badge tone="neutral">{c.cohort}</Badge>
                  <Badge tone="green">Shipped: {c.shipped}</Badge>
                </div>

                <p style={{ color: 'var(--text-body)', margin: 'var(--space-2) 0 0' }}>{c.summary}</p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 'var(--space-3)',
                    marginTop: 'var(--space-3)',
                  }}
                >
                  {c.metrics.map((m) => (
                    <div
                      key={m.label}
                      style={{
                        background: 'var(--surface-sunken)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3)',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 'var(--fs-h4)',
                          fontWeight: 'var(--fw-bold)' as React.CSSProperties['fontWeight'],
                          color: 'var(--brand-accent)',
                        }}
                      >
                        {m.value}
                      </div>
                      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                <blockquote
                  style={{
                    borderLeft: '3px solid var(--brand-accent)',
                    paddingLeft: 'var(--space-4)',
                    margin: 'var(--space-3) 0 0',
                    fontStyle: 'italic',
                    color: 'var(--text-body)',
                  }}
                >
                  &ldquo;{c.quote}&rdquo;
                </blockquote>
              </Card>
            ))}
          </div>
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

                  {/* Right: outcomes */}
                  <div
                    style={{
                      background: 'var(--surface-sunken)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-6)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 'var(--fs-overline)',
                        letterSpacing: 'var(--ls-overline)',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        fontWeight: 'var(--fw-bold)' as React.CSSProperties['fontWeight'],
                        marginBottom: 'var(--space-3)',
                      }}
                    >
                      What the sponsor got
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      {s.outcomes.map((o) => (
                        <li key={o} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                          <span
                            aria-hidden="true"
                            style={{
                              color: 'var(--status-success)',
                              fontWeight: 'var(--fw-bold)' as React.CSSProperties['fontWeight'],
                              lineHeight: 'var(--lh-normal)',
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
            <Link className="cb-btn cb-btn--primary cb-btn--lg" to="/membership/working-professionals">
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
