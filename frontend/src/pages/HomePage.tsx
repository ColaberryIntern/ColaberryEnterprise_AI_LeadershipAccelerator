import React from 'react';
import SEOHead from '../components/SEOHead';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Badge } from '../colaberry/components/core/Badge';
import ProgramRoadmap from '../components/visuals/ProgramRoadmap';
import PartnerStrip from '../components/visuals/PartnerStrip';
import CohortUrgency from '../components/visuals/CohortUrgency';
import SectionFigure from '../components/visuals/SectionFigure';
import { StatCounter } from '../components/visuals/charts';

/**
 * HomePage — "One Program. Two Doors In."
 *
 * One continuous 12-week program (the cohort), entered through two doors:
 *   Door A — individuals "Join the Challenge" at /enroll.
 *   Door B — employers "Sponsor Your Team" at /sponsorship.
 *
 * There is NO standalone 3-week class: the four phases simply group the 12
 * weeks. The outcome credential is the "Certified Anthropic AI Systems
 * Architect" (CCA-F prep). Colaberry is an Anthropic / Claude Code partner —
 * learners train hands-on with Claude Code, so sponsors "put their people in
 * Anthropic-partner hands."
 *
 * Built on the Colaberry design system: semantic tokens only (no raw layout
 * hex), bold premium brand language, big Roboto headings, full-bleed brand
 * moments. Section order:
 *   hero (light text over dark photo) → two doors → 12-week roadmap centerpiece
 *   → partner strip → outcomes stat row → section figure (real photo)
 *   → cohort urgency → brand-line band → final dual CTA.
 */

const INDIVIDUAL_PATH = '/enroll';
const SPONSOR_PATH = '/sponsorship';
const DESIGNER_PATH = '/ai-workforce-designer';

interface Door {
  badge: string;
  tone: 'red' | 'blue';
  title: string;
  who: string;
  body: string;
  points: string[];
  ctaLabel: string;
  ctaHref: string;
  ctaTone?: 'red' | 'green' | 'blue';
}

const DOORS: Door[] = [
  {
    badge: 'Door A · Individuals',
    tone: 'red',
    title: 'Join the Challenge',
    who: 'For working professionals, career-changers, and self-starters.',
    body: 'Enter the same 12-week cohort the pros do, on your own schedule. A guided path that turns "I use AI" into "I build with AI" — with real projects, not toy demos.',
    points: [
      'One continuous 12-week program — start with the next cohort',
      'Learn With Claude, build through Colaberry, deploy in the real world',
      'Graduate as a Certified Anthropic AI Systems Architect (CCA-F prep)',
    ],
    ctaLabel: 'Join the Challenge',
    ctaHref: INDIVIDUAL_PATH,
    ctaTone: 'red',
  },
  {
    badge: 'Door B · Employers',
    tone: 'blue',
    title: 'Sponsor Your Team',
    who: 'For leaders who need to know who their real AI builders are.',
    body: 'Put your people in Anthropic-partner hands. They train hands-on with Claude Code, ship work you can see, and climb a company-scoped leaderboard — no one comes off the job.',
    points: [
      'Reassignable seats — if someone leaves, the seat does not',
      'A company leaderboard that surfaces your true builders',
      'Talent discovery, not another training line item',
    ],
    ctaLabel: 'Sponsor Your Team',
    ctaHref: SPONSOR_PATH,
    ctaTone: 'blue',
  },
];

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: '01',
    title: 'Buy seats',
    body: 'Sponsor a block of annual seats for your organization. One invoice, one cohort, zero scheduling headaches.',
  },
  {
    n: '02',
    title: 'Employees redeem codes',
    body: 'Each teammate redeems a code to claim a seat. Codes are reassignable, so a seat is never wasted when someone moves on.',
  },
  {
    n: '03',
    title: 'Learn on their own time',
    body: 'No one leaves their desk. People progress through the 12-week build path on their own schedule, around the work they already do.',
  },
  {
    n: '04',
    title: 'Company leaderboard',
    body: 'A leaderboard scoped to your organization shows real progress and real output — so your actual AI builders rise to the top.',
  },
  {
    n: '05',
    title: 'Demo Day',
    body: 'Top builders present what they shipped. You discover the talent you already employ — proven, not self-reported.',
  },
];

interface Outcome {
  value: string;
  label: string;
  accent?: string;
}

const OUTCOMES: Outcome[] = [
  { value: '12', label: 'weeks, one continuous program — four phases, one credential', accent: 'var(--brand-accent)' },
  { value: '5,000+', label: 'careers launched through hands-on, build-first programs', accent: 'var(--chart-3)' },
  { value: 'Since 2012', label: 'helping people build real careers in data and AI', accent: 'var(--chart-1)' },
  { value: 'CCA-F', label: 'Certified Anthropic AI Systems Architect — what you graduate as', accent: 'var(--chart-4)' },
];

function HomePage() {
  return (
    <>
      <SEOHead
        title="Home"
        description="One program, two doors. Learn with Claude, build through Colaberry, deploy in the real world. Join the 12-week Challenge as an individual, or sponsor your team — and graduate a Certified Anthropic AI Systems Architect."
      />

      {/* ============================ HERO ============================ */}
      <section
        aria-label="Most people consume AI. Very few learn to build with it."
        style={{
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(1200px 600px at 70% -10%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 60%), var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-32) 0 var(--space-24)',
        }}
      >
        {/* Dark photo wash — keep it dark enough that light hero text stays AA-legible. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            backgroundImage:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 78%, transparent), color-mix(in srgb, var(--surface-inverse) 92%, transparent)), url('/hero/hero-home.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          className="container"
          style={{ position: 'relative', zIndex: 1, maxWidth: 980, paddingInline: 'var(--space-6)', textAlign: 'center' }}
        >
          <Badge solid style={{ marginBottom: 'var(--space-6)' }}>
            One program · two doors · one credential
          </Badge>
          <h1
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'var(--fs-hero-fluid)',
              lineHeight: 'var(--lh-tight)',
              letterSpacing: 'var(--ls-tighter)',
              margin: '0 0 var(--space-6)',
              color: 'var(--text-on-inverse)',
            }}
          >
            Most people consume AI. Very few learn to build with it.
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'color-mix(in srgb, var(--text-on-inverse) 82%, transparent)',
              maxWidth: 700,
              margin: '0 auto var(--space-8)',
            }}
          >
            Learn With Claude. Build Through Colaberry. Deploy In The Real World. One
            continuous 12-week cohort, two doors in: walk in yourself, or sponsor your
            team and find out who your real AI builders are.
          </p>
          <p
            style={{
              fontSize: 'var(--fs-body-sm)',
              fontWeight: 600,
              letterSpacing: 'var(--ls-wide)',
              textTransform: 'uppercase',
              color: 'color-mix(in srgb, var(--brand-secondary) 70%, var(--text-on-inverse))',
              margin: '0 0 var(--space-8)',
            }}
          >
            Graduate as a Certified Anthropic AI Systems Architect
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
              justifyContent: 'center',
            }}
          >
            <Button as="a" href={INDIVIDUAL_PATH} size="lg" data-track="hero_join_challenge">
              Join the Challenge
            </Button>
            <Button
              as="a"
              href={SPONSOR_PATH}
              size="lg"
              tone="blue"
              data-track="hero_sponsor_team"
            >
              Sponsor Your Team
            </Button>
          </div>
          <p
            style={{
              marginTop: 'var(--space-6)',
              fontSize: 'var(--fs-caption)',
              color: 'color-mix(in srgb, var(--text-on-inverse) 64%, transparent)',
            }}
          >
            Next 12-week cohort starts Thu, Jul 23 · individuals self-serve · annual,
            reassignable seats for teams
          </p>
        </div>
      </section>

      {/* ======================= THE TWO DOORS ======================= */}
      <section
        aria-label="Two ways in"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-16)' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 'var(--fs-h2)',
                lineHeight: 'var(--lh-heading)',
                letterSpacing: 'var(--ls-tight)',
                color: 'var(--text-strong)',
                margin: '0 0 var(--space-4)',
              }}
            >
              One program. Two doors in.
            </h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              Same cohort, same standard, same Demo Day. Choose the door that fits you —
              individuals walk in on their own, employers send their teams.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 'var(--space-8)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            }}
          >
            {DOORS.map((door) => {
              // Door A (individual / "Join the Challenge") = single-person photo;
              // Door B (employer / "Sponsor Your Team") = team photo. Both cards sit
              // on a light surface, so tint with --surface-card so text stays AA-readable.
              const watermarkUrl =
                door.tone === 'blue' ? '/img/team-collab.jpg' : '/hero/hero-professional.jpg';
              return (
              <Card
                key={door.title}
                accent={door.tone}
                elevation="md"
                hoverable
                padded
                className="cb-min0"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-5)',
                }}
              >
                {/* Subtle photo watermark — strong --surface-card tint keeps it a faint
                    background texture so card text stays fully WCAG-AA legible. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 0,
                    backgroundImage: `linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 88%, transparent), color-mix(in srgb, var(--surface-card) 94%, transparent)), url('${watermarkUrl}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <Badge tone={door.tone}>{door.badge}</Badge>
                </div>
                <h3
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 'var(--fs-h3)',
                    lineHeight: 'var(--lh-heading)',
                    color: 'var(--text-strong)',
                    margin: 0,
                  }}
                >
                  {door.title}
                </h3>
                <p style={{ position: 'relative', zIndex: 1, fontSize: 'var(--fs-body-sm)', fontWeight: 500, color: 'var(--text-body)', margin: 0 }}>
                  {door.who}
                </p>
                <p style={{ position: 'relative', zIndex: 1, fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
                  {door.body}
                </p>
                <ul style={{ position: 'relative', zIndex: 1, listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {door.points.map((point) => (
                    <li
                      key={point}
                      style={{
                        display: 'flex',
                        gap: 'var(--space-3)',
                        fontSize: 'var(--fs-body-sm)',
                        lineHeight: 'var(--lh-normal)',
                        color: 'var(--text-body)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          flex: '0 0 auto',
                          marginTop: 6,
                          width: 8,
                          height: 8,
                          borderRadius: 'var(--radius-pill)',
                          background:
                            door.tone === 'blue' ? 'var(--status-info)' : 'var(--brand-accent)',
                        }}
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
                  <Button
                    as="a"
                    href={door.ctaHref}
                    tone={door.ctaTone}
                    fullWidth
                    data-track={`door_${door.tone}_cta`}
                  >
                    {door.ctaLabel}
                  </Button>
                </div>
              </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ THE 12-WEEK ROADMAP (CENTERPIECE) ============ */}
      <section
        aria-label="Your 12-week path"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1200, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="warning" style={{ marginBottom: 'var(--space-4)' }}>
              The path
            </Badge>
            <h2
              className="cb-balance"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 'var(--fs-h2)',
                lineHeight: 'var(--lh-heading)',
                letterSpacing: 'var(--ls-tight)',
                color: 'var(--text-strong)',
                margin: '0 0 var(--space-4)',
              }}
            >
              Your 12-week path to Certified Anthropic AI Systems Architect
            </h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              One continuous program — never a quick course. The four phases simply group
              the twelve weeks, while a real project lane and a CCA-F certification lane
              run alongside and converge at the finish.
            </p>
          </div>

          <ProgramRoadmap />
        </div>
      </section>

      {/* ==================== ANTHROPIC PARTNER STRIP ==================== */}
      <section
        aria-label="Anthropic partnership"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-16) 0' }}
      >
        <div className="container" style={{ paddingInline: 'var(--space-6)' }}>
          <PartnerStrip />
        </div>
      </section>

      {/* ====================== OUTCOMES STAT ROW ====================== */}
      <section
        aria-label="Outcomes"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-12) 0 var(--space-24)' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-12)' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 'var(--fs-h2)',
                lineHeight: 'var(--lh-heading)',
                letterSpacing: 'var(--ls-tight)',
                color: 'var(--text-strong)',
                margin: '0 0 var(--space-4)',
              }}
            >
              Built for outcomes, proven since 2012
            </h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              A build-first track record, an Anthropic-partner curriculum, and a
              credential that says you can ship.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {OUTCOMES.map((item) => (
              <StatCounter
                key={item.label}
                value={item.value}
                label={item.label}
                accent={item.accent}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===================== SECTION FIGURE ===================== */}
      <section
        aria-label="How you learn"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <SectionFigure
            src="/img/mentor-coaching.jpg"
            alt="A mentor coaching a builder through a hands-on AI project at a laptop"
            eyebrow="Learn With Claude"
            title="Hands-on with Claude Code, from week one"
            body={[
              'You do not watch slides — you build. Every week you ship real, guided work with Claude Code, the same tools and workflows teams use in production.',
              'A continuous 12-week program means momentum compounds: foundations become an AI team, the team connects to the real world, and your work scales into a system you can demo.',
            ]}
            caption="Real project work, mentor-guided — not toy demos."
            side="right"
            cta={{ label: 'Join the Challenge', to: INDIVIDUAL_PATH }}
          />
        </div>
      </section>

      {/* ===================== COHORT URGENCY ===================== */}
      <section
        aria-label="Next cohort"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <CohortUrgency startDateISO="2026-07-23" seatsTotal={40} seatsLeft={7} />
        </div>
      </section>

      {/* =================== HOW THE CHALLENGE WORKS =================== */}
      <section
        aria-label="How the Challenge works for teams"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-16)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>
              For employers
            </Badge>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 'var(--fs-h2)',
                lineHeight: 'var(--lh-heading)',
                letterSpacing: 'var(--ls-tight)',
                color: 'var(--text-strong)',
                margin: '0 0 var(--space-4)',
              }}
            >
              How the Challenge works
            </h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              Five steps from purchase to proof. No one leaves their desk — and you find
              out who your real builders are.
            </p>
          </div>

          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            }}
          >
            {STEPS.map((step) => (
              <li key={step.n} className="cb-min0">
                <Card elevation="sm" padded style={{ height: '100%' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 44,
                      height: 44,
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--surface-brand-subtle)',
                      color: 'var(--brand-accent)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: 'var(--fs-body-sm)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    {step.n}
                  </span>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: 'var(--fs-h5)',
                      lineHeight: 'var(--lh-snug)',
                      color: 'var(--text-strong)',
                      margin: '0 0 var(--space-2)',
                    }}
                  >
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)', margin: 0 }}>
                    {step.body}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ====================== BRAND-LINE BAND ====================== */}
      <section
        aria-label="What we stand for"
        style={{
          background: 'var(--surface-brand)',
          color: 'var(--text-on-accent)',
          padding: 'var(--space-24) 0',
        }}
      >
        <div
          className="container"
          style={{ maxWidth: 880, paddingInline: 'var(--space-6)', textAlign: 'center' }}
        >
          <p
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'var(--fs-h2)',
              lineHeight: 'var(--lh-snug)',
              letterSpacing: 'var(--ls-tight)',
              margin: '0 0 var(--space-6)',
              color: 'var(--text-on-accent)',
            }}
          >
            Most people consume AI. Very few learn to build with it.
          </p>
          <p
            style={{
              fontSize: 'var(--fs-h4)',
              fontWeight: 500,
              lineHeight: 'var(--lh-snug)',
              margin: 0,
              color: 'color-mix(in srgb, var(--text-on-accent) 88%, transparent)',
            }}
          >
            Learn With Claude. Build Through Colaberry. Deploy In The Real World.
          </p>
        </div>
      </section>

      {/* ====================== FINAL DUAL CTA ====================== */}
      <section
        aria-label="Get started"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div
          className="container"
          style={{ maxWidth: 820, paddingInline: 'var(--space-6)', textAlign: 'center' }}
        >
          <h2
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'var(--fs-h2)',
              lineHeight: 'var(--lh-heading)',
              letterSpacing: 'var(--ls-tight)',
              color: 'var(--text-strong)',
              margin: '0 0 var(--space-5)',
            }}
          >
            Pick your door. The cohort is the same.
          </h2>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'var(--text-muted)',
              maxWidth: 620,
              margin: '0 auto var(--space-10)',
            }}
          >
            Walk in yourself, or send your team and find out who your real AI builders
            are — without taking anyone off the job. Either way, you graduate a Certified
            Anthropic AI Systems Architect.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
              justifyContent: 'center',
            }}
          >
            <Button as="a" href={INDIVIDUAL_PATH} size="lg" data-track="final_join_challenge">
              Join the Challenge
            </Button>
            <Button
              as="a"
              href={SPONSOR_PATH}
              size="lg"
              tone="blue"
              data-track="final_sponsor_team"
            >
              Sponsor Your Team
            </Button>
          </div>
          <p style={{ marginTop: 'var(--space-8)', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
            Still exploring? See your team as an AI-powered org with the{' '}
            <a
              href={DESIGNER_PATH}
              style={{ color: 'var(--text-link)', fontWeight: 500 }}
              data-track="secondary_workforce_designer"
            >
              AI Workforce Designer
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}

export default HomePage;
