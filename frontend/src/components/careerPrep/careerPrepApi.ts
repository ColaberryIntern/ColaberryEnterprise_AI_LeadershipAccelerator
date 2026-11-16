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
