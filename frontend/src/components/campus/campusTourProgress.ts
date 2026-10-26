import axios from 'axios';
import { getParticipantToken, VIEW_AS_TOKEN_KEY } from '../../utils/participantToken';

/**
 * Explorer Growth (2026-10-26): tell the server how far a tour got, so staff can see "how many tours have been taken and how many
 * steps of how many completed". Its own module (not campusApi) so the many suites that hand-mock campusApi keep working unchanged.
 *
 * Fire and forget: a failure loses one step, and the next step (or the finish) carries the same information, so it never blocks or
 * alerts the learner. Not sent while Viewing as a learner (the server refuses view-as POSTs anyway), nor without a token.
 */
export type TourName = 'member' | 'explorer' | 'business';
export const TOUR_PROGRESS_PATH = '/api/portal/campus/tour/progress';

export function postTourProgress(p: { tour: TourName; stop: number; total: number; finished?: boolean }): void {
  try { if (window.sessionStorage.getItem(VIEW_AS_TOKEN_KEY)) return; } catch { /* no storage: carry on */ }
  const token = getParticipantToken();
  if (!token) return;
  axios.post(`${process.env.REACT_APP_API_URL || ''}${TOUR_PROGRESS_PATH}`, p, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 })
    .catch(() => { /* one lost step; the next one says the same */ });
}
