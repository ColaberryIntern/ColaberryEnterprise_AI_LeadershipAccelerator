import React, { useEffect, useRef } from 'react';
import SEOHead from '../components/SEOHead';
import { PROGRAM_SCHEDULE } from '../config/programSchedule';
import { Badge } from '../colaberry/components/core/Badge';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Progress } from '../colaberry/components/core/Progress';
import { Accordion } from '../colaberry/components/core/Accordion';

/**
 * ProgramPage — "The one class everyone enters."
 *
 * Strategy: One Class, Many Doors. A single cohort/program sits at the center;
 * two doors lead into it — individuals (Join the Challenge) and employers
 * (Sponsor Your Team). This page explains the program itself: what you build,
 * the cohort rhythm, the outcomes, the Anthropic Architect certification track,
 * and the leaderboard + Demo Day. It closes with the two-door CTA.
 *
 * Built entirely on the Colaberry design system: semantic tokens only (no raw
 * hex), DS core components (Badge, Button, Card, Progress, Accordion). styles.css
 * is imported once at the app root (src/index.tsx).
 */

/** Two-door destinations (see publicRoutes.tsx). */
const DOOR_A_HREF = '/membership/builders'; // individuals — self-serve membership
const DOOR_B_HREF = '/sponsorship'; // employers — sponsor annual seats

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
const BUILD_PILLARS = [
  {
    accent: 'red' as const,
    title: 'A working AI system — not a slide deck',
    body:
      'You scope one real problem from your own world and build a functioning AI solution against it: a multi-step agent, an automation, or a decision tool that actually runs.',
  },
  {
    accent: 'blue' as const,
    title: 'The architect mindset',
    body:
      'You learn to design with Claude — decomposing a problem, orchestrating tools and context, and shipping something deterministic on top of a probabilistic model.',
  },
  {
    accent: 'green' as const,
    title: 'A portfolio artifact',
    body:
      'You leave with a deployed build, a repo, and a Demo Day presentation — proof of capability you can show a hiring manager, a board, or your own team.',
  },
];

const RHYTHM = [
  {
    week: 'Week 1',
    title: 'Define & architect',
    body:
      'Pick your problem. Learn the build patterns with Claude. Lock a scoped, measurable target.',
  },
  {
    week: 'Week 2',
    title: 'Build & refine',
    body:
      'Stand up the system, harden it against real inputs, and instrument it so it works on the second run, not just the first.',
  },
  {
    week: 'Week 3',
    title: 'Present at Demo Day',
    body:
      'Tell the story, run the live demo, and defend your architecture decisions to the cohort and panel.',
  },
];

const OUTCOMES = [
  {
    accent: 'red' as const,
    title: 'A deployed AI build',
    body: 'A real, running system scoped to a problem you care about.',
  },
  {
    accent: 'blue' as const,
    title: 'Anthropic Architect cert track',
    body:
      'Progress along the official Learn-With-Claude curriculum toward Anthropic Architect recognition.',
  },
  {
    accent: 'green' as const,
    title: 'A Demo Day presentation',
    body: 'A recorded, panel-tested walkthrough of what you built and why.',
  },
  {
    accent: 'blue' as const,
    title: 'Reusable patterns',
    body: 'Architecture templates and prompts you keep and reuse after the cohort ends.',
  },
];

const FAQ_ITEMS = [
  {
    title: 'Do I need to be technical to enter?',
    content:
      'No. The program teaches you to architect and build with Claude as your execution partner — you direct the system, decompose the problem, and ship the result. People from non-engineering backgrounds finish with working builds every cohort.',
  },
  {
    title: 'How much time does it take?',
    content: `${PROGRAM_SCHEDULE.shortDescription}. Between sessions, expect a few hours of applied work on your own build. Sponsored employees learn on their own time and move at their own pace toward Demo Day.`,
  },
  {
    title: 'What is the Anthropic Architect certification track?',
    content:
      'A structured Learn-With-Claude curriculum that runs alongside the build. You progress through the official coursework as you ship your system, working toward Anthropic Architect recognition — the same training path Colaberry uses internally.',
  },
  {
    title: 'How do the leaderboard and Demo Day work?',
    content:
      'As you build, your progress posts to a cohort leaderboard. Sponsored teams see a company-scoped board so employers can spot their real AI builders. Every cohort ends in Demo Day: you present your working system live to peers and a panel.',
  },
  {
    title: 'What is the difference between the two doors?',
    content:
      'There is one program. Individuals enter through a monthly membership and learn self-serve. Employers sponsor annual seats; employees redeem a code, learn on their own time, and climb a company leaderboard. Same cohort, same Demo Day — two ways in.',
  },
];

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
            Join as a member and start building with Claude this week. Self-serve,
            month to month, full cohort access.
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
            Find out who your real AI builders are — without taking anyone off the
            job. Reassignable annual seats, company leaderboard, Demo Day.
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
        title="The Program"
        description="One class everyone enters. Build a working AI system with Claude over a 3-week cohort, progress along the Anthropic Architect certification track, climb the leaderboard, and present at Demo Day."
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
              "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 76%, transparent), color-mix(in srgb, var(--surface-inverse) 90%, transparent)), url('/hero/hero-ai.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div style={{ ...container, maxWidth: 880, textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <FadeIn>
            <Badge solid>The Program</Badge>
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
              The one class everyone enters.
            </h1>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'var(--text-on-inverse)',
                opacity: 0.82,
                maxWidth: 640,
                marginInline: 'auto',
              }}
            >
              Most people consume AI. Very few learn to build with it. This is the
              single cohort both doors lead into — where you ship a real AI system,
              earn it on a leaderboard, and prove it at Demo Day.
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
          </FadeIn>
        </div>
      </section>

      {/* ── One class, many doors ─────────────────────────────────────────── */}
      <section aria-label="One class, many doors" style={sectionPad}>
        <div style={{ ...narrow, textAlign: 'center' }}>
          <FadeIn>
            <span style={eyebrow}>One class, many doors</span>
            <h2 style={{ ...h2, marginBlock: 'var(--space-4) var(--space-5)' }}>
              One program. Two ways in.
            </h2>
            <p style={lead}>
              There is exactly one class. Individuals walk through one door and
              learn self-serve. Employers walk through the other and sponsor seats
              for their people. Everyone lands in the same cohort, builds the same
              way, and presents at the same Demo Day.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── What you build ────────────────────────────────────────────────── */}
      <section
        aria-label="What you build"
        style={{ ...sectionPad, background: 'var(--surface-subtle)' }}
      >
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

      {/* ── The cohort rhythm ─────────────────────────────────────────────── */}
      <section aria-label="The cohort rhythm" style={sectionPad}>
        <div style={container}>
          <FadeIn>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-8)',
              }}
            >
              <span style={eyebrow}>The cohort rhythm</span>
              <h2 style={{ ...h2, flexBasis: '100%' }}>
                Three weeks, one build, real momentum.
              </h2>
            </div>
          </FadeIn>

          <FadeIn>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-10)',
              }}
            >
              {PROGRAM_SCHEDULE.summaryBadges.map((b: string, i: number) => (
                <Badge key={b} tone={i === 0 ? 'red' : 'neutral'} dot={i === 0}>
                  {b}
                </Badge>
              ))}
            </div>
          </FadeIn>

          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            }}
          >
            {RHYTHM.map((step, i) => (
              <FadeIn key={step.week}>
                <Card elevation="sm" accent={i === 2 ? 'green' : undefined}>
                  <div style={cardBody}>
                    <Badge tone={i === 2 ? 'green' : 'blue'}>{step.week}</Badge>
                    <h3
                      style={{ ...cardTitle, marginTop: 'var(--space-3)' }}
                    >
                      {step.title}
                    </h3>
                    <p style={{ ...muted, marginTop: 'var(--space-2)' }}>
                      {step.body}
                    </p>
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Anthropic Architect cert track ────────────────────────────────── */}
      <section
        aria-label="Anthropic Architect certification track"
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
                  Certification track
                </span>
                <h2
                  style={{
                    ...h2,
                    color: 'var(--text-on-inverse)',
                    marginBlock: 'var(--space-4) var(--space-5)',
                  }}
                >
                  Build toward Anthropic Architect.
                </h2>
                <p
                  style={{
                    fontSize: 'var(--fs-body-lg)',
                    lineHeight: 'var(--lh-relaxed)',
                    color: 'var(--text-on-inverse)',
                    opacity: 0.82,
                  }}
                >
                  Alongside your build, you progress through the official
                  Learn-With-Claude curriculum — the same training path Colaberry
                  uses internally — working toward Anthropic Architect recognition.
                  The coursework and the cohort reinforce each other: you learn the
                  pattern, then you ship it.
                </p>
              </div>

              <Card elevation="md">
                <div style={cardBody}>
                  <h3 style={cardTitle}>Your track progress</h3>
                  <div style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-5)' }}>
                    <Progress
                      label="Learn-With-Claude coursework"
                      value={100}
                      tone="blue"
                      showValue
                    />
                    <Progress
                      label="Working AI build shipped"
                      value={60}
                      tone="red"
                      showValue
                    />
                    <Progress
                      label="Demo Day presentation"
                      value={20}
                      tone="green"
                      showValue
                    />
                  </div>
                  <p style={{ ...muted, marginTop: 'var(--space-5)', fontSize: 'var(--fs-caption)' }}>
                    Illustrative track. Recognition reflects coursework completed
                    plus a shipped build defended at Demo Day.
                  </p>
                </div>
              </Card>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Leaderboard + Demo Day ────────────────────────────────────────── */}
      <section aria-label="Leaderboard and Demo Day" style={sectionPad}>
        <div style={container}>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            }}
          >
            <FadeIn>
              <Card accent="blue" elevation="sm">
                <div style={cardBody}>
                  <Badge tone="blue">The leaderboard</Badge>
                  <h2
                    style={{
                      ...h2,
                      fontSize: 'var(--fs-h3)',
                      marginBlock: 'var(--space-3) var(--space-4)',
                    }}
                  >
                    Progress you can see.
                  </h2>
                  <p style={muted}>
                    As you build, your progress posts to a cohort leaderboard.
                    Sponsored teams get a company-scoped board — so employers find
                    out who their real AI builders are, without taking anyone off
                    the job. It is talent discovery, not a training report.
                  </p>
                </div>
              </Card>
            </FadeIn>

            <FadeIn>
              <Card accent="red" elevation="sm">
                <div style={cardBody}>
                  <Badge tone="red">Demo Day</Badge>
                  <h2
                    style={{
                      ...h2,
                      fontSize: 'var(--fs-h3)',
                      marginBlock: 'var(--space-3) var(--space-4)',
                    }}
                  >
                    Prove it live.
                  </h2>
                  <p style={muted}>
                    Every cohort ends in Demo Day. You present your working system
                    to peers and a panel: the problem, the live demo, and the
                    architecture decisions behind it. It is the moment the build
                    becomes proof.
                  </p>
                </div>
              </Card>
            </FadeIn>
          </div>
        </div>
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
                What you walk away with.
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
                Same cohort. Same Demo Day. Two ways in.
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
