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
 *      model writes Train's terms as "$0 to get started"; that string cannot go
 *      here. "A free account" and "Start free" say the same thing and are what
 *      COMPARE_ROWS already uses on /pricing, so the two pages agree.
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
 */

import type { IconName } from '../components/publicV2/Icon';
import type { ServicePhoto } from './v2Services';

/** One step in the "how this runs" sequence on a service page. */
export interface ServiceStep {
  readonly n: string;
  readonly title: string;
  readonly body: string;
}

/** One item in the "what is included" grid. */
export interface ServiceInclusion {
  readonly title: string;
  readonly body: string;
}

export interface ServiceFaq {
  readonly q: string;
  readonly a: string;
}

export interface ServicePage {
  /** URL segment under /services. Also the key into SERVICE_SHAPES. */
  readonly slug: 'build' | 'guide' | 'train';
  readonly icon: IconName;
  readonly photo: ServicePhoto;
  /** The one-word name, rendered with the model's trailing full stop. */
  readonly verb: string;
  /** The single sentence the page is about. */
  readonly promise: string;
  /** The paragraph under the promise. */
  readonly lede: string;
  /** When a buyer should pick this one. */
  readonly chooseWhen: string;
  readonly includes: readonly ServiceInclusion[];
  /** Heading for the sequence section, e.g. "How a Build engagement runs". */
  readonly stepsEyebrow: string;
  readonly stepsHeading: string;
  readonly steps: readonly ServiceStep[];
  /** The "what this is not" / "what it is" contrast pair. */
  readonly isNotHeading: string;
  readonly isNot: readonly string[];
  readonly isHeading: string;
  readonly isIt: readonly string[];
  readonly faqs: readonly ServiceFaq[];
  /** Label and route for the page's own primary action. */
  readonly ctaLabel: string;
  readonly ctaRoute: string;
}

export const SERVICE_PAGES: readonly ServicePage[] = [
  {
    slug: 'build',
    icon: 'blocks',
    photo: {
      src: '/img/outcome-builder.jpg',
      alt:
        'A person at a desk with printed plans, sticky notes and a tablet spread out beside an open laptop.',
    },
    verb: 'Build',
    promise: 'A custom application, designed for your business.',
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
      },
      {
        title: 'ROI discovery',
        body: 'The processes the application should take on, ranked by what they return.',
      },
      {
        title: 'Custom design',
        body:
          'Screens, flows and rules designed around your business, reviewed with your experts.',
      },
      {
        title: 'Demo pilot',
        body: 'A working first version on your real process, before the full build.',
      },
      {
        title: 'Built by Colaberry architects',
        body:
          'With Claude Code, and with governance, access control and audit logging built in.',
      },
      {
        title: 'Continuous improvement',
        body: 'The monthly engagement keeps the application growing as your business does.',
      },
    ],
    stepsEyebrow: 'How a Build engagement runs',
    stepsHeading: 'From your experts’ heads to a working application.',
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
    isNotHeading: 'Not a template with your logo on it.',
    isNot: [
      'An off-the-shelf product, configured',
      'A generic chatbot on top of your documents',
      'A prototype nobody can run in production',
    ],
    isHeading: 'An application shaped by the people who know your business.',
    isIt: [
      'Designed around your workflows and your industry’s rules',
      'Governed: evaluations, access control, audit logging, human approval',
      'Improved every month as your needs change',
    ],
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
          'You do. Build is designed with your data boundaries and approval rules from day ' +
          'one, and Guide runs entirely inside your own environment.',
      },
      {
        q: 'What exactly is a demo pilot?',
        a:
          'One of your real processes, automated with Claude Code and running, with the ROI ' +
          'case written beside it. It is how you decide whether to go further, on evidence ' +
          'rather than on a deck.',
      },
    ],
    ctaLabel: 'Book a demo pilot',
    ctaRoute: '/demo-pilot',
  },
  {
    slug: 'guide',
    icon: 'compass',
    photo: {
      src: '/img/mentor-coaching.jpg',
      alt:
        'A more experienced colleague reaching in to point at a laptop screen while three teammates follow along.',
    },
    verb: 'Guide',
    promise: 'Your team automates your workflows. We guide every step.',
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
      },
      {
        title: 'Built locally, in your environment',
        body: 'Your systems, your data, your approval rules. Nothing leaves your boundary.',
      },
      {
        title: 'Claude Code training',
        body: 'The Forward Deployed Engineer course, for your builders.',
      },
      {
        title: 'Weekly scrum calls',
        body: 'What shipped, what is stuck and what is next, every week.',
      },
      {
        title: 'A project manager and a mentor',
        body: 'Direction on every project, while a wrong turn is still cheap.',
      },
      {
        title: 'Answers in your Slack or Teams',
        body: 'Guidance where your team already works.',
      },
      {
        title: 'Project tracking for every build',
        body: 'All departments and projects on the platform, confirmed from commits.',
      },
    ],
    stepsEyebrow: 'What it actually looks like',
    stepsHeading: 'A week inside a Guide cohort.',
    steps: [
      {
        n: 'Mon',
        title: 'Commit to the week',
        body: 'Each builder states which workflow they will move forward. Visible to the cohort.',
      },
      {
        n: 'Scrum',
        title: 'Weekly scrum call',
        body: 'What shipped, what is stuck, what is next, across every project.',
      },
      {
        n: 'Daily',
        title: 'Answers in Slack or Teams',
        body: 'Questions handled where your team already works, not queued for a call.',
      },
      {
        n: 'Mentor',
        title: 'Direction on the build',
        body: 'A wrong turn caught while it is still cheap to change.',
      },
      {
        n: 'Fri',
        title: 'Tracked from the work',
        body: 'Project status updated on the platform from commits, not from self-reports.',
      },
    ],
    isNotHeading: 'Not another tool to log into.',
    isNot: [
      'A new platform your team has to adopt',
      'Outside engineers working in your systems',
      'A course with nothing real to build',
    ],
    isHeading: 'Your processes, automated inside the systems you already have.',
    isIt: [
      'Workflows that connect your ERP, CRM, email, drives and chat',
      'Built locally, in your environment, by your own people',
      'Capability that stays in the company afterwards',
    ],
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
  },
  {
    slug: 'train',
    icon: 'ladder',
    photo: {
      src: '/img/team-collab.jpg',
      alt:
        'Three colleagues around a wooden table, one typing on a laptop while another takes notes.',
    },
    verb: 'Train',
    promise: 'Turn your people into Forward Deployed Engineers.',
    lede:
      'Your team learns Claude Code by building: a 12-week course, live sessions every week, ' +
      'and a community of other learners. A Forward Deployed Engineer assigned to your ' +
      'account keeps it organized and points your people at your own work.',
    chooseWhen:
      'You want to start without a procurement conversation, and judge the result by what ' +
      'your people actually build.',
    includes: [
      {
        title: 'An FDE managing your account',
        body: 'One person accountable for your team’s training.',
      },
      {
        title: 'The 12-week FDE course',
        body: 'Designed to produce engineers who take AI from an idea to something deployed.',
      },
      {
        title: 'Claude Code, hands on',
        body: 'Building from week one, not watching slides.',
      },
      {
        title: 'Weekly live sessions',
        body: 'Plus recordings, for when someone misses one.',
      },
      {
        title: 'A community of learners',
        body: 'Your people learn alongside other builders.',
      },
    ],
    stepsEyebrow: 'The 12 weeks',
    stepsHeading: 'From first prompt to Forward Deployed Engineer.',
    steps: [
      {
        n: 'Start',
        title: 'Open your account',
        body:
          'Your FDE is assigned, your people are enrolled, and the first session is on the ' +
          'calendar.',
      },
      {
        n: 'Weekly',
        title: 'Live session, then build',
        body: 'A live session with the cohort, then hands-on building with Claude Code.',
      },
      {
        n: 'Ongoing',
        title: 'Community and FDE check-ins',
        body: 'Learners help each other; your FDE tracks progress and points them at your work.',
      },
      {
        n: 'Week 12',
        title: 'Forward Deployed Engineers',
        body: 'People who can take a business problem from an idea to a deployed AI solution.',
      },
    ],
    isNotHeading: 'Judge it by what your people build.',
    isNot: [
      'A certification measured by attendance',
      'Slides, with the building left as an exercise',
      'A procurement conversation before anyone has tried it',
    ],
    isHeading: 'Readiness computed from what your people actually ship.',
    isIt: [
      'Building with Claude Code from week one',
      'An assigned FDE pointing the work at your own processes',
      'Progress confirmed from commits, not from a completion percentage',
    ],
    faqs: [
      {
        q: 'What does it cost to start?',
        a:
          'Nothing. You open a free account, your FDE is assigned, and your people are ' +
          'enrolled. There is no procurement conversation before anyone has tried it.',
      },
      {
        q: 'What happens after the 12 weeks?',
        a:
          'When your new Forward Deployed Engineers are ready to automate real processes ' +
          'with us beside them, Guide picks up where Train leaves off.',
      },
      {
        q: 'How is readiness measured?',
        a:
          'From what your people ship. Progress is confirmed against real commits rather ' +
          'than reported as a completion percentage or counted as attendance.',
      },
    ],
    ctaLabel: 'Create a free account',
    ctaRoute: '/try',
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
