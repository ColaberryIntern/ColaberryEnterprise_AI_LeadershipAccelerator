import React from 'react';
import SEOHead from '../components/SEOHead';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Badge } from '../colaberry/components/core/Badge';
import ProgramRoadmap from '../components/visuals/ProgramRoadmap';
import PartnerStrip from '../components/visuals/PartnerStrip';
import CohortUrgency from '../components/visuals/CohortUrgency';
import EmployerDashboardPreview from '../components/visuals/EmployerDashboardPreview';
import { StatCounter } from '../components/visuals/charts';

/**
 * HomePage — enterprise.colaberry.ai, employer-led.
 *
 * Research-validated message (maker/checker, 2026-06-29): the enterprise site
 * FOREGROUNDS the employer talent-discovery proposition — "Find out who your
 * real AI builders are, without taking anyone off the job" — and keeps the
 * individual door clearly secondary (never deleted).
 *
 * The unique proposition: sponsor a team into one continuous 12-week, build-first
 * program; employees learn on their own time (no one comes off the job), ship a
 * real deployed AI build at Demo Day, and the employer watches every builder
 * climb a company-scoped leaderboard — capability revealed by OUTPUT, not
 * inferred from resumes. Reassignable annual seats keep the capability with the
 * company even if a person leaves, for a fraction of the cost of one AI hire.
 *
 * Built on the Colaberry design system: semantic tokens only, executive register.
 * Section order: hero (employer) + trust strip → how it works (5 steps) →
 * why it works (4 pillars) → dashboard preview → 12-week roadmap → partner strip
 * → build-vs-buy cost band → outcomes → cohort urgency → individual door
 * (secondary) → brand band → final CTA.
 */

const SPONSOR_PATH = '/sponsorship';
const INDIVIDUAL_PATH = '/enroll';
const DESIGNER_PATH = '/ai-workforce-designer';

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: '01',
    title: 'Sponsor seats',
    body: 'Buy a block of annual seats for your organization. One invoice, one cohort — and the seats are reassignable, so a seat is never wasted when someone moves on.',
  },
  {
    n: '02',
    title: 'They learn in the evenings',
    body: 'Two live sessions a week — Monday & Thursday, 6:30–8:30 PM CST — plus self-paced build work around the job they already do. The sessions are after hours, so nobody comes off work.',
  },
  {
    n: '03',
    title: 'They build with Claude Code',
    body: 'Hands-on in Anthropic-partner training — real, guided work with Claude Code, the same tools teams ship with in production.',
  },
  {
    n: '04',
    title: 'You watch the leaderboard',
    body: 'A company-scoped leaderboard shows who is actually shipping — real progress and real output, in real time, from one dashboard.',
  },
  {
    n: '05',
    title: 'They ship at Demo Day',
    body: 'Top builders present a real, deployed AI product. You discover the talent you already employ — proven by what they built, not what they claim.',
  },
];

interface Pillar {
  tone: 'red' | 'blue' | 'green';
  title: string;
  body: string;
}

const PILLARS: Pillar[] = [
  {
    tone: 'red',
    title: 'Discover the builders you already employ',
    body: 'Your next AI builders may already be on your payroll — the hard workers with the drive but not yet the title or credential. The program surfaces them by having them build, so capability is revealed by output, not inferred from a resume.',
  },
  {
    tone: 'blue',
    title: 'Nobody comes off the job',
    body: 'No one leaves their desk and no billable hours are lost. People learn on their own time, around the work they already do, across one continuous 12-week program. Minimal disruption by design.',
  },
  {
    tone: 'green',
    title: 'Proven output, not resumes',
    body: 'Every seat ends in a real, deployed AI build presented at Demo Day — capability you can see and use, not a completion certificate. A shipped artifact is the hardest credential to fake.',
  },
  {
    tone: 'red',
    title: 'A reassignable capability asset',
    body: 'Annual seats are reassignable, so the capability stays with your company even if the person leaves — the "what if they quit" question, answered. Graduates earn the Certified Anthropic AI Systems Architect credential (CCA-F prep).',
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
  { value: 'Since 2012', label: 'building real careers in data and AI', accent: 'var(--chart-1)' },
  { value: 'CCA-F', label: 'Certified Anthropic AI Systems Architect — what builders graduate as', accent: 'var(--chart-4)' },
];

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 'var(--fs-h2)',
  lineHeight: 'var(--lh-heading)',
  letterSpacing: 'var(--ls-tight)',
  color: 'var(--text-strong)',
  margin: '0 0 var(--space-4)',
};

function HomePage() {
  return (
    <>
      <SEOHead
        title="Find out who your real AI builders are"
        description="Find out who your real AI builders are — without taking anyone off the job. Sponsor your team into a 12-week, build-first program: they learn on their own time, ship a real AI build at Demo Day, and you watch every builder climb a company leaderboard. Individuals can join the same cohort too."
      />

      {/* ============================ HERO (EMPLOYER-LED) ============================ */}
      <section
        aria-label="Find out who your real AI builders are, without taking anyone off the job."
        style={{
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(1200px 600px at 70% -10%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 60%), var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-32) 0 var(--space-20)',
        }}
      >
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
          style={{ position: 'relative', zIndex: 1, maxWidth: 1000, paddingInline: 'var(--space-6)', textAlign: 'center' }}
        >
          <Badge solid style={{ marginBottom: 'var(--space-6)' }}>
            AI capability, built from the inside
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
            Find out who your real AI builders are —{' '}
            <span style={{ color: 'var(--brand-accent)' }}>without taking anyone off the job.</span>
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'color-mix(in srgb, var(--text-on-inverse) 84%, transparent)',
              maxWidth: 760,
              margin: '0 auto var(--space-8)',
            }}
          >
            Sponsor your team into one continuous 12-week, build-first program and discover the
            people already on your payroll who can actually ship AI. They learn on their own time,
            around the work they already do, and prove it by deploying a real build at Demo Day —
            for a fraction of the cost of hiring one AI engineer.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-5)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Button as="a" href={SPONSOR_PATH} size="lg" data-track="hero_sponsor_team">
              Sponsor Your Team
            </Button>
            <a
              href={INDIVIDUAL_PATH}
              data-track="hero_individual_link"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--fs-body-sm)',
                fontWeight: 600,
                color: 'color-mix(in srgb, var(--text-on-inverse) 86%, transparent)',
                textDecoration: 'none',
              }}
            >
              Just want to join yourself? Enroll &rarr;
            </a>
          </div>
          {/* Trust strip — truthful credibility signal, raised high */}
          <p
            style={{
              marginTop: 'var(--space-8)',
              fontSize: 'var(--fs-caption)',
              fontWeight: 600,
              letterSpacing: 'var(--ls-wide)',
              color: 'color-mix(in srgb, var(--text-on-inverse) 66%, transparent)',
            }}
          >
            Since 2012 &nbsp;·&nbsp; 5,000+ careers launched &nbsp;·&nbsp; Anthropic / Claude Code partner
          </p>
        </div>
      </section>

      {/* =================== HOW IT WORKS (5 STEPS, lifted up) =================== */}
      <section
        aria-label="How it works for employers"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-16)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>
              For employers
            </Badge>
            <h2 style={h2Style}>From a block of seats to proven builders</h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              Five steps from purchase to proof. No one leaves their desk — and you find out who your
              real AI builders are.
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

          <div style={{ textAlign: 'center', marginTop: 'var(--space-12)' }}>
            <Button as="a" href={SPONSOR_PATH} size="lg" data-track="howitworks_sponsor_team">
              Sponsor Your Team
            </Button>
          </div>
        </div>
      </section>

      {/* ==================== WHY IT WORKS (4 PILLARS) ==================== */}
      <section
        aria-label="Why it works"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-16)' }}>
            <h2 style={h2Style}>A talent-discovery engine, not another training line item</h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              The value is not the course. It is finding the people who can build — and keeping that
              capability inside your company.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            }}
          >
            {PILLARS.map((pillar) => (
              <Card key={pillar.title} accent={pillar.tone} elevation="md" padded hoverable style={{ height: '100%' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 'var(--fs-h5)',
                    lineHeight: 'var(--lh-snug)',
                    color: 'var(--text-strong)',
                    margin: '0 0 var(--space-3)',
                  }}
                >
                  {pillar.title}
                </h3>
                <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
                  {pillar.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== EMPLOYER DASHBOARD PREVIEW ==================== */}
      <section
        aria-label="Watch every builder from one dashboard"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>
              Watch the progress
            </Badge>
            <h2 style={h2Style}>See exactly who is building — in real time</h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              A company-scoped view of the people who choose to build: their progress, what they have
              shipped, and who is climbing toward Demo Day. Proof you can see, not self-reported.
            </p>
          </div>
          <EmployerDashboardPreview />
        </div>
      </section>

      {/* ============ THE 12-WEEK ROADMAP ============ */}
      <section
        aria-label="The 12-week path"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1200, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="warning" style={{ marginBottom: 'var(--space-4)' }}>
              The program
            </Badge>
            <h2 className="cb-balance" style={h2Style}>
              One continuous 12-week path to Certified Anthropic AI Systems Architect
            </h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              Never a quick course. The four phases simply group the twelve weeks, while a real
              project lane and a CCA-F certification lane run alongside and converge at the finish.
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

      {/* ==================== BUILD-VS-BUY COST BAND ==================== */}
      <section
        aria-label="Build AI capability in-house"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 880, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <Badge tone="green" style={{ marginBottom: 'var(--space-4)' }}>
            Build, don&rsquo;t buy
          </Badge>
          <h2 className="cb-balance" style={{ ...h2Style, margin: '0 auto var(--space-5)', maxWidth: 760 }}>
            Grow AI builders in-house, instead of hiring them
          </h2>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'var(--text-muted)',
              maxWidth: 660,
              margin: '0 auto var(--space-8)',
            }}
          >
            Upskilling a team for AI used to mean an expensive new req or pulling people off billable
            work. Sponsor your team instead: reach your whole organization for less than the recruiting
            fee on a single AI engineer, with no one coming off the floor — and because seats are
            reassignable, the capability you build stays a company asset, not a personal perk.
          </p>
          <Button as="a" href={SPONSOR_PATH} size="lg" data-track="costband_sponsor_team">
            Sponsor Your Team
          </Button>
        </div>
      </section>

      {/* ====================== OUTCOMES STAT ROW ====================== */}
      <section
        aria-label="Outcomes"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-20) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-12)' }}>
            <h2 style={h2Style}>Built for outcomes, proven since 2012</h2>
            <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>
              A build-first track record, an Anthropic-partner curriculum, and a credential that says
              your people can ship.
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
              <StatCounter key={item.label} value={item.value} label={item.label} accent={item.accent} />
            ))}
          </div>
        </div>
      </section>

      {/* ===================== COHORT URGENCY ===================== */}
      <section
        aria-label="Next cohort"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <CohortUrgency startDateISO="2026-07-23" seatsTotal={40} seatsLeft={7} />
        </div>
      </section>

      {/* ============== INDIVIDUAL DOOR (SECONDARY) ============== */}
      <section
        aria-label="Prefer to join on your own"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-20) 0' }}
      >
        <div className="container" style={{ maxWidth: 880, paddingInline: 'var(--space-6)' }}>
          <Card elevation="sm" padded style={{ textAlign: 'center' }}>
            <Badge tone="red" style={{ marginBottom: 'var(--space-4)' }}>
              One class, many doors
            </Badge>
            <h2 style={{ ...h2Style, fontSize: 'var(--fs-h3)', margin: '0 0 var(--space-3)' }}>
              Prefer to walk in yourself?
            </h2>
            <p
              style={{
                fontSize: 'var(--fs-body)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'var(--text-muted)',
                maxWidth: 620,
                margin: '0 auto var(--space-6)',
              }}
            >
              Same cohort, same standard, same credential. Working professionals and career-changers
              can enter the 12-week Challenge on their own schedule and graduate a Certified Anthropic
              AI Systems Architect.
            </p>
            <Button as="a" href={INDIVIDUAL_PATH} tone="red" data-track="individual_door_enroll">
              Join the Challenge
            </Button>
          </Card>
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
        <div className="container" style={{ maxWidth: 880, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
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
            The best AI builder on your team may not have the title yet.
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

      {/* ====================== FINAL CTA ====================== */}
      <section
        aria-label="Get started"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}
      >
        <div className="container" style={{ maxWidth: 820, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <h2 className="cb-balance" style={{ ...h2Style, margin: '0 0 var(--space-5)' }}>
            Find out who your real AI builders are.
          </h2>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'var(--text-muted)',
              maxWidth: 640,
              margin: '0 auto var(--space-10)',
            }}
          >
            Sponsor your team and watch them build — without taking anyone off the job. Or walk in
            yourself. Either way, the work is real and the credential is earned.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'center', justifyContent: 'center' }}>
            <Button as="a" href={SPONSOR_PATH} size="lg" data-track="final_sponsor_team">
              Sponsor Your Team
            </Button>
            <a
              href={INDIVIDUAL_PATH}
              data-track="final_individual_link"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 600, color: 'var(--text-link)', textDecoration: 'none' }}
            >
              Just want to join yourself? Enroll &rarr;
            </a>
          </div>
          <p style={{ marginTop: 'var(--space-8)', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
            Still exploring? See your team as an AI-powered org with the{' '}
            <a href={DESIGNER_PATH} style={{ color: 'var(--text-link)', fontWeight: 500 }} data-track="secondary_workforce_designer">
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
