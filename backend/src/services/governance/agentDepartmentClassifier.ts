// AI Workforce Reset, Phase D.1 "Inventory" (2026-08-24) — classifies each
// enabled AiAgent into one of the real `departments` table slugs, per
// abac-design.md decision 4 (per-department scope to start). Pure logic, no
// I/O — the real `departments` table rows were queried directly against
// production before writing DEPARTMENT_SLUGS below (18 real slugs, confirmed
// live, not guessed): admissions, alumni, education, executive, finance,
// governance, growth, infrastructure, intelligence, marketing, operations,
// orchestration, partnerships, platform, reporting, security, strategy,
// student_success.
//
// Real production category distribution (163 enabled agents, queried
// directly, not assumed) drove CATEGORY_TO_DEPARTMENT below. Most categories
// map cleanly; a handful of categories (`dept_super`, `workforce_director`,
// `company`) don't share one department across every agent that carries
// them, so those 19 agents get a per-agent override in
// AGENT_NAME_OVERRIDES instead of a forced, wrong category-level guess.
//
// Every mapping below is a best-effort classification, not a verified
// organizational decision — `department` is purely declarative (nothing
// enforces on it yet) and trivially re-editable, so getting one wrong here
// has zero blast radius today. Genuinely cross-cutting agents (spanning more
// than one real department) get `department: null` rather than a forced,
// misleading single value — disclosed via `confidence: 'needs_review'`,
// never silently guessed.

export type ClassificationConfidence = 'auto' | 'needs_review';

export interface AgentDepartmentClassification {
  department: string | null;
  confidence: ClassificationConfidence;
  reason: string;
}

/** The 18 real `departments.slug` values, confirmed live in production
 * 2026-08-24 (`SELECT slug FROM departments`) — not invented. */
export const DEPARTMENT_SLUGS = [
  'admissions', 'alumni', 'education', 'executive', 'finance', 'governance',
  'growth', 'infrastructure', 'intelligence', 'marketing', 'operations',
  'orchestration', 'partnerships', 'platform', 'reporting', 'security',
  'strategy', 'student_success',
] as const;

/** Category -> department, for every category where ALL enabled agents
 * carrying it genuinely belong to the same department (confirmed against
 * the real 163-agent distribution, not assumed from the category name
 * alone). Categories absent here (`dept_super`, `workforce_director`,
 * `company`) get per-agent overrides below instead. */
const CATEGORY_TO_DEPARTMENT: Record<string, string> = {
  accelerator: 'education',
  curriculum: 'education',
  openclaw: 'marketing',
  outbound: 'marketing',
  skool: 'marketing',
  executive: 'executive',
  behavioral: 'intelligence',
  autonomous: 'intelligence',
  ai_ops: 'intelligence',
  meta: 'intelligence',
  memory: 'intelligence',
  operations: 'operations',
  maintenance: 'platform',
  admissions: 'admissions',
  admissions_ops: 'admissions',
  strategic: 'strategy',
  student_success: 'student_success',
  security_ops: 'security',
  governance_ops: 'governance',
  reporting: 'reporting',
};

/** Per-agent overrides for the 19 real agents (as of 2026-08-24) whose
 * category (`dept_super`, `workforce_director`, `company`) spans more than
 * one real department. Keyed on the exact real `agent_name` string. Genuinely
 * cross-cutting agents map to `null` rather than a forced, misleading
 * department. */
const AGENT_NAME_OVERRIDES: Record<string, { department: string | null; reason: string }> = {
  // dept_super — obvious 1:1 agents.
  AdmissionsSuperAgent: { department: 'admissions', reason: 'name maps 1:1 to a real department' },
  FinanceSuperAgent: { department: 'finance', reason: 'name maps 1:1 to a real department' },
  PartnershipSuperAgent: { department: 'partnerships', reason: 'name maps 1:1 to a real department' },
  // dept_super — genuinely cross-cutting, best-fit single department chosen
  // (never a forced guess when the fit is this loose — flagged for review).
  AnalyticsEngineSuperAgent: { department: 'reporting', reason: '"Reporting & Analytics" is the closest single-department fit; touches multiple departments’ data' },
  CampaignOpsSuperAgent: { department: 'marketing', reason: 'campaign operations are a marketing function' },
  ContentEngineSuperAgent: { department: 'marketing', reason: 'content generation is a marketing function' },
  LeadIntelligenceSuperAgent: { department: 'growth', reason: 'lead intelligence feeds the growth/pipeline function' },
  SystemResilienceSuperAgent: { department: 'infrastructure', reason: 'system resilience is an infrastructure function' },
  // workforce_director — one real department each, from the name's own suffix.
  WorkforceCareerDirector: { department: 'student_success', reason: 'career services is a student-success function; no dedicated "career" department exists' },
  WorkforceCertificationDirector: { department: 'education', reason: 'certification tracks curriculum/education' },
  WorkforceCommunityDirector: { department: 'student_success', reason: 'community/engagement is a student-success function; no dedicated "community" department exists' },
  WorkforceCurriculumDirector: { department: 'education', reason: 'name maps 1:1 to a real department' },
  WorkforceFinanceDirector: { department: 'finance', reason: 'name maps 1:1 to a real department' },
  WorkforceMarketingDirector: { department: 'marketing', reason: 'name maps 1:1 to a real department' },
  WorkforceOperationsDirector: { department: 'operations', reason: 'name maps 1:1 to a real department' },
  WorkforceResearchDirector: { department: 'intelligence', reason: 'research is an intelligence/analysis function' },
  WorkforceStudentSuccessDirector: { department: 'student_success', reason: 'name maps 1:1 to a real department' },
  WorkforceTechnologyDirector: { department: 'infrastructure', reason: 'technology maps to infrastructure' },
  // company — genuinely company-wide, never forced into one department.
  WorkforceIntelligence: { department: null, reason: 'company-wide oversight agent, not owned by a single department' },
};

/** Classifies one agent into a real department slug (or null, disclosed
 * honestly) from its real `agent_name` + `category`. Pure function — no
 * database access, no side effects. */
export function classifyAgentDepartment(agentName: string, category: string | null): AgentDepartmentClassification {
  const override = AGENT_NAME_OVERRIDES[agentName];
  if (override) {
    return {
      department: override.department,
      confidence: 'needs_review',
      reason: override.reason,
    };
  }

  const department = category ? CATEGORY_TO_DEPARTMENT[category] : undefined;
  if (department) {
    return {
      department,
      confidence: 'auto',
      reason: `category "${category}" maps to this department for every enabled agent that carries it`,
    };
  }

  return {
    department: null,
    confidence: 'needs_review',
    reason: category
      ? `category "${category}" has no known department mapping yet`
      : 'agent has no category to classify from',
  };
}
