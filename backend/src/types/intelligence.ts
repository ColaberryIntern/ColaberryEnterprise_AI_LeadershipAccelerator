export interface DatasetRegistryResponse {
  id: string;
  table_name: string;
  schema_name: string;
  column_count: number;
  row_count: number;
  semantic_types: Record<string, string>;
  relationships: Record<string, any>[];
  status: string;
  last_scanned: string | null;
}

export interface SystemProcessResponse {
  id: string;
  process_name: string;
  source_module: string;
  event_type: string;
  execution_time_ms: number;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface DiscoveryResult {
  status: string;
  tables_discovered: number;
  relationships_found: number;
  hub_entity: string | null;
}

export interface OrchestratorQuery {
  question: string;
  scope?: {
    level: 'global' | 'group' | 'entity' | 'metric';
    entity_type?: string;
    entity_id?: string;
  };
}

export interface OrchestratorResponse {
  question: string;
  intent: string;
  narrative: string;
  data: Record<string, any>;
  visualizations: VisualizationSpec[];
  follow_ups: string[];
  sources: string[];
  execution_path: string;
}

export interface VisualizationSpec {
  chart_type: string;
  title: string;
  data: Record<string, any>[];
  config: Record<string, any>;
}

export interface IntelligenceHealthResponse {
  engine_status: string;
  last_discovery: string | null;
  datasets_count: number;
  processes_count_24h: number;
  vector_status: string;
  ml_status: string;
}

export interface IntelligenceConfigEntry {
  id: number;
  config_key: string;
  config_value: Record<string, any>;
  updated_at: string | null;
}
