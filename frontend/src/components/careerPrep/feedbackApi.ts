import portalApi from '../../utils/portalApi';
import { recordFailedRequest, redactUrl } from '../../pages/admin/marketing/bugReport/reportContext';

/** Career Prep pilot feedback (backend controllers/careerPrepFeedbackController.ts). */
export type FeedbackKind = 'broken' | 'confusing' | 'idea' | 'works';
export interface FeedbackItem { id: string; kind: FeedbackKind; message: string; better?: string; status: 'new' | 'looking' | 'fixed' | 'planned' | 'not_now'; reply?: string; unread: boolean; createdAt: string }
export interface FeedbackContext {
  pageUrl: string; tab: string; sheet?: string; interviewId?: string; browser: string; viewport: string; errors: unknown[]; failedRequests: unknown[];
}
export interface FeedbackBody { clientKey: string; kind: FeedbackKind; message: string; better?: string; screenshot?: string; context: FeedbackContext }

const URL_BASE = '/api/portal/career-prep/feedback';

export async function sendFeedback(body: FeedbackBody): Promise<FeedbackItem> {
  return (await portalApi.post(URL_BASE, body)).data.item;
}

export async function fetchFeedback(): Promise<FeedbackItem[]> {
  const items = (await portalApi.get(URL_BASE))?.data?.items;
  return Array.isArray(items) ? items : [];
}

export async function markFeedbackSeen(): Promise<void> { await portalApi.post(`${URL_BASE}/seen`); }

let watching = false;
/** The portal's client uses XHR, which the shared recorder (a fetch wrapper) cannot see: note its failures too. Once per page. */
export function watchPortalFailures(): void {
  if (watching || !portalApi.interceptors) return;
  watching = true;
  portalApi.interceptors.response.use((r) => r, (err) => {
    const e = err as { config?: { method?: string; url?: string }; response?: { status?: number } };
    if (e?.config) {
      recordFailedRequest({ at: new Date().toISOString(), method: (e.config.method ?? 'get').toUpperCase(), url: redactUrl(e.config.url ?? ''), status: e.response?.status ?? 'network-failure', ms: 0 });
    }
    return Promise.reject(err);
  });
}
