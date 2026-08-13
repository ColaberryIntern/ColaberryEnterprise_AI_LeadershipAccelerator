/**
 * v2Pricing.ts -- the pricing page.
 *
 * Every figure here is already in the claims registry as VERIFIED against a live
 * probe of enterprise.colaberry.ai/pricing (2026-08-07), so this page renders
 * them through `<Claim>` rather than retyping them. That matters: if a price
 * changes, it changes in the registry and every surface follows, instead of one
 * page quietly disagreeing with another -- which is exactly how the retired
 * $4,500 offer survived on a landing page for a month after it was withdrawn.
 *
 * ROUTE SCOPING IS WHY THIS PAGE EXISTS AT ALL
 * `pricing.individual.monthly`, `pricing.team` and `pricing.department` are
 * approved ONLY for '/pricing'. They cannot render on the homepage or on the
 * free-workspace page even if someone adds them. This page declares that route,
 * so it is the one surface where the full ladder is publishable.
 */

import type { IconName } from '../components/publicV2/Icon';

export interface PricingTier {
  readonly key: string;
  readonly badge: string;
  readonly name: string;
  /** Registry key for the headline figure. Never a hardcoded number. */
  readonly priceClaim: string;
  /** Registry key for a secondary figure, where one is approved for this route. */
  readonly secondaryClaim?: string;
  readonly unit?: string;
  readonly blurb: string;
  readonly includes: readonly string[];
  readonly ctaLabel: string;
  readonly ctaRoute: string;
  readonly icon: IconName;
  /** The tier we recommend starting on. Exactly one. */
  readonly featured?: boolean;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    key: 'free',
    badge: 'Start here',
    name: 'Start free',
    priceClaim: 'pricing.free',
    unit: 'to start',
    blurb:
      'Explore the whole platform yourself, with both the learner experience and your own ' +
      'management dashboard, and invite your team free to test it.',
    includes: [
      'A dual account: the learner experience plus your own management dashboard',
      'Your organization view, opening on sample data until your team fills it',
      'Readiness, builder XP and evidence tracked per person as they join',
      'Free test invites, so your employees can try it before anyone pays',
    ],
    ctaLabel: 'Create a free account',
    ctaRoute: '/v2/start',
    icon: 'spark',
    featured: true,
  },
  {
    key: 'individual',
    badge: 'Activate a license',
    name: 'One license',
    priceClaim: 'pricing.individual.annual',
    secondaryClaim: 'pricing.individual.monthly',
    blurb:
      'Full platform access for one person, from first login through to certification ' +
      'preparation. The single paid step, taken only when you are ready.',
    includes: [
      'Self-paced learning paths, on your own schedule',
      'Certification preparation, aligned to the official architect domains',
      'A real, deployed project of your own rather than a toy problem',
      'Weekly live events and office hours',
    ],
    ctaLabel: 'Start free first',
    ctaRoute: '/v2/start',
    icon: 'ladder',
  },
  {
    key: 'team',
    badge: 'Activate licenses',
    name: 'Team and department',
    priceClaim: 'pricing.team',
    secondaryClaim: 'pricing.department',
    unit: 'per seat, per year',
    blurb:
      'Annual seats for your organization, reassignable as people move, plus the management ' +
      'dashboard across everyone you develop.',
    includes: [
      'Annual seats, reassignable across your organization',
      'Volume pricing that drops as you scale',
      'One management dashboard for readiness, adoption and evidence',
      'A company-scoped view of who is progressing and who is stuck',
    ],
    ctaLabel: 'Talk to an architect',
    ctaRoute: '/contact',
    icon: 'people',
  },
];

/**
 * Engagements are deliberately absent from the ladder above.
 * `pricing.services` is VERIFIED as "scoped on a call" by decision of 2026-08-07,
 * so putting a number beside them would contradict the registry.
 */
export const SERVICES_PRICING_NOTE =
  'Consulting engagements are scoped with a person who can qualify the work, rather than ' +
  'anchored on a number before anyone has seen your systems.';

export interface PricingFaq {
  readonly q: string;
  readonly a: string;
}

export const PRICING_FAQ: readonly PricingFaq[] = [
  {
    q: 'What does free actually include?',
    a:
      'The whole platform, for you, plus free invites for your team to try it. It opens on ' +
      'sample data shaped to the metrics the product really captures, and fills with your ' +
      'own as people join. No credit card, and no sales call required to look around.',
  },
  {
    q: 'When would we pay?',
    a:
      'When you want someone to progress rather than evaluate. A license unlocks the paths, ' +
      'the certification preparation and the project work. Until then the account stays free.',
  },
  {
    q: 'Can seats move between people?',
    a: 'Yes. Team and department seats are annual and reassignable as people change roles.',
  },
  {
    q: 'Is the certification issued by Colaberry?',
    a:
      'No. We prepare people for it and the credential is issued by the certifying body. We ' +
      'are deliberate about that distinction on every page.',
  },
];
