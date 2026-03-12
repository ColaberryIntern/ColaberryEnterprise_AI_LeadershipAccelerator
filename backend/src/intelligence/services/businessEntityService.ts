import DatasetRegistry from '../../models/DatasetRegistry';

export interface BusinessCategory {
  id: string;
  label: string;
  color: string;
  tables: string[];
  matched_tables: string[];
  total_rows: number;
  table_count: number;
}

export interface HierarchyEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface BusinessEntityNetwork {
  categories: BusinessCategory[];
  hierarchy_edges: HierarchyEdge[];
  hub_entity: string;
  total_tables: number;
  total_rows: number;
}

/**
 * Maps raw database tables to business entity categories.
 * Derived from Sequelize associations in models/index.ts.
 */
const BUSINESS_ENTITY_MAP: Record<string, { label: string; color: string; tables: string[] }> = {
  campaigns: {
    label: 'Campaigns',
    color: '#2b6cb0',
    tables: [
      'campaigns', 'campaign_leads', 'campaign_health', 'campaign_errors',
      'follow_up_sequences', 'icp_profiles', 'icp_insights',
      'campaign_test_runs', 'campaign_test_steps',
      'campaign_simulations', 'campaign_simulation_steps',
    ],
  },
  leads: {
    label: 'Leads',
    color: '#1a365d',
    tables: [
      'leads', 'activities', 'appointments', 'scheduled_emails',
      'interaction_outcomes', 'lead_temperature_history',
      'strategy_calls', 'strategy_call_intelligence',
      'opportunity_scores', 'communication_logs',
    ],
  },
  students: {
    label: 'Students',
    color: '#38a169',
    tables: [
      'enrollments', 'attendance_records', 'assignment_submissions',
      'lesson_instances', 'skill_mastery', 'user_curriculum_profiles',
      'mentor_conversations', 'session_chat_messages',
      'variable_stores', 'github_connections',
    ],
  },
  cohorts: {
    label: 'Cohorts',
    color: '#805ad5',
    tables: ['cohorts', 'live_sessions', 'session_checklists'],
  },
  curriculum: {
    label: 'Curriculum',
    color: '#dd6b20',
    tables: [
      'program_blueprints', 'curriculum_modules', 'curriculum_lessons',
      'section_configs', 'artifact_definitions', 'mini_sections',
      'variable_definitions', 'session_gates', 'prompt_templates',
      'blueprint_snapshots', 'skill_definitions',
    ],
  },
  visitors: {
    label: 'Visitors',
    color: '#319795',
    tables: [
      'visitors', 'visitor_sessions', 'page_events',
      'behavioral_signals', 'intent_scores',
      'chat_conversations', 'chat_messages',
    ],
  },
  agents: {
    label: 'AI Agents',
    color: '#e53e3e',
    tables: [
      'ai_agents', 'ai_agent_activity_logs',
      'orchestration_health', 'ai_system_events',
    ],
  },
  system: {
    label: 'System',
    color: '#718096',
    tables: [
      'admin_users', 'automation_logs', 'system_settings',
      'event_ledger', 'audit_logs', 'test_simulation_results',
      'dataset_registry', 'system_processes',
      'entity_summaries', 'qa_history', 'intelligence_configs',
    ],
  },
};

/**
 * Business entity hierarchy edges (parent → child relationships).
 */
const HIERARCHY_EDGES: HierarchyEdge[] = [
  // Core pipeline flow
  { source: 'campaigns', target: 'leads', relationship: 'enrolls' },
  { source: 'leads', target: 'visitors', relationship: 'tracks' },
  { source: 'leads', target: 'students', relationship: 'converts to' },
  { source: 'cohorts', target: 'students', relationship: 'contains' },
  { source: 'cohorts', target: 'curriculum', relationship: 'follows' },
  // Agent oversight
  { source: 'agents', target: 'campaigns', relationship: 'monitors' },
  { source: 'agents', target: 'system', relationship: 'observes' },
  { source: 'agents', target: 'leads', relationship: 'scores' },
  // Cross-domain connections
  { source: 'campaigns', target: 'visitors', relationship: 'targets' },
  { source: 'system', target: 'leads', relationship: 'logs' },
  { source: 'system', target: 'campaigns', relationship: 'schedules' },
  { source: 'students', target: 'curriculum', relationship: 'progresses' },
  { source: 'visitors', target: 'campaigns', relationship: 'attributed to' },
];

/**
 * Build business-level entity hierarchy from DatasetRegistry data.
 * Maps raw tables to ~8 business categories with aggregated stats.
 */
export async function buildBusinessEntityHierarchy(): Promise<BusinessEntityNetwork> {
  const datasets = await DatasetRegistry.findAll({
    where: { status: 'active' },
    attributes: ['table_name', 'row_count', 'column_count'],
  });

  // Build lookup: table_name → row_count
  const tableRowCounts = new Map<string, number>();
  for (const ds of datasets) {
    tableRowCounts.set(ds.table_name, ds.row_count || 0);
  }

  // Build reverse lookup: table_name → category_id
  const tableToCategoryMap = new Map<string, string>();
  for (const [catId, def] of Object.entries(BUSINESS_ENTITY_MAP)) {
    for (const table of def.tables) {
      tableToCategoryMap.set(table, catId);
    }
  }

  // Log unmapped tables
  const unmappedTables: string[] = [];
  for (const ds of datasets) {
    if (!tableToCategoryMap.has(ds.table_name)) {
      unmappedTables.push(ds.table_name);
    }
  }
  if (unmappedTables.length > 0) {
    console.warn('[Intelligence] Unmapped tables in business hierarchy:', unmappedTables.join(', '));
  }

  // Aggregate per category
  const categories: BusinessCategory[] = Object.entries(BUSINESS_ENTITY_MAP).map(([id, def]) => {
    const matchedTables = def.tables.filter((t) => tableRowCounts.has(t));
    const totalRows = matchedTables.reduce((sum, t) => sum + (tableRowCounts.get(t) || 0), 0);

    return {
      id,
      label: def.label,
      color: def.color,
      tables: def.tables,
      matched_tables: matchedTables,
      total_rows: totalRows,
      table_count: matchedTables.length,
    };
  });

  // Add "Other" category for unmapped tables
  if (unmappedTables.length > 0) {
    const totalRows = unmappedTables.reduce((sum, t) => sum + (tableRowCounts.get(t) || 0), 0);
    categories.push({
      id: 'other',
      label: 'Other',
      color: '#a0aec0',
      tables: unmappedTables,
      matched_tables: unmappedTables,
      total_rows: totalRows,
      table_count: unmappedTables.length,
    });
  }

  const totalRows = datasets.reduce((sum, ds) => sum + (ds.row_count || 0), 0);

  return {
    categories,
    hierarchy_edges: HIERARCHY_EDGES,
    hub_entity: 'leads',
    total_tables: datasets.length,
    total_rows: totalRows,
  };
}
