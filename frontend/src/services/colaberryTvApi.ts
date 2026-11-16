import portalApi from '../utils/portalApi';
import type { TvShort } from '../components/campus/now/tvPlaylist';

/**
 * Colaberry TV's API (Campus v20 N3, Basecamp C134). Mirrors backend/src/routes/colaberryTvRoutes.ts; the backend is the
 * contract. Learners read the on-air list.
 *
 * TV-2, 2026-11-16: the write half of this client is GONE. TV-1 pointed the TV at the Colaberry Training library and sent the
 * Manage button to /admin/marketing/library, which left `getManaged`, `addShortLink`, `updateShort`, `reorderShorts`,
 * `removeShort` and `tvError` with no caller anywhere in the app - they existed only to serve the in-campus TvManager modal,
 * which is deleted in the same change. The /manage endpoints they called still exist on the backend and are removed separately;
 * see the TV-2 ticket for why that half is not in this commit.
 */
export interface TvList { videos: TvShort[]; can_manage: boolean }

const BASE = '/api/portal/colaberry-tv';

export async function getTv(): Promise<TvList> {
  const { data } = await portalApi.get<TvList>(BASE, { timeout: 15000 });
  return { videos: Array.isArray(data?.videos) ? data.videos : [], can_manage: data?.can_manage === true };
}
