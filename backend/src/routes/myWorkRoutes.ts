import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireContentEntitlement } from '../middlewares/requireContentEntitlement';
import { getMyWorkFile, getMyWorkPiece, listMyWork } from '../services/myWork/myWorkService';
import { featureStatus, liveFeaturedIds, MAX_FEATURED, setFeatured } from '../services/career/featuredWork';
import { setShared, sharedIds, shareStatus } from '../services/career/sharedWork';
import { logFailure, sendArtifactFile, sendCsvXlsx, sendOfficePreview } from './artifactFileResponses';

/**
 * My work (C128, phase 1 of the approved C127 Portfolio and Showcase Gallery design): the learner's
 * OWN pieces of work, every one, and each piece's own viewer.
 *
 * Same two gates as the rest of the Career Studio (careerPortfolioRoutes.ts), in the same order:
 *   requireParticipant        who are you (401)
 *   requireContentEntitlement may you open the portfolio (402)
 *
 * The subject is ALWAYS the caller (`req.participant.sub`). No route takes an enrollment id, so
 * reading someone else's work is not expressible in the URL; the piece id is checked against that
 * enrollment in the query, and any piece that is not the caller's answers 404, the same as one that
 * does not exist, so the id space cannot be probed.
 *
 * Nothing here publishes. The one write (PUT /:id/feature, C130) changes the learner's LIVE featured set only, which shows on
 * their own Preview; a stranger sees a featured piece only after a reviewer approves the page (Ali, 11 Nov 2026: "After review").
 * The other write (PUT /:id/share, C138) shares a piece with the learner's own cohort in the Showcase; it is a separate switch.
 * Every other route is a GET. Deliberately NOT gated on the
 * resume prerequisite the profile uses: that gate decides what CAREER evidence is assembled for a
 * page others may see, and this is the learner looking at their own submissions.
 */
const router = Router();
const P = '/api/portal/career/work';
const gates = [requireParticipant, requireContentEntitlement('portfolio')];
const Params = z.object({ id: z.string().uuid() });
const eid = (req: Request): string => req.participant!.sub;

/** Parse the id or answer 400; null means the response is already sent. */
function pieceId(req: Request, res: Response): string | null {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Piece id must be a UUID.' }); return null; }
  return parsed.data.id;
}
const NOT_FOUND = { error: 'No piece of yours with that id.' };

router.get(P, ...gates, async (req: Request, res: Response) => {
  try {
    const [list, featured, shared] = await Promise.all([listMyWork(eid(req)), liveFeaturedIds(eid(req)), sharedIds(eid(req))]);
    const on = new Set(featured);
    const sh = new Set(shared);
    const items = list.map((it) => ({ ...it, featured: on.has(it.id), shared: sh.has(it.id) }));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ items });
  } catch (err) {
    logFailure('my_work_list_failed', err);
    res.status(500).json({ error: 'Could not load your work.' });
  }
});

router.get(`${P}/:id`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const piece = await getMyWorkPiece(eid(req), id);
    if (!piece) { res.status(404).json(NOT_FOUND); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    const [feature, share] = await Promise.all([featureStatus(eid(req), id), shareStatus(eid(req), id)]);
    res.json({ ...piece, feature, share });
  } catch (err) {
    logFailure('my_work_piece_failed', err, { id });
    res.status(500).json({ error: 'Could not load this piece.' });
  }
});

router.get(`${P}/:id/file`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const file = await getMyWorkFile(eid(req), id);
    if (!file) { res.status(404).json(NOT_FOUND); return; }
    sendArtifactFile(req, res, file, 'my_work_file_stream_failed', id);
  } catch (err) {
    logFailure('my_work_file_failed', err, { id });
    res.status(500).json({ error: 'Could not load this file.' });
  }
});

router.get(`${P}/:id/preview`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const file = await getMyWorkFile(eid(req), id);
    if (!file) { res.status(404).json(NOT_FOUND); return; }
    await sendOfficePreview(res, file);
  } catch (err) {
    logFailure('my_work_preview_failed', err, { id });
    res.status(500).json({ error: 'Could not preview this document.' });
  }
});

router.get(`${P}/:id/xlsx`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  try {
    const piece = await getMyWorkPiece(eid(req), id);
    if (!piece) { res.status(404).json(NOT_FOUND); return; }
    await sendCsvXlsx(res, piece.file);
  } catch (err) {
    logFailure('my_work_xlsx_failed', err, { id });
    res.status(500).json({ error: 'Could not build the Excel file.' });
  }
});

const FeatureBody = z.object({ featured: z.boolean() }).strict();

/**
 * Feature or unfeature one of the caller's own pieces (C130). Idempotent: the same call twice is the same end state. 404 for a piece
 * that is not theirs; 409 past the cap. requireParticipant already refuses this write in read-only view-as.
 */
router.put(`${P}/:id/feature`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  const body = FeatureBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Send { featured: true } or { featured: false }.' }); return; }
  try {
    const r = await setFeatured(eid(req), id, body.data.featured);
    if (r === 'not_found') { res.status(404).json(NOT_FOUND); return; }
    if (r === 'limit') { res.status(409).json({ error: `You can feature up to ${MAX_FEATURED} pieces. Unfeature one first.` }); return; }
    res.json({ ...r, ...(await featureStatus(eid(req), id)) });
  } catch (err) {
    logFailure('my_work_feature_failed', err, { id });
    res.status(500).json({ error: 'Could not change this piece.' });
  }
});

const ShareBody = z.object({ shared: z.boolean() }).strict();

/**
 * Share or unshare one of the caller's own pieces with their cohort in the Showcase (C138). Its own switch: it never touches the
 * featured set (C127 decision Q1 A). Idempotent; 404 for a piece that is not theirs; refused in read-only view-as (requireParticipant).
 */
router.put(`${P}/:id/share`, ...gates, async (req: Request, res: Response) => {
  const id = pieceId(req, res);
  if (!id) return;
  const body = ShareBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Send { shared: true } or { shared: false }.' }); return; }
  try {
    const r = await setShared(eid(req), id, body.data.shared);
    if (r === 'not_found') { res.status(404).json(NOT_FOUND); return; }
    res.json(r);
  } catch (err) {
    logFailure('my_work_share_failed', err, { id });
    res.status(500).json({ error: 'Could not change this piece.' });
  }
});

export default router;
