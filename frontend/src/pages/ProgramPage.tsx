import React from 'react';
import SEOHead from '../components/SEOHead';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Badge } from '../colaberry/components/core/Badge';
import EcosystemPillars from '../components/capability/EcosystemPillars';
import EcosystemTimeline from '../components/capability/EcosystemTimeline';
import ArchitectNetwork from '../components/capability/ArchitectNetwork';
import CompanyMomentumDashboard from '../components/capability/CompanyMomentumDashboard';
import AuthorityStrip from '../components/capability/AuthorityStrip';
import MaturityJourney from '../components/visuals/MaturityJourney';
import ProgramRoadmap from '../components/visuals/ProgramRoadmap';
import PartnerStrip from '../components/visuals/PartnerStrip';

/**
 * ProgramPage — enterprise.colaberry.ai.
 *
 * Positions the offering as a SELF-PACED program that lives inside a living
 * AI Systems Capability ecosystem, not a fixed cohort. Training is one part of
 * the ecosystem: learners also get certified (Certified Anthropic AI Systems
 * Architect, CCA-F), build real projects on their own workflows with Claude
 * Code, join a network of AI Architects across companies and phases, attend
 * weekly live events, and follow a rolling timeline that keeps them current as
 * AI moves. Single persona, same as the rest of the site: a decision-maker who
 * is also the learner, evaluating the platform for their company. One primary
 * CTA everywhere, "Start free" -> /try, with a soft "Book a walkthrough".
 *
 * Built on the Colaberry design system, mirroring HomePage's idiom: semantic
 * tokens only, DS core components (Button/Card/Badge), alternating
 * surface-page / surface-sunken sections, and the shared capability + visual
 * components so this page matches every other page.
 */

/** Single-persona destinations (see publicRoutes.tsx). */
const TRY_PATH = '/try'; // start a free account (learner + org view)
const WALKTHROUGH_PATH = '/contact'; // soft secondary — book a guided walkthrough

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-h2)',
  lineHeight: 'var(--lh-heading)', letterSpacing: 'var(--ls-tight)', color: 'var(--text-strong)',
  margin: '0 0 var(--space-4)',
};
const leadStyle: React.CSSProperties = {
  fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0,
};
const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h5)',
  lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', margin: '0 0 var(--space-3)',
};
const cardBody: React.CSSProperties = {
  fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0,
};

type CardAccent = 'red' | 'green' | 'blue';

interface HowStep { accent: CardAccent; title: string; body: string; }

/** Self-paced "how it works" — NOT a fixed Mon/Thu cohort. */
const HOW_IT_WORKS: HowStep[] = [
  {
    accent: 'red',
    title: 'Start any day',
    body: 'The program is self-paced, so there is no cohort to wait for. Create your account and begin the moment you are ready, not on a date we picked.',
  },
  {
    accent: 'blue',
    title: 'Learn on your own time',
    body: 'Work through guided paths around your job, at the pace that fits your week. Nobody comes off the floor, and nothing expires the moment a class ends.',
  },
  {
    accent: 'green',
    title: 'Build hands-on with Claude Code',
    body: 'Every path ends in a real, deployed build. You work in Claude Code, the same agentic tooling teams ship with in production, guided step by step.',
  },
  {
    accent: 'blue',
    title: 'Optional weekly live events',
    body: 'Drop into weekly live sessions, office hours, and workshops when you want them. They keep you current as AI moves, they do not lock your calendar.',
  },
];

interface Proof { tone: 'red' | 'blue' | 'green'; label: string; sub: string; }
const CREDENTIAL_PROOF: Proof[] = [
  { tone: 'red', label: 'You can architect a real system', sub: 'Not answer a quiz. You scope a problem, decompose it, and design the solution.' },
  { tone: 'blue', label: 'You built and deployed it', sub: 'A running build on a real workflow, defended at a capstone, is the hardest credential to fake.' },
  { tone: 'green', label: 'Anthropic-aligned, CCA-F', sub: 'You prepare on the Claude Code curriculum teams ship with, toward the CCA-F credential.' },
];

function ProgramPage() {
  return (
    <>
      <SEOHead
        title="The Self-Paced AI Systems Architect Program"
        description="A self-paced program inside a living AI Systems Capability ecosystem. Learn on your own time, start any day, build real systems with Claude Code, get certified as an Anthropic AI Systems Architect (CCA-F), and join a network of AI Architects with weekly live events."
      />

      {/* ============================ HERO ============================ */}
      <section
        aria-label="A self-paced program inside an AI capability ecosystem"
        style={{
          position: 'relative', overflow: 'hidden',
          background: 'radial-gradient(1200px 600px at 70% -10%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 60%), var(--surface-inverse)',
          color: 'var(--text-on-inverse)', padding: 'var(--space-32) 0 var(--space-20)',
        }}
      >
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 80%, transparent), color-mix(in srgb, var(--surface-inverse) 92%, transparent)), url('/hero/hero-professional.jpg')",
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 1000, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <Badge solid style={{ marginBottom: 'var(--space-6)' }}>A self-paced program, inside an ecosystem</Badge>
          <h1 className="cb-balance" style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-hero-fluid)',
            lineHeight: 'var(--lh-tight)', letterSpacing: 'var(--ls-tighter)', margin: '0 0 var(--space-6)', color: 'var(--text-on-inverse)',
          }}>
            Your team learns AI on their own time.{' '}
            <span style={{ color: 'var(--brand-accent)' }}>Builds real systems.</span>{' '}
            Gets certified.
          </h1>
          <p style={{
            fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)',
            color: 'color-mix(in srgb, var(--text-on-inverse) 84%, transparent)', maxWidth: 780, margin: '0 auto var(--space-6)',
          }}>
            Self-paced, so your people learn on their own time, around the job they already do. Nobody comes
            off the floor. They start any day and build real AI systems with Claude Code. Training is one part
            of a living ecosystem: certification, real projects, weekly live events, and a network of AI
            Architects that keeps them current as AI moves. You try it all yourself first, free.
          </p>
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 'var(--fs-body-sm)', fontWeight: 700,
            letterSpacing: 'var(--ls-wide)', color: 'var(--brand-accent)', margin: '0 0 var(--space-8)',
          }}>
            Learn With Claude. Build Through Colaberry. Deploy In The Real World.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'center', justifyContent: 'center' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="program_hero_start_free">Start free</Button>
            <a href={WALKTHROUGH_PATH} data-track="program_hero_book_walkthrough" style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 600,
              color: 'color-mix(in srgb, var(--text-on-inverse) 86%, transparent)', textDecoration: 'none',
            }}>Book a walkthrough &rarr;</a>
          </div>
          <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--fs-caption)', color: 'color-mix(in srgb, var(--text-on-inverse) 70%, transparent)' }}>
            Evaluating this for your company? You experience the content yourself, you are the learner too.
            Try the whole platform free, then invite your team when you are ready. No credit card.
          </p>
          <p style={{
            marginTop: 'var(--space-8)', fontSize: 'var(--fs-caption)', fontWeight: 600, letterSpacing: 'var(--ls-wide)',
            color: 'color-mix(in srgb, var(--text-on-inverse) 66%, transparent)',
          }}>
            Start any day &nbsp;·&nbsp; Self-paced &nbsp;·&nbsp; Anthropic / Claude Code partner
          </p>
        </div>
      </section>

      {/* ======================= AUTHORITY (BOOK) ======================= */}
      <section aria-label="Grounded in Trust Before Intelligence" style={{ background: 'var(--surface-page)', padding: 'var(--space-20) 0' }}>
        <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
          <AuthorityStrip />
        </div>
      </section>

      {/* ==================== THE ECOSYSTEM ==================== */}
      <section aria-label="The AI Systems Capability ecosystem" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-16)' }}>
            <Badge tone="red" style={{ marginBottom: 'var(--space-4)' }}>Training is one part</Badge>
            <h2 className="cb-balance" style={h2Style}>A program that lives inside an ecosystem</h2>
            <p style={leadStyle}>
              The course is only the entry point. You also get certified, build real projects, join a network
              of AI Architects, attend weekly live events, and stay current as the field moves. Six parts, one
              ecosystem, all working together.
            </p>
          </div>
          <EcosystemPillars />
        </div>
      </section>

      {/* ==================== SELF-PACED: HOW IT WORKS ==================== */}
      <section aria-label="How the self-paced program works" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-16)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>How it works</Badge>
            <h2 className="cb-balance" style={h2Style}>Self-paced, on your schedule, not ours</h2>
            <p style={leadStyle}>
              There is no Monday-and-Thursday cohort to keep up with. You start when you are ready and move at
              the pace your week allows, with live events there whenever you want them.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {HOW_IT_WORKS.map((step) => (
              <Card key={step.title} accent={step.accent} elevation="md" padded hoverable style={{ height: '100%' }}>
                <h3 style={cardTitle}>{step.title}</h3>
                <p style={cardBody}>{step.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== MATURITY MODEL (ANIMATED) ==================== */}
      <section aria-label="The AI maturity model" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1200, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>The levels you climb</Badge>
            <h2 className="cb-balance" style={h2Style}>From AI Aware to AI Architect</h2>
            <p style={leadStyle}>
              The program is the engine that moves you up the maturity model, one level at a time. You can see
              exactly where you are and what it takes to reach the next level.
            </p>
          </div>
          <MaturityJourney />
        </div>
      </section>

      {/* ==================== CERTIFICATION (IMAGE + TEXT) ==================== */}
      <section aria-label="The certification" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ display: 'grid', gap: 'var(--space-10)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'center' }}>
            <div>
              <Badge tone="green" style={{ marginBottom: 'var(--space-4)' }}>The certification</Badge>
              <h2 style={h2Style}>Get certified as an Anthropic AI Systems Architect</h2>
              <p style={{ ...leadStyle, marginBottom: 'var(--space-6)' }}>
                The program prepares you for the Certified Anthropic AI Systems Architect credential (CCA-F). It
                is not a certificate of attendance. It proves you can ship: you learn the pattern, then you build
                and defend a real system. A credential a hiring manager, a board, or your own team can trust.
              </p>
              <Card elevation="md" padded>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--space-4)' }}>
                  {CREDENTIAL_PROOF.map((row) => (
                    <li key={row.label} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                      <span style={{ marginTop: 2, flex: '0 0 auto' }}>
                        <Badge tone={row.tone} dot>&nbsp;</Badge>
                      </span>
                      <span>
                        <strong style={{ color: 'var(--text-strong)', fontSize: 'var(--fs-body-sm)' }}>{row.label}</strong>
                        <br />
                        <span style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)' }}>{row.sub}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            <img src="/img/certificate.jpg" alt="The Certified Anthropic AI Systems Architect credential"
              style={{ width: '100%', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', display: 'block' }} loading="lazy" />
          </div>
        </div>
      </section>

      {/* ==================== REAL PROJECTS (IMAGE + TEXT) ==================== */}
      <section aria-label="Build real projects on your own workflows" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ display: 'grid', gap: 'var(--space-10)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'center' }}>
            <img src="/img/developer-code.jpg" alt="A builder shipping a real AI system in a code editor"
              style={{ width: '100%', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', display: 'block' }} loading="lazy" />
            <div>
              <Badge tone="red" style={{ marginBottom: 'var(--space-4)' }}>Real projects</Badge>
              <h2 style={h2Style}>Build on your own workflows, not toy problems</h2>
              <p style={{ ...leadStyle, marginBottom: 'var(--space-5)' }}>
                This is not slideware. You scope a real problem from your own world and build a working AI
                system against it, a multi-step agent, an automation, or a decision tool that actually runs.
                You direct the work in Claude Code, the same tooling teams ship with in production.
              </p>
              <p style={leadStyle}>
                You leave with a deployed build, a repo, and a defended architecture. Proof of capability you
                can show a hiring manager, a board, or your own team, long after the program is behind you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ THE 12-WEEK GUIDED PATH ============ */}
      <section aria-label="The 12-week guided path" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1200, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="warning" style={{ marginBottom: 'var(--space-4)' }}>The guided path</Badge>
            <h2 className="cb-balance" style={h2Style}>A guided path from first prompt to certified architect</h2>
            <p style={leadStyle}>
              Self-paced does not mean unstructured. A guided path of roughly twelve weeks runs a project lane
              and a CCA-F certification lane side by side, converging on one finish: Certified Anthropic AI
              Systems Architect. You follow it on your own clock.
            </p>
          </div>
          <ProgramRoadmap />
        </div>
      </section>

      {/* ==================== WEEKLY LIVE EVENTS + STAY CURRENT ==================== */}
      <section aria-label="Weekly live events and staying current" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>Weekly and rolling</Badge>
            <h2 className="cb-balance" style={h2Style}>Weekly live events keep you current</h2>
            <p style={leadStyle}>
              AI changes weekly, so a one-time course goes stale. You get a rolling stream of weekly live
              events, new modules, and model updates on a timeline that never stops, so you never fall behind.
            </p>
          </div>
          <EcosystemTimeline />
        </div>
      </section>

      {/* ==================== ARCHITECT NETWORK ==================== */}
      <section aria-label="The architect network" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="green" style={{ marginBottom: 'var(--space-4)' }}>The network</Badge>
            <h2 className="cb-balance" style={h2Style}>A network of AI Architects, across companies and phases</h2>
            <p style={leadStyle}>
              You learn alongside builders and architects at other companies, some a few steps ahead, some
              right beside you. The network is where capability compounds, long after any single course ends.
            </p>
          </div>
          <ArchitectNetwork />
        </div>
      </section>

      {/* ==================== PROGRESS DASHBOARD ==================== */}
      <section aria-label="Track your progress" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1080, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>Track your progress</Badge>
            <h2 className="cb-balance" style={h2Style}>See how far you have come, and your sponsor sees it too</h2>
            <p style={leadStyle}>
              One live view of where you are, what you have shipped, and how close you are to the credential.
              If your seat is employer-sponsored, your sponsor watches the same capability climb, on the same
              dashboard used across the platform.
            </p>
          </div>
          <CompanyMomentumDashboard />
        </div>
      </section>

      {/* ==================== ANTHROPIC PARTNER STRIP ==================== */}
      <section aria-label="Anthropic partnership" style={{ background: 'var(--surface-page)', padding: 'var(--space-16) 0' }}>
        <div className="container" style={{ paddingInline: 'var(--space-6)' }}><PartnerStrip /></div>
      </section>

      {/* ====================== FINAL CTA ====================== */}
      <section aria-label="Get started" style={{ background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 820, paddingInline: 'var(--space-6)', textAlign: 'center' }}>
          <h2 className="cb-balance" style={{ ...h2Style, color: 'var(--text-on-inverse)', margin: '0 0 var(--space-5)' }}>
            Start free. Explore it yourself. Bring your team when ready.
          </h2>
          <p style={{
            fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)',
            color: 'color-mix(in srgb, var(--text-on-inverse) 84%, transparent)', maxWidth: 640, margin: '0 auto var(--space-10)',
          }}>
            Create your free account and step into the whole ecosystem yourself, as both the learner and the
            admin: certification, real projects, weekly live events, and a network of AI Architects. Watch
            capability climb on a live dashboard, then invite your team free when you are ready.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'center', justifyContent: 'center' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="program_final_start_free">Start free</Button>
            <a href={WALKTHROUGH_PATH} data-track="program_final_book_walkthrough" style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 600,
              color: 'color-mix(in srgb, var(--text-on-inverse) 86%, transparent)', textDecoration: 'none',
            }}>Book a walkthrough &rarr;</a>
          </div>
        </div>
      </section>
    </>
  );
}

export default ProgramPage;
