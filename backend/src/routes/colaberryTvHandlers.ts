import type { Request, Response } from 'express';
import { classifyError } from '../utils/errorClassifier';
import { AddBody, IdParam, OrderBody, UpdateBody, parseYoutubeId, type TvVideoRow } from '../services/colaberryTv/tvModel';

/**
 * The Colaberry TV playlist handlers, shared by the campus (/api/portal/colaberry-tv/manage, participant token + `campaigns`
 * section) and the admin console (/api/admin/colaberry-tv, requireSection('campaigns')). Each one validates before it reads,
 * returns the whole playlist after a change (so the manager and the open TV redraw from one answer), and never leaks a stack.
 * The service is loaded lazily, as the campus routes do, so importing this file never opens the database.
 */
type Handler = (req: Request, res: Response, actor: string) => Promise<void>;

const svc = () => import('../services/colaberryTv/tvService');

function bad(res: Response, error: string): void { res.status(400).json({ error, error_class: 'ValidationFailed' }); }

function fail(res: Response, event: string, err: unknown): void {
  const error_class = classifyError(err);
  console.error(JSON.stringify({ level: 'error', service: 'colaberry-tv', event, outcome: 'failure', error_class, message: (err as Error)?.message?.slice(0, 200) ?? null }));
  res.status(500).json({ error: 'Colaberry TV is unavailable right now', error_class });
}

export interface ManageVideo { id: string; youtube_id: string; title: string | null; duration_s: number | null; audience: string; on_air: boolean; position: number }
export function toManageList(rows: TvVideoRow[]): ManageVideo[] {
  return rows.map((r) => ({ id: r.id, youtube_id: r.youtube_id, title: r.title, duration_s: r.duration_s, audience: r.audience, on_air: r.on_air, position: r.position }));
}

async function playlist(res: Response, status = 200, extra: Record<string, unknown> = {}): Promise<void> {
  res.status(status).json({ videos: toManageList(await (await svc()).listAll()), ...extra });
}

export const manageHandlers: Record<'list' | 'add' | 'update' | 'order' | 'remove', Handler> = {
  async list(_req, res) {
    try { await playlist(res); } catch (err) { fail(res, 'colaberry_tv_manage_list_failed', err); }
  },
  async add(req, res, actor) {
    const parsed = AddBody.safeParse(req.body ?? {});
    if (!parsed.success) { bad(res, 'Paste a YouTube or YouTube Shorts link'); return; }
    const id = parseYoutubeId(parsed.data.url);
    if (!id) { bad(res, 'That is not a YouTube link we can play'); return; }
    try {
      const { created } = await (await svc()).addShort(id, actor);
      await playlist(res, created ? 201 : 200, { created });
    } catch (err) { fail(res, 'colaberry_tv_add_failed', err); }
  },
  async update(req, res, actor) {
    const p = IdParam.safeParse(req.params ?? {});
    const b = UpdateBody.safeParse(req.body ?? {});
    if (!p.success || !b.success) { bad(res, 'Invalid change'); return; }
    try {
      const r = await (await svc()).updateShort(p.data.id, b.data, actor);
      if (r === 'not_found') { res.status(404).json({ error: 'That short is not on the playlist', error_class: 'NotFound' }); return; }
      await playlist(res);
    } catch (err) { fail(res, 'colaberry_tv_update_failed', err); }
  },
  async order(req, res, actor) {
    const b = OrderBody.safeParse(req.body ?? {});
    if (!b.success) { bad(res, 'Invalid order'); return; }
    try {
      const r = await (await svc()).reorderShorts(b.data.ids, actor);
      if (r === 'mismatch') { res.status(409).json({ error: 'The playlist changed. Reload and try again.', error_class: 'StaleOrder' }); return; }
      await playlist(res);
    } catch (err) { fail(res, 'colaberry_tv_reorder_failed', err); }
  },
  async remove(req, res, actor) {
    const p = IdParam.safeParse(req.params ?? {});
    if (!p.success) { bad(res, 'Invalid short'); return; }
    try {
      const r = await (await svc()).removeShort(p.data.id, actor);
      if (r === 'not_found') { res.status(404).json({ error: 'That short is not on the playlist', error_class: 'NotFound' }); return; }
      await playlist(res);
    } catch (err) { fail(res, 'colaberry_tv_remove_failed', err); }
  },
};

/** May this enrollment manage the TV? Their Management Portal sections include `campaigns`. FAIL CLOSED and logged. */
export async function canManageTv(enrollmentId: string): Promise<boolean> {
  try {
    const { getMgmtStatus } = await import('../services/access/mgmtBridgeService');
    const { sections } = await getMgmtStatus(enrollmentId);
    return Array.isArray(sections) && sections.includes('campaigns');
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', service: 'colaberry-tv', event: 'colaberry_tv_manager_lookup_failed', outcome: 'failure',
      error_class: classifyError(err) }));
    return false;
  }
}
