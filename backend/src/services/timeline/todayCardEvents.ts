import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureTodayCardEventsSchema } from '../../db/ensureTodayCardEventsSchema';

/**
 * Record what a learner saw on Today and where they opened a card from (C107, C98 recommendation 3). Written by
 * POST /api/portal/runtime/today/events (seen cards, banner opens) and by the feed's own open
 * (POST /api/portal/runtime/today/:cardRef/interact).
 *
 * NEVER AFFECTS THE PAGE. This is measurement: every error is logged with an error_class and swallowed, so the caller
 * answers the same whether or not the row was written. Only the first occurrence of each (ref, event, source) per
 * learner is kept (ON CONFLICT DO NOTHING), so a replayed or repeated batch changes nothing.
 */
export type TodayCardEventKind = 'seen' | 'open';
export type TodayCardEventSource = 'feed' | 'banner';
export interface TodayCardEvent { ref: string; event: TodayCardEventKind; source: TodayCardEventSource }

/** The most events one call writes. The route enforces the same bound on input. */
export const MAX_EVENTS_PER_CALL = 30;

/** Never throws. Returns how many distinct events were sent to the database (0 on failure or empty input). */
export async function recordTodayCardEvents(enrollmentId: string, events: TodayCardEvent[]): Promise<number> {
  const unique = new Map<string, TodayCardEvent>();
  for (const e of events.slice(0, MAX_EVENTS_PER_CALL)) unique.set(`${e.ref}|${e.event}|${e.source}`, e);
  const rows = [...unique.values()];
  if (!rows.length) return 0;
  try {
    await ensureTodayCardEventsSchema();
    const replacements: Record<string, string> = { eid: enrollmentId };
    const values = rows.map((e, i) => {
      replacements[`r${i}`] = e.ref;
      replacements[`e${i}`] = e.event;
      replacements[`s${i}`] = e.source;
      return `(:eid, :r${i}, :e${i}, :s${i})`;
    });
    await sequelize.query(
      `INSERT INTO today_card_events (enrollment_id, ref, event, source) VALUES ${values.join(', ')}
       ON CONFLICT (enrollment_id, ref, event, source) DO NOTHING`,
      { replacements, type: QueryTypes.INSERT },
    );
    return rows.length;
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'today_card_events_record_failed', outcome: 'failure',
      error_class: e?.name || 'TodayCardEventError',
      context: { enrollment_id: enrollmentId, count: rows.length, message: String(e?.message || err).slice(0, 200) },
    }));
    return 0;
  }
}
