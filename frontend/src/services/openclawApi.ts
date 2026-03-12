import api from '../utils/api';

const BASE = '/api/admin/openclaw';

export interface OpenclawDashboard {
  kpis: {
    signals_24h: number;
    signals_total: number;
    responses_posted: number;
    responses_draft: number;
    active_sessions: number;
    queue_depth: number;
    learnings: number;
  };
  platforms: Array<{ platform: string; count: number }>;
  agents: Array<{
    name: string;
    status: string;
    enabled: boolean;
    last_run_at: string | null;
    run_count: number;
    error_count: number;
  }>;
}

export interface OpenclawSignalItem {
  id: string;
  platform: string;
  source_url: string;
  author: string;
  title: string;
  content_excerpt: string;
  topic_tags: string[];
  relevance_score: number;
  engagement_score: number;
  risk_score: number;
  status: string;
  discovered_at: string;
  details: Record<string, any>;
}

export interface OpenclawResponseItem {
  id: string;
  signal_id: string;
  platform: string;
  content: string;
  tone: string;
  post_status: string;
  post_url: string | null;
  posted_at: string | null;
  engagement_metrics: Record<string, any>;
  created_at: string;
  signal?: { title: string; source_url: string; platform: string };
}

export interface OpenclawSessionItem {
  id: string;
  platform: string;
  session_status: string;
  last_activity_at: string;
  pages_visited: number;
  actions_performed: number;
  health_score: number;
}

export interface OpenclawLearningItem {
  id: string;
  learning_type: string;
  platform: string;
  metric_key: string;
  metric_value: number;
  sample_size: number;
  confidence: number;
  insight: string;
  applied: boolean;
}

export const getOpenclawDashboard = () =>
  api.get<OpenclawDashboard>(`${BASE}/dashboard`);

export const getOpenclawSignals = (params?: Record<string, string>) =>
  api.get<{ signals: OpenclawSignalItem[]; total: number }>(`${BASE}/signals`, { params });

export const getOpenclawSignal = (id: string) =>
  api.get<OpenclawSignalItem>(`${BASE}/signals/${id}`);

export const getOpenclawResponses = (params?: Record<string, string>) =>
  api.get<{ responses: OpenclawResponseItem[]; total: number }>(`${BASE}/responses`, { params });

export const approveOpenclawResponse = (id: string) =>
  api.post(`${BASE}/responses/${id}/approve`);

export const rejectOpenclawResponse = (id: string) =>
  api.post(`${BASE}/responses/${id}/reject`);

export const getOpenclawSessions = () =>
  api.get<{ sessions: OpenclawSessionItem[] }>(`${BASE}/sessions`);

export const getOpenclawTasks = (params?: Record<string, string>) =>
  api.get(`${BASE}/tasks`, { params });

export const getOpenclawLearnings = (params?: Record<string, string>) =>
  api.get<{ learnings: OpenclawLearningItem[] }>(`${BASE}/learnings`, { params });

export const getOpenclawConfig = () =>
  api.get(`${BASE}/config`);

export const updateOpenclawConfig = (data: { agent_name: string; config?: Record<string, any>; enabled?: boolean }) =>
  api.post(`${BASE}/config`, data);
