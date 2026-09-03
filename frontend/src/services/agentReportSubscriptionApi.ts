import api from '../utils/api';

// AI Agent Dashboard redesign, Checkpoint C, Reports slice (2026-09-02) —
// first frontend caller of the real, already-live AgentReportSubscription
// CRUD (agentReportSubscriptionService.ts) plus the brand-new
// GET /api/admin/agents/:id/report-runs (agentReportRunService.ts) this
// checkpoint added, since delivery history had no read endpoint at all
// before this. successRatePct is `null` — not a fabricated number — when
// there's no real sent-or-failed evidence yet; the UI must render that
// distinctly from an actual 0% or 100%.

export type ReportContentSection = 'cost' | 'activity' | 'trust' | 'tickets';
export type ReportCadence = 'daily' | 'weekly';

export interface ReportSubscription {
  id: string;
  agentId: string;
  contentScope: ReportContentSection[];
  cadence: ReportCadence;
  deliveryHourLocal: number;
  timezone: string;
  channel: string;
  enabled: boolean;
  createdByEmail: string;
  createdAt: string;
}

export interface ReportRun {
  id: string;
  subscriptionId: string;
  periodKey: string;
  generatedAt: string;
  deliveredAt: string | null;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  errorMessage: string | null;
}

export interface ReportRunHistory {
  windowDays: number;
  runs: ReportRun[];
  sent: number;
  failed: number;
  pending: number;
  successRatePct: number | null;
}

interface SubscriptionsResponse {
  agentId: string;
  subscriptions: ReportSubscription[];
}

export async function listReportSubscriptions(agentId: string): Promise<ReportSubscription[]> {
  const res = await api.get<SubscriptionsResponse>(`/api/admin/agents/${agentId}/report-subscriptions`);
  return res.data.subscriptions;
}

export async function createReportSubscription(
  agentId: string,
  input: { contentScope: ReportContentSection[]; cadence: ReportCadence; deliveryHourLocal: number; timezone?: string },
): Promise<ReportSubscription> {
  const res = await api.post<ReportSubscription>(`/api/admin/agents/${agentId}/report-subscriptions`, input);
  return res.data;
}

export async function updateReportSubscription(
  agentId: string,
  subscriptionId: string,
  updates: Partial<{ enabled: boolean; contentScope: ReportContentSection[]; cadence: ReportCadence; deliveryHourLocal: number; timezone: string }>,
): Promise<ReportSubscription> {
  const res = await api.patch<ReportSubscription>(`/api/admin/agents/${agentId}/report-subscriptions/${subscriptionId}`, updates);
  return res.data;
}

export async function getReportRuns(agentId: string): Promise<ReportRunHistory> {
  const res = await api.get<ReportRunHistory>(`/api/admin/agents/${agentId}/report-runs`);
  return res.data;
}
