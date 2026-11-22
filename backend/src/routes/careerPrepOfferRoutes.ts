import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireCareerPrep } from './careerPrepRoutes';
import { logFailure, sendValidated } from './campusRoutes';
import { candidateOffer, respondToOffer, type CandidateOffer } from '../services/placement/offerService';
import { candidateOffers } from '../services/placement/offerStore';

/**
 * Career Prep v27, CP10.4 (kit F7): the learner's own offers, for the Offers sheet.
 *
 *   GET  /api/portal/career-prep/offers                          the caller's OWN offers (current versions), newest first
 *   POST /api/portal/career-prep/offers/:groupId/accept          body { version }: accept the version the learner saw
 *   POST /api/portal/career-prep/offers/:groupId/decline         body { version }
 *   POST /api/portal/career-prep/offers/:groupId/talk-first      body { version }: "Talk to my recruiter first"
 *
 * Behind the same two gates as every Career Prep route (a participant session, Career Prep on for that enrollment; 404
 * otherwise). The enrollment comes only from the token. The candidate shape is offerService.candidateOffer: the pay,
 * never the fee, the rate or the invoice (the fee is the employer's; the declared shape below is strict, so an extra
 * field fails loud in development). Answers go through offerService.respondToOffer under the offer group's row lock:
 *   accept twice (a double click, a retry, two tabs)   200 both times, ONE invoice record (offer_id UNIQUE)
 *   another learner's offer, or no such offer           404
 *   the employer changed the offer since it was shown   409 stale, with the current version, so the learner re-reads it
 *   already accepted, declined or withdrawn             409 final, with the current version
 * Nothing here emails or bills anyone: an acceptance writes the invoice RECORD only (staff send invoices, CP11).
 * Failure: a database error is an honest 500 with nothing changed (the answer is one transaction). Mounted through
 * boot/placementBoot.ts.
 */
const STATUS = z.enum(['sent', 'accepted', 'declined', 'talk_first', 'withdrawn']);
const cents = z.number().int().positive().nullable();
export const CandidateOfferShape = z.object({
  id: z.string(), groupId: z.string(), version: z.number().int().positive(), company: z.string(), role: z.string(),
  payBasis: z.enum(['yearly', 'hourly']), salaryCents: cents, hourlyRateCents: cents, hoursPerWeek: z.number().positive().nullable(),
  startDate: z.string().nullable(), respondBy: z.string().datetime().nullable(), status: STATUS,
}).strict();
export const CandidateOffersResponse = z.object({ offers: z.array(CandidateOfferShape) }).strict();
export const CandidateAnswerResponse = z.object({ offer: CandidateOfferShape, replay: z.boolean() }).strict();
export const CandidateConflictResponse = z.object({ error: z.string(), reason: z.enum(['stale', 'final']), offer: CandidateOfferShape.nullable() }).strict();

const NoQuery = z.object({}).strict();
const Params = z.object({ groupId: z.string().uuid(), decision: z.enum(['accept', 'decline', 'talk-first']) }).strict();
const Body = z.object({ version: z.number().int().positive().max(10_000) }).strict();
const DECISION = { accept: 'accept', decline: 'decline', 'talk-first': 'talk_first' } as const;
const CONFLICT = {
  stale: 'The employer updated this offer after you opened it. Read the new details before you answer.',
  final: 'This offer was already answered or withdrawn, so it cannot change now.',
} as const;

async function ownOffers(enrollmentId: string): Promise<CandidateOffer[]> {
  return (await candidateOffers(enrollmentId)).map(candidateOffer);
}

export async function listOffersRoute(req: Request, res: Response): Promise<void> {
  if (!NoQuery.safeParse(req.query).success) { res.status(400).json({ error: 'This list takes no parameters.' }); return; }
  try {
    sendValidated(res, CandidateOffersResponse, { offers: await ownOffers(req.participant!.sub) }, 'career_prep_offers');
  } catch (err) {
    logFailure('career_prep_offers_failed', err);
    res.status(500).json({ error: 'Could not load your offers. Try again in a moment.' });
  }
}

export async function answerOfferRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  const b = Body.safeParse(req.body ?? {});
  if (!p.success || !b.success) { res.status(400).json({ error: 'Check the offer and try again.' }); return; }
  const me = req.participant!.sub;
  try {
    const out = await respondToOffer(me, p.data.groupId, b.data.version, DECISION[p.data.decision]);
    if (out.status === 'ok') { sendValidated(res, CandidateAnswerResponse, { offer: candidateOffer(out.offer), replay: out.replay }, 'career_prep_offer_answer'); return; }
    if (out.status === 'stale' || out.status === 'final') {
      const offer = (await ownOffers(me)).find((o) => o.groupId === p.data.groupId) ?? null;
      res.status(409);
      sendValidated(res, CandidateConflictResponse, { error: CONFLICT[out.status], reason: out.status, offer }, 'career_prep_offer_conflict');
      return;
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err) {
    logFailure('career_prep_offer_answer_failed', err);
    res.status(500).json({ error: 'Could not save your answer. Nothing changed. Try again in a moment.' });
  }
}

const router = Router();
router.get('/api/portal/career-prep/offers', requireParticipant, requireCareerPrep, listOffersRoute);
router.post('/api/portal/career-prep/offers/:groupId/:decision', requireParticipant, requireCareerPrep, answerOfferRoute);
export default router;
