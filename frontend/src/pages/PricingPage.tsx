import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
// @ts-ignore - vendored JS design-system components ship .d.ts alongside
import { Card } from '../colaberry/components/core/Card';
// @ts-ignore
import { Button } from '../colaberry/components/core/Button';
// @ts-ignore
import { Badge } from '../colaberry/components/core/Badge';
import SectionFigure from '../components/visuals/SectionFigure';
import CohortUrgency from '../components/visuals/CohortUrgency';
import { PhaseBand, StatCounter } from '../components/visuals/charts';

/**
 * PricingPage — "One Class, Many Doors".
 *
 * ONE program, entered through two clearly separated doors:
 *   Door A (Individual): $149/mo membership → /membership/working-professionals
 *   Door B (Employer): sponsor annual seats, volume-tiered → /sponsorship
 *
 * Built entirely on the Colaberry design system (Card / Button / Badge) and
 * semantic tokens. No raw hex — corporate colors get swapped by re-pointing
 * tokens later. DS Buttons are rendered as <span> inside react-router <Link>
 * so navigation stays SPA-native while keeping DS styling.
 */

interface FeatureItem {
  label: string;
}

const INDIVIDUAL_FEATURES: FeatureItem[] = [
  { label: 'Full access to the live cohort — learn to build with Claude, not just consume it' },
  { label: 'Your own project from day one: ship a working AI build, not a certificate' },
  { label: 'Hands-on labs, working sessions, and a peer cohort of real builders' },
  { label: 'Present at Demo Day and earn a spot on the public builder leaderboard' },
  { label: 'Cancel anytime — no annual lock-in for individual members' },
];

interface SponsorTier {
  seats: string;
  name: string;
  per: string;
  note: string;
  accent: 'blue' | 'green' | 'red';
  featured?: boolean;
}

const SPONSOR_TIERS: SponsorTier[] = [
  {
    seats: '5–9 seats',
    name: 'Team',
    per: 'Standard annual seat',
    note: 'Reassignable seats, a company-scoped leaderboard, and a sponsor dashboard.',
    accent: 'blue',
  },
  {
    seats: '10–24 seats',
    name: 'Department',
    per: 'Volume-discounted seat',
    note: 'Everything in Team plus cohort scheduling support and a named program lead.',
    accent: 'green',
    featured: true,
  },
  {
    seats: '25+ seats',
    name: 'Enterprise',
    per: 'Custom annual pricing',
    note: 'Private cohorts, SSO, talent-discovery reporting, and a dedicated success partner.',
    accent: 'red',
  },
];

function CheckRow({ label }: FeatureItem) {
  return (
    <li
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-3)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: '0 0 auto',
          marginTop: '2px',
          color: 'var(--status-success)',
          fontWeight: 700,
        }}
      >
        ✓
      </span>
      <span className="cb-min0" style={{ color: 'var(--text-body)' }}>
        {label}
      </span>
    </li>
  );
}

function PricingPage() {
  return (
    <>
      <SEOHead
        title="Pricing — Join the Challenge or Sponsor Your Team"
        description="One program, two doors. Individuals join the build challenge from $149/mo (billed annually; $199/mo month-to-month). Employers sponsor annual, reassignable seats to discover their real AI builders. Most people consume AI. Very few learn to build with it."
      />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        aria-label="Pricing overview"
        style={{
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-20) var(--space-4) var(--space-16)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
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
        <div style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <Badge solid dot>
            One Class · Two Doors
          </Badge>
          {/* Hero lives on a dark photo: force light text explicitly so global
              heading color rules can't render the headline near-black. */}
          <h1
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-display)',
              fontWeight: 900,
              lineHeight: 1.05,
              color: 'var(--text-on-inverse)',
              margin: 'var(--space-5) 0 var(--space-4)',
            }}
          >
            Most people consume AI.
            <br />
            Very few learn to build with it.
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body)',
              color: 'color-mix(in srgb, var(--text-on-inverse) 82%, transparent)',
              maxWidth: 620,
              margin: '0 auto var(--space-6)',
            }}
          >
            One program. Two ways in. Join as an individual builder, or sponsor your
            team and discover who your real AI builders are — without taking anyone off
            the job. Graduate as a{' '}
            <strong style={{ color: 'var(--text-on-inverse)', fontWeight: 700 }}>
              Certified Anthropic AI Systems Architect
            </strong>{' '}
            — trained hands-on in Anthropic-partner hands.
          </p>

          {/* Visual proof row — the 12-week shape + headline outcomes, all light on dark. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 'var(--space-4)',
              maxWidth: 640,
              margin: '0 auto',
            }}
          >
            <StatCounter value="12 wks" label="One continuous program — four phases, no gaps" accent="var(--brand-secondary)" />
            <StatCounter value="$149/mo" label="Billed annually — or $199/mo month-to-month" accent="var(--brand-accent)" />
            <StatCounter value="CCA-F" label="Certified Anthropic AI Systems Architect prep" accent="var(--chart-3)" />
          </div>
        </div>
      </section>

      {/* ── The 12-week shape ────────────────────────────────── */}
      <section
        aria-label="The 12-week program shape"
        style={{
          background: 'var(--surface-page)',
          padding: 'var(--space-12) var(--space-4) 0',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-body-sm)',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              margin: '0 0 var(--space-4)',
            }}
          >
            One continuous 12-week path · four phases
          </p>
          <PhaseBand />
        </div>
      </section>

      {/* ── Two Doors ────────────────────────────────────────── */}
      <section
        aria-label="Choose your path"
        style={{
          background: 'var(--surface-page)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 'var(--space-6)',
              alignItems: 'stretch',
            }}
          >
            {/* Door A — Individual */}
            <Card
              accent="red"
              padded
              elevation="md"
              style={{ position: 'relative', overflow: 'hidden' }}
            >
              {/* Subtle single-person photo watermark — strong --surface-card tint keeps
                  it a faint background texture so card text stays fully WCAG-AA legible. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 0,
                  backgroundImage:
                    "linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 88%, transparent), color-mix(in srgb, var(--surface-card) 94%, transparent)), url('/hero/hero-professional.jpg')",
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  height: '100%',
                }}
              >
                <Badge tone="red">Door A · For Individuals</Badge>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h2)',
                    fontWeight: 700,
                    color: 'var(--text-strong)',
                    margin: 0,
                  }}
                >
                  Join the Challenge
                </h2>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-display)',
                      fontWeight: 900,
                      color: 'var(--text-strong)',
                      lineHeight: 1,
                    }}
                  >
                    $149
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>
                    /mo · billed annually
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body-sm)', margin: '0 0 var(--space-1)' }}>
                  Pay for the year up front — or{' '}
                  <strong style={{ color: 'var(--text-body)' }}>$199/mo</strong> month-to-month.
                </p>
                <p style={{ color: 'var(--text-body)', margin: 0 }}>
                  Self-serve. The fastest way to go from consuming AI to
                  building with it — with a working project to show for it.
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
                  {INDIVIDUAL_FEATURES.map((f) => (
                    <CheckRow key={f.label} label={f.label} />
                  ))}
                </ul>

                <div style={{ marginTop: 'auto', paddingTop: 'var(--space-5)' }}>
                  <Link
                    to="/membership/working-professionals"
                    style={{ textDecoration: 'none' }}
                    aria-label="Join the Challenge as an individual — view membership"
                  >
                    <Button as="span" size="lg" fullWidth>
                      Join the Challenge
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>

            {/* Door B — Employer */}
            <Card
              accent="blue"
              padded
              elevation="md"
              style={{ position: 'relative', overflow: 'hidden' }}
            >
              {/* Subtle team photo watermark — strong --surface-card tint keeps it a
                  faint background texture so card text stays fully WCAG-AA legible. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 0,
                  backgroundImage:
                    "linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 88%, transparent), color-mix(in srgb, var(--surface-card) 94%, transparent)), url('/img/team-collab.jpg')",
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  height: '100%',
                }}
              >
                <Badge tone="blue">Door B · For Employers</Badge>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h2)',
                    fontWeight: 700,
                    color: 'var(--text-strong)',
                    margin: 0,
                  }}
                >
                  Sponsor Your Team
                </h2>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-display)',
                      fontWeight: 900,
                      color: 'var(--text-strong)',
                      lineHeight: 1,
                    }}
                  >
                    Annual
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>
                    seats · volume-discounted
                  </span>
                </div>
                <p style={{ color: 'var(--text-body)', margin: 0 }}>
                  This is talent discovery, not training. Buy annual seats, hand
                  employees redemption codes, and find out who your real AI builders are —
                  while they learn on their own time.
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
                  <CheckRow label="Reassignable seats — if someone leaves, give the seat to the next builder. The 'what if they quit' objection is gone." />
                  <CheckRow label="A company-scoped leaderboard so your strongest builders surface themselves." />
                  <CheckRow label="Employees learn on their own time and present at Demo Day — no one comes off the job." />
                  <CheckRow label="Volume-discounted pricing that drops as your seat count grows." />
                </ul>

                <div style={{ marginTop: 'auto', paddingTop: 'var(--space-5)' }}>
                  <Link
                    to="/sponsorship"
                    style={{ textDecoration: 'none' }}
                    aria-label="Sponsor your team — view employer sponsorship"
                  >
                    <Button as="span" variant="primary" tone="blue" size="lg" fullWidth>
                      Sponsor Your Team
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ── What you graduate as (photo figure) ──────────────── */}
      <section
        aria-label="The credential you earn"
        style={{
          background: 'var(--surface-page)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <SectionFigure
            src="/img/outcome-builder.jpg"
            alt="A Colaberry member building a real working AI system at their laptop."
            eyebrow="The outcome"
            title="You don't finish with a certificate. You finish as a builder."
            body={[
              'Either door leads to the same place: graduating as a Certified Anthropic AI Systems Architect (CCA-F prep). You learn hands-on with Claude Code, building a real working AI system — not slideware.',
              'Colaberry is an Anthropic / Claude Code partner, so you put yourself — or your people — in Anthropic-partner hands from day one. Learn with Claude, build through Colaberry, deploy in the real world.',
            ]}
            side="right"
            cta={{ label: 'Join the Challenge', to: '/membership/working-professionals' }}
          />
        </div>
      </section>

      {/* ── Employer seat tiers ──────────────────────────────── */}
      <section
        aria-label="Employer seat tiers"
        style={{
          background: 'var(--surface-sunken)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto var(--space-10)' }}>
            <Badge tone="blue">Sponsor Your Team</Badge>
            <h2
              className="cb-balance"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-h1)',
                fontWeight: 700,
                color: 'var(--text-strong)',
                margin: 'var(--space-4) 0 var(--space-3)',
              }}
            >
              Annual seats, priced by volume
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              Per-seat pricing drops as you scale. Every seat is reassignable across your
              organization for the full year.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--space-5)',
              alignItems: 'stretch',
            }}
          >
            {SPONSOR_TIERS.map((tier) => (
              <Card
                key={tier.name}
                accent={tier.accent}
                padded
                elevation={tier.featured ? 'md' : 'sm'}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    height: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {tier.seats}
                    </span>
                    {tier.featured && <Badge tone="green">Most popular</Badge>}
                  </div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-h3, var(--fs-h2))',
                      fontWeight: 700,
                      color: 'var(--text-strong)',
                      margin: 0,
                    }}
                  >
                    {tier.name}
                  </h3>
                  <p style={{ color: 'var(--text-body)', fontWeight: 500, margin: 0 }}>
                    {tier.per}
                  </p>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>{tier.note}</p>
                </div>
              </Card>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 'var(--space-10)' }}>
            <Link to="/sponsorship" style={{ textDecoration: 'none' }}>
              <Button as="span" variant="primary" tone="blue" size="lg">
                Sponsor Your Team
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Third-party AI cost disclosure ───────────────────── */}
      <section
        aria-label="What's included and what students provide"
        style={{
          background: 'var(--surface-page)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Card padded elevation="sm">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Badge tone="warning">Good to know</Badge>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-h2)',
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                  margin: 0,
                }}
              >
                You bring your own AI tools
              </h2>
              <p style={{ color: 'var(--text-body)', margin: 0 }}>
                Membership and sponsorship cover the program, the cohort, and the build
                experience. Because you build on real tools, students cover their own
                third-party AI costs directly with the providers:
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0' }}>
                <CheckRow label="Anthropic Claude subscription — approximately $20/month." />
                <CheckRow label="LLM API usage for your project — typically under $10/month." />
              </ul>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body-sm)', margin: 'var(--space-2) 0 0' }}>
                These are paid directly to the providers and are not part of your Colaberry
                membership or seat price. Most builders spend well under $30/month total.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Next cohort urgency ──────────────────────────────── */}
      <section
        aria-label="Next cohort"
        style={{
          background: 'var(--surface-sunken)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <CohortUrgency startDateISO="2026-07-23" seatsTotal={40} seatsLeft={7} />
        </div>
      </section>

      {/* ── Closing band ─────────────────────────────────────── */}
      <section
        aria-label="Get started"
        style={{
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-16) var(--space-4)',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-h1)',
              fontWeight: 900,
              margin: '0 0 var(--space-3)',
            }}
          >
            Learn With Claude. Build Through Colaberry. Deploy In The Real World.
          </h2>
          <p style={{ color: 'color-mix(in srgb, var(--text-on-inverse) 80%, transparent)', margin: '0 0 var(--space-7)' }}>
            Pick your door. The class is the same — the way in is yours to choose.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link to="/membership/working-professionals" style={{ textDecoration: 'none' }}>
              <Button as="span" size="lg">
                Join the Challenge
              </Button>
            </Link>
            <Link to="/sponsorship" style={{ textDecoration: 'none' }}>
              {/* data-theme="dark" re-points --text-strong/--border-strong so the
                  outline button stays legible on the inverse closing-band surface. */}
              <span data-theme="dark" style={{ display: 'inline-flex' }}>
                <Button as="span" variant="outline" size="lg">
                  Sponsor Your Team
                </Button>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default PricingPage;
