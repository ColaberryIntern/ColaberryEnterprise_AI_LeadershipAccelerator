import portalApi from '../../utils/portalApi';

/**
 * Career Prep v27: the student's own Career Prep data (backend routes/careerPrepRoutes.ts). Every number
 * is optional: the server omits a value it cannot compute, and the UI never fills one in.
 */
export type InterviewType = 'recruiter' | 'hiring_manager' | 'technical' | 'behavioral';
export interface PrepInterview {
  id: string; source: 'real' | 'added' | 'practice'; company: string; role: string; type: InterviewType;
  startsAt?: string; readiness?: number; target: number;
}
export interface PrepSummary {
  firstName?: string;
  nextInterview?: PrepInterview;
  stops: { readiness?: number; readyAt?: number; streak?: number; thisWeek?: number };
  interviews: PrepInterview[];
  today: string;
}
export interface PrepSkill { key: string; label: string; score?: number; change30?: number; count: number; sources: string[] }
export interface PrepDashboard {
  anchorId?: string;
  readiness?: { value: number; target?: number; changeSinceFirst?: number; trend: Array<{ week: string; value: number }> };
  interviews: PrepInterview[];
  skills: PrepSkill[];
  sources: { video: number; phone_mock: number; real_interview: number; training: number; project: number };
  weeklyMinutes: Array<{ week: string; minutes: number }>;
  streak: number;
  thisWeek: number;
}

const BASE = '/api/portal/career-prep';

export async function fetchPrepSummary(): Promise<PrepSummary> {
  return (await portalApi.get(`${BASE}/summary`)).data;
}

export async function fetchPrepDashboard(interviewId?: string): Promise<PrepDashboard> {
  return (await portalApi.get(`${BASE}/dashboard`, { params: interviewId ? { interviewId } : {} })).data;
}

export type NewInterview =
  | { mode: 'add'; company: string; role: string; type: InterviewType; startsAt: string | null; jdText?: string }
  | { mode: 'practice'; role: string; type: InterviewType };

export async function postInterview(body: NewInterview): Promise<{ id: string; source: 'added' | 'practice' }> {
  return (await portalApi.post(`${BASE}/interviews`, body)).data;
}

export async function askCoraApi(message: string, interviewId?: string): Promise<{ messages: string[]; cards?: Array<{ id: string; icon: string; title: string; line: string }> }> {
  return (await portalApi.post(`${BASE}/cora`, interviewId ? { message, interviewId } : { message })).data;
}

export interface PrepSegment { kind: 'warmup' | 'learn' | 'try' | 'pressure' | 'cooldown' | 'rehearsal'; title: string; minutes: number; targetSkill?: string }
export interface PrepPlan { kind: 'days' | 'tonight' | 'full' | 'custom'; minutes: number; days: Array<{ date: string; segments: PrepSegment[] }> }
export interface StoredPlan { id: string; interviewId: string; plan: PrepPlan }

export async function postPlan(body: { interviewId: string; kind: PrepPlan['kind']; minutes?: 10 | 20 | 45; focusSkill?: string }): Promise<StoredPlan> {
  return (await portalApi.post(`${BASE}/plans`, body)).data;
}

export async function fetchActivePlan(interviewId: string): Promise<StoredPlan | null> {
  return (await portalApi.get(`${BASE}/plans`, { params: { interviewId } })).data.plan ?? null;
}
