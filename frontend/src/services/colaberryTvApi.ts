import portalApi from '../utils/portalApi';
import type { TvShort } from '../components/campus/now/tvPlaylist';

/**
 * Colaberry TV's API (Campus v20 N3, Basecamp C134). Mirrors backend/src/routes/colaberryTvRoutes.ts; the backend is the
 * contract. Learners read the on-air list.
 *
 * TV-2: the write half of this client is GONE, and so is the backend it called. TV-1 pointed the TV at the Colaberry Training
 * library and sent the Manage button to /admin/marketing/library, which left `getManaged`, `addShortLink`, `updateShort`,
 * `reorderShorts`, `removeShort` and `tvError` with no caller anywhere in the app - they existed only to serve the in-campus
 * TvManager modal. Part 1 (2026-11-16) deleted them and the modal; part 2 removed the five /api/portal/colaberry-tv/manage
 * routes, the /api/admin/colaberry-tv router and the service writes behind both, so there is nothing left to call.
 */
export interface TvList { videos: TvShort[]; can_manage: boolean }

const BASE = '/api/portal/colaberry-tv';

export async function getTv(): Promise<TvList> {
  const { data } = await portalApi.get<TvList>(BASE, { timeout: 15000 });
  return { videos: Array.isArray(data?.videos) ? data.videos : [], can_manage: data?.can_manage === true };
}
