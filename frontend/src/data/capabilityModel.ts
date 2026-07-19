/**
 * Capability-platform content model for enterprise.colaberry.ai.
 *
 * Single source of truth for the "Enterprise AI Capability Platform" narrative
 * that leads the public site: the 5-level maturity model (Aware -> Organization),
 * the AI Capability Index (AICI) dimensions, and an illustrative executive
 * dashboard. Rendered with the Colaberry design-system tokens.
 *
 * Numbers under ILLUSTRATIVE_DASHBOARD / OUTCOME_STATS are sample figures used to
 * show what the platform measures; they are always labelled "illustrative" in the
 * UI, never presented as a specific client's data.
 */

export interface MaturityLevel {
  level: number;
  name: string;
  /** what employees do at this level */
  tagline: string;
  /** what the platform measures at this level */
  measures: string;
  /** brand hex for the stage node (cool -> warm progression) */
  hex: string;
}

export const MATURITY_LEVELS: MaturityLevel[] = [
  { level: 1, name: 'AI Aware', tagline: 'Employees understand what AI can and cannot do.', measures: 'Baseline literacy across every department.', hex: '#367895' },
  { level: 2, name: 'AI Enabled', tagline: 'Employees use AI in their daily work.', measures: 'Daily active usage and adoption by team.', hex: '#2BA39A' },
  { level: 3, name: 'AI Builders', tagline: 'Employees build working AI solutions.', measures: 'Automations shipped and hours saved.', hex: '#5BA63C' },
  { level: 4, name: 'AI Architects', tagline: 'Employees design enterprise AI systems.', measures: 'Systems designed, governed, and deployed.', hex: '#E8920C' },
  { level: 5, name: 'AI Organization', tagline: 'AI is part of every business process.', measures: 'AI-touched processes, ROI, governance org-wide.', hex: '#FB2832' },
];

export interface AiciDimension {
  key: string;
  name: string;
  desc: string;
  /** illustrative dimension score (0-100) */
  sample: number;
}

// Seven dimensions of the Colaberry Enterprise AI Capability Index (AICI),
// grounded in the INPACT framework from "Trust Before Intelligence".
export const AICI_DIMENSIONS: AiciDimension[] = [
  { key: 'leadership', name: 'Leadership Readiness', desc: 'Executive alignment, sponsorship, and a funded AI mandate.', sample: 52 },
  { key: 'workforce', name: 'Workforce Skills', desc: 'Depth of real AI capability across your existing people.', sample: 41 },
  { key: 'adoption', name: 'AI Adoption', desc: 'How much AI is actually used in day-to-day work.', sample: 48 },
  { key: 'delivery', name: 'Solution Delivery', desc: 'Ability to build and ship AI into production.', sample: 39 },
  { key: 'governance', name: 'Governance & Risk', desc: 'Trust infrastructure, controls, and safe deployment.', sample: 44 },
  { key: 'culture', name: 'Innovation Culture', desc: 'Whether people are encouraged to build and experiment.', sample: 57 },
  { key: 'impact', name: 'Business Impact', desc: 'Measured ROI and outcomes from AI investment.', sample: 46 },
];

export interface DeptReadiness { name: string; pct: number; }
export interface EmployeeTier { name: string; count: number; }
export interface ImpactMetric { name: string; value: string; }

// Illustrative CIO dashboard — mirrors the positioning brief.
export const ILLUSTRATIVE_DASHBOARD: {
  overallReadiness: number;
  departments: DeptReadiness[];
  tiers: EmployeeTier[];
  impact: ImpactMetric[];
} = {
  overallReadiness: 74,
  departments: [
    { name: 'Operations', pct: 82 },
    { name: 'Marketing', pct: 79 },
    { name: 'Finance', pct: 68 },
    { name: 'Sales', pct: 61 },
    { name: 'HR', pct: 54 },
  ],
  tiers: [
    { name: 'AI Aware', count: 412 },
    { name: 'AI Users', count: 306 },
    { name: 'AI Builders', count: 81 },
    { name: 'AI Architects', count: 14 },
  ],
  impact: [
    { name: 'Automations Built', value: '41' },
    { name: 'Hours Saved', value: '7,820' },
    { name: 'Estimated ROI', value: '$683K' },
    { name: 'Projects Delivered', value: '17' },
  ],
};

// ---- Ecosystem model (self-paced program is one part of a larger ecosystem) ----

export interface EcosystemPillar { icon: string; name: string; desc: string; }
export const ECOSYSTEM_PILLARS: EcosystemPillar[] = [
  { icon: 'ri-graduation-cap-line', name: 'Learn, self-paced', desc: 'Structured, self-paced paths your people take on their own time. No cohort to wait for, start any day.' },
  { icon: 'ri-medal-2-line', name: 'Get certified', desc: 'Work toward the Certified Anthropic AI Systems Architect credential (CCA-F). A credential that says they can ship.' },
  { icon: 'ri-tools-line', name: 'Build real projects', desc: 'Every path ends in a deployed AI build on your own workflows, guided end to end, not toy exercises.' },
  { icon: 'ri-team-line', name: 'Join the architect network', desc: 'A living network of AI Architects across companies and phases. Learn from people ahead of you and beside you.' },
  { icon: 'ri-live-line', name: 'Weekly live events', desc: 'Office hours, build sessions, and guest architects every week. Show up when you can, catch the replay when you cannot.' },
  { icon: 'ri-radar-line', name: 'Stay current', desc: 'The field moves weekly. A rolling timeline of new modules, patterns, and model updates keeps your people ahead.' },
];

export interface TimelineItem { when: string; kind: string; title: string; tone: 'red' | 'blue' | 'green' | 'warning'; }
export const TIMELINE_ITEMS: TimelineItem[] = [
  { when: 'Every Monday', kind: 'Live event', title: 'Architect office hours: bring your build, get unblocked', tone: 'red' },
  { when: 'Every Thursday', kind: 'Live event', title: 'Build session: ship something small, live, together', tone: 'red' },
  { when: 'This week', kind: 'New module', title: 'Model Context Protocol: giving Claude your tools', tone: 'blue' },
  { when: 'This week', kind: 'Pattern drop', title: 'Multi-agent orchestration for back-office workflows', tone: 'green' },
  { when: 'Rolling', kind: 'Model update', title: 'What changed with the latest Claude, and how to use it', tone: 'warning' },
  { when: 'Monthly', kind: 'Demo Day', title: 'Members present deployed builds to the network', tone: 'red' },
];

export interface Architect { name: string; company: string; phase: string; }
export const ARCHITECTS: Architect[] = [
  { name: 'Priya Nair', company: 'Regional health system', phase: 'AI Architect' },
  { name: 'Marcus Bell', company: 'Logistics & freight', phase: 'AI Builder' },
  { name: 'Sofia Alvarez', company: 'Community bank', phase: 'AI Architect' },
  { name: 'David Okafor', company: 'Manufacturing', phase: 'AI Builder' },
  { name: 'Lena Fischer', company: 'Public sector', phase: 'AI Enabled' },
  { name: 'Jamal Carter', company: 'Insurance', phase: 'AI Architect' },
  { name: 'Wei Chen', company: 'Utilities co-op', phase: 'AI Builder' },
  { name: 'Amara Diop', company: 'Retail & e-commerce', phase: 'AI Enabled' },
];

export interface RosterMember { name: string; team: string; phase: number; progress: number; tier: string; }
export const ILLUSTRATIVE_ROSTER: RosterMember[] = [
  { name: 'A. Rivera', team: 'Operations', phase: 4, progress: 92, tier: 'Architect' },
  { name: 'J. Park', team: 'Finance', phase: 3, progress: 74, tier: 'Builder' },
  { name: 'M. Osei', team: 'Marketing', phase: 3, progress: 68, tier: 'Builder' },
  { name: 'S. Kaur', team: 'Support', phase: 2, progress: 51, tier: 'Enabled' },
  { name: 'T. Nguyen', team: 'HR', phase: 2, progress: 43, tier: 'Enabled' },
];

// Authority anchor — Ram Katamaraja's book.
export const BOOK = {
  title: 'Trust Before Intelligence',
  subtitle: 'Why 95% of AI Pilots Fail, How 5% Succeed',
  author: 'Ram Dhan Yadav Katamaraja',
  authorTitle: 'CEO of Colaberry',
  amazonUrl: 'https://www.amazon.com/Trust-Before-Intelligence-Pilots-Succeed/dp/B0H1MNTNQM',
  coverSrc: '/img/book-cover.jpg',
} as const;
