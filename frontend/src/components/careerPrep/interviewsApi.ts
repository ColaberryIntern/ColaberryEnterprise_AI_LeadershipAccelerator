import portalApi from '../../utils/portalApi';

/**
 * Career Prep v27, CP8.3 (kit F4): the interviews the job-search inbox found for the signed-in student (backend
 * routes/careerPrepPlacementInterviewsRoutes.ts). The server decides every state, label and KPI; "Join" is the
 * consent-room page (`/portal/career/interview/<id>`), never the meeting provider's link, and only for a booked one.
 */
export type PlacementState = 'new' | 'awaiting' | 'review' | 'booked' | 'done' | 'cancelled';
export interface PlacementInterview {
  id: string; company: string | null; role: string | null; state: PlacementState; stateLabel: string;
  startsAt: string | null; minutes: number; readAs: string | null; confidence: number | null;
  roomPage: string | null; joinOpensAt: string | null; joinClosesAt: string | null; prepId: string | null;
  history: Array<{ at: string; label: string }>;
  /** CP9.2: for a held interview, its replay state, the plain words and the score when scored; null before it is held. */
  replay?: ReplaySummary | null;
}
export interface PlacementInterviews { kpis: { upcoming: number; waiting: number; recruiter: number; held: number; scored?: number }; interviews: PlacementInterview[] }

export type ReplayState = 'not_held' | 'not_recorded' | 'waiting' | 'scored' | 'no_score' | 'unavailable';
export interface ReplaySummary { status: ReplayState; note: string; score: number | null }
export interface ReplayPart { score: number; value: string; target: string }
export interface ReplayQuestion {
  n: number; question: string | null; answer: string; at: number; seconds: number;
  pace: ReplayPart | null; fillers: ReplayPart | null; content: { score: number; covered: number; of: number } | null;
}
/** The candidate's own replay (backend routes/placementReplayRoutes.ts). `recording` is a signed path on our server. */
export interface CandidateReplay extends ReplaySummary {
  interviewId: string; company: string | null; role: string | null; startsAt: string | null; recording: string | null; questions: ReplayQuestion[];
}

export async function fetchPlacementInterviewsApi(): Promise<PlacementInterviews> {
  return (await portalApi.get('/api/portal/career-prep/interviews/placement')).data;
}

export async function fetchReplayApi(interviewId: string): Promise<CandidateReplay> {
  return (await portalApi.get(`/api/portal/career-prep/replays/${encodeURIComponent(interviewId)}`)).data.replay;
}

/** The recording path on our API host (the same base the portal's API calls use). */
export const replayMediaUrl = (path: string): string => `${process.env.REACT_APP_API_URL || ''}${path}`;
