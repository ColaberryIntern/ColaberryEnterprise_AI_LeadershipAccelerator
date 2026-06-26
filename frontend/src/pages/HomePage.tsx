import React from 'react';
import SEOHead from '../components/SEOHead';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Badge } from '../colaberry/components/core/Badge';

/**
 * HomePage — "One Class, Many Doors".
 *
 * One program (the cohort), entered through two doors:
 *   Door A — individuals self-serve a $149/mo membership.
 *   Door B — employers sponsor annual seats; employees redeem codes,
 *            learn on their own time, climb a company leaderboard, present at Demo Day.
 *
 * The corporate value prop is TALENT DISCOVERY, not training:
 * "Find out who your real AI builders are — without taking anyone off the job."
 *
 * Built on the Colaberry design system: semantic tokens only (no raw hex),
 * core DS components (Button, Card, Badge). Section order:
 * hero → two doors → how the Challenge works → brand-line band → trust strip → final dual CTA.
 */

const INDIVIDUAL_PATH = '/membership/working-professionals';
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
    body: 'Enter the same cohort the pros do, on your own schedule. A guided path that turns "I use AI" into "I build with AI" — with real projects, not toy demos.',
    points: [
      'Self-serve membership at $149/mo — start this week',
      'Learn With Claude, build through Colaberry, deploy in the real world',
      'Earn your spot on the leaderboard and present at Demo Day',
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
    body: 'Sponsor annual seats and let your people prove it. They learn on their own time, climb a company-scoped leaderboard, and ship work you can see — no one comes off the job.',
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
    body: 'No one leaves their desk. People progress through the build path on their own schedule, around the work they already do.',
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

interface Proof {
  stat: string;
  label: string;
}

const PROOF: Proof[] = [
  { stat: 'Since 2012', label: 'Colaberry has helped people build careers in data and AI' },
  { stat: '5,000+', label: 'careers launched through hands-on, build-first programs' },
  { stat: 'Learn With Claude', label: 'frontier AI guidance built into every step of the path' },
  { stat: 'One cohort', label: 'two doors — individuals and teams learn side by side' },
];

function HomePage() {
  return (
    <>
      <SEOHead
        title="Home"
        description="One class, many doors. Find out who your real AI builders are — without taking anyone off the job. Join the Challenge as an individual, or sponsor your team. Learn with Claude, build through Colaberry, deploy in the real world."
      />

      {/* ============================ HERO ============================ */}
      <section
        aria-label="Find your AI builders"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(1200px 600px at 70% -10%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 60%), var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-32) 0 var(--space-24)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            backgroundImage:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 76%, transparent), color-mix(in srgb, var(--surface-inverse) 90%, transparent)), url('/hero/hero-home.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          className="container"
          style={{ position: 'relative', zIndex: 1, maxWidth: 980, paddingInline: 'var(--space-6)', textAlign: 'center' }}
        >
          <Badge solid style={{ marginBottom: 'var(--space-6)' }}>
            One class · many doors
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
            Find out who your real AI builders are — without taking anyone off the job.
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'color-mix(in srgb, var(--text-on-inverse) 80%, transparent)',
              maxWidth: 680,
              margin: '0 auto var(--space-10)',
            }}
          >
            Most people consume AI. Very few learn to build with it. One cohort, two
            doors: enter it yourself, or sponsor your team and let your people prove
            what they can ship.
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
              color: 'color-mix(in srgb, var(--text-on-inverse) 60%, transparent)',
            }}
          >
            $149/mo for individuals · annual, reassignable seats for teams
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
            {DOORS.map((door) => (
              <Card
                key={door.title}
                accent={door.tone}
                elevation="md"
                hoverable
                padded
                className="cb-min0"
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
              >
                <div>
                  <Badge tone={door.tone}>{door.badge}</Badge>
                </div>
                <h3
                  style={{
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
                <p style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 500, color: 'var(--text-body)', margin: 0 }}>
                  {door.who}
                </p>
                <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
                  {door.body}
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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
                <div style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
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
            ))}
          </div>
        </div>
      </section>

      {/* =================== HOW THE CHALLENGE WORKS =================== */}
      <section
        aria-label="How the Challenge works"
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

      {/* ======================= TRUST / PROOF ======================= */}
      <section
        aria-label="Why Colaberry"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {PROOF.map((item) => (
              <div
                key={item.stat}
                className="cb-min0"
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-6)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: 'var(--fs-h3)',
                    lineHeight: 'var(--lh-tight)',
                    color: 'var(--brand-accent)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  {item.stat}
                </div>
                <div style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)' }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
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
            are — without taking anyone off the job.
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
