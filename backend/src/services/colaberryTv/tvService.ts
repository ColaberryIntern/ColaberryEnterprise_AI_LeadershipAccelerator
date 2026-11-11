import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureColaberryTvSchema } from '../../db/ensureColaberryTvSchema';
import { fetchShortTitle } from './tvOembed';
import { nextPositions, toViewerList, type TvAudience, type TvVideo, type TvVideoRow, type TvViewer } from './tvModel';

/**
 * Colaberry TV playlist (Campus v20 N3, Basecamp C134). Raw SQL because there is no model for these two additive tables; every
 * result is typed here. Every write runs in one transaction with its audit row, so a change and its record land together or not
 * at all. `actor` is who did it ("enrollment:<id>" from the campus, "admin:<email>" from the admin console).
 *
 * IDEMPOTENT: adding a link already on the playlist returns the existing row and writes nothing (no duplicate, no audit row);
 * removing an id that is gone is 'not_found'; reordering to the current order rewrites the same positions.
 */
const COLS = 'id, youtube_id, title, duration_s, audience, on_air, position, created_at';

async function rows(t?: Transaction): Promise<TvVideoRow[]> {
  return sequelize.query<TvVideoRow>(`SELECT ${COLS} FROM colaberry_tv_videos ORDER BY position ASC, created_at ASC`,
    { type: QueryTypes.SELECT, transaction: t });
}

async function audit(t: Transaction, actor: string, action: string, row: { id: string | null; youtube_id: string | null }, detail: Record<string, unknown> = {}): Promise<void> {
  await sequelize.query(
    'INSERT INTO colaberry_tv_audit (video_id, youtube_id, action, actor, detail) VALUES (:video_id, :youtube_id, :action, :actor, CAST(:detail AS JSONB))',
    { replacements: { video_id: row.id, youtube_id: row.youtube_id, action, actor, detail: JSON.stringify(detail) }, transaction: t });
}

let titlesFilled = false;
/** Once per process: fill NULL titles from oEmbed (the seed's nine). Best effort, sequential, each call bounded by its timeout. */
async function fillMissingTitles(list: TvVideoRow[]): Promise<void> {
  if (titlesFilled) return;
  titlesFilled = true;
  for (const r of list.filter((x) => !x.title)) {
    const title = await fetchShortTitle(r.youtube_id);
    if (!title) continue;
    await sequelize.query('UPDATE colaberry_tv_videos SET title = :title, updated_at = NOW() WHERE id = :id AND title IS NULL',
      { replacements: { title, id: r.id } });
    r.title = title;
  }
}

export async function listAll(): Promise<TvVideoRow[]> {
  await ensureColaberryTvSchema();
  const list = await rows();
  await fillMissingTitles(list).catch((err) => {
    console.warn(JSON.stringify({ level: 'warn', service: 'colaberry-tv', event: 'colaberry_tv_title_fill_failed', outcome: 'failure',
      error_class: (err as Error)?.name || 'Error' }));
  });
  return list;
}

export async function listForViewer(viewer: TvViewer): Promise<TvVideo[]> {
  return toViewerList(await listAll(), viewer);
}

export async function addShort(youtubeId: string, actor: string): Promise<{ row: TvVideoRow; created: boolean }> {
  await ensureColaberryTvSchema();
  const existing = (await rows()).find((r) => r.youtube_id === youtubeId);
  if (existing) return { row: existing, created: false };
  const title = await fetchShortTitle(youtubeId);
  return sequelize.transaction(async (t) => {
    const inserted = await sequelize.query<TvVideoRow>(
      `INSERT INTO colaberry_tv_videos (youtube_id, title, position)
       VALUES (:youtubeId, :title, (SELECT COALESCE(MAX(position), 0) + 1 FROM colaberry_tv_videos))
       ON CONFLICT (youtube_id) DO NOTHING RETURNING ${COLS}`,
      { replacements: { youtubeId, title }, type: QueryTypes.SELECT, transaction: t });
    if (!inserted.length) {
      const again = (await rows(t)).find((r) => r.youtube_id === youtubeId)!;
      return { row: again, created: false };
    }
    await audit(t, actor, 'add', inserted[0], { title });
    return { row: inserted[0], created: true };
  });
}

export interface TvUpdate { title?: string; audience?: TvAudience; on_air?: boolean }

export async function updateShort(id: string, patch: TvUpdate, actor: string): Promise<TvVideoRow | 'not_found'> {
  await ensureColaberryTvSchema();
  return sequelize.transaction(async (t) => {
    const updated = await sequelize.query<TvVideoRow>(
      `UPDATE colaberry_tv_videos SET
         title = COALESCE(:title, title), audience = COALESCE(:audience, audience), on_air = COALESCE(:on_air, on_air), updated_at = NOW()
       WHERE id = :id RETURNING ${COLS}`,
      { replacements: { id, title: patch.title ?? null, audience: patch.audience ?? null, on_air: patch.on_air ?? null },
        type: QueryTypes.SELECT, transaction: t });
    if (!updated.length) return 'not_found';
    await audit(t, actor, 'update', updated[0], { ...patch });
    return updated[0];
  });
}

/** `ids` must be exactly the playlist's ids (every short once): a partial or stale order is 'mismatch' and changes nothing. */
export async function reorderShorts(ids: string[], actor: string): Promise<TvVideoRow[] | 'mismatch'> {
  await ensureColaberryTvSchema();
  return sequelize.transaction(async (t) => {
    const current = await rows(t);
    const known = new Set(current.map((r) => r.id));
    if (ids.length !== current.length || ids.some((x) => !known.has(x))) return 'mismatch';
    for (const { id, position } of nextPositions(ids)) {
      await sequelize.query('UPDATE colaberry_tv_videos SET position = :pos, updated_at = NOW() WHERE id = :id',
        { replacements: { pos: position, id }, transaction: t });
    }
    await audit(t, actor, 'reorder', { id: null, youtube_id: null }, { ids });
    return rows(t);
  });
}

export async function removeShort(id: string, actor: string): Promise<'removed' | 'not_found'> {
  await ensureColaberryTvSchema();
  return sequelize.transaction(async (t) => {
    const gone = await sequelize.query<TvVideoRow>(`DELETE FROM colaberry_tv_videos WHERE id = :id RETURNING ${COLS}`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction: t });
    if (!gone.length) return 'not_found';
    await audit(t, actor, 'remove', gone[0], { title: gone[0].title });
    return 'removed';
  });
}

/** Test seam. */
export function __resetTitleFillForTests(): void { titlesFilled = false; }
