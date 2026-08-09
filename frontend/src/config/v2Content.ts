/**
 * v2Content.ts — structural content for the V2 public site.
 *
 * SCOPE BOUNDARY: this file holds *descriptive* content — what an engagement
 * includes, what a step does. It must never carry a factual assertion about
 * outcomes, volumes, partnerships or credentials; those live in
 * claimsRegistry.ts and are gated there.
 *
 * Rule of thumb: if a sentence could be true or false about the world, it
 * belongs in the registry, not here.
 */

export interface Goal {
  readonly key: string;
  readonly label: string;
  readonly service: string;
  readonly explain: string;
  readonly proof: string;
  readonly cta: string;
  readonly ctaRoute: string;
  readonly next: string;
}

export const GOALS: readonly Goal[] = [
  {
    key: 'opportunity',
    label: 'Find our best AI opportunity',
    service: 'AI Opportunity and Readiness Sprint',
    explain:
      'You have ideas but no ranked, feasibility-tested list. We inventory the workflows, ' +
      'score them on value and feasibility, and hand back a prioritized map.',
    proof: 'An opportunity map and 90-day roadmap, produced from your own workflow inventory.',
    cta: 'Map an AI Opportunity',
    ctaRoute: '/opportunity-lab',
    next: 'Run the AI Opportunity Lab to see the shape of the output.',
  },
  {
    key: 'workflow',
    label: 'Build or improve a workflow',
    service: 'Claude Production Pilot',
    explain:
      'You have one workflow worth proving. We design it, build it with Claude, wire the ' +
      'integrations, add evaluations and human approval, then recommend whether it belongs ' +
      'in production.',
    proof: 'A working pilot on your data, with evaluations and an auditable approval path.',
    cta: 'See the Production Pilot',
    ctaRoute: '/services/claude-production-pilot',
    next: 'Review the pilot deliverables, then bring one workflow to a discovery call.',
  },
  {
    key: 'people',
    label: 'Develop our employees',
    service: 'Workforce Architect Accelerator',
    explain:
      'Your next AI builders may already be on payroll. They learn on their own time, build ' +
      'on a real company project, and produce evidence a manager can inspect.',
    proof: 'Per-person readiness, shipped artifacts and evaluation results on one dashboard.',
    cta: 'Explore the Platform',
    ctaRoute: '/platform',
    next: 'Open the free company workspace and invite two people to try it.',
  },
  {
    key: 'team',
    label: 'Create or extend our AI team',
    service: 'Embedded Architecture and AI Operations',
    explain:
      'You need senior capacity now and capability transfer over time. Architects embed with ' +
      'your team, set the standards, and hand the practice back.',
    proof: 'Architecture reviews, governance standards and a capability-transfer plan.',
    cta: 'Talk to an Architect',
    ctaRoute: '/contact',
    next: 'Book a scoping conversation about embedded capacity.',
  },
] as const;

export interface EngineStep {
  readonly title: string;
  readonly detail: string;
}

export const ENGINE: {
  readonly system: readonly EngineStep[];
  readonly people: readonly EngineStep[];
} = {
  system: [
    { title: 'Discover', detail: 'Inventory workflows, rank by value and feasibility.' },
    { title: 'Design', detail: 'Target architecture, data boundaries, approval points.' },
    { title: 'Build', detail: 'Claude-powered implementation against real systems.' },
    { title: 'Govern', detail: 'Evaluations, access control, audit logging, human approval.' },
    { title: 'Measure', detail: 'Outcome instrumentation tied to the original business case.' },
  ],
  people: [
    { title: 'Assess', detail: 'Baseline capability by evidence, not self-report.' },
    { title: 'Learn', detail: 'Self-paced paths, so nobody comes off the job.' },
    { title: 'Build', detail: 'A real project on your own workflows, with Claude Code.' },
    { title: 'Prove', detail: 'Artifacts, evaluations and reviewed evidence.' },
    { title: 'Lead', detail: 'Architects who own the system after we leave.' },
  ],
} as const;

export interface ServiceSummary {
  readonly slug: string;
  readonly number: string;
  readonly name: string;
  readonly fit: string;
}

export const SERVICES: readonly ServiceSummary[] = [
  {
    slug: 'ai-opportunity-sprint',
    number: '01',
    name: 'AI Opportunity and Readiness Sprint',
    fit: 'For organizations that do not know where to start, or have too many ideas to rank.',
  },
  {
    slug: 'claude-production-pilot',
    number: '02',
    name: 'Claude Production Pilot',
    fit: 'For one promising workflow that needs to be proven before wider investment.',
  },
  {
    slug: 'enterprise-build-modernization',
    number: '03',
    name: 'Enterprise Build and Modernization',
    fit: 'For integrating AI into real systems and workflows, not another sandbox.',
  },
  {
    slug: 'workforce-architect-accelerator',
    number: '04',
    name: 'Workforce Architect Accelerator',
    fit: 'For turning employees into AI builders and architects, not course completers.',
  },
  {
    slug: 'embedded-ai-operations',
    number: '05',
    name: 'Embedded Architecture and AI Operations',
    fit: 'For teams that need experienced leadership or delivery capacity inside the team now.',
  },
] as const;
