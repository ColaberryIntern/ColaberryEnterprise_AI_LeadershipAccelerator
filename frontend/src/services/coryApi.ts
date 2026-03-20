import axios from 'axios';

const API_BASE = '/api/admin/intelligence/cory';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExecutiveBriefing {
  problem_detected?: string;
  analysis?: string;
  action_taken?: string;
  expected_impact?: string;
  confidence: number;
}

export interface CoryResponse {
  message: string;
  briefings?: ExecutiveBriefing[];
  actions_taken?: string[];
  agents_dispatched?: string[];
  trace_id: string;
  intent: string;
  assistant_response?: any;
  suggested_questions?: string[];
}

export interface CoryStatusReport {
  status: string;
  agent_fleet: { total: number; healthy: number; errored: number; paused: number };
  decisions_24h: { total: number; executed: number; proposed: number; rejected: number };
  latest_strategic_report: any;
  departments: DepartmentSummary[];
  experiments_running: number;
  avg_confidence: number;
  system_risk_level: string;
}

export interface DepartmentSummary {
  department: string;
  agent_count: number;
  healthy: number;
  errored: number;
  paused: number;
  agents: Array<{
    id: string;
    agent_name: string;
    status: string;
    enabled: boolean;
    run_count: number;
    error_count: number;
    last_run_at: string | null;
  }>;
}

export interface TimelineEntry {
  time: string;
  problem_detected: string;
  analysis: string;
  decision: string;
  execution: string;
  impact: string;
  trace_id: string;
  confidence: number;
  risk_tier: string;
  risk_score: number;
  execution_status: string;
}

export interface AgentInfo {
  id: string;
  agent_name: string;
  agent_type: string;
  status: string;
  enabled: boolean;
  category: string;
  department: string;
  run_count: number;
  error_count: number;
  avg_duration_ms: number;
  last_run_at: string | null;
  description: string;
  schedule: string;
  trigger_type: string;
}

// ─── API Functions ───────────────────────────────────────────────────────────

export async function sendCoryCommand(command: string, context?: Record<string, any>): Promise<CoryResponse> {
  const { data } = await api.post('/command', { command, context });
  return data;
}

export async function getCoryStatus(): Promise<CoryStatusReport> {
  const { data } = await api.get('/status');
  return data;
}

export async function getCoryNarrative(limit = 10): Promise<ExecutiveBriefing[]> {
  const { data } = await api.get('/narrative', { params: { limit } });
  return data.briefings || [];
}

export async function getCoryTimeline(limit = 50): Promise<TimelineEntry[]> {
  const { data } = await api.get('/timeline', { params: { limit } });
  return data.entries || [];
}

export async function getCoryDepartments(): Promise<DepartmentSummary[]> {
  const { data } = await api.get('/departments');
  return data.departments || [];
}

export async function hireAgent(spec: {
  name: string;
  role: string;
  department: string;
  responsibilities: string;
}): Promise<any> {
  const { data } = await api.post('/hire-agent', spec);
  return data;
}

export async function retireAgent(agentId: string): Promise<void> {
  await api.post('/retire-agent', { agent_id: agentId });
}

export async function getCoryAgents(): Promise<AgentInfo[]> {
  const { data } = await api.get('/agents');
  return data.agents || [];
}
