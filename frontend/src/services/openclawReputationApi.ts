import api from '../utils/api';

const BASE = '/api/admin/openclaw';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthorityContentItem {
  id: string;
  source_type: string;
  source_signal_ids: string[];
  platform: string;
  title: string | null;
  content: string;
  tone: string;
  short_id: string | null;
  tracked_url: string | null;
  utm_params: Record<string, string>;
  status: string;
  posted_at: string | null;
  post_url: string | null;
  performance_metrics: Record<string, any>;
  created_at: string;
  updated_at: string | null;
}

export interface EngagementEventItem {
  id: string;
  response_id: string | null;
  authority_content_id: string | null;
  platform: string;
  source_url: string | null;
  engagement_type: string;
  user_name: string | null;
  user_title: string | null;
  user_company: string | null;
  content: string | null;
  intent_score: number | null;
  influence_score: number | null;
  role_seniority: string;
  company_detected: string | null;
  status: string;
  details: Record<string, any>;
  created_at: string;
}

export interface ResponseQueueItem {
  id: string;
  engagement_id: string;
  response_type: string;
  response_text: string;
  platform: string;
  status: string;
  post_url: string | null;
  posted_at: string | null;
  expires_at: string | null;
  details: Record<string, any>;
  created_at: string;
  engagement?: EngagementEventItem;
}

export interface LinkedInActionItem {
  id: string;
  action_type: string;
  target_post_url: string | null;
  target_user_name: string | null;
  target_user_title: string | null;
  suggested_text: string;
  context: string | null;
  priority: number;
  status: string;
  completed_at: string | null;
  source_signal_id: string | null;
  source_engagement_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

// ── Authority Content ────────────────────────────────────────────────────────

export const getAuthorityContent = (params?: Record<string, string>) =>
  api.get<{ authority_content: AuthorityContentItem[]; total: number }>(`${BASE}/authority-content`, { params });

export const generateAuthorityContent = (topic: string) =>
  api.post<{ success: boolean; authority_content: AuthorityContentItem }>(`${BASE}/authority-content/generate`, { topic });

export const approveAuthorityContent = (id: string) =>
  api.post<{ success: boolean; authority_content: AuthorityContentItem }>(`${BASE}/authority-content/${id}/approve`);

export const markAuthorityContentPosted = (id: string, post_url: string) =>
  api.post<{ success: boolean; authority_content: AuthorityContentItem }>(`${BASE}/authority-content/${id}/mark-posted`, { post_url });

export const updateAuthorityMetrics = (id: string, performance_metrics: Record<string, any>) =>
  api.put<{ success: boolean; authority_content: AuthorityContentItem }>(`${BASE}/authority-content/${id}/metrics`, { performance_metrics });

export const generateArticles = (platforms?: string[]) =>
  api.post<{ success: boolean; drafts: AuthorityContentItem[]; agent_result: any }>(`${BASE}/authority-content/generate-articles`, { platforms });

export const publishAuthorityContent = (id: string) =>
  api.post<{ success: boolean; authority_content: AuthorityContentItem; publish_result: any }>(`${BASE}/authority-content/${id}/publish`);

// ── Response Operations ──────────────────────────────────────────────────────

export const flushAllResponses = () =>
  api.post<{ success: boolean; queued: number; skipped_manual: number; message: string }>(`${BASE}/responses/flush-all`);

export const auditResponseUrls = () =>
  api.post<{ success: boolean; audited: number; fixed: number; unfixable: number }>(`${BASE}/responses/audit-urls`);

export const verifyAllPosted = () =>
  api.post<{ success: boolean; total: number; verified: number; filtered: number; errored: number }>(`${BASE}/responses/verify-all-posted`);

export const verifyResponse = (id: string) =>
  api.get<{ success: boolean; verification: { visible: boolean; checked_at: string; details: string } }>(`${BASE}/responses/${id}/verify`);

// ── Engagement Events ────────────────────────────────────────────────────────

export const getEngagements = (params?: Record<string, string>) =>
  api.get<{ engagements: EngagementEventItem[]; total: number }>(`${BASE}/engagements`, { params });

export const createEngagement = (data: {
  platform: string;
  engagement_type: string;
  user_name?: string;
  user_title?: string;
  user_company?: string;
  content?: string;
  source_url?: string;
  response_id?: string;
  authority_content_id?: string;
}) =>
  api.post<{ success: boolean; engagement: EngagementEventItem }>(`${BASE}/engagements`, data);

export const updateEngagement = (id: string, data: Record<string, any>) =>
  api.put<{ success: boolean; engagement: EngagementEventItem }>(`${BASE}/engagements/${id}`, data);

// ── Response Queue ───────────────────────────────────────────────────────────

export const getResponseQueue = (params?: Record<string, string>) =>
  api.get<{ responses: ResponseQueueItem[]; total: number }>(`${BASE}/response-queue`, { params });

export const approveResponse = (id: string) =>
  api.post<{ success: boolean; response: ResponseQueueItem }>(`${BASE}/response-queue/${id}/approve`);

export const rejectResponse = (id: string) =>
  api.post<{ success: boolean; response: ResponseQueueItem }>(`${BASE}/response-queue/${id}/reject`);

export const markResponsePosted = (id: string, post_url?: string) =>
  api.post<{ success: boolean; response: ResponseQueueItem }>(`${BASE}/response-queue/${id}/mark-posted`, { post_url });

// ── LinkedIn Actions ─────────────────────────────────────────────────────────

export const getLinkedInActions = (params?: Record<string, string>) =>
  api.get<{ actions: LinkedInActionItem[]; total: number }>(`${BASE}/linkedin-actions`, { params });

export const completeLinkedInAction = (id: string) =>
  api.post<{ success: boolean; action: LinkedInActionItem }>(`${BASE}/linkedin-actions/${id}/complete`);

export const skipLinkedInAction = (id: string) =>
  api.post<{ success: boolean; action: LinkedInActionItem }>(`${BASE}/linkedin-actions/${id}/skip`);
