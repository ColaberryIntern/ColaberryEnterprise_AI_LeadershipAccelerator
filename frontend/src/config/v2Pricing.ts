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
  /**
   * Each tier carries its own accent, as the previous site did. One accent
   * across three cards made them read as a list; three accents make them read
   * as three choices, which is what the page is asking the reader to make.
   */
  readonly accent: 'green' | 'cherry' | 'blue';
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    key: 'free',
    badge: 'Start here',
    name: 'Start free',
    priceClaim: 'pricing.free',
    unit: 'for the whole platform',
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
    ctaRoute: '/try',
    icon: 'spark',
    accent: 'green',
    featured: true,
  },
  {
    key: 'individual',
    badge: 'Activate a license',
    name: 'One license',
    priceClaim: 'pricing.individual.annual',
    unit: 'per person, per month, billed annually',
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
    ctaRoute: '/try',
    icon: 'ladder',
    accent: 'cherry',
  },
  {
    key: 'team',
    badge: 'Activate licenses',
    name: 'Team and department',
    priceClaim: 'pricing.team',
    secondaryClaim: 'pricing.department',
    unit: 'per seat, per year — volume pricing as you scale',
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
    accent: 'blue',
  },
];

/**
 * THE THREE SERVICES -- Build, Guide, Train.
 *
 * Modeled on `docs/enterprise-site-v4/index.html`, the design Ali named as the
 * model for site updates. v4 reframes the page from "here is a license ladder"
 * to "here are three services, one commercial shape each", with a single entry
 * offer in front of them: the demo pilot.
 *
 * NO FIGURES HERE, AND THAT IS THE POINT. Each service carries the *shape* of
 * its commercial terms, never a number. The license ladder below still renders
 * its figures through the claims registry, because `/pricing` is the one route
 * where `pricing.team` and `pricing.department` are publishable and removing
 * that surface would take governed, approved prices off the site entirely.
 *
 * The five engagements in `v2Services.ts` are NOT replaced by these three. They
 * are the delivery catalogue; these are the three ways a buyer commercially
 * engages. See the PR description for the mapping and the open question.
 */
export interface ServiceShape {
  readonly key: string;
  readonly badge: string;
  /** The verb, rendered large. */
  readonly verb: string;
  /** The promise, one sentence. */
  readonly promise: string;
  readonly blurb: string;
  /** The commercial shape. A shape, never a figure. */
  readonly termsLabel: string;
  readonly terms: string;
  readonly includes: readonly string[];
  readonly ctaLabel: string;
  readonly ctaRoute: string;
  readonly icon: IconName;
  readonly featured?: boolean;
  readonly accent: 'green' | 'cherry' | 'blue';
}

export const SERVICE_SHAPES: readonly ServiceShape[] = [
  {
    key: 'build',
    badge: 'Custom application',
    verb: 'Build',
    promise: 'A custom application, designed for your business.',
    blurb:
      'We work with your business experts, the people who know how your industry actually ' +
      'runs, to design and build an application around the way you work.',
    termsLabel: 'Engagement',
    terms: 'Down payment, then a monthly fee',
    includes: [
      'Custom made and custom designed, not a template',
      'Designed with your own business experts',
      'A demo pilot before the full build',
      'Built by Colaberry architects, with governance and audit logging',
    ],
    ctaLabel: 'Book a demo pilot',
    ctaRoute: '/contact',
    icon: 'blocks',
    accent: 'blue',
  },
  {
    key: 'guide',
    badge: 'Cohort',
    verb: 'Guide',
    promise: 'Your team automates your workflows. We guide every step.',
    blurb:
      'No new tool to log into. Your people build workflows that run locally, in your own ' +
      'environment, against the systems you already have.',
    termsLabel: 'Cohort',
    terms: 'A 12-month engagement, training and guided building together',
    includes: [
      'Built locally, in your environment and current systems',
      'Claude Code training for your builders',
      'Weekly scrum, a project manager and a mentor',
      'Answers where your team already works, in Slack or Teams',
      'Project tracking for every build, confirmed from commits',
    ],
    ctaLabel: 'Book a demo pilot',
    ctaRoute: '/contact',
    icon: 'compass',
    accent: 'cherry',
    featured: true,
  },
  {
    key: 'train',
    badge: 'Training',
    verb: 'Train',
    promise: 'Turn your people into Forward Deployed Engineers.',
    blurb:
      'Your team learns by building: a 12-week course, live sessions every week, and a ' +
      'community of other builders. An assigned FDE keeps it pointed at your own work.',
    termsLabel: 'Training',
    terms: 'An FDE assigned to your account',
    includes: [
      'One Forward Deployed Engineer accountable for your team',
      'The 12-week FDE course, building from week one',
      'Weekly live sessions, with recordings when someone misses one',
      'A community of other learners',
    ],
    ctaLabel: 'Create a free account',
    ctaRoute: '/try',
    icon: 'ladder',
    accent: 'green',
  },
];

/**
 * The side-by-side. Eight rows, taken from v4.
 *
 * Column order matches SERVICE_SHAPES so the table and the cards above it can
 * never drift apart; a test asserts the lengths agree.
 */
export interface CompareRow {
  readonly label: string;
  readonly build: string;
  readonly guide: string;
  readonly train: string;
}

export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    label: 'What gets built',
    build: 'A custom application, designed for your business',
    guide: 'Workflows that automate your processes',
    train: 'Your team’s skills, applied to your work',
  },
  {
    label: 'Who does the building',
    build: 'Colaberry architects, with your experts',
    guide: 'Your team, guided by us',
    train: 'Your team, as they learn',
  },
  {
    label: 'Where it lives',
    build: 'Your own application',
    guide: 'Locally, in your environment and current systems',
    train: 'Wherever your team applies it',
  },
  {
    label: 'Starts with',
    build: 'A demo pilot',
    guide: 'A demo pilot',
    train: 'A free account',
  },
  {
    label: 'Finding ROI in your processes',
    build: 'With your business experts',
    guide: 'With your team',
    train: 'Your FDE points the way',
  },
  {
    label: 'Training in Claude Code',
    build: 'Optional',
    guide: 'Included',
    train: 'The core of it',
  },
  {
    label: 'Your main contact',
    build: 'Colaberry architects',
    guide: 'A project manager and a mentor',
    train: 'Your assigned FDE',
  },
  {
    label: 'Commercial terms',
    build: 'Down payment, then a monthly fee',
    guide: 'A 12-month engagement',
    train: 'An assigned FDE',
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
    q: 'What exactly is a demo pilot?',
    a:
      'One of your real processes, automated and running, with the ROI case written beside ' +
      'it. It is how you decide whether to go further, on evidence rather than on a deck.',
  },
  {
    q: 'Department by department, or company-wide?',
    a:
      'Either. Most start with the department where the return is clearest. If leadership is ' +
      'aligned, every leader can start after the pilot. The method is the same.',
  },
  {
    q: 'Is Build an off-the-shelf product?',
    a:
      'No. It is custom made and custom designed with your business experts, around how your ' +
      'company and your industry actually work.',
  },
  {
    q: 'Will Guide add another tool to our stack?',
    a:
      'No. Your team builds workflows that run locally in your own environment and work with ' +
      'the systems you already have: your ERP, CRM, email, drives and chat.',
  },
  {
    q: 'Can we combine services?',
    a:
      'Yes. Build a custom application while your people go through Train or Guide to ' +
      'automate the workflows around it.',
  },
  {
    q: 'Who owns the data?',
    a:
      'You do. Guide runs entirely inside your environment, and Build is designed with your ' +
      'data boundaries and approval rules from day one.',
  },
  {
    /**
     * Kept from the previous page deliberately. v4 has no equivalent question,
     * but this is the certification disclaimer the whole site commits to making
     * on every surface, and dropping it to match a count would be a regression.
     */
    q: 'Is the certification issued by Colaberry?',
    a:
      'No. We prepare people for it and the credential is issued by the certifying body. We ' +
      'are deliberate about that distinction on every page.',
  },
];
