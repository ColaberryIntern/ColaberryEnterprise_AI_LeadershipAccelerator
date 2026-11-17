/**
 * v2ServicePages.ts — the three services, in full: Build, Guide, Train.
 *
 * WHY THIS FILE EXISTS. The site used to sell five productized engagements, each
 * with its own detail page under `/services/:slug`. The v5 site model
 * (`docs/enterprise-site-v5/`) collapses those five into three, because five
 * names for what a buyer experiences as three choices made the chooser page do
 * the work the sales call should do. `v2Services.ts` still holds the five, and
 * still renders nothing: it survives only as the redirect table, so inbound
 * links and search results keep working. See LEGACY_SERVICE_REDIRECTS below.
 *
 * SCOPE BOUNDARY, inherited from v2Services.ts and not relaxed here:
 * descriptive only. What a service includes and when it fits. No outcome
 * promises, no volumes, no prices. The claims registry owns anything that could
 * be true or false.
 *
 * TWO GUARDS THIS FILE MUST NOT TRIP, both enforced by ServicesV2.test.tsx:
 *
 *   1. No currency figure renders on a services page (`/\$\s?[\d,]/`). The v5
 *      model writes Train's terms as "$0 to get started" and its phase chip as
 *      "Start · $0"; neither string can go here.
 *
 *   2. No duration or speed claim of the form "3-4 weeks" or "in 6 weeks". A
 *      competitor's "3 weeks vs 12-16 weeks" was once restated as ours. Note
 *      that "12-week course" and "12-month engagement" are *durations of a
 *      thing you buy*, not promises about how fast a result arrives, and both
 *      already ship on /pricing inside SERVICE_SHAPES.
 *
 * The commercial shape of each service is NOT duplicated here. It lives once in
 * SERVICE_SHAPES (config/v2Pricing.ts) and is read from there, so the services
 * pages and the pricing page cannot drift into two different offers.
 *
 * MODEL FIDELITY (2026-11-16). Each page now follows the model's own layout: a
 * dark hero with a terms card, a "what it is / what is included" pair, the
 * page's own sequence (Build's five-step timeline, Guide's week, Train's twelve
 * weeks), the contrast pair, the FAQ where the model has one, the other two
 * services, and the closing band. The fields below carry the model's copy for
 * the parts the page did not have before (hero paragraph, terms note, hero list,
 * one icon per inclusion), with its em dashes turned into commas or colons.
 */

import type { IconName } from '../components/publicV2/Icon';
import type { GlyphName } from '../components/publicV2/ModelGlyph';

/** One step in the "how this runs" sequence on a service page. */
export interface ServiceStep {
  readonly n: string;
  readonly title: string;
  readonly body: string;
}

/** One item in the "what is included" list. */
export interface ServiceInclusion {
  readonly title: string;
  readonly body: string;
  /** The model's line icon for this item. */
  readonly glyph: GlyphName;
}

export interface ServiceFaq {
  readonly q: string;
  readonly a: string;
}

/** One side of the contrast pair: a list, or a short paragraph with an action. */
export interface ServiceContrastSide {
  readonly label: string;
  readonly heading: string;
  readonly items?: readonly string[];
  readonly body?: string;
  readonly action?: { readonly label: string; readonly to: string };
}

export interface ServicePage {
  /** URL segment under /services. Also the key into SERVICE_SHAPES. */
  readonly slug: 'build' | 'guide' | 'train';
  readonly icon: IconName;
  /** The one-word name, rendered with the model's trailing full stop. */
  readonly verb: string;
  /** The single sentence the page is about. */
  readonly promise: string;
  /** The hero's paragraph under the promise (the model's `p.l`). */
  readonly heroLede: string;
  /** The line under the terms in the hero's terms card. */
  readonly termsNote: string;
  /** The hero terms card's four ticks. */
  readonly heroList: readonly string[];
  /** One line for this service on the other two services' pages. */
  readonly short: string;
  /** The paragraph under "What it is". */
  readonly lede: string;
  /** When a buyer should pick this one. */
  readonly chooseWhen: string;
  readonly includes: readonly ServiceInclusion[];
  /** The sequence section: label, heading (plain part, then the accent phrase), optional lede. */
  readonly stepsEyebrow: string;
  readonly stepsHeading: string;
  readonly stepsAccent?: string;
  readonly stepsLede?: string;
  readonly steps: readonly ServiceStep[];
  /** The contrast pair, and whether it comes before the sequence (Guide) or after it. */
  readonly contrastNo: ServiceContrastSide;
  readonly contrastYes: ServiceContrastSide;
  readonly contrastFirst?: boolean;
  /** Questions; the model's Train page has none. */
  readonly faqs: readonly ServiceFaq[];
  /** Label and route for the page's own primary action, and the second button beside it. */
  readonly ctaLabel: string;
  readonly ctaRoute: string;
  readonly secondaryLabel: string;
  readonly secondaryRoute: string;
}

export const SERVICE_PAGES: readonly ServicePage[] = [
  {
    slug: 'build',
    icon: 'blocks',
    verb: 'Build',
    promise: 'A custom application, designed for your business.',
    heroLede:
      'We work closely with your business experts to design and build an application around ' +
      'how your company and your industry actually work: custom made, custom designed, built ' +
      'with Claude Code.',
    termsNote:
      'Design and build of your custom application, with your business experts involved ' +
      'throughout.',
    heroList: [
      'Custom made, custom designed',
      'Built with your business experts',
      'Demo pilot before the full build',
      'Built by Colaberry architects',
    ],
    short: 'A custom application, designed for your business',
    lede:
      'We work closely with your business experts, the people who know how your industry ' +
      'actually runs, to design and build an application around the way you work. Custom ' +
      'made, custom designed, built with Claude Code. Not a template, and not an ' +
      'off-the-shelf tool with your logo on it.',
    chooseWhen:
      'Your business needs an application that fits how you work, and you want it designed ' +
      'and built for you, without pulling your people off their jobs.',
    includes: [
      {
        title: 'Sessions with your business experts',
        body:
          'We learn how your industry and your company actually work before we design ' +
          'anything.',
        glyph: 'people',
      },
      {
        title: 'ROI discovery',
        body: 'The processes the application should take on, ranked by what they return.',
        glyph: 'search',
      },
      {
        title: 'Custom design',
        body:
          'Screens, flows and rules designed around your business, reviewed with your experts.',
        glyph: 'layers',
      },
      {
        title: 'Demo pilot',
        body: 'A working first version on your real process, before the full build.',
        glyph: 'terminal',
      },
      {
        title: 'Built by Colaberry architects',
        body:
          'With Claude Code, with governance, access control and audit logging built in.',
        glyph: 'code',
      },
      {
        title: 'Continuous improvement',
        body: 'The monthly engagement keeps the application growing as your business does.',
        glyph: 'bars',
      },
    ],
    stepsEyebrow: 'How a Build engagement runs',
    stepsHeading: 'From your experts’ heads',
    stepsAccent: 'to a working application.',
    steps: [
      {
        n: '01',
        title: 'Sit with your experts',
        body: 'We learn how the work really runs: the rules, the exceptions, the judgment calls.',
      },
      {
        n: '02',
        title: 'Find the ROI',
        body: 'The processes the application should take on, ranked by what they return.',
      },
      {
        n: '03',
        title: 'Demo pilot',
        body: 'A working first version on one real process, with the ROI case beside it.',
      },
      {
        n: '04',
        title: 'Design and build',
        body: 'Screens, flows and rules designed with your experts; built by our architects.',
      },
      {
        n: '05',
        title: 'Grow it monthly',
        body: 'New processes and new departments added as the business asks for them.',
      },
    ],
    contrastNo: {
      label: 'What Build is not',
      heading: 'Not a template with your logo on it.',
      items: [
        'An off-the-shelf product, configured',
        'A generic chatbot on top of your documents',
        'A prototype nobody can run in production',
      ],
    },
    contrastYes: {
      label: 'What it is',
      heading: 'An application shaped by the people who know your business.',
      items: [
        'Designed around your workflows and your industry’s rules',
        'Governed: evaluations, access control, audit logging, human approval',
        'Improved every month as your needs change',
      ],
    },
    faqs: [
      {
        q: 'Is Build an off-the-shelf product?',
        a:
          'No. It is custom made and custom designed with your business experts, around how ' +
          'your company and your industry actually work.',
      },
      {
        q: 'Who owns the data?',
        a:
          'You do. Guide runs entirely inside your environment, and Build is designed with ' +
          'your data boundaries and approval rules from day one.',
      },
      {
        q: 'What exactly is a demo pilot?',
        a:
          'One of your real processes, automated with Claude Code and running, with the ROI ' +
          'case written beside it. It is how you decide whether to go further, on evidence, ' +
          'not on a deck.',
      },
    ],
    ctaLabel: 'Book a demo pilot',
    ctaRoute: '/demo-pilot',
    secondaryLabel: 'How pricing works',
    secondaryRoute: '/pricing',
  },
  {
    slug: 'guide',
    icon: 'compass',
    verb: 'Guide',
    promise: 'Your team automates your workflows. We guide every step.',
    heroLede:
      'No new tools. Your people build workflows that automate your business processes: ' +
      'locally, in your own environment, working together with the systems you already run.',
    termsNote: 'Training and guided building, included together for the full year.',
    heroList: [
      'Built locally, in your current systems',
      '12-week Claude Code training',
      'Weekly scrum, a project manager and a mentor',
      'Answers in your Slack or Teams',
    ],
    short: 'Your team automates your workflows, with us beside them',
    lede:
      'This is not about adding another tool. Your people build workflows that automate your ' +
      'business processes locally, in your own environment, working together with the systems ' +
      'you already run. We train them in Claude Code and guide them every week, so the ' +
      'capability stays inside your company.',
    chooseWhen:
      'You want the capability to stay in-house, and your people already understand the ' +
      'processes worth automating.',
    includes: [
      {
        title: 'Process discovery and demo pilot',
        body:
          'We find the workflows worth automating; your team builds the first one with us.',
        glyph: 'search',
      },
      {
        title: 'Built locally, in your environment',
        body: 'Your systems, your data, your approval rules. Nothing leaves your boundary.',
        glyph: 'shield',
      },
      {
        title: 'Claude Code training',
        body: 'The 12-week Forward Deployed Engineer course for your builders.',
        glyph: 'cap',
      },
      {
        title: 'Weekly scrum calls',
        body: 'What shipped, what is stuck and what is next, every week.',
        glyph: 'calendar',
      },
      {
        title: 'Project manager and mentor',
        body: 'Direction on every project, while a wrong turn is still cheap.',
        glyph: 'compass',
      },
      {
        title: 'Answers in your Slack or Teams',
        body: 'Guidance where your team already works.',
        glyph: 'chat',
      },
      {
        title: 'Project tracking for every build',
        body: 'All departments and projects on the platform, confirmed from commits.',
        glyph: 'bars',
      },
    ],
    stepsEyebrow: 'What it actually looks like',
    stepsHeading: 'A week inside a Guide cohort.',
    stepsLede:
      'Deliberately unglamorous. The value is in the rhythm holding for twelve months, not in ' +
      'any single session.',
    steps: [
      {
        n: 'Monday',
        title: 'Commit to the week',
        body: 'Each builder states which workflow they will move forward. Visible to the cohort.',
      },
      {
        n: 'Scrum',
        title: 'Weekly scrum call',
        body: 'What shipped, what is stuck, what is next, across every project.',
      },
      {
        n: 'Every day',
        title: 'Answers in Slack or Teams',
        body: 'Questions handled where your team already works, not queued for a call.',
      },
      {
        n: 'Mentor',
        title: 'Direction on the build',
        body: 'A wrong turn caught while it is still cheap to change.',
      },
      {
        n: 'Friday',
        title: 'Tracked from the work',
        body: 'Project status updates on the platform from commits, not self-reports.',
      },
    ],
    contrastNo: {
      label: 'What Guide is not',
      heading: 'Not another tool to log into.',
      items: [
        'A new platform your team has to adopt',
        'Outside engineers working in your systems',
        'A course with nothing real to build',
      ],
    },
    contrastYes: {
      label: 'What it is',
      heading: 'Your processes, automated inside the systems you already have.',
      items: [
        'Workflows that connect your ERP, CRM, email, drives and chat',
        'Built locally, in your environment, by your own people',
        'Capability that stays in the company after the year',
      ],
    },
    contrastFirst: true,
    faqs: [
      {
        q: 'Will Guide add another tool to our stack?',
        a:
          'No. Your team builds workflows that run locally in your own environment and work ' +
          'with the systems you already have: your ERP, CRM, email, drives and chat.',
      },
      {
        q: 'Who owns the data?',
        a:
          'You do. Guide runs entirely inside your environment, and Build is designed with ' +
          'your data boundaries and approval rules from day one.',
      },
      {
        q: 'Department by department, or company-wide?',
        a:
          'Either. You can start with the department where the ROI is clearest. If ' +
          'leadership is aligned, every leader can start after the pilot. The method is the ' +
          'same.',
      },
    ],
    ctaLabel: 'Book a demo pilot',
    ctaRoute: '/demo-pilot',
    secondaryLabel: 'How pricing works',
    secondaryRoute: '/pricing',
  },
  {
    slug: 'train',
    icon: 'ladder',
    verb: 'Train',
    promise: 'Turn your people into Forward Deployed Engineers.',
    heroLede:
      'A 12-week Claude Code course with live sessions every week and a community of other ' +
      'learners, managed by an FDE assigned to your account.',
    termsNote: 'An FDE is assigned to manage your account.',
    heroList: [
      'Your own assigned FDE',
      '12-week FDE course',
      'Weekly live sessions and recordings',
      'Community of other learners',
    ],
    short: 'Your people become Forward Deployed Engineers',
    lede:
      'Your team learns Claude Code by building: a 12-week course, live sessions every week ' +
      'and a community of other learners. An FDE assigned to your account keeps it organized ' +
      'and points your people at your own work.',
    chooseWhen:
      'You want to start without a procurement conversation, and judge the result by what ' +
      'your people actually build.',
    includes: [
      {
        title: 'An FDE managing your account',
        body: 'One person accountable for your team’s training.',
        glyph: 'person',
      },
      {
        title: '12-week FDE course',
        body: 'Designed to produce engineers who take AI from idea to deployed.',
        glyph: 'cap',
      },
      {
        title: 'Claude Code, hands-on',
        body: 'Building from week one, not watching slides.',
        glyph: 'terminal',
      },
      {
        title: 'Weekly live sessions',
        body: 'Plus recordings when someone misses one.',
        glyph: 'video',
      },
      {
        title: 'Community of learners',
        body: 'Your people learn alongside other builders.',
        glyph: 'people',
      },
    ],
    stepsEyebrow: 'The 12 weeks',
    stepsHeading: 'From first prompt',
    stepsAccent: 'to Forward Deployed Engineer.',
    stepsLede:
      'Building from week one. Your FDE connects what your people learn to your own processes ' +
      'along the way.',
    steps: [
      {
        n: 'Start',
        title: 'Open your account',
        body:
          'Your FDE is assigned, your people are enrolled, and the first session is on the ' +
          'calendar.',
      },
      {
        n: 'Every week',
        title: 'Live session + build',
        body: 'A live session with the cohort, then hands-on building with Claude Code.',
      },
      {
        n: 'Throughout',
        title: 'Community + FDE check-ins',
        body: 'Learners help each other; your FDE tracks progress and points them at your work.',
      },
      {
        n: 'Week 12',
        title: 'Forward Deployed Engineers',
        body: 'People who can take a business problem from idea to a deployed AI solution.',
      },
    ],
    /*
        The model's Train pair is two short notes, not two lists. Its second label reads
        "Why $0 to start"; a currency figure cannot render on a services page, so the label
        says what the note is about instead.
    */
    contrastNo: {
      label: 'After Train',
      heading: 'Ready to point them at the work?',
      body:
        'When your new FDEs are ready to automate real processes with us beside them, Guide ' +
        'picks up where Train leaves off.',
      action: { label: 'See Guide', to: '/services/guide' },
    },
    contrastYes: {
      label: 'Why start here',
      heading: 'Judge it by what your people build.',
      body:
        'Start without a procurement conversation. Readiness is computed from what your ' +
        'people actually ship, not from attendance.',
    },
    faqs: [],
    ctaLabel: 'Create a free account',
    ctaRoute: '/try',
    secondaryLabel: 'Talk to an Architect',
    secondaryRoute: '/demo-pilot',
  },
];

export function getServicePage(slug: string): ServicePage | undefined {
  return SERVICE_PAGES.find((s) => s.slug === slug);
}

/**
 * The five retired slugs, each pointing at the service that absorbed it.
 *
 * These are not decoration. `/services/:slug` renders a redirect for any key in
 * this table, so every inbound link, bookmark and search result that points at
 * one of the old engagement pages still lands somewhere correct. The v5 model
 * asks for 301s; a client-side replace is what a hash-free SPA can actually do
 * here, and `linkIntegrity.test.tsx` plus `ServicesV2.test.tsx` assert that none
 * of these ever renders a dead page.
 *
 * Mapping comes from the model's own site map:
 *   - the sprint, the production pilot and enterprise build all became Build
 *   - embedded AI operations became Guide
 *   - the workforce architect accelerator became Train (and so did /accelerator)
 */
export const LEGACY_SERVICE_REDIRECTS: Readonly<Record<string, ServicePage['slug']>> = {
  'ai-opportunity-sprint': 'build',
  'claude-production-pilot': 'build',
  'enterprise-build-modernization': 'build',
  'embedded-ai-operations': 'guide',
  'workforce-architect-accelerator': 'train',
};
