// ─── Data Source Router ────────────────────────────────────────────────────
// Maps intents to data sources. Deterministic routing — no LLM.

import { Intent } from './intentClassifier';

export type DataSource = 'sql' | 'agent_logs' | 'ml' | 'events' | 'metrics';

export interface RoutedSources {
  primary: DataSource;
  secondary: DataSource[];
  tables: string[];
}

const INTENT_SOURCE_MAP: Record<Intent, RoutedSources> = {
  campaign_analysis: {
    primary: 'sql',
    secondary: ['events'],
    tables: ['campaigns', 'campaign_health', 'campaign_errors', 'leads', 'follow_up_sequences'],
  },
  lead_analysis: {
    primary: 'sql',
    secondary: ['ml'],
    tables: ['leads', 'activities', 'opportunity_scores', 'lead_temperature_history', 'strategy_calls'],
  },
  student_analysis: {
    primary: 'sql',
    secondary: ['metrics'],
    tables: ['enrollments', 'cohorts', 'attendance_records', 'lesson_instances', 'skill_mastery'],
  },
  agent_analysis: {
    primary: 'sql',
    secondary: ['agent_logs'],
    tables: ['ai_agents', 'ai_agent_activity_logs', 'orchestration_health', 'ai_system_events'],
  },
  anomaly_detection: {
    primary: 'sql',
    secondary: ['ml', 'agent_logs'],
    tables: ['system_processes', 'campaign_errors', 'ai_agent_activity_logs', 'orchestration_health'],
  },
  forecast_request: {
    primary: 'sql',
    secondary: ['ml'],
    tables: ['leads', 'enrollments', 'campaigns', 'activities'],
  },
  general_insight: {
    primary: 'sql',
    secondary: ['metrics'],
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents', 'system_processes'],
  },
};

/**
 * Route an intent to its data sources.
 * When entity_type is provided, narrows the table list to entity-relevant tables.
 */
export function routeDataSources(intent: Intent, entityType?: string): RoutedSources {
  const base = { ...INTENT_SOURCE_MAP[intent] };

  // Narrow tables if entity scope is active
  if (entityType) {
    const entityTables = ENTITY_TABLE_FILTER[entityType];
    if (entityTables) {
      base.tables = base.tables.filter((t) => entityTables.includes(t));
      // If all tables were filtered out, use the entity's own table set
      if (base.tables.length === 0) {
        base.tables = entityTables.slice(0, 5);
      }
    }
  }

  return base;
}

// Entity → primary tables (used for scope narrowing)
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
