import portalApi from '../../utils/portalApi';
import { runtimeApi } from '../../pages/portal/runtime/runtimeApi';
import { todayFeedApi } from '../../pages/portal/today/todayFeedApi';
import { emitCardCollected, emitPointsEarned } from '../../services/pointsFx';
import type { PlanStop } from './campusPlan';

/**
 * "Mark done" on a plan step (WP-2, the prototype's completePlan), through the SAME collect path Today uses
 * (TodayShell.collectCard), so the server applies the same gate and awards the same points:
 *   blog:<id>                 -> the read gate (runtimeApi.blogCollect)
 *   podcast:/testimonial:<id> -> the listen/watch gate (runtimeApi.mediaCollect)
 *   a curriculum card         -> the card's own completion gate (POST /classroom/cards/:id/complete)
 * Then, best effort, the plan's own impression is marked complete (todayFeedApi.interact only records it; it awards nothing).
 *
 * Failure: the server's refusal (422: watch 75% first, read for 2 minutes, ...) is returned as `refused` with its message, so the
 * card can say why; nothing is marked done. Any other error is `failed`. There is no retry: the learner presses again.
 */
export type CompleteResult = { ok: true; points: number } | { ok: false; reason: 'refused' | 'failed'; message: string };

const media = (ref: string): { kind: 'podcast' | 'testimonial'; id: string } | null => {
  const m = /^(podcast|testimonial):(.+)$/.exec(ref);
  return m ? { kind: m[1] as 'podcast' | 'testimonial', id: m[2] } : null;
};

function messageOf(e: unknown): { status: number | null; message: string } {
  const r = (e as { response?: { status?: number; data?: { message?: string; error?: string } } }).response;
  return { status: r?.status ?? null, message: r?.data?.message || r?.data?.error || 'That did not go through. Try again.' };
}

export async function completeStop(stop: Pick<PlanStop, 'ref' | 'cardId'>): Promise<CompleteResult> {
  const ref = stop.ref ?? '';
  try {
    let res: { points_awarded?: number } | null;
    const m = media(ref);
    if (ref.startsWith('blog:')) res = await runtimeApi.blogCollect(ref.slice('blog:'.length));
    else if (m) res = await runtimeApi.mediaCollect(m.kind, m.id);
    else if (stop.cardId) res = (await portalApi.post(`/api/portal/classroom/cards/${stop.cardId}/complete`)).data;
    else return { ok: false, reason: 'failed', message: 'This step is done where it opens.' };
    const points = res?.points_awarded ?? 0;
    emitPointsEarned(points);
    if (stop.cardId) emitCardCollected(stop.cardId);
    // Records the impression only; never blocks the result, but a failure is logged.
    if (ref) todayFeedApi.interact(ref, 'complete').catch((e) => console.warn(JSON.stringify({ event: 'campus_plan_interact_failed', error_class: (e as Error)?.name ?? 'Error', ref })));
    return { ok: true, points };
  } catch (e) {
    const { status, message } = messageOf(e);
    return { ok: false, reason: status === 422 ? 'refused' : 'failed', message };
  }
}
