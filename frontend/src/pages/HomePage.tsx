import React from 'react';
import SEOHead from '../components/SEOHead';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Badge } from '../colaberry/components/core/Badge';
import ProgramRoadmap from '../components/visuals/ProgramRoadmap';
import PartnerStrip from '../components/visuals/PartnerStrip';
import { StatCounter } from '../components/visuals/charts';
import MaturityJourney from '../components/visuals/MaturityJourney';
import AuthorityStrip from '../components/capability/AuthorityStrip';
import CompanyMomentumDashboard from '../components/capability/CompanyMomentumDashboard';
import CapabilityIndex from '../components/capability/CapabilityIndex';
import EcosystemPillars from '../components/capability/EcosystemPillars';
import EcosystemTimeline from '../components/capability/EcosystemTimeline';
import ArchitectNetwork from '../components/capability/ArchitectNetwork';

/**
 * HomePage — enterprise.colaberry.ai.
 *
 * Positioned as an Enterprise AI Capability Platform for a SINGLE persona: a
 * decision-maker who is also the learner, evaluating the platform for their
 * company and wanting to experience it themselves. One primary CTA everywhere,
 * "Start free" -> /try, which grants a dual account (learner experience + their
 * own organization / management view). They explore the whole platform free,
 * watch capability climb on a live dashboard, and invite their team free when
 * ready. Colaberry design system.
 */

const TRY_PATH = '/try';
const WALKTHROUGH_PATH = '/contact';

interface Step { n: string; title: string; body: string; }
const STEPS: Step[] = [
  { n: '01', title: 'Assess & give access', body: 'Establish a baseline with your AI Capability Index, then give reassignable annual seats to the people you want to develop. Self-paced, so anyone can start any day.' },
  { n: '02', title: 'They learn on their own time', body: 'Self-paced paths they take whenever it fits, plus optional weekly live events and office hours to stay current. Nobody comes off the job.' },
  { n: '03', title: 'They build with Claude Code', body: 'Every path ends in a real, deployed build on your own workflows, guided hands-on in Anthropic-partner training.' },
  { n: '04', title: 'You watch capability climb', body: 'One dashboard shows who is advancing from Aware to Builder to Architect, what they have shipped, and the ROI behind it.' },
  { n: '05', title: 'They get certified & present', body: 'Builders earn the Certified Anthropic AI Systems Architect credential and present deployed work at Demo Day to the wider network.' },
];

interface FreeStep { n: string; title: string; body: string; }
const FREE_TRIAL: FreeStep[] = [
  { n: '01', title: 'Try it free yourself', body: 'One free account gives you both sides at once: the learner experience and your own management dashboard. Explore the whole platform and watch both perspectives together. No credit card.' },
  { n: '02', title: 'Invite your employees free', body: 'Send free test invites so your team can try it too. Their progress shows up on your dashboard as they learn and build.' },
  { n: '03', title: 'Activate licenses when you are ready', body: 'Like what you see? Activate licenses for instant full access. Licenses are the single paid step, and they are optional, only when you are ready.' },
];

interface Pillar { tone: 'red' | 'blue' | 'green'; title: string; body: string; }
const PILLARS: Pillar[] = [
  { tone: 'red', title: 'Discover the builders you already employ', body: 'Your next AI builders may already be on your payroll. The platform surfaces them by having them build, so capability is revealed by output, not inferred from a resume.' },
  { tone: 'blue', title: 'Nobody comes off the job', body: 'People learn on their own time, around the work they already do. No billable hours lost, minimal disruption by design.' },
  { tone: 'green', title: 'Proven output, not resumes', body: 'Every seat ends in a real, deployed AI build at Demo Day. A shipped artifact is the hardest credential to fake.' },
  { tone: 'red', title: 'A reassignable capability asset', body: 'Annual seats are reassignable, so the capability stays with your company even if a person leaves. Graduates earn the Certified Anthropic AI Systems Architect credential.' },
];

interface Outcome { value: string; label: string; accent?: string; }
const OUTCOMES: Outcome[] = [
  { value: '5,000+', label: 'careers launched through hands-on, build-first programs', accent: 'var(--chart-3)' },
  { value: 'Since 2012', label: 'building real careers in data and AI', accent: 'var(--chart-1)' },
  { value: '12 wks', label: 'from AI Aware to a deployed build at Demo Day', accent: 'var(--brand-accent)' },
  { value: 'CCA-F', label: 'Certified Anthropic AI Systems Architect, what builders graduate as', accent: 'var(--chart-4)' },
];

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-h2)',
  lineHeight: 'var(--lh-heading)', letterSpacing: 'var(--ls-tight)', color: 'var(--text-strong)',
  margin: '0 0 var(--space-4)',
};
const leadStyle: React.CSSProperties = {
  fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0,
};

function HomePage() {
  return (
    <>
      <SEOHead
        title="The Enterprise AI Capability Platform"
        description="Build an internal AI capability that becomes a competitive advantage. You are evaluating this for your company, so try the whole platform yourself free: explore it as both the learner and the admin, watch AI readiness and velocity climb across your organization on a live dashboard, and invite your team free when you are ready. No credit card."
      />

      {/* ============================ HERO ============================ */}
      <section
        aria-label="Turn your workforce into an AI-enabled organization"
        style={{
          position: 'relative', overflow: 'hidden',
          background: 'radial-gradient(1200px 600px at 70% -10%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 60%), var(--surface-inverse)',
          color: 'var(--text-on-inverse)', padding: 'var(--space-32) 0 var(--space-20)',
        }}
      >
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 80%, transparent), color-mix(in srgb, var(--surface-inverse) 92%, transparent)), url('/hero/hero-home.jpg')",
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 1000, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <Badge solid style={{ marginBottom: 'var(--space-6)' }}>The Enterprise AI Capability Platform</Badge>
          <h1 className="cb-balance" style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-hero-fluid)',
            lineHeight: 'var(--lh-tight)', letterSpacing: 'var(--ls-tighter)', margin: '0 0 var(--space-6)', color: 'var(--text-on-inverse)',
          }}>
            Turn your workforce into an{' '}
            <span style={{ color: 'var(--brand-accent)' }}>AI-enabled organization.</span>
          </h1>
          <p style={{
            fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)',
            color: 'color-mix(in srgb, var(--text-on-inverse) 84%, transparent)', maxWidth: 780, margin: '0 auto var(--space-8)',
          }}>
            You are evaluating this for your company, so try the whole thing yourself, free. Explore the
            platform as both the learner and the admin, watch AI readiness and velocity climb across your
            organization on a live dashboard, and invite your team free when you are ready.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'center', justifyContent: 'center' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="hero_start_free">Start free</Button>
            <a href={WALKTHROUGH_PATH} data-track="hero_book_walkthrough" style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 600,
              color: 'color-mix(in srgb, var(--text-on-inverse) 86%, transparent)', textDecoration: 'none',
            }}>Book a walkthrough &rarr;</a>
          </div>
          <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--fs-caption)', color: 'color-mix(in srgb, var(--text-on-inverse) 70%, transparent)' }}>
            Free to start, no credit card. A free account gives you both the learner experience and your own organization view.
          </p>
          <p style={{
            marginTop: 'var(--space-8)', fontSize: 'var(--fs-caption)', fontWeight: 600, letterSpacing: 'var(--ls-wide)',
            color: 'color-mix(in srgb, var(--text-on-inverse) 66%, transparent)',
          }}>
            Since 2012 &nbsp;·&nbsp; 5,000+ careers launched &nbsp;·&nbsp; Anthropic / Claude Code partner
          </p>
        </div>
      </section>

      {/* ======================= AUTHORITY (BOOK) ======================= */}
      <section aria-label="Grounded in Trust Before Intelligence" style={{ background: 'var(--surface-page)', padding: 'var(--space-20) 0' }}>
        <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
          <AuthorityStrip />
        </div>
      </section>

      {/* ================= HOW THE FREE TRIAL WORKS ================= */}
      <section aria-label="How the free trial works" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-16)' }}>
            <Badge tone="green" dot style={{ marginBottom: 'var(--space-4)' }}>Free to start</Badge>
            <h2 className="cb-balance" style={h2Style}>How the free trial works</h2>
            <p style={leadStyle}>Three effortless steps: free to explore, free to invite your team, and licenses only when you are ready. No credit card to begin.</p>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {FREE_TRIAL.map((step) => (
              <li key={step.n} className="cb-min0">
                <Card elevation="sm" padded style={{ height: '100%' }}>
                  <span aria-hidden="true" style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
                    borderRadius: 'var(--radius-pill)', background: 'var(--surface-brand-subtle)', color: 'var(--brand-accent)',
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--fs-body-sm)', marginBottom: 'var(--space-4)',
                  }}>{step.n}</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h5)', lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', margin: '0 0 var(--space-2)' }}>{step.title}</h3>
                  <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)', margin: 0 }}>{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
          <div style={{ textAlign: 'center', marginTop: 'var(--space-12)' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="freetrial_start_free">Start free</Button>
            <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>No credit card. Licenses only when you are ready.</p>
          </div>
        </div>
      </section>

      {/* ==================== THE ECOSYSTEM ==================== */}
      <section aria-label="The AI Systems Capability ecosystem" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-16)' }}>
            <Badge tone="red" style={{ marginBottom: 'var(--space-4)' }}>More than a course</Badge>
            <h2 className="cb-balance" style={h2Style}>An ecosystem for building AI systems capability</h2>
            <p style={leadStyle}>Training is one part of it. Your people also get certified, build real projects, join a network of AI Architects, attend weekly live events, and stay current as the field moves.</p>
          </div>
          <EcosystemPillars />
        </div>
      </section>

      {/* ==================== MATURITY MODEL (ANIMATED) ==================== */}
      <section aria-label="The AI maturity model" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1200, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>Organizational maturity</Badge>
            <h2 className="cb-balance" style={h2Style}>From AI Aware to AI Organization</h2>
            <p style={leadStyle}>
              Five levels your people climb, and the platform measures every one. Stop selling classes.
              Build organizational maturity you can prove.
            </p>
          </div>
          <MaturityJourney />
        </div>
      </section>

      {/* ==================== PHILOSOPHY (IMAGE + TEXT) ==================== */}
      <section aria-label="Your future AI leaders already work for you" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ display: 'grid', gap: 'var(--space-10)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'center' }}>
            <div>
              <Badge tone="green" style={{ marginBottom: 'var(--space-4)' }}>Our philosophy</Badge>
              <h2 style={h2Style}>Every organization already has its future AI leaders</h2>
              <p style={{ ...leadStyle, marginBottom: 'var(--space-5)' }}>
                They do not need to be hired. They need the right environment to grow. The platform
                identifies them, develops them, measures their progress, and keeps them in a community
                of practitioners long after the program ends.
              </p>
              <p style={{ ...leadStyle }}>
                There are three ways to become AI-enabled: hire expensive talent, replace everyone, or
                develop the people you already trust. Only the third one works.
              </p>
            </div>
            <img src="/img/team-collab.jpg" alt="A team collaborating on an AI build"
              style={{ width: '100%', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', display: 'block' }} loading="lazy" />
          </div>
        </div>
      </section>

      {/* =================== HOW IT WORKS (5 STEPS) =================== */}
      <section aria-label="How it works for employers" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-16)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>For employers</Badge>
            <h2 style={h2Style}>From a block of seats to proven builders</h2>
            <p style={leadStyle}>Five steps from baseline to proof. No one leaves their desk, and you find out who your real AI builders are.</p>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {STEPS.map((step) => (
              <li key={step.n} className="cb-min0">
                <Card elevation="sm" padded style={{ height: '100%' }}>
                  <span aria-hidden="true" style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
                    borderRadius: 'var(--radius-pill)', background: 'var(--surface-brand-subtle)', color: 'var(--brand-accent)',
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--fs-body-sm)', marginBottom: 'var(--space-4)',
                  }}>{step.n}</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h5)', lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', margin: '0 0 var(--space-2)' }}>{step.title}</h3>
                  <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)', margin: 0 }}>{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
          <div style={{ textAlign: 'center', marginTop: 'var(--space-12)' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="howitworks_start_free">Start free</Button>
          </div>
        </div>
      </section>

      {/* ==================== EXECUTIVE DASHBOARD ==================== */}
      <section aria-label="The executive dashboard" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1080, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>The executive dashboard</Badge>
            <h2 className="cb-balance" style={h2Style}>When your CIO logs in, they see momentum, not courses</h2>
            <p style={leadStyle}>Where the organization is, how fast it is moving, and when it reaches the next level, tied together from the data your people earn every day.</p>
          </div>
          <CompanyMomentumDashboard />
        </div>
      </section>

      {/* ==================== AI CAPABILITY INDEX ==================== */}
      <section aria-label="The AI Capability Index" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="warning" style={{ marginBottom: 'var(--space-4)' }}>Your signature metric</Badge>
            <h2 className="cb-balance" style={h2Style}>One score that measures it all</h2>
            <p style={leadStyle}>A benchmarked score across seven dimensions, grounded in the frameworks from <em>Trust Before Intelligence</em>. A concrete before-and-after story for the board.</p>
          </div>
          <CapabilityIndex ctaHref={WALKTHROUGH_PATH} />
        </div>
      </section>

      {/* ==================== STAY CURRENT — TIMELINE ==================== */}
      <section aria-label="Stay current with the timeline" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>Stay on top of AI</Badge>
            <h2 className="cb-balance" style={h2Style}>What&rsquo;s on the timeline this week</h2>
            <p style={leadStyle}>AI changes weekly, so a one-time course goes stale. Members get a rolling stream of weekly live events, new modules, and model updates, so your people never fall behind.</p>
          </div>
          <EcosystemTimeline />
        </div>
      </section>

      {/* ==================== ARCHITECT NETWORK ==================== */}
      <section aria-label="The architect network" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="green" style={{ marginBottom: 'var(--space-4)' }}>The network</Badge>
            <h2 className="cb-balance" style={h2Style}>A network of AI Architects, across companies and phases</h2>
            <p style={leadStyle}>Your people learn alongside builders and architects at other companies, some a few steps ahead, some right beside them. The network is where capability compounds, long after any course ends.</p>
          </div>
          <ArchitectNetwork />
        </div>
      </section>

      {/* ============ THE 12-WEEK ROADMAP (kept mechanic) ============ */}
      <section aria-label="The 12-week path" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1200, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="warning" style={{ marginBottom: 'var(--space-4)' }}>The program</Badge>
            <h2 className="cb-balance" style={h2Style}>How they climb: one continuous 12-week path to Architect</h2>
            <p style={leadStyle}>The development engine behind the maturity model. Four phases group the twelve weeks, while a real project lane and a CCA-F certification lane converge at the finish.</p>
          </div>
          <ProgramRoadmap />
        </div>
      </section>

      {/* ==================== WHY IT WORKS (4 PILLARS) ==================== */}
      <section aria-label="Why it works" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-16)' }}>
            <h2 style={h2Style}>A capability engine, not another training line item</h2>
            <p style={leadStyle}>The value is not the course. It is finding the people who can build, and keeping that capability inside your company.</p>
          </div>
          <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {PILLARS.map((pillar) => (
              <Card key={pillar.title} accent={pillar.tone} elevation="md" padded hoverable style={{ height: '100%' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h5)', lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', margin: '0 0 var(--space-3)' }}>{pillar.title}</h3>
                <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>{pillar.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== BUILD-VS-BUY COST BAND ==================== */}
      <section aria-label="Build AI capability in-house" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 880, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <Badge tone="green" style={{ marginBottom: 'var(--space-4)' }}>Build, don&rsquo;t buy</Badge>
          <h2 className="cb-balance" style={{ ...h2Style, margin: '0 auto var(--space-5)', maxWidth: 760 }}>Grow AI builders in-house, instead of hiring them</h2>
          <p style={{ fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', maxWidth: 660, margin: '0 auto var(--space-8)' }}>
            Reach your whole organization for less than the recruiting fee on a single AI engineer, with
            no one coming off the floor. Because seats are reassignable, the capability you build stays a
            company asset, not a personal perk.
          </p>
          <Button as="a" href={TRY_PATH} size="lg" data-track="costband_start_free">Start free</Button>
        </div>
      </section>

      {/* ====================== OUTCOMES STAT ROW ====================== */}
      <section aria-label="Outcomes" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-20) 0' }}>
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-12)' }}>
            <h2 style={h2Style}>Built for outcomes, proven since 2012</h2>
            <p style={leadStyle}>A build-first track record, an Anthropic-partner curriculum, and a credential that says your people can ship.</p>
          </div>
          <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {OUTCOMES.map((item) => (<StatCounter key={item.label} value={item.value} label={item.label} accent={item.accent} />))}
          </div>
        </div>
      </section>

      {/* ==================== ANTHROPIC PARTNER STRIP ==================== */}
      <section aria-label="Anthropic partnership" style={{ background: 'var(--surface-page)', padding: 'var(--space-16) 0' }}>
        <div className="container" style={{ paddingInline: 'var(--space-6)' }}><PartnerStrip /></div>
      </section>

      {/* ====================== BRAND-LINE BAND ====================== */}
      <section aria-label="What we stand for" style={{ background: 'var(--surface-brand)', color: 'var(--text-on-accent)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 880, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <p className="cb-balance" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-h2)', lineHeight: 'var(--lh-snug)', letterSpacing: 'var(--ls-tight)', margin: '0 0 var(--space-6)', color: 'var(--text-on-accent)' }}>
            The best AI builder on your team may not have the title yet.
          </p>
          <p style={{ fontSize: 'var(--fs-h4)', fontWeight: 500, lineHeight: 'var(--lh-snug)', margin: 0, color: 'color-mix(in srgb, var(--text-on-accent) 88%, transparent)' }}>
            Learn With Claude. Build Through Colaberry. Deploy In The Real World.
          </p>
        </div>
      </section>

      {/* ====================== FINAL CTA ====================== */}
      <section aria-label="Get started" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 820, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <h2 className="cb-balance" style={{ ...h2Style, margin: '0 0 var(--space-5)' }}>Try it free, then bring your team.</h2>
          <p style={{ fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', maxWidth: 640, margin: '0 auto var(--space-10)' }}>
            Start free and explore the whole platform yourself, as both the learner and the admin. Watch AI
            readiness and velocity climb across your organization on a live dashboard, then invite your team
            free when you are ready.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'center', justifyContent: 'center' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="final_start_free">Start free</Button>
            <a href={WALKTHROUGH_PATH} data-track="final_book_walkthrough" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 600, color: 'var(--text-link)', textDecoration: 'none' }}>
              Book a walkthrough &rarr;
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

export default HomePage;
