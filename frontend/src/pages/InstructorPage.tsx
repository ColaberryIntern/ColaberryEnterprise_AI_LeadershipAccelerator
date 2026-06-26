import React, { useState } from 'react';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { Badge } from '../colaberry/components/core/Badge';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { StatCounter } from '../components/visuals/charts';
import SectionFigure from '../components/visuals/SectionFigure';
import PartnerStrip from '../components/visuals/PartnerStrip';
import CohortUrgency from '../components/visuals/CohortUrgency';

/**
 * InstructorPage — "ALI — the AI guy."
 *
 * The instructor story for the program that produces Certified Anthropic AI
 * Systems Architects. Ali Muwwakkil leads every cohort: learners train
 * hands-on with Claude Code in Anthropic-partner training and ship a real,
 * deployed AI build.
 *
 * Built entirely on the Colaberry design system: semantic tokens only (no raw
 * layout hex), DS core components (Badge, Button, Card), shared visual
 * components (StatCounter, SectionFigure, PartnerStrip, CohortUrgency), and
 * real self-hosted photos. styles.css loads once at the app root.
 *
 * Two doors out (Join the Challenge / Sponsor Your Team) plus a direct
 * "Book a call with Ali" path via the existing StrategyCallModal.
 */

/* ----------------------------------------------------------------------------
 * Two-door destinations (mirrors ProgramPage / publicRoutes.tsx)
 * ------------------------------------------------------------------------- */
const DOOR_INDIVIDUAL = '/enroll'; // Join the Challenge
const DOOR_EMPLOYER = '/sponsorship'; // Sponsor Your Team

/* ----------------------------------------------------------------------------
 * Shared layout tokens (inline style objects reference semantic CSS variables
 * only — never raw hex — so a corporate color swap re-points a single token).
 * ------------------------------------------------------------------------- */
const sectionPad: React.CSSProperties = { paddingBlock: 'var(--space-24)' };
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
const cardBody: React.CSSProperties = { padding: 'var(--space-6)' };
const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-h5)',
  fontWeight: 700,
  color: 'var(--text-strong)',
  margin: 0,
};
const muted: React.CSSProperties = {
  color: 'var(--text-muted)',
  lineHeight: 'var(--lh-relaxed)',
  margin: 0,
};

/* ----------------------------------------------------------------------------
 * Content data
 * ------------------------------------------------------------------------- */
const STATS: { value: string; label: string }[] = [
  { value: '1', label: 'Anthropic-partner program he leads end to end' },
  { value: '12 wks', label: 'From first session to a deployed AI build' },
  { value: '100%', label: 'Cohorts Ali personally leads — no hand-off' },
  { value: '10+', label: 'Industries he has shipped AI systems into' },
];

const TEACHES: { accent: 'red' | 'blue' | 'green'; title: string; body: string }[] = [
  {
    accent: 'blue',
    title: 'Building with Claude Code',
    body:
      'Hands-on in the same tools teams ship with in production — decomposing a problem, orchestrating context and tools, and directing Claude Code to do real work, not demos.',
  },
  {
    accent: 'red',
    title: 'The AI Systems Architect mindset',
    body:
      'How to design something deterministic on top of a probabilistic model: scoping, agent design, validation, and the governance that makes a system safe to run.',
  },
  {
    accent: 'green',
    title: 'Shipping a real, deployed build',
    body:
      'Every learner leaves with a working system and a Demo Day presentation — proof of capability, not a certificate of attendance.',
  },
  {
    accent: 'blue',
    title: 'Certification, the right way',
    body:
      'He runs the official Learn-With-Claude track that preps the Certified Anthropic AI Systems Architect credential (CCA-F) — the same path Colaberry uses internally.',
  },
];

/* ----------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */
function InstructorPage() {
  const [showBooking, setShowBooking] = useState(false);

  return (
    <div style={{ background: 'var(--surface-page)' }}>
      <SEOHead
        title="ALI — the AI guy | Your Instructor"
        description="Meet Ali Muwwakkil — the instructor who leads the Anthropic-partner program that produces Certified AI Systems Architects. Hands-on with Claude Code, every cohort, a real deployed build."
      />

      {/* ── Hero (dark photo → all hero text uses light --text-on-inverse) ──── */}
      <section
        aria-label="Meet your instructor"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          paddingBlock: 'var(--space-32)',
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
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gap: 'var(--space-12)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            alignItems: 'center',
          }}
        >
          {/* Copy */}
          <div>
            <Badge solid>Your instructor</Badge>
            <h1
              className="cb-balance"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-hero-fluid)',
                fontWeight: 900,
                lineHeight: 'var(--lh-tight)',
                letterSpacing: 'var(--ls-tighter)',
                color: 'var(--text-on-inverse)',
                marginBlock: 'var(--space-5) var(--space-3)',
              }}
            >
              ALI — <span style={{ color: 'var(--brand-accent)' }}>the AI guy.</span>
            </h1>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'var(--text-on-inverse)',
                opacity: 0.86,
                maxWidth: 560,
              }}
            >
              Ali Muwwakkil leads the program that turns people who consume AI into
              people who <strong>build with it</strong> — hands-on with Claude Code,
              in Anthropic-partner training, all the way to a Certified AI Systems
              Architect and a deployed system.
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
                flexWrap: 'wrap',
                marginTop: 'var(--space-8)',
              }}
            >
              <Button as="a" href={DOOR_INDIVIDUAL} variant="primary" size="lg">
                Join the Challenge
              </Button>
              {/* data-theme="dark" re-points --text-strong/--border-strong so the
                  outline button reads correctly on the inverse hero surface. */}
              <span data-theme="dark" style={{ display: 'inline-flex' }}>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowBooking(true)}
                >
                  Book a call with Ali
                </Button>
              </span>
            </div>
          </div>

          {/* Photo — object-fit cover, rounded, broken-image safe */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                position: 'relative',
                width: 'min(360px, 80vw)',
                aspectRatio: '4 / 5',
                borderRadius: 'var(--radius-2xl)',
                overflow: 'hidden',
                background: 'var(--surface-sunken)',
                border:
                  'var(--border-1) solid color-mix(in srgb, var(--text-on-inverse) 18%, transparent)',
                boxShadow: 'var(--shadow-xl)',
              }}
            >
              <img
                src="/ali-muwwakkil.jpg"
                alt="Ali Muwwakkil, lead instructor for the Colaberry AI Systems Architect program"
                loading="eager"
                decoding="async"
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  // Broken-image safety: hide the browser's alt glyph; the muted
                  // sunken frame shows through instead.
                  color: 'transparent',
                  fontSize: 0,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Anthropic-partner trust band ──────────────────────────────────── */}
      <section aria-label="Anthropic partner training" style={{ paddingBlock: 'var(--space-8)' }}>
        <PartnerStrip />
      </section>

      {/* ── Credibility stats ─────────────────────────────────────────────── */}
      <section aria-label="By the numbers" style={{ ...sectionPad, paddingBlockStart: 'var(--space-12)' }}>
        <div style={container}>
          <div style={{ maxWidth: 680, marginBottom: 'var(--space-10)' }}>
            <span style={eyebrow}>Why learn from Ali</span>
            <h2 style={{ ...h2, marginTop: 'var(--space-4)' }}>
              Not a theorist. An operator who ships.
            </h2>
          </div>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-5)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {STATS.map((s) => (
              <StatCounter key={s.label} value={s.value} label={s.label} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Story (figure: developer / Claude Code) ───────────────────────── */}
      <section aria-label="About Ali" style={{ ...sectionPad, background: 'var(--surface-subtle)' }}>
        <div style={container}>
          <SectionFigure
            src="/img/developer-code.jpg"
            alt="Working hands-on with Claude Code on a real AI build"
            eyebrow="The story"
            title="He builds the thing he teaches."
            body={[
              'Ali Muwwakkil leads Colaberry’s AI program — working directly with builders and the directors, VPs, and CTOs who sponsor them — to design, build, and deploy production AI systems. He is not lecturing from slides; he is an operator who ships systems that run in production.',
              'His rule is simple: every learner leaves with a working system, not a deck. The 12-week program is one continuous path — the four phases just group the weeks — from architecture on day one to a deployed AI build by Demo Day.',
              'And he stays in the room. Ali personally leads every cohort, gives direct feedback on architecture decisions, and is there through deployment. When you join, you are learning from the person who will guide your build.',
            ]}
            side="right"
            caption="Hands-on with Claude Code — the same tools teams ship with."
          />
        </div>
      </section>

      {/* ── What he teaches ───────────────────────────────────────────────── */}
      <section aria-label="What Ali teaches" style={sectionPad}>
        <div style={container}>
          <div style={{ maxWidth: 680, marginBottom: 'var(--space-10)' }}>
            <span style={eyebrow}>What he teaches</span>
            <h2 style={{ ...h2, marginTop: 'var(--space-4)' }}>
              The skills that produce a Certified AI Systems Architect.
            </h2>
          </div>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-6)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            {TEACHES.map((t) => (
              <Card key={t.title} accent={t.accent} elevation="sm" hoverable>
                <div style={cardBody}>
                  <h3 style={cardTitle}>{t.title}</h3>
                  <p style={{ ...muted, marginTop: 'var(--space-3)' }}>{t.body}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── The program he leads (figure: certificate) ────────────────────── */}
      <section
        aria-label="The program Ali leads"
        style={{ ...sectionPad, background: 'var(--surface-subtle)' }}
      >
        <div style={container}>
          <SectionFigure
            src="/img/certificate.jpg"
            alt="The Certified Anthropic AI Systems Architect credential"
            eyebrow="The program he leads"
            title="One continuous 12-week path to Architect."
            body={[
              'It is one continuous 12-week program — the four phases simply group the weeks — built around real deployment instead of theory.',
              'The outcome credential is the Certified Anthropic AI Systems Architect (CCA-F prep). You put your people in Anthropic-partner hands, and they come out with the credential and a build to prove it.',
            ]}
            side="left"
            cta={{ label: 'Join the Challenge', to: DOOR_INDIVIDUAL }}
          />
        </div>
      </section>

      {/* ── Next cohort urgency ───────────────────────────────────────────── */}
      <section aria-label="Next cohort" style={{ ...sectionPad, paddingBlockEnd: 'var(--space-12)' }}>
        <div style={container}>
          <CohortUrgency startDateISO="2026-07-23" />
        </div>
      </section>

      {/* ── Book-a-call CTA ───────────────────────────────────────────────── */}
      <section
        aria-label="Talk to Ali"
        style={{ ...sectionPad, background: 'var(--surface-inverse)' }}
      >
        <div style={{ ...narrow, textAlign: 'center' }}>
          <span style={{ ...eyebrow, color: 'var(--brand-accent)' }}>Talk to Ali directly</span>
          <h2
            className="cb-balance"
            style={{ ...h2, color: 'var(--text-on-inverse)', marginBlock: 'var(--space-4) var(--space-5)' }}
          >
            Map your build in 30 minutes.
          </h2>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'var(--text-on-inverse)',
              opacity: 0.84,
              marginInline: 'auto',
              maxWidth: 560,
            }}
          >
            Book a call. Ali will walk through your situation, sketch the AI system,
            and show you exactly what it takes to ship it. You talk to Ali — not a
            sales rep.
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
            <Button variant="primary" size="lg" onClick={() => setShowBooking(true)}>
              Book a call with Ali
            </Button>
            <span data-theme="dark" style={{ display: 'inline-flex' }}>
              <Button as="a" href={DOOR_EMPLOYER} variant="outline" size="lg">
                Sponsor Your Team
              </Button>
            </span>
          </div>
          <p
            style={{
              marginTop: 'var(--space-4)',
              fontSize: 'var(--fs-caption)',
              color: 'var(--text-on-inverse)',
              opacity: 0.6,
            }}
          >
            Free. No obligation.
          </p>
        </div>
      </section>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/ai-architect/instructor"
      />
    </div>
  );
}

export default InstructorPage;
