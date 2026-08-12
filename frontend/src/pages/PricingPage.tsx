import React from 'react';
import SEOHead from '../components/SEOHead';
import { Button } from '../colaberry/components/core/Button';
import { Card } from '../colaberry/components/core/Card';
import { Badge } from '../colaberry/components/core/Badge';

/**
 * PricingPage - "Free to start, licenses only when you are ready."
 *
 * The /pricing page for enterprise.colaberry.ai, framed around the three
 * effortless beats: try it free yourself, invite your employees free, then
 * activate licenses for instant access when ready. Built around the whole
 * AI Systems Capability platform (self-paced learning + certification + real
 * projects + the AI Architect network + weekly live events + a stay-current
 * timeline), not a single class. Single persona (a decision-maker who is also
 * the learner), free-first. One primary CTA everywhere, "Start free" -> /try,
 * which grants a dual account (learner experience + their own organization
 * view). The paid tiers are the same platform, activated: licenses are the
 * single, optional paid step, not a separate product.
 *   Free:       start free, no credit card                 -> /try
 *   One license: $149/mo billed annually ($199 monthly)    -> /try (activate low-key)
 *   Team licenses: annual reassignable seats, from $950    -> /sponsorship
 *
 * Built entirely on the Colaberry design system (Card / Button / Badge) and
 * semantic tokens, matching the HomePage idiom: aria-labeled sections that
 * alternate --surface-page / --surface-sunken, Badge eyebrows, cb-balance
 * headings, data-track CTAs, and CSS-variable inline styles. No Bootstrap,
 * no raw hex. DS Buttons never receive a `style` prop (the DS drops it); any
 * spacing is handled by a wrapping element.
 */

const TRY_PATH = '/try';
const INDIVIDUAL_PATH = '/enroll';
const SPONSOR_PATH = '/sponsorship';
const WALKTHROUGH_PATH = '/contact';

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-h2)',
  lineHeight: 'var(--lh-heading)', letterSpacing: 'var(--ls-tight)', color: 'var(--text-strong)',
  margin: '0 0 var(--space-4)',
};
const leadStyle: React.CSSProperties = {
  fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0,
};
const cardTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h3)',
  lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', margin: 0,
};

interface FeatureItem {
  label: string;
}

/** A single reassignable check row used across plan cards and the inclusions grid. */
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
        style={{ flex: '0 0 auto', marginTop: '2px', color: 'var(--status-success)', fontWeight: 700 }}
      >
        ✓
      </span>
      <span className="cb-min0" style={{ color: 'var(--text-body)' }}>{label}</span>
    </li>
  );
}

interface PlanCard {
  id: string;
  eyebrow: string;
  solid?: boolean;
  name: string;
  price: string;
  priceUnit: string;
  priceSub?: string;
  blurb: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  ctaTone?: 'green';
  ctaVariant?: 'outline';
  accent: 'red' | 'green' | 'blue';
  featured?: boolean;
  subNote: React.ReactNode;
}

const PLANS: PlanCard[] = [
  {
    id: 'free',
    eyebrow: 'Start here',
    solid: true,
    name: 'Start free',
    price: '$0',
    priceUnit: 'to start',
    blurb: 'Start here. Explore the whole platform yourself, with both the learner experience and your own management dashboard, and invite your team free to test it. Pay nothing to begin.',
    features: [
      'A dual account: the learner experience plus your own management dashboard',
      'See your organization come to life with sample data',
      'Watch AI readiness and velocity climb on a live dashboard',
      'Send free test invites so your employees can try it too',
    ],
    ctaLabel: 'Start free',
    ctaHref: TRY_PATH,
    accent: 'green',
    featured: true,
    subNote: 'No credit card.',
  },
  {
    id: 'individual',
    eyebrow: 'Activate a license',
    name: 'One license',
    price: '$149',
    priceUnit: '/mo, billed annually',
    priceSub: 'Or $199/mo month-to-month.',
    blurb: 'Activate one license for instant, full platform access for one person, from first login to Certified Architect. The single paid step, only when you are ready.',
    features: [
      'Self-paced learning paths on your own schedule',
      'Certification prep for the Certified Anthropic AI Systems Architect (CCA-F)',
      'Build a real, deployed project of your own',
      'Weekly live events and office hours to stay current',
      'The AI Architect network across companies and phases',
    ],
    ctaLabel: 'Start free',
    ctaHref: TRY_PATH,
    ctaTone: 'green',
    accent: 'red',
    subNote: (
      <>
        Start free, activate your license when ready.{' '}
        <a
          href={INDIVIDUAL_PATH}
          data-track="pricing_individual_enroll"
          style={{ color: 'var(--text-link)', fontWeight: 600, textDecoration: 'none' }}
        >
          Activate now &rarr;
        </a>
      </>
    ),
  },
  {
    id: 'employer',
    eyebrow: 'Activate licenses',
    name: 'Team licenses',
    price: 'from $950',
    priceUnit: '/seat, per year',
    priceSub: 'Team $1,200 · Department $950 · Enterprise custom.',
    blurb: 'Activate licenses for your team for instant access across your organization, plus one management dashboard. Reassignable annual seats, roll out as many as you need, when you are ready.',
    features: [
      'Annual seats, reassignable across your organization',
      'Volume-discounted pricing that drops as you scale',
      'The full platform for every person you develop',
      'One management dashboard for readiness, adoption, and ROI',
      'A company-scoped network and Demo Day showcase',
    ],
    ctaLabel: 'Activate licenses',
    ctaHref: SPONSOR_PATH,
    ctaVariant: 'outline',
    accent: 'blue',
    subNote: 'Seats reassignable.',
  },
];

const ECOSYSTEM_INCLUSIONS: FeatureItem[] = [
  { label: 'Self-paced learning paths you take on your own schedule' },
  { label: 'Certified Anthropic AI Systems Architect prep (CCA-F)' },
  { label: 'Build real, deployed projects on your own workflows' },
  { label: 'The AI Architect network, across companies and phases' },
  { label: 'Weekly live events and office hours' },
  { label: 'A stay-current timeline of new modules and model updates' },
  { label: 'One consistent dashboard across your whole account' },
];

interface Reassurance { q: string; a: string; }
const REASSURANCE: Reassurance[] = [
  {
    q: 'Can I try before I pay?',
    a: 'Yes. Start free with your own account, sample data, and free test invites for your team. No credit card, no commitment. Activate licenses only when you are ready.',
  },
  {
    q: 'Can individuals cancel?',
    a: 'Yes. Individual plans are cancel anytime. Choose annual billing for the best rate, or go month-to-month at $199.',
  },
  {
    q: 'What if an employee leaves?',
    a: 'Employer seats are reassignable across your organization for the full year, so the capability stays with your company.',
  },
];

function PricingPage() {
  return (
    <>
      <SEOHead
        title="Pricing: Free to Start, Licenses When You Are Ready"
        description="Try the whole platform yourself for free with no credit card, then invite your employees free to test it too. Activate licenses for instant full access only when you are ready: one license from $149/mo (billed annually; $199/mo month-to-month), or team licenses on annual reassignable seats from $950/seat/yr. Self-paced learning, certification, real projects, weekly live events, and the AI Architect network."
      />

      {/* ============================ HERO ============================ */}
      <section
        aria-label="Pricing overview"
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
          <Badge solid dot style={{ marginBottom: 'var(--space-6)' }}>Pricing</Badge>
          <h1 className="cb-balance" style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-hero-fluid)',
            lineHeight: 'var(--lh-tight)', letterSpacing: 'var(--ls-tighter)', margin: '0 0 var(--space-6)', color: 'var(--text-on-inverse)',
          }}>
            Free to start.{' '}
            <span style={{ color: 'var(--brand-accent)' }}>Licenses only when you are ready.</span>
          </h1>
          <p style={{
            fontSize: 'var(--fs-body-lg)', lineHeight: 'var(--lh-relaxed)',
            color: 'color-mix(in srgb, var(--text-on-inverse) 84%, transparent)', maxWidth: 780, margin: '0 auto var(--space-8)',
          }}>
            Try the whole platform yourself for free, then invite your employees free to test it too.
            When you like it, activate licenses for instant full access. Licenses are the single paid
            step, and they are optional. Every plan is the same complete platform: self-paced learning,
            certification, real projects, the AI Architect network, and weekly live events.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'center', justifyContent: 'center' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="pricing_hero_start_free">Start free</Button>
            <a href={WALKTHROUGH_PATH} data-track="pricing_hero_book_walkthrough" style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 600,
              color: 'color-mix(in srgb, var(--text-on-inverse) 86%, transparent)', textDecoration: 'none',
            }}>Book a walkthrough &rarr;</a>
          </div>
          <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--fs-caption)', color: 'color-mix(in srgb, var(--text-on-inverse) 70%, transparent)' }}>
            Free to start, no credit card. A free account gives you both the learner experience and your own organization view.
          </p>
        </div>
      </section>

      {/* ======================= THREE PLANS ======================= */}
      <section aria-label="Choose how you come in" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1160, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-16)' }}>
            <Badge tone="red" style={{ marginBottom: 'var(--space-4)' }}>Three effortless steps</Badge>
            <h2 className="cb-balance" style={h2Style}>Start free, invite your team free, activate licenses when ready</h2>
            <p style={leadStyle}>The same platform behind every step. Explore it yourself and invite your employees at no cost, then activate licenses for instant access, only when you are ready.</p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--space-6)', alignItems: 'stretch',
          }}>
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                accent={plan.accent}
                padded
                elevation={plan.featured ? 'md' : 'sm'}
                style={plan.featured ? { boxShadow: '0 0 0 2px var(--brand-accent), var(--shadow-lg)' } : undefined}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: '100%' }}>
                  <div>
                    <Badge tone={plan.accent} solid={plan.solid} dot={plan.solid}>{plan.eyebrow}</Badge>
                  </div>
                  <h3 style={cardTitleStyle}>{plan.name}</h3>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display)', fontWeight: 900,
                      color: 'var(--text-strong)', lineHeight: 1,
                    }}>{plan.price}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>{plan.priceUnit}</span>
                  </div>
                  {plan.priceSub && (
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body-sm)', margin: 0 }}>{plan.priceSub}</p>
                  )}

                  <p style={{ color: 'var(--text-body)', margin: 'var(--space-1) 0 0' }}>{plan.blurb}</p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
                    {plan.features.map((f) => (<CheckRow key={f} label={f} />))}
                  </ul>

                  <div style={{ marginTop: 'auto', paddingTop: 'var(--space-5)' }}>
                    <Button
                      as="a"
                      href={plan.ctaHref}
                      size="lg"
                      fullWidth
                      tone={plan.ctaTone}
                      variant={plan.ctaVariant}
                      data-track={`pricing_${plan.id}_cta`}
                    >
                      {plan.ctaLabel}
                    </Button>
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-caption)', margin: 'var(--space-3) 0 0' }}>
                      {plan.subNote}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* =================== WHAT'S INCLUDED (EVERY PLAN) =================== */}
      <section aria-label="What is included in every plan" style={{ background: 'var(--surface-sunken)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1000, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto var(--space-12)' }}>
            <Badge tone="green" style={{ marginBottom: 'var(--space-4)' }}>In every plan</Badge>
            <h2 className="cb-balance" style={h2Style}>The whole ecosystem, not just a class</h2>
            <p style={leadStyle}>
              Whichever way you come in, you get the entire package. Training is one part of it. The rest
              is what keeps your people building and current long after any single course ends.
            </p>
          </div>
          <Card padded elevation="sm">
            <ul style={{
              listStyle: 'none', padding: 0, margin: 0,
              display: 'grid', gap: 'var(--space-3) var(--space-8)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}>
              {ECOSYSTEM_INCLUSIONS.map((item) => (<CheckRow key={item.label} label={item.label} />))}
            </ul>
          </Card>
        </div>
      </section>

      {/* ====================== REASSURANCE / FAQ ====================== */}
      <section aria-label="Good to know" style={{ background: 'var(--surface-page)', padding: 'var(--space-24) 0' }}>
        <div className="container" style={{ maxWidth: 1120, paddingInline: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto var(--space-12)' }}>
            <Badge tone="warning" style={{ marginBottom: 'var(--space-4)' }}>Good to know</Badge>
            <h2 className="cb-balance" style={h2Style}>Low risk, easy to reassign</h2>
            <p style={leadStyle}>Free to try first, cancel anytime for individuals, and reassignable seats for employers.</p>
          </div>
          <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {REASSURANCE.map((item) => (
              <Card key={item.q} elevation="sm" padded style={{ height: '100%' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h5)', lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', margin: '0 0 var(--space-2)' }}>{item.q}</h3>
                <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>{item.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ====================== FINAL CTA (FREE-FIRST) ====================== */}
      <section
        aria-label="Get started"
        style={{ background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)', padding: 'var(--space-24) 0', textAlign: 'center' }}
      >
        <div className="container" style={{ maxWidth: 720, paddingInline: 'var(--space-6)' }}>
          <h2 className="cb-balance" style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-h1)',
            lineHeight: 'var(--lh-snug)', margin: '0 0 var(--space-3)', color: 'var(--text-on-inverse)',
          }}>
            See the whole platform for free.
          </h2>
          <p style={{ color: 'color-mix(in srgb, var(--text-on-inverse) 82%, transparent)', margin: '0 auto var(--space-8)', maxWidth: 560 }}>
            Create your free account, explore it yourself as both the learner and the admin, load it with
            sample data, and invite your team free. No credit card. Activate licenses for instant access
            whenever you are ready.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-5)', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button as="a" href={TRY_PATH} size="lg" data-track="pricing_final_start_free">Start free</Button>
            <a href={WALKTHROUGH_PATH} data-track="pricing_final_book_walkthrough" style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 600,
              color: 'color-mix(in srgb, var(--text-on-inverse) 86%, transparent)', textDecoration: 'none',
            }}>Book a walkthrough &rarr;</a>
          </div>
        </div>
      </section>
    </>
  );
}

export default PricingPage;
