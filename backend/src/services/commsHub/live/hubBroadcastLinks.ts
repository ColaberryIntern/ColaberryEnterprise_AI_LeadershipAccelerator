import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { publicThumbnailPath } from '../thumbnails/thumbnailPaths';

/**
 * Hub event <-> broadcast occurrence links for members (CH5.3). A hub occurrence's source ref is
 * ('community_event', '<hub event id>@<Central date>') (CH5.1), so both directions are one join.
 * Both readers DEGRADE rather than fail: a card without a Watch button or a replay without its
 * picture is better than a page that does not load, and the failure is logged.
 */
function logPartial(event: string, err: unknown, n: number): void {
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'comms_hub', event, outcome: 'partial', error_class: e?.name || 'UnknownError', context: { count: n, message: String(e?.message ?? '').slice(0, 200) } }));
}

export interface HubOccurrenceState { occurrence_id: string; editorial_state: string; scheduled_start_at: Date | null }

/** The broadcast occurrences of these hub events, by event id (every date that was prepared). */
export async function occurrencesForEvents(eventIds: readonly string[]): Promise<Map<string, HubOccurrenceState[]>> {
  const out = new Map<string, HubOccurrenceState[]>();
  if (!eventIds.length) return out;
  try {
    const rows = await sequelize.query<HubOccurrenceState & { event_id: string }>(
      `SELECT split_part(r.source_id, '@', 1) AS event_id, o.id AS occurrence_id, o.editorial_state, o.scheduled_start_at
         FROM broadcast_source_refs r JOIN broadcast_occurrences o ON o.id = r.occurrence_id
        WHERE r.source_type = 'community_event' AND split_part(r.source_id, '@', 1) IN (:ids) AND position('@' in r.source_id) > 0`,
      { replacements: { ids: [...eventIds] }, type: QueryTypes.SELECT },
    );
    for (const r of rows) {
      const list = out.get(r.event_id) ?? [];
      list.push({ occurrence_id: r.occurrence_id, editorial_state: r.editorial_state, scheduled_start_at: r.scheduled_start_at ? new Date(r.scheduled_start_at) : null });
      out.set(r.event_id, list);
    }
  } catch (err) { logPartial('comms_hub_event_occurrences_failed', err, eventIds.length); }
  return out;
}

/** The chosen hub thumbnail for each of these occurrences that came from a hub event, by occurrence id. */
export async function hubThumbnailsForOccurrences(occurrenceIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!occurrenceIds.length) return out;
  try {
    const rows = await sequelize.query<{ occurrence_id: string; event_id: string; thumbnail_id: string }>(
      `SELECT r.occurrence_id, e.id AS event_id, e.thumbnail_id
         FROM broadcast_source_refs r JOIN comms_hub_events e ON e.id::text = split_part(r.source_id, '@', 1)
        WHERE r.source_type = 'community_event' AND position('@' in r.source_id) > 0
          AND r.occurrence_id IN (:ids) AND e.thumbnail_id IS NOT NULL`,
      { replacements: { ids: [...occurrenceIds] }, type: QueryTypes.SELECT },
    );
    for (const r of rows) out.set(r.occurrence_id, publicThumbnailPath(r.event_id, r.thumbnail_id));
  } catch (err) { logPartial('comms_hub_replay_thumbnails_failed', err, occurrenceIds.length); }
  return out;
}
