import portalApi from '../utils/portalApi';

export type WeekItemType = 'warm_up' | 'lab' | 'video_critique' | 'post_quiz' | 'mock_interview';

export interface WeekVisibilityMap {
  [itemType: string]: { visible: boolean; revealed_at: string | null };
}

export interface WeekData {
  week_number: number;
  course_link: { url: string | null; status: string; title: string | null } | null;
  visibility: WeekVisibilityMap;
  next_unrevealed: WeekItemType | null;
}

export interface InterviewQuestion {
  id: string;
  text: string;
}

export interface StartInterviewResult {
  session_id: string;
  status: string;
  questions: InterviewQuestion[];
  already_completed: boolean;
}

export interface SubmitInterviewResult {
  total_score: number;
  feedback: string;
  emailed: boolean;
}

export interface RevealResult {
  revealed: WeekItemType | null;
  visibility: WeekVisibilityMap;
}

export const getWeekData = (weekNumber: number): Promise<{ data: WeekData }> =>
  portalApi.get(`/api/portal/classroom/week/${weekNumber}`);

export const revealNextActivity = (
  weekNumber: number,
  completed_item: WeekItemType
): Promise<{ data: RevealResult }> =>
  portalApi.post(`/api/portal/classroom/week/${weekNumber}/reveal`, { completed_item });

export const startInterview = (weekNumber: number): Promise<{ data: StartInterviewResult }> =>
  portalApi.post('/api/portal/interview/start', { week_number: weekNumber });

export const submitInterview = (
  sessionId: string,
  answers: Array<{ question_id: string; answer: string }>
): Promise<{ data: SubmitInterviewResult }> =>
  portalApi.post(`/api/portal/interview/${sessionId}/submit`, { answers });
