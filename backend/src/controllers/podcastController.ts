import { Request, Response } from 'express';
import { Podcast } from '../models';
import { refreshPodcasts } from '../services/podcast/podcastIngestionService';

// Fields safe to expose to students on the portal (omits internal bookkeeping columns).
const PORTAL_ATTRIBUTES = [
  'id',
  'title',
  'slug',
  'website_url',
  'audio_url',
  'thumbnail_url',
  'description',
  'duration_seconds',
  'duration_label',
  'published_at',
  'featured',
];

const CATALOG_ORDER: [string, string][] = [
  ['featured', 'DESC'],
  ['published_at', 'DESC'],
];

/** GET /api/admin/podcasts — full catalog for the admin console / Experience Studio. */
export async function listPodcastsAdmin(_req: Request, res: Response): Promise<void> {
  const rows = await Podcast.findAll({ order: CATALOG_ORDER as any });
  res.json({ podcasts: rows, count: rows.length });
}

/** GET /api/portal/podcasts — active catalog for students. */
export async function listPodcastsPortal(_req: Request, res: Response): Promise<void> {
  const rows = await Podcast.findAll({
    where: { is_active: true },
    attributes: PORTAL_ATTRIBUTES,
    order: CATALOG_ORDER as any,
  });
  res.json({ podcasts: rows, count: rows.length });
}

/** POST /api/admin/podcasts/refresh — manually trigger a scrape (?dryRun=true to preview). */
export async function triggerPodcastRefresh(req: Request, res: Response): Promise<void> {
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
  try {
    const summary = await refreshPodcasts({ dryRun });
    res.json({ ok: true, summary });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || 'podcast refresh failed' });
  }
}
