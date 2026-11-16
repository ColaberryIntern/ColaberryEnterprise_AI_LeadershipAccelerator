import portalApi from '../../utils/portalApi';

/**
 * Career Prep v27: the student's own Career Prep data (backend routes/careerPrepRoutes.ts). Every number
 * is optional: the server omits a value it cannot compute, and the UI never fills one in.
 */
export type InterviewType = 'recruiter' | 'hiring_manager' | 'technical' | 'behavioral';
export interface PrepInterview {
  id: string; source: 'real' | 'added' | 'practice'; company: string; role: string; type: InterviewType;
  startsAt?: string; readiness?: number; target: number;
  /** Practice questions from the job description, when there were some. */
  questions?: string[];
}
export interface PrepSummary {
  firstName?: string;
  nextInterview?: PrepInterview;
  stops: { readiness?: number; readyAt?: number; streak?: number; thisWeek?: number };
  interviews: PrepInterview[];
  /** CP5.1: every dated interview, counted (the list above holds at most 3). */
  interviewCount?: number;
  /** CP5.1: minutes planned for today in the next interview's plan; absent when none. */
  sessionMinutes?: number;
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

export interface SessionSegment extends PrepSegment { state: 'pending' | 'done' }
export interface PrepSessionView { id: string; planId: string; status: 'running' | 'paused' | 'finished' | 'ended' | 'abandoned'; startedAt: string; secondsActive: number; segments: SessionSegment[] }
export interface AttemptView { id: string; status: 'pending' | 'done' | 'failed'; errorClass: string | null;
  result: { seconds: number; scores: Array<{ key: string; label: string; score: number; value: string; target: string; source: string }>; notes: string[] } | null }

export async function startSessionApi(planId: string): Promise<{ session: PrepSessionView; resumed: boolean }> {
  return (await portalApi.post(`${BASE}/sessions`, { planId })).data;
}

/** CP4.5: what changed in a session, computed by the server from the rows it wrote (numbers absent when unknown). */
export interface PrepRecap {
  status: 'finished' | 'ended'; minutes: number; attempts: number; firstName?: string;
  /** Answers still being scored when the session ended; they reach Your progress when scoring finishes. */
  pending: number;
  readiness?: { after: number; before?: number; interviewId?: string; company?: string };
  skills: Array<{ key: string; label: string; before?: number; after: number }>;
  streak: number;
}

/** A session move. Finishing or ending it also returns the recap (when the server could build one). */
export async function patchSessionApi(id: string, body: { action: 'segment_done' | 'pause' | 'resume' | 'finish' | 'end'; segmentIndex?: number; secondsActive: number }): Promise<{ session: PrepSessionView; recap?: PrepRecap }> {
  return (await portalApi.patch(`${BASE}/sessions/${encodeURIComponent(id)}`, body)).data;
}

export interface PrepReminder { id: string; kind: 'tonight' | 'tomorrow'; sendAt: string; status: string }
/** CP4.5: "Remind me tonight at 6:00 PM" (a plan) or "Same time tomorrow" (a session). Asking twice is one reminder. */
export async function setReminderApi(kind: PrepReminder['kind'], ref: { planId: string } | { sessionId: string }): Promise<PrepReminder> {
  return (await portalApi.post(`${BASE}/reminders`, { kind, ...ref })).data.reminder;
}
export async function fetchRemindersApi(): Promise<PrepReminder[]> {
  return (await portalApi.get(`${BASE}/reminders`)).data.reminders;
}

/** Upload one Try answer. `clientKey` makes a retried upload the same attempt on the server. */
export async function uploadAttemptApi(sessionId: string, segmentIndex: number, clientKey: string, file: Blob, onProgress?: (f: number) => void): Promise<AttemptView> {
  const form = new FormData();
  form.append('segmentIndex', String(segmentIndex));
  form.append('clientKey', clientKey);
  form.append('video', file, 'try.webm');
  const res = await portalApi.post(`${BASE}/sessions/${encodeURIComponent(sessionId)}/attempts`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300_000,
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
  });
  return res.data.attempt;
}

export async function fetchAttemptApi(sessionId: string, attemptId: string): Promise<AttemptView> {
  return (await portalApi.get(`${BASE}/sessions/${encodeURIComponent(sessionId)}/attempts/${encodeURIComponent(attemptId)}`)).data.attempt;
}
