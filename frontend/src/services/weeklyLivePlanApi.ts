import api from '../utils/api';

/** Weekly Live plans (Basecamp WL3.5): the topic picker on Studio setup. Full administrators only; others get a 403. */
export interface PlanInputs { week: number | 'auto'; proof?: string; forceNews?: string; audience?: string; avoid?: string; notes?: string }
export type PlanStatus = 'draft' | 'researching' | 'ready' | 'chosen' | 'failed';
export type PlanStage = 'queued' | 'signals' | 'demand' | 'topics' | 'done' | 'failed';
export interface PlanDemand { week: number; video_url: string | null; video_title: string | null; channel: string | null; views: number | null; multiple: number | null; score: number | null; thin_median: boolean; measured_at: string; failed: boolean }
export interface PlanSignal { id: string; headline: string; publisher: string | null; url: string; published_at: string | null; date_confirmed: boolean; factors: number[]; fits_weeks: number[]; idea: string | null; dropped_reason: string | null }
export interface PlanTopic {
  id: string; rank: number; week: number; title: string; spin: string | null; parody: string | null; hooks: { text: string; viral: number }[];
  package: Record<string, string>; marketing: Record<string, string>; signals_used: string[]; teach_lines: Record<string, { score: number; why: string }>;
  teach: number; viral: number; convert: number; topic_score: number; factors: number[]; warnings: { code: string; message: string }[]; recommended: boolean;
}
export interface PlanView {
  plan: { id: string; air_date: string; cohort_id: string | null; status: PlanStatus; stage: PlanStage; error: string | null; note: string | null; cost_usd: number; chosen_topic_id: string | null; inputs: PlanInputs };
  demand: PlanDemand[]; signals: PlanSignal[]; topics: PlanTopic[];
}
export type PlanBatch = { ok: true; cohortId: string; cohortName: string } | { ok: false; status: number; error: string };
export interface MapWeek { week: number; theme: string; intensive: string; timesCovered: number; lastCovered: string | null; lastTitle: string | null; daysAgo: number | null; coveredInLast4: boolean }
export interface PlanSetup { batch: PlanBatch; map: { asOf: string; recentWeeks: number[]; weeks: MapWeek[] }; demand: PlanDemand[]; latestPlanId: string | null }

export interface PlanFailure { status: number | null; message: string; code: string | null }
export function planFailure(e: unknown): PlanFailure {
  const r = (e as { response?: { status?: number; data?: { error?: string; code?: string } } })?.response;
  return { status: r?.status ?? null, message: r?.data?.error || 'Something went wrong. Try again.', code: r?.data?.code ?? null };
}

export async function getPlanSetup(airDate: string): Promise<PlanSetup> {
  return (await api.get('/api/admin/live/plan-setup', { params: { airDate } })).data;
}
export async function startPlan(airDate: string, inputs: PlanInputs): Promise<{ planId: string; started: boolean }> {
  return (await api.post('/api/admin/live/plans', { airDate, inputs })).data;
}
export async function getPlan(id: string): Promise<PlanView> {
  return (await api.get(`/api/admin/live/plans/${id}`)).data;
}
export async function regeneratePlan(id: string): Promise<void> {
  await api.post(`/api/admin/live/plans/${id}/regenerate`, {});
}
export async function chooseTopic(id: string, topicId: string, override = false): Promise<void> {
  await api.post(`/api/admin/live/plans/${id}/choose`, override ? { topicId, override } : { topicId });
}
