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
  sources: { video: number; phone_mock: number; real_interview: number; training: number; project: number; read_aloud: number };
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
/** focusSkill: the skill the student picked ("Make me a plan for this"), when the plan was built for one. */
export interface StoredPlan { id: string; interviewId: string; plan: PrepPlan; focusSkill?: string }

export async function postPlan(body: { interviewId: string; kind: PrepPlan['kind']; minutes?: 10 | 20 | 45; focusSkill?: string }): Promise<StoredPlan> {
  return (await portalApi.post(`${BASE}/plans`, body)).data;
}

export async function fetchActivePlan(interviewId: string): Promise<StoredPlan | null> {
  return (await portalApi.get(`${BASE}/plans`, { params: { interviewId } })).data.plan ?? null;
}

export interface SessionSegment extends PrepSegment { state: 'pending' | 'done' }
export interface PrepSessionView { id: string; planId: string; status: 'running' | 'paused' | 'finished' | 'ended' | 'abandoned'; startedAt: string; secondsActive: number; segments: SessionSegment[] }
/** recording (R1.1, a scored attempt): saved to the profile, still saveable for up to an hour, or gone. */
export interface AttemptView { id: string; status: 'pending' | 'done' | 'failed'; errorClass: string | null; recording?: 'saved' | 'pending' | 'gone';
  result: { seconds: number; scores: Array<{ key: string; label: string; score: number; value: string; target: string; source: string }>; notes: string[];
    /** CP5.8: present on a read-aloud warm-up: the one score that counts, and the line it was read from. */
    readAloud?: { score: number; lineId: string } } | null }

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
  /** Skills this session's answers fed that are still short of a first score (count of the observations needed). */
  building?: Array<{ key: string; label: string; count: number; needed: number }>;
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

/**
 * Upload one Try answer (video) or, with `lineId`, one read-aloud warm-up (CP5.8, audio only). `clientKey` makes a retried
 * upload the same attempt on the server.
 */
export async function uploadAttemptApi(sessionId: string, segmentIndex: number, clientKey: string, file: Blob, onProgress?: (f: number) => void, lineId?: string): Promise<AttemptView> {
  const form = new FormData();
  form.append('segmentIndex', String(segmentIndex));
  form.append('clientKey', clientKey);
  if (lineId) form.append('lineId', lineId);
  form.append('video', file, lineId ? 'read.webm' : 'try.webm');
  const res = await portalApi.post(`${BASE}/sessions/${encodeURIComponent(sessionId)}/attempts`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300_000,
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
  });
  return res.data.attempt;
}

/** CP5.8: the line this student reads next (they rotate). */
export interface ReadAloudLine { id: string; text: string }
export async function fetchReadAloudLineApi(): Promise<ReadAloudLine> {
  return (await portalApi.get(`${BASE}/read-aloud/line`)).data.line;
}

export async function fetchAttemptApi(sessionId: string, attemptId: string): Promise<AttemptView> {
  return (await portalApi.get(`${BASE}/sessions/${encodeURIComponent(sessionId)}/attempts/${encodeURIComponent(attemptId)}`)).data.attempt;
}

/** R1.1: what each result behind one skill's number was (from one source), newest first. */
export type PrepSourceKey = keyof PrepDashboard['sources'];
export interface PrepSourceItem {
  at: string; value: number; kind: 'intro_video' | 'try_answer' | 'case_study' | 'other'; label: string;
  link?: string; video?: { streamUrl: string; posterUrl: string }; notKept?: boolean;
}
export async function fetchSkillSourcesApi(skill: string, source: PrepSourceKey): Promise<PrepSourceItem[]> {
  return (await portalApi.get(`${BASE}/skills/${encodeURIComponent(skill)}/sources`, { params: { source } })).data.items;
}

/** R1.1: a Try answer the student chose to keep. Playback URLs are signed for the owner and expire. */
/** showPublic (R1.2): the second opt-in, "Show on my public profile". Off by default; older responses omit it (off). */
export interface SavedAnswer { attemptId: string; question: string | null; delivery: number | null; seconds: number | null; savedAt: string; streamUrl: string; posterUrl: string; showPublic?: boolean }
export async function setShowPublicApi(attemptId: string, on: boolean): Promise<SavedAnswer> {
  return (await portalApi.put(`${BASE}/attempts/${encodeURIComponent(attemptId)}/public`, { on })).data.answer;
}
export async function saveAnswerApi(attemptId: string, question?: string): Promise<SavedAnswer> {
  return (await portalApi.post(`${BASE}/attempts/${encodeURIComponent(attemptId)}/save`, question ? { question: question.slice(0, 600) } : {})).data.answer;
}
export async function deleteAnswerApi(attemptId: string): Promise<void> {
  await portalApi.delete(`${BASE}/attempts/${encodeURIComponent(attemptId)}/save`);
}
export async function fetchSavedAnswersApi(): Promise<SavedAnswer[]> {
  return (await portalApi.get(`${BASE}/answers`)).data.answers;
}
