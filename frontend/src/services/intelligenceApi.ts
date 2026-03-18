import axios from 'axios';

const API_BASE = '/api/admin/intelligence';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
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

// AI Query (legacy orchestrator)
export const queryOrchestrator = (question: string, scope?: Record<string, any>) =>
  api.post<QueryResponse>('/query', { question, scope });

// Deterministic AI Assistant Pipeline
export interface PipelineStep {
  step: number;
  name: string;
  status: 'completed' | 'skipped' | 'error';
  duration_ms: number;
  detail?: string;
}

export interface NarrativeSections {
  executive_summary: string;
  key_findings: string[];
  risk_assessment: string;
  recommended_actions: string[];
  follow_up_areas: string[];
}

export interface AssistantResponse {
  question: string;
  entity_type: string | null;
  intent: string;
  confidence: number;
  narrative: string;
  narrative_sections: NarrativeSections | null;
  insights: Array<{ type: string; severity: string; message: string; metric?: string; value?: number }>;
  charts: Array<{ type: string; title: string; data: Record<string, any>[]; labelKey: string; valueKey: string }>;
  recommendations: string[];
  sources: string[];
  pipelineSteps: PipelineStep[];
  execution_path: string;
}

export const assistantQuery = (question: string, entityType?: string) =>
  api.post<AssistantResponse>('/assistant', { question, entity_type: entityType });

export const getExecutiveSummary = (params?: { entity_type?: string }) =>
  api.get<QueryResponse>('/executive-summary', { params });
export const getRankedInsights = (params?: { entity_type?: string }) =>
  api.get<QueryResponse>('/insights', { params });
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

// ─── Autonomy endpoints ──────────────────────────────────────────────────────

export const getAutonomyDashboard = () => api.get('/autonomy/dashboard');
export const getAutonomyDecisions = (params?: { status?: string; limit?: number }) =>
  api.get('/autonomy/decisions', { params });
export const simulateAutonomyCycle = () => api.post('/autonomy/simulate');
export const executeDecision = (decisionId: string) =>
  api.post(`/autonomy/decisions/${decisionId}/execute`);
export const rejectDecision = (decisionId: string) =>
  api.post(`/autonomy/decisions/${decisionId}/reject`);
export const runAutonomyCycle = () => api.post('/autonomy/run-cycle');

// ─── Department Intelligence Layer ─────────────────────────────────────────

export interface DepartmentSummary {
  id: string;
  name: string;
  slug: string;
  mission: string;
  color: string;
  bg_light: string;
  team_size: number;
  health_score: number;
  innovation_score: number;
  initiative_count: number;
  active_initiatives: number;
  completed_initiatives: number;
  total_revenue_impact: number;
  strategic_objectives: { title: string; progress: number }[];
  kpis: { name: string; value: number; unit: string; trend: string }[];
}

export interface InitiativeSummary {
  id: string;
  department_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  owner: string;
  start_date: string;
  target_date: string;
  completed_date: string | null;
  revenue_impact: number | null;
  risk_level: string;
  department?: { id: string; name: string; slug: string; color: string };
}

export interface DepartmentEventSummary {
  id: string;
  department_id: string;
  initiative_id: string | null;
  event_type: string;
  title: string;
  description: string;
  severity: string | null;
  created_at: string;
  department?: { id: string; name: string; slug: string; color: string };
  initiative?: { id: string; title: string };
}

export interface InnovationScoreEntry {
  id: string;
  name: string;
  slug: string;
  color: string;
  bg_light: string;
  innovation_score: number;
  health_score: number;
  breakdown: {
    initiative_velocity: number;
    completion_rate: number;
    avg_progress: number;
    team_size: number;
    active_initiatives: number;
    completed_initiatives: number;
    total_initiatives: number;
  };
}

export const getDepartmentsApi = () =>
  api.get<{ departments: DepartmentSummary[] }>('/departments');

export const getDepartmentDetail = (id: string) =>
  api.get<any>(`/departments/${id}`);

export const getInitiativesApi = (params?: { department_id?: string; status?: string; priority?: string }) =>
  api.get<{ initiatives: InitiativeSummary[] }>('/initiatives', { params });

export const getInitiativeDetail = (id: string) =>
  api.get<InitiativeSummary>(`/initiatives/${id}`);

export const getRoadmapData = () =>
  api.get<{ roadmap: any[] }>('/roadmap');

export const getDepartmentTimelineEvents = (params?: { department_id?: string; limit?: number }) =>
  api.get<{ events: DepartmentEventSummary[] }>('/department-timeline', { params });

export const getInnovationScoresData = () =>
  api.get<{ scores: InnovationScoreEntry[] }>('/innovation-scores');

export const getRevenueImpactData = (params?: { department_id?: string }) =>
  api.get<{ grand_total: number; by_department: any[] }>('/revenue-impact', { params });

// ─── Department Head AI Chat ────────────────────────────────────────────────

export interface DeptHeadInfo {
  name: string;
  title: string;
  personality: string;
}

export interface IdeaEvaluation {
  idea: string;
  department_id: string;
  department_name: string;
  head_name: string;
  research_summary: string;
  feasibility_score: number;
  confidence: number;
  risk_assessment: string;
  estimated_impact: string;
  estimated_timeline: string;
  recommendation: 'auto_implement' | 'needs_approval' | 'not_recommended';
  implementation_plan: string[];
  coo_report: string;
}

export const getDeptHeadInfo = (slug: string) =>
  api.get<DeptHeadInfo>(`/departments/${slug}/head`);

export const chatWithDeptHead = (slug: string, message: string, history: Array<{ role: string; content: string }>) =>
  api.post<{ response: string; head_name: string; head_title: string }>(`/departments/${slug}/chat`, { message, history });

export const evaluateIdea = (slug: string, idea: string) =>
  api.post<IdeaEvaluation>(`/departments/${slug}/evaluate-idea`, { idea });

// ─── Department Strategy Layer ──────────────────────────────────────────────

export interface StrategyAgentInfo {
  id: string;
  agent_name: string;
  status: string;
  enabled: boolean;
  run_count: number;
  error_count: number;
  last_run_at: string | null;
  avg_duration_ms: number | null;
  last_result: any;
  config: Record<string, any>;
}

export interface StrategySummary {
  total_departments: number;
  total_initiatives: number;
  active_initiatives: number;
  completed_initiatives: number;
  cross_dept_initiatives: number;
  avg_health_score: number;
  avg_innovation_score: number;
  departments: Array<{
    id: string;
    name: string;
    slug: string;
    color: string;
    health_score: number;
    innovation_score: number;
    active_initiatives: number;
    total_initiatives: number;
    last_strategy_run: string | null;
  }>;
}

export interface CrossDeptInitiative {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  risk_level: string;
  created_by_agent: string | null;
  supporting_departments: string[];
  department: { id: string; name: string; slug: string; color: string };
  supporting_department_details: Array<{ id: string; name: string; slug: string; color: string }>;
}

export const getStrategySummary = () =>
  api.get<StrategySummary>('/strategy-summary');

export const getCrossDeptInitiatives = () =>
  api.get<{ initiatives: CrossDeptInitiative[] }>('/cross-dept-initiatives');

export const getStrategyAgents = () =>
  api.get<{ agents: StrategyAgentInfo[] }>('/strategy-agents');

export const runDepartmentStrategy = (slug: string) =>
  api.post<any>(`/departments/${slug}/run-strategy`);

// ─── Campaign Intelligence Graph ────────────────────────────────────────

export interface CampaignGraphNode {
  id: string;
  type: 'source' | 'entry' | 'campaign' | 'outcome';
  label: string;
  count: number;
  metrics: {
    conversion_rate?: number;
    messages_sent?: number;
    active_users?: number;
  };
  source_breakdown?: Record<string, number>;
}

export interface CampaignGraphEdge {
  from: string;
  to: string;
  label: string;
  volume?: number;
}

export interface CampaignGraphData {
  nodes: CampaignGraphNode[];
  edges: CampaignGraphEdge[];
}

export const getCampaignGraph = () =>
  axios.get<CampaignGraphData>('/api/admin/campaign-intelligence/graph', {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  });

export default api;
