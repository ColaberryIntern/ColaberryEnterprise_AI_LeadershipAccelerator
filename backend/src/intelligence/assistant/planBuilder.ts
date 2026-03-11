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
    vector: [],
    tables: ['campaigns', 'campaign_health', 'campaign_errors', 'leads', 'follow_up_sequences'],
  },
  lead_analysis: {
    sql: true,
    ml: ['risk_scorer'],
    vector: [],
    tables: ['leads', 'activities', 'opportunity_scores', 'lead_temperature_history', 'strategy_calls'],
  },
  student_analysis: {
    sql: true,
    ml: [],
    vector: [],
    tables: ['enrollments', 'cohorts', 'attendance_records', 'lesson_instances', 'skill_mastery'],
  },
  agent_analysis: {
    sql: true,
    ml: ['anomaly_detector'],
    vector: [],
    tables: ['ai_agents', 'ai_agent_activity_logs', 'orchestration_health', 'ai_system_events'],
  },
  anomaly_detection: {
    sql: true,
    ml: ['anomaly_detector'],
    vector: [],
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
    vector: [],
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents'],
  },
  root_cause_analysis: {
    sql: true,
    ml: ['root_cause_explainer'],
    vector: ['similar_entities'],
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
    vector: [],
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents', 'system_processes'],
  },
};

// Entity → table filter (carried over from dataSourceRouter.ts)
const ENTITY_TABLE_FILTER: Record<string, string[]> = {
  campaigns: [
    'campaigns', 'campaign_health', 'campaign_errors', 'leads',
    'follow_up_sequences', 'campaign_test_runs', 'icp_profiles',
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

/**
 * Generate an execution plan for the given intent.
 * Optionally verifies table existence via DatasetRegistry.
 */
export async function generatePlan(
  intent: Intent,
  question: string,
  entityType?: string
): Promise<ExecutionPlan> {
  const template = INTENT_PLAN_MAP[intent] || INTENT_PLAN_MAP.general_insight;
  let tables = [...template.tables];

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
