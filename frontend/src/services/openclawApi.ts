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
    active_agents: number;
    content_pipeline: number;
    responses_manual_queue: number;
    replies_sent: number;
    total_engagement_score: number;
    total_clicks: number;
    total_replies: number;
    ctr: number;
    reply_rate: number;
    best_tone: string;
  };
  platforms: Array<{ platform: string; count: number }>;
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    enabled: boolean;
    description: string;
    config: Record<string, any>;
    last_run_at: string | null;
    last_result: Record<string, any> | null;
    run_count: number;
    error_count: number;
    avg_duration_ms: number | null;
  }>;
  performance: {
    top_responses: Array<{
      id: string;
      platform: string;
      tone: string;
      short_id: string;
      posted_at: string;
      content_preview: string;
      engagement_score: number;
      clicks: number;
      replies: number;
      reactions: number;
      signal_title: string;
    }>;
    tone_breakdown: Array<{
      tone: string;
      avg_engagement: number;
      sample_size: number;
      confidence: number;
    }>;
    platform_breakdown: Array<{
      platform: string;
      avg_engagement: number;
      sample_size: number;
    }>;
  };
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
  short_id: string | null;
  tracked_url: string | null;
  engagement_metrics: Record<string, any>;
  created_at: string;
  reasoning: string | null;
  priority_score: number | null;
  intent_level: string | null;
  recommended_action: string | null;
  follow_up_suggestion: string | null;
  execution_type: string | null;
  lead_id: number | null;
  signal?: {
    title: string;
    source_url: string;
    platform: string;
    content_excerpt: string | null;
    details: Record<string, any> | null;
    relevance_score: number | null;
    engagement_score: number | null;
    author: string | null;
  };
  lead?: {
    id: number;
    name: string;
    email: string;
    interest_level: string | null;
    lead_score: number | null;
    pipeline_stage: string | null;
  };
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

export interface OpenclawAgentActivity {
  id: string;
  agent_id: string;
  action: string;
  reason: string | null;
  confidence: number | null;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  result: string;
  details: Record<string, any> | null;
  duration_ms: number | null;
  created_at: string;
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

export const getOpenclawAgentActivity = (agentId: string, params?: Record<string, string>) =>
  api.get<{ activities: OpenclawAgentActivity[]; total: number }>(`${BASE}/agents/${agentId}/activity`, { params });

export const markOpenclawResponsePosted = (id: string, post_url: string) =>
  api.post(`${BASE}/responses/${id}/mark-posted`, { post_url });

export const submitOpenclawSignal = (url: string, platform?: string) =>
  api.post<{ success: boolean; signal: OpenclawSignalItem; task_id: string }>(`${BASE}/signals/submit`, { url, platform });

export const generateLinkedInPost = (topic: string) =>
  api.post<{ success: boolean; signal: OpenclawSignalItem; response: any; short_id: string }>(`${BASE}/linkedin/generate`, { topic });
