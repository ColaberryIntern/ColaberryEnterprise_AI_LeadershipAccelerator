import axios from 'axios';

const API_BASE = '/api/admin/intelligence/reporting';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Types ────────────────────────────────────────────────────────────────

export interface ReportingInsight {
  id: string;
  insight_type: 'anomaly' | 'pattern' | 'trend' | 'opportunity' | 'risk';
  source_agent: string;
  entity_type: string;
  entity_id?: string;
  department?: string;
  title: string;
  narrative?: string;
  confidence: number;
  impact: number;
  urgency: number;
  data_strength: number;
  final_score: number;
  evidence?: Record<string, any>;
  recommendations?: Record<string, any>;
  visualization_spec?: Record<string, any>;
  status: 'new' | 'acknowledged' | 'actioned' | 'dismissed';
  alert_severity: 'info' | 'insight' | 'opportunity' | 'warning' | 'critical';
  created_at: string;
}

export interface KPISnapshotEntry {
  id: string;
  scope_type: string;
  scope_id: string;
  scope_name: string;
  period: string;
  snapshot_date: string;
  metrics: Record<string, number>;
  deltas?: Record<string, number>;
  computed_by: string;
}

export interface ExperimentProposal {
  id: string;
  title: string;
  hypothesis?: string;
  proposed_by_agent: string;
  department?: string;
  experiment_type: string;
  status: string;
  confidence?: number;
  priority: string;
  created_at: string;
}

export interface RevenueOpportunityEntry {
  id: string;
  opportunity_type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  estimated_value?: number;
  confidence?: number;
  urgency: string;
  status: string;
}

export interface AgentKPI {
  agent_id: string;
  agent_name: string;
  department: string;
  category: string;
  status: string;
  run_count: number;
  error_count: number;
  error_rate: number;
  avg_duration_ms: number;
  actions_last_24h: number;
  success_rate: number;
  impact_score: number;
}

export interface MapNode {
  id: string;
  label: string;
  color: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface MapEdge {
  source: string;
  target: string;
  label?: string;
  value?: number;
}

export interface MapData {
  nodes: MapNode[];
  edges: MapEdge[];
  title: string;
  map_type: string;
}

// ─── API Functions ────────────────────────────────────────────────────────

// Insights
export const getInsights = (params?: Record<string, any>) =>
  api.get<{ rows: ReportingInsight[]; count: number }>('/insights', { params }).then(r => r.data);

export const getInsight = (id: string) =>
  api.get<ReportingInsight>(`/insights/${id}`).then(r => r.data);

export const actionInsight = (id: string, status: string) =>
  api.post(`/insights/${id}/action`, { status }).then(r => r.data);

export const feedbackInsight = (id: string, feedback_type: 'useful' | 'not_useful' | 'favorite') =>
  api.post(`/insights/${id}/feedback`, { feedback_type }).then(r => r.data);

// KPIs
export const getSystemKPIs = () =>
  api.get<Record<string, any>>('/kpis').then(r => r.data);

export const getKPIHistory = (scopeType: string, scopeId: string, params?: Record<string, any>) =>
  api.get<KPISnapshotEntry[]>(`/kpis/${scopeType}/${scopeId}`, { params }).then(r => r.data);

// Trends
export const getTrends = (params?: Record<string, any>) =>
  api.get('/trends', { params }).then(r => r.data);

// Maps
export const getMapData = (mapType: string) =>
  api.get<MapData>(`/maps/${mapType}`).then(r => r.data);

// Experiments
export const getExperiments = (params?: Record<string, any>) =>
  api.get<{ rows: ExperimentProposal[]; count: number }>('/experiments', { params }).then(r => r.data);

export const approveExperiment = (id: string) =>
  api.post(`/experiments/${id}/approve`).then(r => r.data);

// Revenue Opportunities
export const getOpportunities = (params?: Record<string, any>) =>
  api.get<{ rows: RevenueOpportunityEntry[]; count: number }>('/opportunities', { params }).then(r => r.data);

// Agent Performance
export const getAgentPerformance = (params?: Record<string, any>) =>
  api.get<AgentKPI[]>('/agent-performance', { params }).then(r => r.data);

// Executive Brief
export const getExecutiveBrief = () =>
  api.get<{ summary: string; insights_count: number }>('/executive-brief').then(r => r.data);

// Manual Scan
export const triggerScan = () =>
  api.post('/scan').then(r => r.data);

// Knowledge Graph
export const getGraphNode = (nodeId: string) =>
  api.get(`/graph/node/${nodeId}`).then(r => r.data);

export const getGraphPath = (from: string, to: string) =>
  api.get('/graph/path', { params: { from, to } }).then(r => r.data);

export const getGraphImpact = (nodeId: string) =>
  api.get(`/graph/impact/${nodeId}`).then(r => r.data);

// Cory Modes
export const coryExplain = (chartData: any, chartType: string, title: string) =>
  api.post<{ explanation: string }>('/cory/explain', { chartData, chartType, title }).then(r => r.data);

export const coryResearch = (entityType: string, entityId: string, question?: string) =>
  api.post<{ research: string }>('/cory/research', { entityType, entityId, question }).then(r => r.data);

export const coryRecommend = (insightId: string) =>
  api.post<{ recommendations: string }>('/cory/recommend', { insightId }).then(r => r.data);
