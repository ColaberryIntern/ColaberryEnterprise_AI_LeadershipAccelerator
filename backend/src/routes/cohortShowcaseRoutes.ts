import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireContentEntitlement } from '../middlewares/requireContentEntitlement';
import { getCohortSharedFile, getCohortSharedPiece, listCohortShowcase } from '../services/career/sharedWork';
import { logFailure, sendArtifactFile, sendCsvXlsx, sendOfficePreview } from './artifactFileResponses';

/**
 * The Showcase (C138, phase 4 of the approved C127 design): work the caller's CLASSMATES chose to share with their cohort, and a
 * read-only page for each shared piece.
 *
 * Same two gates as My work, in the same order: requireParticipant (401, and 403 for staff tokens), then
 * requireContentEntitlement('portfolio') (402), because the Showcase sits in the Showcase Gallery building with the portfolio.
 *
 * WHO SEES WHAT is decided in sharedWork.ts, never here and never in the browser: the viewer is the token's enrollment, their
 * cohort is read from enrollments, and only pieces shared by learners in that cohort come back (Ali, 11 Nov 2026: own cohort
 * only). Every piece that is not visible (another cohort, unshared, deleted, made up) answers the SAME 404 body, so a classmate
 * cannot tell which ids exist. Every route is a GET; sharing is PUT /api/portal/career/work/:id/share in myWorkRoutes.
 */
const router = Router();
const P = '/api/portal/career/showcase';
const gates = [requireParticipant, requireContentEntitlement('portfolio')];
const Params = z.object({ id: z.string().uuid() });
const eid = (req: Request): string => req.participant!.sub;
export const SHOWCASE_NOT_FOUND = { error: 'Not found' };

function pieceId(req: Request, res: Response): string | null {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Piece id must be a UUID.' }); return null; }
  return parsed.data.id;
}

router.get(P, ...gates, async (req: Request, res: Response) => {
  try {
    const showcase = await listCohortShowcase(eid(req));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(showcase);
  } catch (err) {
    logFailure('cohort_showcase_list_failed', err);
    res.status(500).json({ error: 'Could not load the Showcase.' });
  }
});

router.get(`${P}/:id`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const piece = await getCohortSharedPiece(eid(req), id);
    if (!piece) { res.status(404).json(SHOWCASE_NOT_FOUND); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ piece });
  } catch (err) {
    logFailure('cohort_showcase_piece_failed', err, { id });
    res.status(500).json({ error: 'Could not load this piece.' });
  }
});

router.get(`${P}/:id/file`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const hit = await getCohortSharedFile(eid(req), id);
    if (!hit) { res.status(404).json(SHOWCASE_NOT_FOUND); return; }
    sendArtifactFile(req, res, hit.file, 'cohort_showcase_file_stream_failed', id);
  } catch (err) {
    logFailure('cohort_showcase_file_failed', err, { id });
    res.status(500).json({ error: 'Could not load this file.' });
  }
});

router.get(`${P}/:id/preview`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const hit = await getCohortSharedFile(eid(req), id);
    if (!hit) { res.status(404).json(SHOWCASE_NOT_FOUND); return; }
    await sendOfficePreview(res, hit.file);
  } catch (err) {
    logFailure('cohort_showcase_preview_failed', err, { id });
    res.status(500).json({ error: 'Could not preview this document.' });
  }
});

router.get(`${P}/:id/xlsx`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const piece = await getCohortSharedPiece(eid(req), id);
    if (!piece) { res.status(404).json(SHOWCASE_NOT_FOUND); return; }
    await sendCsvXlsx(res, piece.file);
  } catch (err) {
    logFailure('cohort_showcase_xlsx_failed', err, { id });
    res.status(500).json({ error: 'Could not build the Excel file.' });
  }
});

export default router;
