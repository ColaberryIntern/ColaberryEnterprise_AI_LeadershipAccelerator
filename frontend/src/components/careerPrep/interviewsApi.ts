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
}
export interface PlacementInterviews { kpis: { upcoming: number; waiting: number; recruiter: number; held: number }; interviews: PlacementInterview[] }

export async function fetchPlacementInterviewsApi(): Promise<PlacementInterviews> {
  return (await portalApi.get('/api/portal/career-prep/interviews/placement')).data;
}
