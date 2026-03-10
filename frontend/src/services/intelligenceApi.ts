import axios from 'axios';

const API_BASE = '/api/admin/intelligence';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface DatasetEntry {
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

export interface SystemProcessEntry {
  id: string;
  process_name: string;
  source_module: string;
  event_type: string;
  execution_time_ms: number;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface HealthStatus {
  engine_status: string;
  engine_detail: Record<string, any> | null;
  last_discovery: string | null;
  datasets_count: number;
  processes_count_24h: number;
}

export interface VisualizationSpec {
  chart_type: string;
  title: string;
  data: Record<string, any>[];
  config: Record<string, any>;
}

export interface QueryResponse {
  question: string;
  intent: string;
  narrative: string;
  data: Record<string, any>;
  visualizations: VisualizationSpec[];
  follow_ups: string[];
  sources: string[];
  execution_path: string;
}

export interface EntityNode {
  id: string;
  label: string;
  row_count: number;
  column_count: number;
  is_hub: boolean;
}

export interface EntityEdge {
  source: string;
  target: string;
  type: string;
  confidence: number;
}

export interface EntityNetwork {
  nodes: EntityNode[];
  edges: EntityEdge[];
  hub_entity: string | null;
}

export interface ConfigEntry {
  id: number;
  config_key: string;
  config_value: Record<string, any>;
  updated_at: string | null;
}

// Health
export const getHealth = () => api.get<HealthStatus>('/health');

// Datasets
export const getDatasets = () => api.get<DatasetEntry[]>('/datasets');
export const getDataset = (id: string) => api.get<DatasetEntry>(`/datasets/${id}`);

// Processes
export const getProcesses = (params?: Record<string, any>) =>
  api.get<{ rows: SystemProcessEntry[]; count: number }>('/processes', { params });

// Config
export const getConfig = () => api.get<ConfigEntry[]>('/config');
export const updateConfig = (config_key: string, config_value: Record<string, any>) =>
  api.put<ConfigEntry>('/config', { config_key, config_value });

// Discovery
export const triggerDiscovery = () => api.post('/discovery/run');
export const getDictionary = () => api.get('/discovery/dictionary');

// AI Query
export const queryOrchestrator = (question: string, scope?: Record<string, any>) =>
  api.post<QueryResponse>('/query', { question, scope });

export const getExecutiveSummary = () => api.get<QueryResponse>('/executive-summary');
export const getRankedInsights = () => api.get<QueryResponse>('/insights');
export const getEntityNetwork = () => api.get<EntityNetwork>('/entity-network');

// Q&A History
export const getQAHistory = (params?: { limit?: number; offset?: number }) =>
  api.get<{ rows: any[]; count: number }>('/qa-history', { params });

// Analytics (optional entity_type scoping)
export const getKPIs = (params?: { entity_type?: string }) => api.get('/kpis', { params });
export const getAnomalies = (params?: { entity_type?: string }) => api.get('/anomalies', { params });
export const getForecasts = (params?: { entity_type?: string }) => api.get('/forecasts', { params });
export const getRiskEntities = (params?: { entity_type?: string }) => api.get('/risk-entities', { params });

// Business Hierarchy
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

export const getBusinessHierarchy = () => api.get<BusinessEntityNetwork>('/business-hierarchy');

export default api;
