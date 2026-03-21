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

export const getExecutiveSummary = (params?: { entity_type?: string; entity_name?: string }) =>
  api.get<QueryResponse>('/executive-summary', { params });
export const getRankedInsights = (params?: { entity_type?: string; entity_name?: string }) =>
  api.get<QueryResponse>('/insights', { params });
export const getEntityNetwork = () => api.get<EntityNetwork>('/entity-network');

// Q&A History
export const getQAHistory = (params?: { limit?: number; offset?: number }) =>
  api.get<{ rows: any[]; count: number }>('/qa-history', { params });

// Analytics (optional entity_type + entity_name scoping)
export const getKPIs = (params?: { entity_type?: string; entity_name?: string }) => api.get('/kpis', { params });
export const getAnomalies = (params?: { entity_type?: string; entity_name?: string }) => api.get('/anomalies', { params });
export const getForecasts = (params?: { entity_type?: string; entity_name?: string }) => api.get('/forecasts', { params });
export const getRiskEntities = (params?: { entity_type?: string; entity_name?: string }) => api.get('/risk-entities', { params });

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

export interface EdgeVelocityMetrics {
  median_hours: number;
  velocity: number;
  throughput_per_day: number;
  bottleneck_score: number;
}

export interface NodeVelocityMetrics {
  incoming_velocity: number;
  outgoing_velocity: number;
  dwell_hours: number;
  pulse_intensity: number;
}

export interface TimelineBucket {
  bucket_start: string;
  bucket_end: string;
  edge_volumes: Record<string, number>;
  node_counts: Record<string, number>;
}

export interface CampaignGraphNode {
  id: string;
  type: 'source' | 'outreach' | 'engagement' | 'visitor' | 'entry' | 'campaign' | 'outcome';
  label: string;
  count: number;
  metrics: {
    conversion_rate?: number;
    messages_sent?: number;
    active_users?: number;
    engaged_count?: number;
    unengaged_count?: number;
    contacted?: number;
    delivered?: number;
    opened?: number;
    visits_generated?: number;
    pct_of_outreach?: number;
    conversion_to_visit?: number;
    email_count?: number;
    sms_count?: number;
    voice_count?: number;
    attribution_linear?: number;
    attribution_first?: number;
    attribution_last?: number;
    velocity?: NodeVelocityMetrics;
  };
  source_breakdown?: Record<string, number>;
}

export interface CampaignGraphEdge {
  from: string;
  to: string;
  label: string;
  volume?: number;
  velocity?: EdgeVelocityMetrics;
}

export interface CampaignGraphValidation {
  total_leads: number;
  leads_with_first_touch: number;
  leads_unengaged: number;
  leads_in_campaigns: number;
  leads_enrolled: number;
  leads_paid: number;
  leads_with_visitor: number;
  leads_contacted: number;
  leads_contacted_no_visit: number;
  leads_engaged: number;
  leads_opened: number;
  leads_ignored: number;
  warnings: string[];
}

export interface CampaignGraphData {
  nodes: CampaignGraphNode[];
  edges: CampaignGraphEdge[];
  validation?: CampaignGraphValidation;
  time_window?: string;
  timeline_buckets?: TimelineBucket[];
}

export interface GraphUserRecord {
  id: number;
  name: string;
  email: string;
  company: string | null;
  source: string | null;
  source_category: string;
  first_touch: string | null;
  pipeline_stage: string | null;
  created_at: string;
}

export interface GraphUserListResponse {
  users: GraphUserRecord[];
  total: number;
  page: number;
  limit: number;
}

const adminHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
});

export const getCampaignGraph = (timeWindow?: string, timeline?: boolean) =>
  axios.get<CampaignGraphData>('/api/admin/campaign-intelligence/graph', {
    ...adminHeaders(),
    params: {
      ...(timeWindow && timeWindow !== 'all' ? { timeWindow } : {}),
      ...(timeline ? { timeline: 'true' } : {}),
    },
  });

export const getGraphNodeUsers = (nodeId: string, page = 1, limit = 50) =>
  axios.get<GraphUserListResponse>('/api/admin/campaign-intelligence/graph/node-users', {
    ...adminHeaders(),
    params: { nodeId, page, limit },
  });

export const getGraphEdgeUsers = (from: string, to: string, page = 1, limit = 50) =>
  axios.get<GraphUserListResponse>('/api/admin/campaign-intelligence/graph/edge-users', {
    ...adminHeaders(),
    params: { from, to, page, limit },
  });

// ─── Graph Slice (Cohort View) ──────────────────────────────────────────

export interface SliceContext {
  nodeId: string;
  nodeLabel: string;
  cohortSize: number;
  totalLeads: number;
  drillStack: string[];
}

export interface SlicedCampaignGraphData extends CampaignGraphData {
  sliceContext: SliceContext;
}

export const getCampaignGraphSlice = (nodeIds: string[]) =>
  axios.get<SlicedCampaignGraphData>('/api/admin/campaign-intelligence/graph/slice', {
    ...adminHeaders(),
    params: { nodeIds: nodeIds.join(',') },
  });

// ─── Visitor Navigation Flow Graph ──────────────────────────────────────────

export interface FlowGraphNode {
  id: string;
  type: 'source' | 'landing' | 'browse' | 'intent' | 'exit';
  label: string;
  count: number;
  metrics: {
    avg_duration?: number;
    bounce_rate?: number;
    unique_visitors?: number;
  };
}

export interface FlowGraphEdge {
  from: string;
  to: string;
  volume: number;
}

export interface FlowGraphValidation {
  total_sessions: number;
  total_visitors: number;
  bounce_rate: number;
  avg_pages_per_session: number;
  warnings: string[];
}

export interface FlowGraphData {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  validation: FlowGraphValidation;
  time_window?: string;
}

export interface FlowSessionRecord {
  session_id: string;
  visitor_id: string;
  visitor_fingerprint: string;
  lead_name?: string;
  lead_email?: string;
  entry_page: string;
  exit_page: string;
  pageview_count: number;
  duration_seconds: number;
  is_bounce: boolean;
  device_type?: string;
  started_at: string;
  pages: string[];
}

export const getVisitorFlowGraph = (timeWindow?: string) =>
  axios.get<FlowGraphData>('/api/admin/visitor-flow/graph', {
    ...adminHeaders(),
    params: timeWindow && timeWindow !== 'all' ? { timeWindow } : {},
  });

export const getFlowNodeSessions = (nodeId: string, page = 1, limit = 50) =>
  axios.get<{ sessions: FlowSessionRecord[]; total: number }>(
    '/api/admin/visitor-flow/graph/node-sessions',
    { ...adminHeaders(), params: { nodeId, page, limit } },
  );

// ── Marketing Funnel Graph ──────────────────────────────────────────────────

export interface FunnelGraphNode {
  id: string;
  type: 'channel' | 'campaign' | 'engagement' | 'conversion' | 'outcome';
  label: string;
  count: number;
  metrics: {
    lead_count?: number;
    campaign_count?: number;
    budget_spent?: number;
    budget_total?: number;
    engagement_rate?: number;
    avg_lead_score?: number;
    pct_of_total?: number;
  };
}

export interface FunnelGraphEdge {
  from: string;
  to: string;
  volume: number;
}

export interface FunnelGraphValidation {
  total_leads: number;
  total_campaigns: number;
  leads_with_touchpoints: number;
  leads_enrolled: number;
  warnings: string[];
}

export interface FunnelGraphData {
  nodes: FunnelGraphNode[];
  edges: FunnelGraphEdge[];
  validation: FunnelGraphValidation;
  time_window?: string;
}

export interface FunnelLeadRecord {
  lead_id: number;
  name: string;
  email: string;
  pipeline_stage: string;
  lead_score: number;
  campaign_name: string;
  engagement_level: string;
  lifecycle_status: string;
  touchpoint_count: number;
  response_count: number;
  enrolled_at: string;
}

export const getMarketingFunnelGraph = (timeWindow?: string) =>
  axios.get<FunnelGraphData>('/api/admin/marketing/funnel/graph', {
    ...adminHeaders(),
    params: timeWindow && timeWindow !== 'all' ? { timeWindow } : {},
  });

export const getFunnelNodeLeads = (nodeId: string, page = 1, limit = 20, timeWindow?: string) =>
  axios.get<{ leads: FunnelLeadRecord[]; total: number }>(
    '/api/admin/marketing/funnel/graph/node-leads',
    { ...adminHeaders(), params: { nodeId, page, limit, timeWindow } },
  );

export default api;
