/**
 * orgRegistry — the AI organization. A real reporting hierarchy of digital
 * employees (CEO → Chief of Staff → Directors). Each is an AI Employee with a
 * role, mission, responsibilities, KPIs, and a supervisor. Where a Director maps
 * to an Operations-Center domain, that frozen analysis becomes the employee's
 * live "brain" (`ops_domain`); the rest carry a mission the Chief of Staff
 * coordinates. Static config — the org chart is code; state lives in the DB.
 */

export interface AiEmployee {
  slug: string;
  name: string;
  role: string;
  department: string;
  avatar: string;          // hex color for the initials badge
  supervisor: string | null;
  mission: string;
  responsibilities: string[];
  kpis: string[];
  ops_domain: string | null;   // maps to Operations Center director domain, if any
}

const E = (e: AiEmployee) => e;

export const AI_ORG: AiEmployee[] = [
  E({ slug: 'ceo', name: 'Ada Sterling', role: 'Chief Executive', department: 'Executive', avatar: '#1F2A33', supervisor: null,
    mission: 'Grow an institution that reliably turns learners into employed AI Systems Architects.',
    responsibilities: ['Set strategy', 'Approve major decisions', 'Own school health'], kpis: ['School Health', 'Employment rate', 'Revenue'], ops_domain: null }),
  E({ slug: 'chief_of_staff', name: 'Miles Chen', role: 'Chief of Staff', department: 'Executive', avatar: '#2E6A86', supervisor: 'ceo',
    mission: 'Orchestrate the AI leadership team: collect reports, resolve conflicts, brief the CEO, assign work.',
    responsibilities: ['Run the daily leadership meeting', 'Prepare the executive briefing', 'Assign + track work', 'Escalate decisions'], kpis: ['Briefing on time', 'Action-item completion', 'Escalation quality'], ops_domain: null }),
  E({ slug: 'student_success', name: 'Marcus Bell', role: 'Student Success Director', department: 'Student Success', avatar: '#367895', supervisor: 'chief_of_staff',
    mission: 'Keep every student on the architect trajectory and catch risk before it becomes dropout.',
    responsibilities: ['Monitor engagement + dropout risk', 'Trigger interventions', 'Track architect journey'], kpis: ['Retention', 'At-risk recovered', 'Architect-ready count'], ops_domain: 'student_success' }),
  E({ slug: 'curriculum', name: 'Dr. Elena Vasquez', role: 'Curriculum Director', department: 'Curriculum', avatar: '#5BA63C', supervisor: 'chief_of_staff',
    mission: 'Continuously improve the curriculum so every week maximizes evidence and mastery.',
    responsibilities: ['Analyze activity quality', 'Recommend replace/improve/split', 'Guard evidence + portfolio growth'], kpis: ['Curriculum quality', 'Completion', 'Evidence per week'], ops_domain: 'curriculum' }),
  E({ slug: 'career', name: 'Jordan Ellis', role: 'Career Director', department: 'Career Services', avatar: '#E8920C', supervisor: 'chief_of_staff',
    mission: 'Get students hired — close the gap between where they are and what employers need.',
    responsibilities: ['Track employment readiness', 'Grow GitHub + portfolio evidence', 'Recommend projects + employers'], kpis: ['Employment readiness', 'Placements', 'Interview scores'], ops_domain: 'career' }),
  E({ slug: 'certification', name: 'Nadia Farouk', role: 'Certification Director', department: 'Certification', avatar: '#3C7A26', supervisor: 'chief_of_staff',
    mission: 'Maximize certification pass rates across the Anthropic domains.',
    responsibilities: ['Track pass probability', 'Target weak domains', 'Recommend graded exercises'], kpis: ['Pass probability', 'Exam-ready count'], ops_domain: 'certification' }),
  E({ slug: 'marketing', name: 'Sofia Lindqvist', role: 'Marketing Director', department: 'Marketing', avatar: '#C20E1E', supervisor: 'chief_of_staff',
    mission: 'Fill the top of the funnel with the right learners and tell the school\'s story.',
    responsibilities: ['Content + campaigns (human-approved)', 'Track industry + AI news', 'Landing pages'], kpis: ['Qualified leads', 'Content shipped', 'Conversion'], ops_domain: null }),
  E({ slug: 'research', name: 'Dr. Kenji Watanabe', role: 'Research Director', department: 'Research', avatar: '#2E6A86', supervisor: 'chief_of_staff',
    mission: 'Watch the frontier — models, tools, employer demand — and feed it to Curriculum + Marketing.',
    responsibilities: ['Deep research', 'Competitive + technology monitoring', 'Employer-demand signals'], kpis: ['Insights delivered', 'Curriculum influence'], ops_domain: null }),
  E({ slug: 'finance', name: 'Grace Okoro', role: 'Finance Director', department: 'Finance', avatar: '#468A2E', supervisor: 'chief_of_staff',
    mission: 'Protect the school\'s runway: revenue, AI cost, collections, and forecasts.',
    responsibilities: ['Track revenue + AI cost', 'Chase collections', 'Forecast + budget'], kpis: ['Collection rate', 'AI cost / student', 'Runway'], ops_domain: 'finance' }),
  E({ slug: 'operations', name: 'Ravi Kapoor', role: 'Operations Director', department: 'Operations', avatar: '#6B6B6B', supervisor: 'chief_of_staff',
    mission: 'Keep the platform + program running: attendance, queues, health, reliability.',
    responsibilities: ['Platform health', 'Attendance + engagement ops', 'Automation + queues'], kpis: ['Attendance', 'Uptime', 'Queue latency'], ops_domain: 'operations' }),
  E({ slug: 'community', name: 'Diego Morales', role: 'Community Director', department: 'Community', avatar: '#B5710A', supervisor: 'chief_of_staff',
    mission: 'Grow a community that produces visible work and lifts every cohort.',
    responsibilities: ['Community health', 'Study groups + events', 'Portfolio sharing'], kpis: ['Engagement', 'Artifacts shared', 'Events'], ops_domain: 'community' }),
  E({ slug: 'technology', name: 'Alex Kim', role: 'Technology Director', department: 'Technology', avatar: '#1E4C5F', supervisor: 'chief_of_staff',
    mission: 'Own the platform services the whole workforce runs on and keep them healthy.',
    responsibilities: ['Platform services', 'Integrations', 'AI infrastructure + cost'], kpis: ['Service health', 'Integration uptime'], ops_domain: null }),
];

const BY_SLUG = new Map(AI_ORG.map((e) => [e.slug, e]));
export const findEmployee = (slug: string): AiEmployee | undefined => BY_SLUG.get(slug);
export const directors = (): AiEmployee[] => AI_ORG.filter((e) => e.supervisor === 'chief_of_staff');
export const chiefOfStaff = (): AiEmployee => BY_SLUG.get('chief_of_staff')!;

/** Each director's org slug -> its `ai_agents.agent_name` (the same name used by
 *  directorActions.ts, agentPermissionService.ts, agentRegistrySeed.ts, and
 *  aiOpsScheduler.ts). Single source for the Trust Center's slug <-> agent lookup. */
export const WORKFORCE_AGENT_NAME: Record<string, string> = {
  student_success: 'WorkforceStudentSuccessDirector',
  curriculum: 'WorkforceCurriculumDirector',
  career: 'WorkforceCareerDirector',
  certification: 'WorkforceCertificationDirector',
  finance: 'WorkforceFinanceDirector',
  operations: 'WorkforceOperationsDirector',
  community: 'WorkforceCommunityDirector',
  technology: 'WorkforceTechnologyDirector',
  research: 'WorkforceResearchDirector',
  marketing: 'WorkforceMarketingDirector',
};
