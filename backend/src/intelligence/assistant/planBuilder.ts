// ─── Plan Builder ──────────────────────────────────────────────────────────
// Generates an execution plan: which data sources (SQL, ML, vector) to query.

import { Intent } from './intentClassifier';
import DatasetRegistry from '../../models/DatasetRegistry';

export type MlTask =
  | 'anomaly_detector'
  | 'forecaster'
  | 'risk_scorer'
  | 'root_cause_explainer'
  | 'text_clusterer';

export type VectorTask =
  | 'similar_entities'
  | 'semantic_entity_search'
  | 'similar_text_search';

export interface ExecutionPlan {
  sql: boolean;
  ml: MlTask[];
  vector: VectorTask[];
  tables: string[];
  parameters: Record<string, any>;
}

// ─── Intent → Plan Mapping ────────────────────────────────────────────────

interface PlanTemplate {
  sql: boolean;
  ml: MlTask[];
  vector: VectorTask[];
  tables: string[];
}

const INTENT_PLAN_MAP: Record<Intent, PlanTemplate> = {
  campaign_analysis: {
    sql: true,
    ml: ['risk_scorer'],
    vector: ['semantic_entity_search'],
    tables: ['campaigns', 'campaign_health', 'campaign_errors', 'leads', 'follow_up_sequences', 'scheduled_emails', 'communication_logs'],
  },
  lead_analysis: {
    sql: true,
    ml: ['risk_scorer'],
    vector: ['semantic_entity_search'],
    tables: ['leads', 'activities', 'opportunity_scores', 'lead_temperature_history', 'strategy_calls', 'enrollments', 'icp_profiles'],
  },
  student_analysis: {
    sql: true,
    ml: [],
    vector: ['semantic_entity_search'],
    tables: ['enrollments', 'cohorts', 'attendance_records', 'lesson_instances', 'skill_mastery'],
  },
  agent_analysis: {
    sql: true,
    ml: ['anomaly_detector'],
    vector: ['semantic_entity_search'],
    tables: ['ai_agents', 'ai_agent_activity_logs', 'orchestration_health', 'ai_system_events'],
  },
  anomaly_detection: {
    sql: true,
    ml: ['anomaly_detector'],
    vector: ['similar_entities'],
    tables: ['system_processes', 'campaign_errors', 'ai_agent_activity_logs', 'orchestration_health'],
  },
  forecast_request: {
    sql: true,
    ml: ['forecaster'],
    vector: [],
    tables: ['leads', 'enrollments', 'campaigns', 'activities'],
  },
  comparison: {
    sql: true,
    ml: [],
    vector: ['semantic_entity_search'],
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents'],
  },
  root_cause_analysis: {
    sql: true,
    ml: ['root_cause_explainer'],
    vector: ['similar_entities', 'semantic_entity_search'],
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents', 'system_processes'],
  },
  text_search: {
    sql: false,
    ml: ['text_clusterer'],
    vector: ['semantic_entity_search', 'similar_text_search'],
    tables: [],
  },
  general_insight: {
    sql: true,
    ml: [],
    vector: ['semantic_entity_search'],
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents', 'system_processes', 'scheduled_emails', 'communication_logs', 'strategy_calls'],
  },
};

// Entity → table filter (carried over from dataSourceRouter.ts)
const ENTITY_TABLE_FILTER: Record<string, string[]> = {
  campaigns: [
    'campaigns', 'campaign_health', 'campaign_errors', 'leads',
    'follow_up_sequences', 'campaign_test_runs', 'icp_profiles',
    'scheduled_emails', 'communication_logs',
  ],
  leads: [
    'leads', 'activities', 'appointments', 'opportunity_scores',
    'lead_temperature_history', 'strategy_calls', 'communication_logs',
  ],
  students: [
    'enrollments', 'cohorts', 'attendance_records', 'lesson_instances',
    'skill_mastery', 'assignment_submissions',
  ],
  agents: [
    'ai_agents', 'ai_agent_activity_logs', 'orchestration_health',
    'ai_system_events', 'system_processes',
  ],
};

// ─── Department → Data Focus ──────────────────────────────────────────────
// Maps each department to the specific DB tables relevant to its mission.
// Used when entityType === 'department' to scope queries to department-relevant data.

interface DepartmentFocus {
  tables: string[];
  intent: Intent;           // Best-fit intent for template query selection
  agentCategories: string[]; // Agent categories owned by this department
}

const DEPARTMENT_DATA_FOCUS: Record<string, DepartmentFocus> = {
  executive: {
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents', 'system_processes', 'scheduled_emails'],
    intent: 'general_insight',
    agentCategories: ['executive'],
  },
  strategy: {
    tables: ['leads', 'strategy_calls', 'opportunity_scores', 'campaigns', 'enrollments'],
    intent: 'lead_analysis',
    agentCategories: ['strategic', 'dept_strategy'],
  },
  marketing: {
    tables: ['campaigns', 'campaign_health', 'campaign_errors', 'leads', 'scheduled_emails', 'communication_logs', 'follow_up_sequences', 'icp_profiles'],
    intent: 'campaign_analysis',
    agentCategories: ['outbound', 'openclaw'],
  },
  admissions: {
    tables: ['leads', 'strategy_calls', 'enrollments', 'activities', 'opportunity_scores', 'communication_logs'],
    intent: 'lead_analysis',
    agentCategories: ['admissions', 'admissions_ops'],
  },
  alumni: {
    tables: ['enrollments', 'cohorts', 'leads', 'communication_logs'],
    intent: 'student_analysis',
    agentCategories: ['alumni'],
  },
  partnerships: {
    tables: ['leads', 'icp_profiles', 'campaigns', 'communication_logs'],
    intent: 'lead_analysis',
    agentCategories: ['partnerships'],
  },
  education: {
    tables: ['enrollments', 'cohorts', 'attendance_records', 'lesson_instances', 'skill_mastery', 'assignment_submissions'],
    intent: 'student_analysis',
    agentCategories: ['accelerator', 'curriculum'],
  },
  student_success: {
    tables: ['enrollments', 'attendance_records', 'skill_mastery', 'cohorts', 'lesson_instances'],
    intent: 'student_analysis',
    agentCategories: ['student_success'],
  },
  platform: {
    tables: ['system_processes', 'ai_agents', 'ai_agent_activity_logs', 'orchestration_health'],
    intent: 'agent_analysis',
    agentCategories: ['maintenance', 'operations', 'website_intelligence', 'orchestration'],
  },
  intelligence: {
    tables: ['ai_agents', 'ai_agent_activity_logs', 'orchestration_health', 'ai_system_events', 'system_processes'],
    intent: 'agent_analysis',
    agentCategories: ['behavioral', 'ai_ops', 'memory', 'meta', 'autonomous'],
  },
  governance: {
    tables: ['ai_agents', 'ai_agent_activity_logs', 'system_processes', 'campaign_errors'],
    intent: 'anomaly_detection',
    agentCategories: ['security', 'governance_ops'],
  },
  reporting: {
    tables: ['system_processes', 'ai_agent_activity_logs', 'leads', 'campaigns', 'enrollments'],
    intent: 'general_insight',
    agentCategories: ['reporting'],
  },
  finance: {
    tables: ['enrollments', 'campaigns', 'leads', 'strategy_calls'],
    intent: 'general_insight',
    agentCategories: [],
  },
  operations: {
    tables: ['system_processes', 'scheduled_emails', 'communication_logs', 'ai_agents', 'orchestration_health'],
    intent: 'agent_analysis',
    agentCategories: [],
  },
  orchestration: {
    tables: ['ai_agents', 'ai_agent_activity_logs', 'orchestration_health', 'system_processes'],
    intent: 'agent_analysis',
    agentCategories: [],
  },
  growth: {
    tables: ['leads', 'campaigns', 'enrollments', 'scheduled_emails', 'communication_logs', 'activities'],
    intent: 'forecast_request',
    agentCategories: [],
  },
  infrastructure: {
    tables: ['system_processes', 'orchestration_health', 'ai_agents', 'ai_agent_activity_logs'],
    intent: 'agent_analysis',
    agentCategories: [],
  },
  security: {
    tables: ['ai_agents', 'ai_agent_activity_logs', 'system_processes', 'campaign_errors', 'orchestration_health'],
    intent: 'anomaly_detection',
    agentCategories: ['security_ops'],
  },
};

/**
 * Resolve a department name (from entity_name) to its data focus.
 * Normalizes the name to lowercase slug format for lookup.
 */
export function getDepartmentFocus(departmentName: string): DepartmentFocus | null {
  const slug = departmentName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
  return DEPARTMENT_DATA_FOCUS[slug] || null;
}

/**
 * Generate an execution plan for the given intent.
 * Optionally verifies table existence via DatasetRegistry.
 */
export async function generatePlan(
  intent: Intent,
  question: string,
  entityType?: string,
  entityName?: string
): Promise<ExecutionPlan> {
  let effectiveIntent = intent;
  const template = INTENT_PLAN_MAP[intent] || INTENT_PLAN_MAP.general_insight;
  let tables = [...template.tables];

  // Department-specific scoping: translate department name → relevant tables + intent
  if (entityType === 'department' && entityName) {
    const deptFocus = getDepartmentFocus(entityName);
    if (deptFocus) {
      tables = [...deptFocus.tables];
      effectiveIntent = deptFocus.intent;
      // Use the department-appropriate intent template for ML/vector tasks
      const deptTemplate = INTENT_PLAN_MAP[deptFocus.intent] || template;
      return buildVerifiedPlan(deptTemplate, tables, entityType, entityName, question, deptFocus.agentCategories);
    }
  }

  // Narrow tables by entity scope
  if (entityType && ENTITY_TABLE_FILTER[entityType]) {
    const entityTables = ENTITY_TABLE_FILTER[entityType];
    const filtered = tables.filter((t) => entityTables.includes(t));
    tables = filtered.length > 0 ? filtered : entityTables.slice(0, 5);
  }

  // Verify tables exist in DatasetRegistry (best-effort, don't block on failure)
  try {
    const registry = await DatasetRegistry.findAll({
      attributes: ['table_name'],
      where: { status: 'active' },
    });
    const existingTables = new Set(registry.map((r: any) => r.table_name));
    const verified = tables.filter((t) => existingTables.has(t));
    if (verified.length > 0) {
      tables = verified;
    }
    // If none verified, keep original list — tables may exist but not be in registry
  } catch {
    // DatasetRegistry unavailable — use hardcoded tables
  }

  return {
    sql: template.sql,
    ml: [...template.ml],
    vector: [...template.vector],
    tables,
    parameters: {
      entity_type: entityType || null,
      question_keywords: extractKeywords(question),
    },
  };
}

/**
 * Build a plan with DatasetRegistry verification.
 * Used for department-scoped plans that have already determined their tables.
 */
async function buildVerifiedPlan(
  template: PlanTemplate,
  tables: string[],
  entityType: string,
  entityName: string,
  question: string,
  agentCategories: string[]
): Promise<ExecutionPlan> {
  // Verify tables exist in DatasetRegistry (best-effort)
  try {
    const registry = await DatasetRegistry.findAll({
      attributes: ['table_name'],
      where: { status: 'active' },
    });
    const existingTables = new Set(registry.map((r: any) => r.table_name));
    const verified = tables.filter((t) => existingTables.has(t));
    if (verified.length > 0) {
      tables = verified;
    }
  } catch {
    // DatasetRegistry unavailable — use hardcoded tables
  }

  return {
    sql: template.sql,
    ml: [...template.ml],
    vector: [...template.vector],
    tables,
    parameters: {
      entity_type: entityType,
      entity_name: entityName,
      department_agent_categories: agentCategories,
      question_keywords: extractKeywords(question),
    },
  };
}

function extractKeywords(question: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'what', 'which', 'who',
    'whom', 'this', 'that', 'these', 'those', 'am', 'or', 'and', 'but',
    'if', 'not', 'no', 'nor', 'so', 'too', 'very', 'just', 'about',
    'me', 'my', 'show', 'give', 'tell', 'how', 'many', 'much',
  ]);
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}
