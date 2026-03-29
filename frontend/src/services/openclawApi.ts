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
    pipeline_funnel: Record<string, number>;
    priority_breakdown: { hot: number; warm: number; cold: number };
    conversion_rate: number;
    revenue_pipeline: Record<string, { count: number; value: number }>;
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

export interface PlatformStatus {
  ready: boolean;
  method: 'api' | 'browser' | 'manual';
  strategy: string;
  details: string;
  active: boolean;
}

export const getPlatformStatus = () =>
  api.get<{ platforms: Record<string, PlatformStatus> }>(`${BASE}/platform-status`);

export const getOpenclawAgentActivity = (agentId: string, params?: Record<string, string>) =>
  api.get<{ activities: OpenclawAgentActivity[]; total: number }>(`${BASE}/agents/${agentId}/activity`, { params });

export const markOpenclawResponsePosted = (id: string, post_url: string) =>
  api.post(`${BASE}/responses/${id}/mark-posted`, { post_url });

export const postResponseViaBrowser = (id: string) =>
  api.post<{ success: boolean; post_url: string; method: string }>(`${BASE}/responses/${id}/post-via-browser`);

export const submitOpenclawSignal = (url: string, platform?: string) =>
  api.post<{ success: boolean; signal: OpenclawSignalItem; task_id: string }>(`${BASE}/signals/submit`, { url, platform });

export const generateLinkedInPost = (topic: string) =>
  api.post<{ success: boolean; signal: OpenclawSignalItem; response: any; short_id: string }>(`${BASE}/linkedin/generate`, { topic });

export interface LinkedInBatchReplyPayload {
  post_url: string;
  comments_text?: string;
  post_content?: string;
}

export const generateLinkedInCommentReplies = (data: LinkedInBatchReplyPayload) =>
  api.post<{ success: boolean; replies_generated: number; replies: Array<{ commenter_name: string; reply_preview: string }>; message?: string }>(
    `${BASE}/linkedin/reply-to-comments`, data
  );

// ── LinkedIn Session Management ──────────────────────────────────────────────

export interface LinkedInLoginResult {
  success: boolean;
  message: string;
  needs_verification?: boolean;
}

export const loginToLinkedIn = (email: string, password: string) =>
  api.post<LinkedInLoginResult>(`${BASE}/linkedin/login`, { email, password });

export const verifyLinkedInChallenge = (code: string) =>
  api.post<LinkedInLoginResult>(`${BASE}/linkedin/verify`, { code });

export const saveLinkedInSession = (li_at: string, JSESSIONID?: string) =>
  api.post<{ success: boolean; message: string }>(`${BASE}/linkedin/save-session`, { li_at, JSESSIONID });

export const getLinkedInSessionStatus = () =>
  api.get<{ authenticated: boolean; message: string }>(`${BASE}/linkedin/session-status`);

// ── LinkedIn Tracked Posts ────────────────────────────────────────────────────

export interface TrackedLinkedInPost {
  id: string;
  source_url: string;
  title: string;
  details: { tracked: boolean; last_scanned_at: string | null; known_commenters: string[] };
  created_at: string;
}

export const getTrackedLinkedInPosts = () =>
  api.get<{ tracked_posts: TrackedLinkedInPost[] }>(`${BASE}/linkedin/tracked-posts`);

export const trackLinkedInPost = (post_url: string) =>
  api.post<{ success: boolean; tracked_post: TrackedLinkedInPost }>(`${BASE}/linkedin/track-post`, { post_url });

export const removeTrackedLinkedInPost = (id: string) =>
  api.delete(`${BASE}/linkedin/tracked-posts/${id}`);

// ── Phase 2: Revenue Pipeline Types & API ────────────────────────────────────

export interface OpenclawConversationItem {
  id: string;
  lead_id: number | null;
  platform: string;
  thread_identifier: string;
  current_stage: number;
  stage_history: Array<{ stage: number; timestamp: string; trigger: string }>;
  first_signal_id: string | null;
  first_response_id: string | null;
  engagement_count: number;
  their_reply_count: number;
  our_reply_count: number;
  last_activity_at: string;
  last_their_activity_at: string | null;
  stall_detected_at: string | null;
  conversion_signals: Array<{ signal: string; confidence: number; detected_at: string }>;
  priority_tier: 'hot' | 'warm' | 'cold';
  status: 'active' | 'stalled' | 'converted' | 'lost' | 'closed';
  created_at: string;
  lead?: {
    id: number;
    name: string;
    email: string;
    interest_level: string | null;
    lead_score: number | null;
    pipeline_stage: string | null;
    lead_temperature?: string | null;
  };
  firstSignal?: { id: string; title: string; source_url: string; platform: string };
}

export interface PipelineData {
  funnel: Record<string, number>;
  priority_breakdown: { hot: number; warm: number; cold: number };
  conversion_rate: number;
  status_breakdown: Record<string, number>;
  total: number;
}

export interface RevenueData {
  revenue_pipeline: Record<string, { count: number; value: number }>;
  total: number;
}

export const getOpenclawConversations = (params?: Record<string, string>) =>
  api.get<{ conversations: OpenclawConversationItem[]; total: number }>(`${BASE}/conversations`, { params });

export const getOpenclawConversation = (id: string) =>
  api.get<OpenclawConversationItem>(`${BASE}/conversations/${id}`);

export const updateConversationStage = (id: string, stage: number, outcome?: string) =>
  api.put(`${BASE}/conversations/${id}/stage`, { stage, outcome });

export const getOpenclawPipeline = () =>
  api.get<PipelineData>(`${BASE}/pipeline`);

export const getOpenclawRevenue = () =>
  api.get<RevenueData>(`${BASE}/revenue`);

export const getOpenclawHotLeads = (limit?: number) =>
  api.get<{ hot_leads: OpenclawConversationItem[] }>(`${BASE}/hot-leads`, { params: limit ? { limit: String(limit) } : undefined });

// ── Phase 3: Action Engine Types & API ────────────────────────────────────────

export interface ActionUrgency {
  level: 'critical' | 'high' | 'medium' | 'low';
  hours_silent: number;
  decay_rate: number;
}

export interface ActionItem {
  conversation_id: string;
  lead_name: string | null;
  lead_email: string | null;
  platform: string;
  stage: number;
  urgency: ActionUrgency;
  action_type: 'follow_up_required' | 'conversion_ready' | 'respond_to_interest' | 'advance_stage' | 'close_opportunity';
  description: string;
  recommended_action: string;
  priority_score: number;
  lead_score: number;
  hours_since_activity: number;
  priority_tier: string;
  conversion_signals: Array<{ signal: string; confidence: number }>;
  thread_identifier: string;
}

export const getOpenclawActions = (params?: Record<string, string>) =>
  api.get<{ actions: ActionItem[]; total: number }>(`${BASE}/actions/today`, { params });

// ── Phase 4: Circuit Breaker & Rate Limit Types & API ────────────────────────

export interface CircuitStatus {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  platform: string;
  error_count: number;
  total_count: number;
  error_rate: number;
  last_failure_at: string | null;
  opened_at: string | null;
}

export interface RateLimitStatus {
  platform: string;
  hour: number;
  day: number;
  limit_hour: number;
  limit_day: number;
}

export const getCircuitStatus = () =>
  api.get<{ circuit_statuses: CircuitStatus[] }>(`${BASE}/circuit-status`);

export const getRateLimits = () =>
  api.get<{ rate_limits: RateLimitStatus[] }>(`${BASE}/rate-limits`);

// ── Facebook Groups Session & Config ─────────────────────────────────────────

export interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  member_count: string | null;
}

export interface FacebookGroupConfig {
  target_groups: Array<{ id: string; name: string; url: string }>;
  enabled: boolean;
}

export const saveFacebookSession = (c_user: string, xs: string, datr?: string) =>
  api.post<{ success: boolean; message: string }>(`${BASE}/facebook/save-session`, { c_user, xs, datr });

export const getFacebookSessionStatus = () =>
  api.get<{ authenticated: boolean; message: string }>(`${BASE}/facebook/session-status`);

export const getFacebookGroups = () =>
  api.get<{ groups: FacebookGroup[] }>(`${BASE}/facebook/groups`);

export const configureFacebookGroups = (target_groups: Array<{ id: string; name: string; url: string }>, enabled: boolean) =>
  api.post<{ success: boolean; message: string }>(`${BASE}/facebook/groups/configure`, { target_groups, enabled });

export const getConfiguredFacebookGroups = () =>
  api.get<FacebookGroupConfig>(`${BASE}/facebook/groups/configured`);

// ── Reddit Session Management (Cookie-based) ─────────────────────────────────

export const saveRedditSession = (reddit_session: string, token_v2?: string) =>
  api.post<{ success: boolean; message: string }>(`${BASE}/reddit/save-session`, { reddit_session, token_v2 });

export const getRedditSessionStatus = () =>
  api.get<{ authenticated: boolean; username: string; message: string }>(`${BASE}/reddit/session-status`);
