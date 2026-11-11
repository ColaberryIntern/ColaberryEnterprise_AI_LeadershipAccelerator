import { classifyError } from '../../utils/errorClassifier';

/**
 * The "Happening now" strip on Colaberry Now (Campus v20 N2, Basecamp C133). Five parts, each from real data and each FAIL-SOFT:
 * a part whose source fails is null (logged with its class) and the strip simply leaves that chip out. Nothing is ever filled in.
 *
 *   on_campus      people on campus now (fresh presence) and the busiest area (an area id the frontend names and walks to)
 *   next_event     the next public event (title, start, timezone)
 *   open_questions questions with no reply yet (the board's own count)
 *   latest_win     the newest Wins & builds post (id, title, first name of the author)
 *   shorts         on-air shorts this viewer's TV plays
 */
export interface Happening {
  on_campus: { count: number; busiest: string | null; busiest_count: number } | null;
  next_event: { id: string; title: string; starts_at: string; timezone: string } | null;
  open_questions: number | null;
  latest_win: { id: string; title: string; author: string } | null;
  shorts: number | null;
}

async function part<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', service: 'colaberry-now', event: 'colaberry_now_happening_part_failed', outcome: 'partial',
      error_class: classifyError(err), context: { part: name } }));
    return null;
  }
}

/** Pure: total people and the busiest named area (the Quad counts in the total, never as the busiest). */
export function campusPulse(areas: Record<string, { count: number } | undefined>): Happening['on_campus'] {
  let count = 0, busiest: string | null = null, busiestCount = 0;
  for (const [area, v] of Object.entries(areas)) {
    const n = v?.count ?? 0;
    count += n;
    if (area !== 'quad' && n > busiestCount) { busiest = area; busiestCount = n; }
  }
  return count > 0 ? { count, busiest, busiest_count: busiestCount } : null;
}

export async function getHappening(enrollmentId: string, cohortId: string | null, now = Date.now()): Promise<Happening> {
  const [presence, event, board, shorts] = await Promise.all([
    part('on_campus', async () => {
      const { getCampusPresence } = await import('../campus/campusPresenceService');
      return campusPulse((await getCampusPresence(enrollmentId, cohortId, new Date(now))).areas as Record<string, { count: number } | undefined>);
    }),
    part('next_event', async () => {
      const { getUpcomingPublicEvents } = await import('../publicEventsService');
      const next = (await getUpcomingPublicEvents(30, now)).filter((e) => new Date(e.starts_at).getTime() >= now)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
      return next ? { id: String(next.id), title: next.title, starts_at: new Date(next.starts_at).toISOString(), timezone: next.timezone } : null;
    }),
    part('board', async () => (await import('../community/boardStreamService')).boardHappening(enrollmentId)),
    part('shorts', async () => {
      const { campusAudienceFor } = await import('../campus/campusAudience');
      const { listForViewer } = await import('../colaberryTv/tvService');
      return (await listForViewer(await campusAudienceFor(enrollmentId))).length;
    }),
  ]);
  return {
    on_campus: presence ?? null,
    next_event: event ?? null,
    open_questions: board ? board.open_questions : null,
    latest_win: board ? board.latest_win : null,
    shorts: shorts ?? null,
  };
}
