/**
 * todayFeedApi — participant client for the Today Timeline v2 engagement feed
 * (backend: GET/POST /api/portal/runtime/today, flag-gated on TODAY_FEED_V2_ENABLED).
 * Follows the runtimeApi thunk convention; uses the participant portalApi client.
 */
import portalApi from '../../../utils/portalApi';

export interface TodayFeedItem {
  position: number;
  kind: 'anchored' | 'ambient';
  ref: string;
  surface: string;
  type: string;
  render_band: string;
  card_id: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image: string | null;
  video: { url: string; presenter: string | null; poster: string | null; title?: string | null } | null;
  blog: { url: string; title?: string | null; excerpt?: string | null; thumbnail?: string | null } | null;
  content: { title?: string; summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;
  week: number | null;
  estimated_time: number | null;
  status: string | null;
  interacted: boolean;
  author?: { name: string; avatar_url: string | null; level: number } | null;
}

export interface TodayPage {
  items: TodayFeedItem[];
  nextCursor: number;
  exhausted: boolean;
}

export type TodayInteraction = 'open' | 'click' | 'complete' | 'dismiss';

export const todayFeedApi = {
  list: (cursor = 0, limit = 10): Promise<TodayPage> =>
    portalApi.get('/api/portal/runtime/today', { params: { cursor, limit }, timeout: 15000 }).then((r) => r.data as TodayPage),
  interact: (cardRef: string, action: TodayInteraction): Promise<{ ok: true }> =>
    portalApi
      .post(`/api/portal/runtime/today/${encodeURIComponent(cardRef)}/interact`, { action })
      .then((r) => r.data),
};
