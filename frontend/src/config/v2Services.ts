/**
 * v2Services.ts — the five productized engagements, in full.
 *
 * SCOPE BOUNDARY (same rule as v2Content.ts): descriptive only. What an
 * engagement includes and when it fits. No outcome promises, no volumes, no
 * prices — services pricing is "scoped on a call" per the 2026-08-07 decision,
 * and the claims registry owns anything that could be true or false.
 *
 * Deliberately NOT stated anywhere here: how long a result takes, what a result
 * will be, or any figure. The prototype review found a competitor's "3 weeks vs
 * 12-16 weeks" claim had been restated as ours; keeping this file free of
 * numbers removes the surface for that mistake to recur.
 */

import type { IconName } from '../components/publicV2/Icon';

/**
 * A photograph attached to a service.
 *
 * WHAT THESE ARE AND ARE NOT. Each photo depicts the *mode of work* an
 * engagement involves -- a discovery session, hands on a keyboard, an
 * experienced person guiding a team. None of them depicts a Colaberry customer,
 * employee, engagement or outcome, and none is captioned as though it did.
 * Presenting stock photography as documentation of real work would be a
 * fabricated proof claim, which is the one thing this site is built not to do.
 * So: `alt` describes what is literally in the frame, never what it proves.
 *
 * SOURCING RULE, learned the hard way. `public/img/` is a mixed bag. Three files
 * in it carry burned-in Creative Commons watermarks and creator credits --
 * `ai-network.jpg` (cc / Graham B Finney), `architect-plan.jpg` (cc-nc /
 * ARJWright, and it is a photo of a real identifiable person's private screen),
 * and `data-dashboard.jpg` (cc-nc-sa / Bevan R). NC means non-commercial, which
 * this site is not. All EXIF was stripped from every file in that folder, so a
 * metadata scan finds nothing and cannot protect you; the marks are in the
 * pixels. Every photo referenced here was opened and inspected before use, and
 * `v2ServicePhotos.test.ts` fails the build if any of the three ever appears.
 */
export interface ServicePhoto {
  readonly src: string;
  /** What is literally visible. Not a claim about who these people are. */
  readonly alt: string;
}

export interface ServiceDetail {
  /** Icon name from components/publicV2/Icon. Decorative; the name beside it carries the meaning. */
  readonly icon: IconName;
  readonly photo: ServicePhoto;
  readonly slug: string;
  readonly number: string;
  readonly name: string;
  /** One line for cards and nav. */
  readonly fit: string;
  /** Who this is for, in full. */
  readonly bestFit: string;
  /** The situation that usually prompts the call. */
  readonly trigger: string;
  /** What actually happens during the engagement. */
  readonly happens: string;
  readonly deliverables: readonly string[];
  /** What you keep, and how you can check the work. */
  readonly proof: string;
  readonly nextStep: string;
  readonly nextRoute: string;
}

export const SERVICE_DETAILS: readonly ServiceDetail[] = [
  {
    slug: 'ai-opportunity-sprint',
    photo: {
      src: '/img/workshop.jpg',
      alt:
        'Four colleagues gathered around a laptop in a bright room, one of them leaning in to point at something on the screen.',
    },
    icon: 'compass',
    number: '01',
    name: 'AI Opportunity and Readiness Sprint',
    fit: 'For organizations that do not know where to start, or have too many ideas to rank.',
    bestFit:
      'Organizations that do not know where to start, or have too many AI ideas and no way ' +
      'to rank them.',
    trigger:
      'A board or executive team has asked for an AI plan, and the honest answer is that ' +
      'nobody has one yet.',
    happens:
      'Structured discovery with the people who own the work, a workflow inventory, then ' +
      'scoring on value, feasibility, data readiness and risk. You end with a ranked map ' +
      'rather than a list of ideas.',
    deliverables: [
      'Stakeholder discovery',
      'Workflow inventory',
      'Prioritized opportunity map',
      'Feasibility assessment',
      'Risk and governance considerations',
      'Transparent ROI assumptions',
      '90-day roadmap',
      'Executive briefing',
    ],
    proof:
      'The opportunity map and roadmap are the deliverable. You keep them whether or not you ' +
      'build with us, and every assumption behind the ROI model is written down rather than ' +
      'embedded in a spreadsheet you cannot inspect.',
    nextStep: 'Run the AI Opportunity Lab, then book a discovery conversation.',
    nextRoute: '/lab',
  },
  {
    slug: 'claude-production-pilot',
    photo: {
      src: '/img/developer-code.jpg',
      alt:
        'Close view over the shoulder of someone typing on a laptop, source code filling the screen.',
    },
    icon: 'bolt',
    number: '02',
    name: 'Claude Production Pilot',
    fit: 'For one promising workflow that needs to be proven before wider investment.',
    bestFit:
      'Organizations with one promising workflow that needs to be proven before wider ' +
      'investment.',
    trigger:
      'A specific workflow is expensive, slow or error-prone, and someone has asked whether ' +
      'AI could do it.',
    happens:
      'We design the workflow end to end, build it with Claude against your real data and ' +
      'systems, then define what "good" means and measure against it before recommending ' +
      'anything.',
    deliverables: [
      'Workflow design',
      'Claude-powered prototype',
      'Data and application integration',
      'Evaluations',
      'Human approval points',
      'Auditability',
      'Success criteria',
      'Production recommendation',
    ],
    proof:
      'A running pilot plus an evaluation report, including an honest recommendation not to ' +
      'productionize where that is the right call.',
    nextStep: 'Bring one workflow to a scoping call.',
    nextRoute: '/contact',
  },
  {
    slug: 'enterprise-build-modernization',
    photo: {
      src: '/img/outcome-builder.jpg',
      alt:
        'A person at a desk with printed plans, sticky notes and a tablet spread out beside an open laptop.',
    },
    icon: 'blocks',
    number: '03',
    name: 'Enterprise Build and Modernization',
    fit: 'For integrating AI into real systems and workflows, not another sandbox.',
    bestFit:
      'Organizations ready to integrate AI into real systems and workflows, rather than ' +
      'run another sandbox.',
    trigger:
      'A pilot worked, and now it has to survive contact with production, security review ' +
      'and real volume.',
    happens:
      'Production architecture, integration through APIs and MCP, modernization of the ' +
      'surrounding systems, then deployment with the access controls, logging and evaluation ' +
      'a real enterprise requires.',
    deliverables: [
      'Production architecture',
      'API and MCP integration',
      'Existing system modernization',
      'Access controls',
      'Data boundaries',
      'Evaluation and observability',
      'Audit logging',
      'Deployment',
      'Documentation',
      'Capability transfer',
    ],
    proof:
      'Deployed systems, architecture documentation and an operations runbook your team owns ' +
      'and can run without us.',
    nextStep: 'Book an architecture review.',
    nextRoute: '/contact',
  },
  {
    slug: 'workforce-architect-accelerator',
    photo: {
      src: '/img/team-collab.jpg',
      alt:
        'Three colleagues around a wooden table, one typing on a laptop while another takes notes.',
    },
    icon: 'ladder',
    number: '04',
    name: 'Workforce Architect Accelerator',
    fit: 'For turning employees into AI builders and architects, not course completers.',
    bestFit:
      'Organizations that want employees to become AI builders and architects, rather than ' +
      'course completers.',
    trigger:
      'Hiring AI talent is slow and expensive, and the people who already understand your ' +
      'workflows are on your payroll.',
    happens:
      'Baseline assessment, a personalized path, then real building with Claude Code on a ' +
      'company project, producing evidence a manager can actually inspect rather than a ' +
      'completion percentage.',
    deliverables: [
      'Initial skills assessment',
      'Personalized learning path',
      'Claude Code build workflow',
      'Real company project',
      'GitHub evidence',
      'Evaluations',
      'Executive dashboard',
      'Demo Day',
      'Certification preparation',
      'Architect network access',
    ],
    proof:
      'Per-person readiness backed by artifacts, evaluations and reviewed evidence, visible ' +
      'on the executive dashboard and traceable to source records.',
    nextStep: 'Open the free company workspace and see the manager view.',
    nextRoute: '/try',
  },
  {
    slug: 'embedded-ai-operations',
    photo: {
      src: '/img/mentor-coaching.jpg',
      alt:
        'A more experienced colleague reaching in to point at a laptop screen while three teammates follow along.',
    },
    icon: 'people',
    number: '05',
    name: 'Embedded Architecture and AI Operations',
    fit: 'For teams that need experienced leadership or delivery capacity inside the team now.',
    bestFit:
      'Organizations that need experienced leadership or delivery capacity inside the team, now.',
    trigger:
      'Work is queued behind one or two people, or nobody senior enough owns the AI standards.',
    happens:
      'Architects embed with your team, lead implementation, set reliability and governance ' +
      'standards, and transfer the practice as they go rather than at the end.',
    deliverables: [
      'Embedded architects',
      'Architecture reviews',
      'Implementation leadership',
      'Governance',
      'Reliability standards',
      'Continuous improvement',
      'Model and workflow evaluation',
      'Internal capability transfer',
    ],
    proof:
      'Review records, standards documentation and a capability-transfer plan with named ' +
      'internal owners.',
    nextStep: 'Talk to an architect about capacity and scope.',
    nextRoute: '/contact',
  },
] as const;

export function getServiceBySlug(slug: string): ServiceDetail | undefined {
  return SERVICE_DETAILS.find((s) => s.slug === slug);
}
