import React from 'react';
import SEOHead from '../components/SEOHead';
import { Button } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import MermaidDiagram from '../components/visuals/MermaidDiagram';
import EmployerDashboardPreview from '../components/visuals/EmployerDashboardPreview';
import PartnerStrip from '../components/visuals/PartnerStrip';
import ProgramRoadmap from '../components/visuals/ProgramRoadmap';
import SectionFigure from '../components/visuals/SectionFigure';
import { StatCounter } from '../components/visuals/charts';

/* ------------------------------------------------------------------ *
 * AI Consulting — "We build your AI capability, and the people who
 * run it." Premium employer/consulting page positioning Colaberry as
 * an Anthropic / Claude Code partner. Five engagement models:
 * Hire · Embed · Project · Train · Certify, all anchored on the same
 * Certified Anthropic AI Systems Architect credential.
 *
 * Built entirely on the Colaberry design system: DS components +
 * shared visual components + semantic tokens only (never raw layout
 * hex), so a re-pointed brand palette flows through automatically.
 * Default export; route registered in routes/publicRoutes.tsx.
 * ------------------------------------------------------------------ */

const S = {
  page: { background: 'var(--surface-page)', color: 'var(--text-body)' } as React.CSSProperties,
  hero: {
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--surface-inverse)',
    color: 'var(--text-on-inverse)',
    padding: 'var(--space-24) var(--space-6) var(--space-20)',
  } as React.CSSProperties,
  section: { padding: 'var(--space-20) var(--space-6)' } as React.CSSProperties,
  sectionAlt: {
    padding: 'var(--space-20) var(--space-6)',
    background: 'var(--surface-subtle)',
  } as React.CSSProperties,
  inner: { maxWidth: 'var(--container-lg)', margin: '0 auto' } as React.CSSProperties,
  innerNarrow: { maxWidth: 'var(--container-md)', margin: '0 auto' } as React.CSSProperties,

  eyebrow: {
    fontSize: 'var(--fs-overline)',
    fontWeight: 'var(--fw-bold)',
    letterSpacing: 'var(--ls-overline)',
    textTransform: 'uppercase',
    color: 'var(--brand-accent)',
    margin: '0 0 var(--space-4)',
  } as React.CSSProperties,
  h2: {
    fontSize: 'var(--fs-h2)',
    fontWeight: 'var(--fw-bold)',
    color: 'var(--text-strong)',
    letterSpacing: 'var(--ls-tight)',
    margin: '0 0 var(--space-4)',
  } as React.CSSProperties,
  lead: {
    fontSize: 'var(--fs-body-lg)',
    lineHeight: 'var(--lh-relaxed)',
    color: 'var(--text-muted)',
    margin: '0 0 var(--space-12)',
  } as React.CSSProperties,
  cardTitle: {
    fontSize: 'var(--fs-h4)',
    fontWeight: 'var(--fw-bold)',
    color: 'var(--text-strong)',
    margin: '0 0 var(--space-2)',
  } as React.CSSProperties,
  cardBody: {
    fontSize: 'var(--fs-body-sm)',
    lineHeight: 'var(--lh-relaxed)',
    color: 'var(--text-muted)',
    margin: 0,
  } as React.CSSProperties,
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 'var(--space-6)',
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 'var(--space-6)',
  } as React.CSSProperties,
  iconTile: {
    display: 'grid',
    placeItems: 'center',
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--surface-brand-subtle)',
    color: 'var(--brand-accent)',
    fontSize: '22px',
    marginBottom: 'var(--space-4)',
  } as React.CSSProperties,
};

interface Engagement {
  tag: string;
  icon: string;
  title: string;
  body: string;
  accent: 'red' | 'green' | 'blue';
}

/* The five engagement models. Anchored on ONE outcome: we create
   Certified Anthropic AI Systems Architects and put them to work. */
const ENGAGEMENTS: Engagement[] = [
  {
    tag: 'HIRE',
    icon: '\u{1F91D}',
    title: 'Hire from us',
    body: 'Bring on job-ready, Certified Anthropic AI Systems Architects. They have already built and deployed working systems with Claude Code, so they make real impact on day one, not month six.',
    accent: 'red',
  },
  {
    tag: 'EMBED',
    icon: '\u{1F465}',
    title: 'Embed our architects',
    body: 'We place our certified architects onto your team under our leadership. You get a top-notch, managed experience: our people, our standards, our accountability, building inside your business.',
    accent: 'blue',
  },
  {
    tag: 'PROJECT',
    icon: '\u{1F6E0}\u{FE0F}',
    title: 'We deliver your projects',
    body: 'We take on the build and work shoulder-to-shoulder with your team. You get deployed AI systems on your real workflows, and your people level up by watching how it is actually done.',
    accent: 'green',
  },
  {
    tag: 'TRAIN',
    icon: '\u{1F393}',
    title: 'We upskill your team',
    body: 'Put your people in Anthropic-partner hands. We train your team hands-on with Claude Code through the same 12-week Architect program that produces our own builders.',
    accent: 'red',
  },
  {
    tag: 'CERTIFY',
    icon: '\u{1F396}\u{FE0F}',
    title: 'We get your team certified',
    body: 'We prepare and guide your people all the way to the Certified Anthropic AI Systems Architect credential (CCA-F prep), so your capability is proven, not just claimed.',
    accent: 'blue',
  },
];

interface Reason {
  icon: string;
  title: string;
  body: string;
}

/* Why work with an Anthropic-partner team rather than building alone. */
const WHY_PARTNER: Reason[] = [
  {
    icon: '\u{1F517}',
    title: 'One credential, every door',
    body: 'Hire, embed, project, train, or certify — every engagement runs on the same Certified Anthropic AI Systems Architect standard. You always know exactly what "good" means.',
  },
  {
    icon: '\u{26A1}',
    title: 'Capability that compounds',
    body: 'We do not just deliver the work. We leave your team able to run it, so your AI capability keeps growing after we are done.',
  },
  {
    icon: '\u{1F3AF}',
    title: 'Anthropic-partner hands',
    body: 'Your people learn and build with Claude Code under a team that lives in it daily. You put your AI bet in partner hands, not in a vendor reselling someone else’s playbook.',
  },
];

/* The Mermaid engagement-model map. Real graph, brand-themed by the
   shared MermaidDiagram component. Renders to a tasteful fallback card
   if the runtime blocks the CDN import. */
const ENGAGEMENT_CHART = `flowchart TD
  C["Colaberry · Anthropic / Claude Code partner"] --> A["Certified Anthropic\\nAI Systems Architects"]
  A --> H["HIRE\\nJob-ready architects"]
  A --> E["EMBED\\nPlaced on your team,\\nunder our leadership"]
  A --> P["PROJECT\\nWe build, with your team"]
  A --> T["TRAIN\\nWe upskill your people"]
  A --> R["CERTIFY\\nWe get your team certified"]
  H --> O["Real impact in your company"]
  E --> O
  P --> O
  T --> O
  R --> O`;

/* Scoped on-dark outline button — DS tokens only, no raw hex — so it
   stays legible on the inverse hero. Scoped under #consulting-page so
   it never leaks globally. Mirrors the proven SponsorshipPage pattern. */
const SCOPED_CSS = `
#consulting-page .cb-btn--on-dark {
  color: var(--neutral-0);
  box-shadow: inset 0 0 0 var(--border-2) var(--border-strong);
}
#consulting-page .cb-btn--on-dark:hover {
  background: color-mix(in srgb, var(--neutral-0) 12%, transparent);
  color: var(--neutral-0);
  box-shadow: inset 0 0 0 var(--border-2) var(--neutral-0);
}
`;

function ConsultingPage(): JSX.Element {
  return (
    <>
      <style>{SCOPED_CSS}</style>
      <SEOHead
        title="AI Consulting — Colaberry"
        description="We build your AI capability, and the people who run it. Hire, embed, or build with Certified Anthropic AI Systems Architects — put your people in Anthropic-partner hands and train hands-on with Claude Code."
      />

      <div id="consulting-page" style={S.page}>
        {/* ============================ HERO ============================ */}
        <section style={S.hero}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              backgroundImage:
                "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 74%, transparent), color-mix(in srgb, var(--surface-inverse) 90%, transparent)), url('/hero/hero-sponsor.jpg')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div style={{ ...S.innerNarrow, position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <Badge solid>AI Consulting · Anthropic / Claude Code partner</Badge>
            <h1
              className="cb-balance"
              style={{
                fontSize: 'var(--fs-hero-fluid)',
                fontWeight: 'var(--fw-black)',
                lineHeight: 'var(--lh-tight)',
                letterSpacing: 'var(--ls-tighter)',
                color: 'var(--text-on-inverse)',
                margin: 'var(--space-6) 0 var(--space-5)',
              }}
            >
              We build your AI capability — and the people who run it.
            </h1>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'var(--neutral-300)',
                maxWidth: 'var(--container-sm)',
                margin: '0 auto var(--space-3)',
              }}
            >
              Hire them, embed them, or build with them. We create Certified Anthropic AI Systems
              Architects, then put them to work inside your company.
            </p>
            <p
              style={{
                fontSize: 'var(--fs-body)',
                fontWeight: 'var(--fw-bold)',
                color: 'var(--neutral-0)',
                maxWidth: 'var(--container-sm)',
                margin: '0 auto var(--space-8)',
              }}
            >
              Most people consume AI. Very few learn to build with it. Put your people in
              Anthropic-partner hands.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Button as="a" href="/contact" variant="primary" size="lg">
                Book a consulting call
              </Button>
              <Button as="a" href="#engagements" variant="outline" size="lg" className="cb-btn--on-dark">
                See the engagement models
              </Button>
            </div>
            <p
              style={{
                fontSize: 'var(--fs-caption)',
                color: 'var(--neutral-400)',
                margin: 'var(--space-8) 0 0',
              }}
            >
              Learn With Claude. Build Through Colaberry. Deploy In The Real World.
            </p>
          </div>
        </section>

        {/* ===================== PARTNER TRUST STRIP ===================== */}
        <PartnerStrip />

        {/* ===================== THE OFFER (lead figure) ===================== */}
        <section style={S.section}>
          <div style={S.inner}>
            <SectionFigure
              src="/img/handshake-deal.jpg"
              alt="A consulting leader and a client shaking hands across a table after agreeing an AI engagement"
              side="right"
              eyebrow="The offer"
              title="Real AI capability you can hire, embed, or build alongside."
              body={[
                'Every AI vendor sells you a tool. We do something more durable: we create skilled people — Certified Anthropic AI Systems Architects — who can make real impact in your company, and we hand them to you in whatever shape fits.',
                'Need talent? Hire job-ready architects from us. Need a managed team? We embed our certified architects under our leadership. Need it done? We deliver the project with your team. Need to grow your own? We train and certify them.',
              ]}
              cta={{ label: 'Book a consulting call', to: '/contact' }}
            />
          </div>
        </section>

        {/* ===================== ENGAGEMENT MODELS ===================== */}
        <section id="engagements" style={S.sectionAlt}>
          <div style={S.inner}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto' }}>
              <p style={S.eyebrow}>Five ways to engage</p>
              <h2 style={S.h2}>Hire · Embed · Project · Train · Certify</h2>
              <p style={S.lead}>
                One certified standard, five doors into your business. Start with any of them — most
                clients combine two or three as their AI capability grows.
              </p>
            </div>
            <div style={S.grid3}>
              {ENGAGEMENTS.map((e) => (
                <Card key={e.tag} padded elevation="sm" accent={e.accent}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    <div style={S.iconTile} aria-hidden="true">{e.icon}</div>
                    <Badge tone={e.accent === 'red' ? undefined : e.accent} solid={e.accent === 'red'}>
                      {e.tag}
                    </Badge>
                  </div>
                  <h3 style={S.cardTitle}>{e.title}</h3>
                  <p style={S.cardBody}>{e.body}</p>
                </Card>
              ))}
              <Card padded elevation="sm">
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center', gap: 'var(--space-3)' }}>
                  <h3 style={{ ...S.cardTitle, margin: 0 }}>Not sure which fits?</h3>
                  <p style={{ ...S.cardBody, marginBottom: 'var(--space-2)' }}>
                    Tell us the outcome you need. We will map it to the right mix.
                  </p>
                  <Button as="a" href="/contact" variant="primary">
                    Book a consulting call
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* ===================== ENGAGEMENT-MODEL DIAGRAM ===================== */}
        <section style={S.section}>
          <div style={S.innerNarrow}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto' }}>
              <p style={S.eyebrow}>How it fits together</p>
              <h2 style={S.h2}>Every engagement runs on one certified standard.</h2>
              <p style={S.lead}>
                As an Anthropic / Claude Code partner, we create the architects first — then hire,
                embed, deliver, train, or certify around them. All roads lead to real impact in your
                company.
              </p>
            </div>
            <MermaidDiagram
              chart={ENGAGEMENT_CHART}
              caption="The Colaberry engagement model: one certified architect standard powering five ways to work with you."
            />
          </div>
        </section>

        {/* ===================== EMBED FIGURE ===================== */}
        <section style={S.sectionAlt}>
          <div style={S.inner}>
            <SectionFigure
              src="/img/architect-plan.jpg"
              alt="An AI systems architect walking a client team through a solution plan on a large screen"
              side="left"
              eyebrow="Embed, under our leadership"
              title="Our certified architects, on your team, run by us."
              body={[
                'Embedding is where the experience is top-notch: you get our people working inside your business, but managed to our standards — code review, reliability bars, architecture discipline — under our leadership, not yours to babysit.',
                'You get velocity without the management overhead, and your own team learns the operating model by working next to people who already build at the certified level.',
              ]}
              cta={{ label: 'Talk through an embed', to: '/contact' }}
            />
          </div>
        </section>

        {/* ===================== TRAIN: WHAT WE TEACH ===================== */}
        <section style={S.section}>
          <div style={S.inner}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto' }}>
              <p style={S.eyebrow}>Train &amp; certify</p>
              <h2 style={S.h2}>The same path that produces our own architects.</h2>
              <p style={S.lead}>
                When we upskill your team, we run them through the flagship program — one continuous
                12-week path, four phases, ending at the Certified Anthropic AI Systems Architect
                credential and CCA-F prep.
              </p>
            </div>
            <ProgramRoadmap compact />
          </div>
        </section>

        {/* ===================== WHY ANTHROPIC-PARTNER HANDS ===================== */}
        <section style={S.sectionAlt}>
          <div style={S.inner}>
            <div style={{ textAlign: 'center', maxWidth: 'var(--container-md)', margin: '0 auto' }}>
              <p style={S.eyebrow}>Why us</p>
              <h2 style={S.h2}>Put your people in Anthropic-partner hands.</h2>
              <p style={S.lead}>
                A consulting engagement that leaves your team stronger than it found them — not
                dependent on us.
              </p>
            </div>
            <div style={S.grid3}>
              {WHY_PARTNER.map((r) => (
                <Card key={r.title} padded accent="blue">
                  <div
                    style={{ ...S.iconTile, background: 'var(--surface-blue-subtle)', color: 'var(--status-info)' }}
                    aria-hidden="true"
                  >
                    {r.icon}
                  </div>
                  <h3 style={S.cardTitle}>{r.title}</h3>
                  <p style={S.cardBody}>{r.body}</p>
                </Card>
              ))}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 'var(--space-6)',
                marginTop: 'var(--space-12)',
              }}
            >
              <StatCounter value="12 wks" label="One continuous Architect program" />
              <StatCounter value="CCA-F" label="Certification your team preps for" accent="var(--status-info)" />
              <StatCounter value="5" label="Ways to engage: hire, embed, build, train, certify" accent="var(--status-success)" />
            </div>
          </div>
        </section>

        {/* ===================== WHAT YOU SEE (dashboard) ===================== */}
        <section style={S.section}>
          <div style={S.inner}>
            <SectionFigure
              src="/img/team-collab.jpg"
              alt="A cross-functional team collaborating around laptops while building an AI system together"
              side="right"
              eyebrow="Visibility, not vibes"
              title="See exactly who can build — and what they shipped."
              body={[
                'Whether we train your team or embed ours, you get the same evidence: a live view of who is building, what they have mastered, and who is ready to ship in the real world.',
                'No guesswork about whether the investment is landing. The leaderboard and skill map below are the same view sponsoring employers use.',
              ]}
            />
            <div style={{ marginTop: 'var(--space-12)' }}>
              <EmployerDashboardPreview companyName="Your Company" cohortLabel="Consulting Engagement" />
            </div>
          </div>
        </section>

        {/* ===================== FINAL CTA ===================== */}
        <section style={{ ...S.section, background: 'var(--surface-inverse)' }}>
          <div style={{ maxWidth: 'var(--container-md)', margin: '0 auto', textAlign: 'center' }}>
            <Badge solid>Book a consulting call</Badge>
            <h2
              className="cb-balance"
              style={{
                fontSize: 'var(--fs-h1)',
                fontWeight: 'var(--fw-black)',
                color: 'var(--text-on-inverse)',
                letterSpacing: 'var(--ls-tight)',
                margin: 'var(--space-5) 0 var(--space-4)',
              }}
            >
              Tell us the outcome. We will bring the architects.
            </h2>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'var(--neutral-300)',
                maxWidth: 'var(--container-sm)',
                margin: '0 auto var(--space-8)',
              }}
            >
              Hire, embed, build, train, or certify — in one call we will map your AI goal to the
              right engagement and put your people in Anthropic-partner hands.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Button as="a" href="/contact" variant="primary" size="lg">
                Book a consulting call
              </Button>
              <Button as="a" href="/sponsorship" variant="outline" size="lg" className="cb-btn--on-dark">
                Sponsor your team instead
              </Button>
            </div>
            <p
              style={{
                fontSize: 'var(--fs-caption)',
                color: 'var(--neutral-400)',
                margin: 'var(--space-8) 0 0',
              }}
            >
              Most people consume AI. Very few learn to build with it.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

export default ConsultingPage;
