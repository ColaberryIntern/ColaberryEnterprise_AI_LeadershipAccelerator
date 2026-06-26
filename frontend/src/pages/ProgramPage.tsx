import React, { useEffect, useRef } from 'react';
import SEOHead from '../components/SEOHead';
import { Badge } from '../colaberry/components/core/Badge';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Accordion } from '../colaberry/components/core/Accordion';
import ProgramRoadmap from '../components/visuals/ProgramRoadmap';
import MermaidDiagram from '../components/visuals/MermaidDiagram';
import PartnerStrip from '../components/visuals/PartnerStrip';
import SectionFigure from '../components/visuals/SectionFigure';
import { PhaseBand } from '../components/visuals/charts';

/**
 * ProgramPage — "The 12-week journey to Certified Anthropic AI Systems Architect."
 *
 * Strategy: One continuous 12-WEEK program. There is NO 3-week class — the four
 * phases (Build Your AI Foundation → Create Your AI Team → Connect AI to the Real
 * World → Design AI That Scales) are GROUPINGS of weeks within the single 12-week
 * path. Learners train hands-on with Claude Code (Anthropic / Claude Code partner)
 * and prep for the "Certified Anthropic AI Systems Architect" (CCA-F) credential.
 *
 * Two doors lead into the one program: "Join the Challenge" (individual) and
 * "Sponsor Your Team" (employer). Next 12-week cohort starts Mon Jul 27.
 *
 * Built on the Colaberry design system: semantic tokens only (no raw layout hex),
 * DS core components (Badge, Button, Card, Accordion) + the shared visual
 * components (ProgramRoadmap, MermaidDiagram, PartnerStrip, SectionFigure,
 * PhaseBand). styles.css is imported once at the app root (src/index.tsx).
 */

/** Two-door destinations (see publicRoutes.tsx). */
const DOOR_A_HREF = '/enroll'; // individuals — Join the Challenge
const DOOR_B_HREF = '/sponsorship'; // employers — Sponsor Your Team

/* ----------------------------------------------------------------------------
 * Scroll-reveal helper (collapses under prefers-reduced-motion via global CSS)
 * ------------------------------------------------------------------------- */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function FadeIn({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useFadeIn();
  return (
    <div ref={ref} className={`fade-in-section ${className}`}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Shared layout tokens (inline style objects reference semantic CSS variables
 * only — never raw hex — so corporate color swaps re-point a single token).
 * ------------------------------------------------------------------------- */
const sectionPad: React.CSSProperties = {
  paddingBlock: 'var(--space-24)',
};
const container: React.CSSProperties = {
  width: '100%',
  maxWidth: 1120,
  marginInline: 'auto',
  paddingInline: 'var(--space-6)',
};
const wide: React.CSSProperties = { ...container, maxWidth: 1280 };
const narrow: React.CSSProperties = { ...container, maxWidth: 760 };
const eyebrow: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: 'var(--ls-overline)',
  fontSize: 'var(--fs-overline)',
  fontWeight: 700,
  color: 'var(--brand-accent)',
};
const h2: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-h2)',
  fontWeight: 900,
  lineHeight: 'var(--lh-heading)',
  color: 'var(--text-strong)',
  letterSpacing: 'var(--ls-tight)',
  margin: 0,
};
const lead: React.CSSProperties = {
  fontSize: 'var(--fs-body-lg)',
  lineHeight: 'var(--lh-relaxed)',
  color: 'var(--text-muted)',
  margin: 0,
};
const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-h5)',
  fontWeight: 700,
  color: 'var(--text-strong)',
  margin: 0,
};
const cardBody: React.CSSProperties = { padding: 'var(--space-6)' };
const muted: React.CSSProperties = {
  color: 'var(--text-muted)',
  lineHeight: 'var(--lh-relaxed)',
  margin: 0,
};

/* ----------------------------------------------------------------------------
 * Content data
 * ------------------------------------------------------------------------- */

/** Card accent + Badge tone are constrained to the values those DS components
 *  actually support (Card: red|green|blue; Badge adds warning|neutral|outline). */
type CardAccent = 'red' | 'green' | 'blue';
type BadgeTone = CardAccent | 'warning' | 'neutral';

interface Phase {
  n: string;
  weeks: string;
  accent: CardAccent;
  /** Optional Badge tone override when the phase color isn't a Card accent. */
  badge?: BadgeTone;
  title: string;
  body: string;
}

/** The four PHASES — groupings of weeks within the single 12-week program. */
const PHASES: Phase[] = [
  {
    n: '1',
    weeks: 'Weeks 1–3',
    accent: 'red' as const,
    title: 'Build Your AI Foundation',
    body:
      'Master the architect mindset with Claude Code: decompose a real problem, structure context, and ship deterministic behavior on top of a probabilistic model.',
  },
  {
    n: '2',
    weeks: 'Weeks 4–6',
    accent: 'green' as const,
    title: 'Create Your AI Team',
    body:
      'Orchestrate multi-step agents — tools, sub-agents, and handoffs — so the system does real work instead of answering one prompt at a time.',
  },
  {
    n: '3',
    weeks: 'Weeks 7–9',
    accent: 'blue' as const,
    title: 'Connect AI to the Real World',
    body:
      'Wire your build to live data, APIs, and your own systems. Harden it against messy inputs so it works on the hundredth run, not just the first.',
  },
  {
    n: '4',
    weeks: 'Weeks 10–12',
    // Card supports red|green|blue accents; Badge supports a 'warning' (amber)
    // tone. Phase 4 wears the amber Badge for brand-correct phase color while
    // taking the supported blue Card accent so its top rule still renders.
    accent: 'blue' as const,
    badge: 'warning' as const,
    title: 'Design AI That Scales',
    body:
      'Make it production-grade: observability, guardrails, cost control, and a defended architecture you present as your Certified Architect capstone.',
  },
];

const BUILD_PILLARS = [
  {
    accent: 'red' as const,
    title: 'A working AI system — not a slide deck',
    body:
      'Over the 12 weeks you scope one real problem from your own world and build a functioning AI solution against it: a multi-step agent, an automation, or a decision tool that actually runs.',
  },
  {
    accent: 'blue' as const,
    title: 'The architect mindset',
    body:
      'You learn to design with Claude Code — decomposing a problem, orchestrating tools and context, and shipping something deterministic on top of a probabilistic model.',
  },
  {
    accent: 'green' as const,
    title: 'A portfolio artifact',
    body:
      'You leave with a deployed build, a repo, and a capstone presentation — proof of capability you can show a hiring manager, a board, or your own team.',
  },
];

const OUTCOMES = [
  {
    accent: 'red' as const,
    title: 'A deployed AI build',
    body: 'A real, running system scoped to a problem you care about — shipped over the full 12 weeks.',
  },
  {
    accent: 'blue' as const,
    title: 'Certified Anthropic AI Systems Architect',
    body:
      'Completion of the program plus your defended capstone preps you for the CCA-F credential.',
  },
  {
    accent: 'green' as const,
    title: 'A capstone presentation',
    body: 'A recorded, panel-tested walkthrough of what you built and the architecture decisions behind it.',
  },
  {
    accent: 'blue' as const,
    title: 'Reusable patterns',
    body: 'Architecture templates and prompts you keep and reuse long after week 12.',
  },
];

const FAQ_ITEMS = [
  {
    title: 'Do I need to be technical to enter?',
    content:
      'No. The program teaches you to architect and build with Claude Code as your execution partner — you direct the system, decompose the problem, and ship the result. People from non-engineering backgrounds finish with working builds every cohort.',
  },
  {
    title: 'How long is the program?',
    content:
      'It is one continuous 12-week program — a single, guided path from week 1 to week 12. The four phases (Build Your AI Foundation, Create Your AI Team, Connect AI to the Real World, Design AI That Scales) simply group the weeks; they are not separate classes. The next 12-week cohort starts Monday, July 27.',
  },
  {
    title: 'What is the "Certified Anthropic AI Systems Architect" credential?',
    content:
      'It is the outcome credential of the program. Across the 12 weeks you train hands-on with Claude Code on the Anthropic-aligned curriculum and build toward CCA-F (Claude Code Architect — Foundations) certification readiness. Colaberry is an Anthropic / Claude Code partner, so you prepare with the same tools teams ship with in production.',
  },
  {
    title: 'How do the phases and capstone work?',
    content:
      'Each phase is a three-week block within the single 12-week path, and each builds on the last: foundation, then your AI team, then real-world connection, then scale. The program closes with a capstone — you present your working system to peers and a panel: the problem, the live demo, and the architecture decisions behind it.',
  },
  {
    title: 'What is the difference between the two doors?',
    content:
      'There is one 12-week program. Individuals enter through "Join the Challenge" and learn alongside the cohort. Employers "Sponsor Your Team" — employees redeem a seat, learn on their own time, and progress through the same 12 weeks toward the same credential. Same program, same capstone — two ways in.',
  },
];

/* ----------------------------------------------------------------------------
 * Learn → Build → Deploy mermaid source (the brand spine of the 12 weeks).
 * ------------------------------------------------------------------------- */
const JOURNEY_CHART = `flowchart LR
  L["LEARN<br/>Weeks 1-3<br/>Build your AI foundation with Claude Code"]
  B["BUILD<br/>Weeks 4-9<br/>Create your AI team & connect it to the real world"]
  D["DEPLOY<br/>Weeks 10-12<br/>Design AI that scales · ship · defend"]
  C(["Certified Anthropic<br/>AI Systems Architect"])
  L --> B --> D --> C
  classDef learn fill:#FFE7E8,stroke:#FB2832,stroke-width:2px,color:#1A1A1A;
  classDef build fill:#EAF2F6,stroke:#367895,stroke-width:2px,color:#1A1A1A;
  classDef deploy fill:#FCF1DD,stroke:#E8920C,stroke-width:2px,color:#1A1A1A;
  classDef cert fill:#F1F9EA,stroke:#5BA63C,stroke-width:3px,color:#1A1A1A;
  class L learn;
  class B build;
  class D deploy;
  class C cert;`;

/* ----------------------------------------------------------------------------
 * Reusable two-door CTA block
 * ------------------------------------------------------------------------- */
function TwoDoorCTA() {
  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--space-6)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}
    >
      <Card accent="red" elevation="md">
        <div style={cardBody}>
          <Badge tone="red">For individuals</Badge>
          <h3 style={{ ...cardTitle, marginTop: 'var(--space-3)' }}>
            Learn it yourself
          </h3>
          <p style={{ ...muted, marginBlock: 'var(--space-3) var(--space-5)' }}>
            Join the next 12-week cohort and start building with Claude Code.
            One continuous program, full cohort access, all the way to your
            Certified Architect capstone.
          </p>
          <Button as="a" href={DOOR_A_HREF} variant="primary" size="lg" fullWidth>
            Join the Challenge
          </Button>
        </div>
      </Card>

      <Card accent="blue" elevation="md">
        <div style={cardBody}>
          <Badge tone="blue">For employers</Badge>
          <h3 style={{ ...cardTitle, marginTop: 'var(--space-3)' }}>
            Sponsor your team
          </h3>
          <p style={{ ...muted, marginBlock: 'var(--space-3) var(--space-5)' }}>
            Put your people in Anthropic-partner hands. Reassignable seats, a
            company view of progress, and the same 12-week path to Certified
            Anthropic AI Systems Architect.
          </p>
          <Button
            as="a"
            href={DOOR_B_HREF}
            variant="solid"
            tone="blue"
            size="lg"
            fullWidth
          >
            Sponsor Your Team
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */
function ProgramPage() {
  return (
    <div style={{ background: 'var(--surface-page)' }}>
      <SEOHead
        title="The Program — 12-Week AI Systems Architect"
        description="One continuous 12-week program. Train hands-on with Claude Code, build a real AI system across four phases, and prep for the Certified Anthropic AI Systems Architect (CCA-F) credential. Next cohort starts Mon Jul 27."
      />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        aria-label="Program overview"
        style={{
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          paddingBlock: 'var(--space-32)',
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
              "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 78%, transparent), color-mix(in srgb, var(--surface-inverse) 92%, transparent)), url('/hero/hero-ai.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          style={{
            ...container,
            maxWidth: 880,
            textAlign: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <FadeIn>
            <Badge solid>The Program · 12 weeks</Badge>
            {/* HERO CONTRAST: dark photo hero — every line uses light
                --text-on-inverse so the headline is never near-black. */}
            <h1
              className="cb-balance"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-hero-fluid)',
                fontWeight: 900,
                lineHeight: 'var(--lh-tight)',
                letterSpacing: 'var(--ls-tighter)',
                color: 'var(--text-on-inverse)',
                marginBlock: 'var(--space-5) var(--space-4)',
              }}
            >
              One 12-week journey. From first prompt to Certified Architect.
            </h1>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'var(--text-on-inverse)',
                opacity: 0.86,
                maxWidth: 660,
                marginInline: 'auto',
              }}
            >
              Most people consume AI. Very few learn to build with it. This is one
              continuous 12-week program — not a short course — where you train
              hands-on with Claude Code, ship a real AI system, and prep for the
              Certified Anthropic AI Systems Architect credential.
            </p>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-body-sm)',
                fontWeight: 700,
                letterSpacing: 'var(--ls-wide)',
                color: 'var(--brand-accent)',
                marginTop: 'var(--space-6)',
              }}
            >
              Learn With Claude. Build Through Colaberry. Deploy In The Real World.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: 'var(--space-8)',
              }}
            >
              <Button as="a" href="#enter" variant="primary" size="lg">
                Join the Challenge
              </Button>
              {/* data-theme="dark" re-points --text-strong/--border-strong so the
                  outline button reads correctly on the inverse hero surface. */}
              <span data-theme="dark" style={{ display: 'inline-flex' }}>
                <Button as="a" href={DOOR_B_HREF} variant="outline" size="lg">
                  Sponsor Your Team
                </Button>
              </span>
            </div>
            <p
              style={{
                fontSize: 'var(--fs-caption)',
                color: 'var(--text-on-inverse)',
                opacity: 0.74,
                marginTop: 'var(--space-5)',
              }}
            >
              Next 12-week cohort starts Monday, July 27.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── The 12-week roadmap (flagship visual) ─────────────────────────── */}
      <section aria-label="The 12-week roadmap" style={sectionPad}>
        <div style={wide}>
          <FadeIn>
            <div style={{ maxWidth: 720, marginBottom: 'var(--space-10)' }}>
              <span style={eyebrow}>The 12-week path</span>
              <h2 style={{ ...h2, marginBlock: 'var(--space-4) var(--space-4)' }}>
                One continuous program. Twelve weeks. Four phases.
              </h2>
              <p style={lead}>
                There is no three-week class here. You follow a single, guided path
                from week 1 to week 12, with a project lane and a CCA-F
                certification lane running alongside the whole way — converging on
                one finish: Certified Anthropic AI Systems Architect.
              </p>
            </div>
          </FadeIn>
          <FadeIn>
            <ProgramRoadmap />
          </FadeIn>
        </div>
      </section>

      {/* ── Learn → Build → Deploy (mermaid) ──────────────────────────────── */}
      <section
        aria-label="Learn, build, deploy"
        style={{ ...sectionPad, background: 'var(--surface-subtle)' }}
      >
        <div style={container}>
          <FadeIn>
            <div
              style={{
                maxWidth: 720,
                marginBottom: 'var(--space-8)',
                textAlign: 'center',
                marginInline: 'auto',
              }}
            >
              <span style={eyebrow}>How the weeks flow</span>
              <h2 style={{ ...h2, marginTop: 'var(--space-4)' }}>
                Learn. Build. Deploy.
              </h2>
              <p style={{ ...lead, marginTop: 'var(--space-4)' }}>
                The same arc runs through all twelve weeks: you learn a pattern with
                Claude Code, build it into your system, and deploy it for real.
              </p>
            </div>
          </FadeIn>
          <FadeIn>
            <div style={{ maxWidth: 980, marginInline: 'auto' }}>
              <MermaidDiagram
                chart={JOURNEY_CHART}
                caption="One continuous 12-week path: Learn (weeks 1–3) → Build (weeks 4–9) → Deploy (weeks 10–12), converging on the Certified Anthropic AI Systems Architect credential."
              />
            </div>
          </FadeIn>

          <FadeIn>
            <div style={{ marginTop: 'var(--space-10)' }}>
              <PhaseBand
                phases={[
                  { label: '1 · Build Foundation', color: 'var(--brand-accent)' },
                  { label: '2 · Create AI Team', color: 'var(--chart-3)' },
                  { label: '3 · Connect Real World', color: 'var(--chart-1)' },
                  { label: '4 · Design AI That Scales', color: 'var(--chart-4)' },
                ]}
              />
              <p
                style={{
                  ...muted,
                  fontSize: 'var(--fs-caption)',
                  marginTop: 'var(--space-3)',
                  textAlign: 'center',
                }}
              >
                Four phases, three weeks each — groupings within the single
                12-week program, never standalone classes.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── The four phases, detailed ─────────────────────────────────────── */}
      <section aria-label="The four phases" style={sectionPad}>
        <div style={container}>
          <FadeIn>
            <div style={{ maxWidth: 680, marginBottom: 'var(--space-10)' }}>
              <span style={eyebrow}>Inside the 12 weeks</span>
              <h2 style={{ ...h2, marginTop: 'var(--space-4)' }}>
                Four phases, one path.
              </h2>
            </div>
          </FadeIn>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            }}
          >
            {PHASES.map((p) => (
              <FadeIn key={p.title}>
                <Card accent={p.accent} elevation="sm" hoverable>
                  <div style={cardBody}>
                    <Badge tone={p.badge ?? p.accent}>
                      Phase {p.n} · {p.weeks}
                    </Badge>
                    <h3 style={{ ...cardTitle, marginTop: 'var(--space-3)' }}>
                      {p.title}
                    </h3>
                    <p style={{ ...muted, marginTop: 'var(--space-2)' }}>{p.body}</p>
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SectionFigure: mentor coaching ────────────────────────────────── */}
      <section
        aria-label="Mentored, every week"
        style={{ ...sectionPad, background: 'var(--surface-subtle)' }}
      >
        <div style={container}>
          <FadeIn>
            <SectionFigure
              src="/img/mentor-coaching.jpg"
              alt="A mentor coaching a learner through an AI build at a laptop"
              eyebrow="Mentored every week"
              title="You are never building alone."
              body={[
                'Across all twelve weeks you work with mentors who have shipped real AI systems. They review your architecture, unblock you in Claude Code, and hold you to a production bar — not a tutorial bar.',
                'Because it is one continuous program, the support compounds: week 8 builds on the same problem you scoped in week 1, with the same people who have watched it take shape.',
              ]}
              side="right"
              cta={{ label: 'Join the Challenge', to: DOOR_A_HREF }}
            />
          </FadeIn>
        </div>
      </section>

      {/* ── What you build ────────────────────────────────────────────────── */}
      <section aria-label="What you build" style={sectionPad}>
        <div style={container}>
          <FadeIn>
            <div style={{ maxWidth: 680, marginBottom: 'var(--space-10)' }}>
              <span style={eyebrow}>What you build</span>
              <h2 style={{ ...h2, marginTop: 'var(--space-4)' }}>
                You leave with something that runs.
              </h2>
            </div>
          </FadeIn>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            {BUILD_PILLARS.map((p) => (
              <FadeIn key={p.title}>
                <Card accent={p.accent} elevation="sm" hoverable>
                  <div style={cardBody}>
                    <h3 style={cardTitle}>{p.title}</h3>
                    <p style={{ ...muted, marginTop: 'var(--space-3)' }}>{p.body}</p>
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SectionFigure: developer code (hands-on with Claude Code) ─────── */}
      <section
        aria-label="Hands-on with Claude Code"
        style={{ ...sectionPad, background: 'var(--surface-subtle)' }}
      >
        <div style={container}>
          <FadeIn>
            <SectionFigure
              src="/img/developer-code.jpg"
              alt="Close-up of a developer building an AI system in a code editor"
              eyebrow="Hands-on with Claude Code"
              title="Real tools. Real builds. From week one."
              body={[
                'This is not slideware. From the first week you work in Claude Code — the same agentic tooling teams ship with in production — and keep shipping against your own problem through week twelve.',
                'By the end you have a deployed system, a repo, and a defended architecture: the raw material of the Certified Anthropic AI Systems Architect capstone.',
              ]}
              side="left"
            />
          </FadeIn>
        </div>
      </section>

      {/* ── Certification path ────────────────────────────────────────────── */}
      <section
        aria-label="Certification path"
        style={{ ...sectionPad, background: 'var(--surface-inverse)' }}
      >
        <div style={container}>
          <FadeIn>
            <div
              style={{
                display: 'grid',
                gap: 'var(--space-10)',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ ...eyebrow, color: 'var(--brand-accent)' }}>
                  The credential
                </span>
                <h2
                  style={{
                    ...h2,
                    color: 'var(--text-on-inverse)',
                    marginBlock: 'var(--space-4) var(--space-5)',
                  }}
                >
                  Become a Certified Anthropic AI Systems Architect.
                </h2>
                <p
                  style={{
                    fontSize: 'var(--fs-body-lg)',
                    lineHeight: 'var(--lh-relaxed)',
                    color: 'var(--text-on-inverse)',
                    opacity: 0.86,
                  }}
                >
                  The 12-week program is built to prepare you for the Certified
                  Anthropic AI Systems Architect credential (CCA-F prep). As you move
                  through the four phases, you train on the Anthropic-aligned
                  curriculum and, in parallel, ship the build you defend as your
                  capstone. Coursework and project reinforce each other: you learn
                  the pattern, then you ship it.
                </p>
              </div>

              <Card elevation="md">
                <div style={cardBody}>
                  <h3 style={cardTitle}>What the credential requires</h3>
                  <ul
                    style={{
                      marginTop: 'var(--space-5)',
                      display: 'grid',
                      gap: 'var(--space-4)',
                      paddingLeft: 0,
                      listStyle: 'none',
                    }}
                  >
                    {[
                      {
                        tone: 'red' as const,
                        label: 'Complete all 12 weeks',
                        sub: 'The full continuous program across four phases.',
                      },
                      {
                        tone: 'blue' as const,
                        label: 'CCA-F coursework',
                        sub: 'The Anthropic-aligned Claude Code curriculum, week by week.',
                      },
                      {
                        tone: 'green' as const,
                        label: 'A defended capstone',
                        sub: 'A working AI system you present and defend to a panel.',
                      },
                    ].map((row) => (
                      <li
                        key={row.label}
                        style={{
                          display: 'flex',
                          gap: 'var(--space-3)',
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{ marginTop: 2, flex: '0 0 auto' }}>
                          <Badge tone={row.tone} dot>
                            &nbsp;
                          </Badge>
                        </span>
                        <span>
                          <strong style={{ color: 'var(--text-strong)' }}>
                            {row.label}
                          </strong>
                          <br />
                          <span style={{ ...muted, fontSize: 'var(--fs-body-sm)' }}>
                            {row.sub}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p
                    style={{
                      ...muted,
                      marginTop: 'var(--space-5)',
                      fontSize: 'var(--fs-caption)',
                    }}
                  >
                    Recognition reflects coursework completed plus a shipped build
                    defended at the capstone.
                  </p>
                </div>
              </Card>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Partner strip ─────────────────────────────────────────────────── */}
      <section aria-label="Anthropic partner" style={{ paddingBlock: 'var(--space-16)' }}>
        <FadeIn>
          <PartnerStrip />
        </FadeIn>
      </section>

      {/* ── Outcomes ──────────────────────────────────────────────────────── */}
      <section
        aria-label="What you walk away with"
        style={{ ...sectionPad, background: 'var(--surface-subtle)' }}
      >
        <div style={container}>
          <FadeIn>
            <div style={{ maxWidth: 680, marginBottom: 'var(--space-10)' }}>
              <span style={eyebrow}>Outcomes</span>
              <h2 style={{ ...h2, marginTop: 'var(--space-4)' }}>
                What you walk away with after 12 weeks.
              </h2>
            </div>
          </FadeIn>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-5)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}
          >
            {OUTCOMES.map((o) => (
              <FadeIn key={o.title}>
                <Card elevation="sm" accent={o.accent} hoverable>
                  <div style={cardBody}>
                    <h3 style={{ ...cardTitle, fontSize: 'var(--fs-h5)' }}>
                      {o.title}
                    </h3>
                    <p style={{ ...muted, marginTop: 'var(--space-2)' }}>{o.body}</p>
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-label="Frequently asked questions" style={sectionPad}>
        <div style={narrow}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
              <span style={eyebrow}>Questions</span>
              <h2 style={{ ...h2, marginTop: 'var(--space-4)' }}>
                Before you choose a door.
              </h2>
            </div>
          </FadeIn>
          <FadeIn>
            <Accordion items={FAQ_ITEMS} />
          </FadeIn>
        </div>
      </section>

      {/* ── Two-door CTA ──────────────────────────────────────────────────── */}
      <section
        id="enter"
        aria-label="Enter the program"
        style={{
          ...sectionPad,
          background: 'var(--surface-inverse)',
          scrollMarginTop: 'var(--space-16)',
        }}
      >
        <div style={container}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
              <span style={{ ...eyebrow, color: 'var(--brand-accent)' }}>
                Pick your door
              </span>
              <h2
                className="cb-balance"
                style={{
                  ...h2,
                  color: 'var(--text-on-inverse)',
                  marginTop: 'var(--space-4)',
                }}
              >
                Same 12-week program. Same credential. Two ways in.
              </h2>
            </div>
          </FadeIn>
          <FadeIn>
            <TwoDoorCTA />
          </FadeIn>
        </div>
      </section>
    </div>
  );
}

export default ProgramPage;
