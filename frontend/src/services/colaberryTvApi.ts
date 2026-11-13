import portalApi from '../utils/portalApi';
import type { TvShort } from '../components/campus/now/tvPlaylist';

/**
 * Colaberry TV's API (Campus v20 N3, Basecamp C134). Mirrors backend/src/routes/colaberryTvRoutes.ts + colaberryTvHandlers.ts; the
 * backend is the contract. Learners read the on-air list; staff with Campaigns manage it from inside the campus.
 */
export interface TvList { videos: TvShort[]; can_manage: boolean }
export type TvAudience = 'all' | 'explorers' | 'members';
export interface ManagedShort { id: string; youtube_id: string; title: string | null; duration_s: number | null; audience: TvAudience; on_air: boolean; position: number }
export interface ManagedList { videos: ManagedShort[]; created?: boolean }

const BASE = '/api/portal/colaberry-tv';

export async function getTv(): Promise<TvList> {
  const { data } = await portalApi.get<TvList>(BASE, { timeout: 15000 });
  return { videos: Array.isArray(data?.videos) ? data.videos : [], can_manage: data?.can_manage === true };
}

export async function getManaged(): Promise<ManagedList> {
  return (await portalApi.get<ManagedList>(`${BASE}/manage`, { timeout: 15000 })).data;
}
export async function addShortLink(url: string): Promise<ManagedList> {
  return (await portalApi.post<ManagedList>(`${BASE}/manage`, { url }, { timeout: 20000 })).data;
}
export async function updateShort(id: string, patch: { title?: string; audience?: TvAudience; on_air?: boolean }): Promise<ManagedList> {
  return (await portalApi.patch<ManagedList>(`${BASE}/manage/${encodeURIComponent(id)}`, patch, { timeout: 15000 })).data;
}
export async function reorderShorts(ids: string[]): Promise<ManagedList> {
  return (await portalApi.put<ManagedList>(`${BASE}/manage/order`, { ids }, { timeout: 15000 })).data;
}
export async function removeShort(id: string): Promise<ManagedList> {
  return (await portalApi.delete<ManagedList>(`${BASE}/manage/${encodeURIComponent(id)}`, { timeout: 15000 })).data;
}

/** The server's own words for a failed change (validation, stale order), else a plain fallback. */
export function tvError(err: unknown, fallback = 'That did not save. Try again.'): string {
  const e = err as { response?: { data?: { error?: unknown } } };
  const m = e?.response?.data?.error;
  return typeof m === 'string' && m.trim() ? m : fallback;
}
