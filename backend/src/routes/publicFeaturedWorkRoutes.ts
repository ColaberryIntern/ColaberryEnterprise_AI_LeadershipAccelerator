import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPublicFeaturedFile, getPublicFeaturedPiece } from '../services/career/featuredWork';
import { logFailure, sendArtifactFile, sendCsvXlsx, sendOfficePreview } from './artifactFileResponses';

/**
 * A featured piece of work on a learner's PUBLIC portfolio page (C130, phase 3 of the approved C127 design):
 *   GET /api/public/portfolios/:slug/work/:id          the piece, in the public shape (no private status, no leftover data)
 *   GET /api/public/portfolios/:slug/work/:id/file     the uploaded file (PDF inline, everything else an attachment)
 *   GET /api/public/portfolios/:slug/work/:id/preview  a Word / PowerPoint file as HTML
 *   GET /api/public/portfolios/:slug/work/:id/xlsx     a CSV as Excel
 *
 * UNAUTHENTICATED BY DESIGN, like the page it sits on. The service answers only when the page is viewable, the id is in the set
 * a reviewer approved, and the piece's content still matches what was approved; everything else is the same 404 the page itself
 * uses ("Not found"), so a stranger cannot tell an unfeatured piece from someone else's, a changed one, or a made-up id.
 * noindex follows the page's own choice.
 */
const router = Router();
const P = '/api/public/portfolios/:slug/work/:id';
const Params = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,158}$/i), id: z.string().uuid() });
const NOT_FOUND = { error: 'Not found' };

function parse(req: Request, res: Response): { slug: string; id: string } | null {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(404).json(NOT_FOUND); return null; }
  return p.data;
}

router.get(P, async (req: Request, res: Response) => {
  const p = parse(req, res);
  if (!p) return;
  try {
    const hit = await getPublicFeaturedPiece(p.slug, p.id);
    if (!hit) { res.status(404).json(NOT_FOUND); return; }
    if (!hit.indexable) res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'public, max-age=120');
    res.json({ ok: true, piece: hit.piece });
  } catch (err) {
    logFailure('public_featured_piece_failed', err, { slug: p.slug, id: p.id });
    res.status(500).json({ error: 'Unable to load this piece' });
  }
});

router.get(`${P}/file`, async (req: Request, res: Response) => {
  const p = parse(req, res);
  if (!p) return;
  try {
    const hit = await getPublicFeaturedFile(p.slug, p.id);
    if (!hit) { res.status(404).json(NOT_FOUND); return; }
    res.set('X-Robots-Tag', 'noindex, nofollow');
    sendArtifactFile(req, res, hit.file, 'public_featured_file_stream_failed', p.id);
  } catch (err) {
    logFailure('public_featured_file_failed', err, { slug: p.slug, id: p.id });
    res.status(500).json({ error: 'Unable to load this file' });
  }
});

router.get(`${P}/preview`, async (req: Request, res: Response) => {
  const p = parse(req, res);
  if (!p) return;
  try {
    const hit = await getPublicFeaturedFile(p.slug, p.id);
    if (!hit) { res.status(404).json(NOT_FOUND); return; }
    await sendOfficePreview(res, hit.file);
  } catch (err) {
    logFailure('public_featured_preview_failed', err, { slug: p.slug, id: p.id });
    res.status(500).json({ error: 'Unable to preview this document' });
  }
});

router.get(`${P}/xlsx`, async (req: Request, res: Response) => {
  const p = parse(req, res);
  if (!p) return;
  try {
    const hit = await getPublicFeaturedPiece(p.slug, p.id);
    if (!hit) { res.status(404).json(NOT_FOUND); return; }
    await sendCsvXlsx(res, hit.piece.file);
  } catch (err) {
    logFailure('public_featured_xlsx_failed', err, { slug: p.slug, id: p.id });
    res.status(500).json({ error: 'Unable to build the Excel file' });
  }
});

export default router;
