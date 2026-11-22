import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logFailure, sendValidated } from './campusRoutes';
import { LINK_INVALID, redeemLink, REQUEST_LINK_RESPONSE, requestLink, requireHireClient, type ClientRequest } from '../services/placement/clientAuth';
import * as store from '../services/placement/clientStore';
import { candidateView, interviewView, offerView } from '../services/placement/clientView';
import { createOffer } from '../services/placement/offerService';
import type { Read } from '../services/placement/darkSwitches';

/**
 * Career Prep v27, CP10.2 (kit "Employer portal"): the employer portal's API. DARK behind hire_client_portal_enabled.
 *
 *   POST /api/hire/client/auth/request-link  { email }   ALWAYS 202 + one message (no enumeration; clientAuth.ts)
 *   POST /api/hire/client/auth/redeem        { token }   200 { token, expiresIn, clientName } or 401 one message
 *   GET  /api/hire/client/candidates                     the learners staff put forward to THIS client
 *   GET  /api/hire/client/candidates/:enrollmentId       one of them; anyone else's is 404 (never 403: no disclosure)
 *   GET  /api/hire/client/interviews                     this client's interviews (Join = the signed room PAGE, never the
 *                                                          provider's link; every answer passes the no-room-url scan in tests)
 *   GET  /api/hire/client/offers                         this client's current offer versions, with the fee and invoice status
 *   POST /api/hire/client/offers                         make an offer: the agreement box is required (400 without it); the
 *                                                          candidate must be put forward to this client (404); over-length
 *                                                          text is refused (400), never cut short. The fee is computed by
 *                                                          the server (feeCalculator via offerService), never taken from the page.
 * Every data route: requireHireClient (switch, session, member still present), scoped in SQL by the session's client.
 * Answers are never cached. Inputs: Zod, strict (unknown keys are 400).
 */
const NoQuery = z.object({}).strict();
const EnrollmentParam = z.object({ enrollmentId: z.string().uuid() }).strict();
const Pay = z.discriminatedUnion('basis', [
  z.object({ basis: z.literal('yearly'), salaryCents: z.number().int() }).strict(),
  z.object({ basis: z.literal('hourly'), rateCents: z.number().int(), hoursPerWeek: z.number() }).strict(),
]);
export const MakeOfferBody = z.object({
  clientKey: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  interviewId: z.string().uuid().nullable().optional(),
  role: z.string().trim().min(1, 'Enter the role title.').max(200, 'The role can be at most 200 characters.'),
  pay: Pay,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'The start date must be a date.').nullable().optional(),
  respondBy: z.string().datetime().nullable().optional(),
  agreed: z.literal(true, { error: 'Tick the box to agree to the placement fee before sending.' }),
  agreementTextVersion: z.string().trim().min(1).max(40),
}).strict();

const iso = z.string().datetime();
const Candidate = z.object({ enrollmentId: z.string().uuid(), name: z.string(), initials: z.string().max(2), putForwardAt: iso }).strict();
const Interview = z.object({ id: z.string().uuid(), enrollmentId: z.string().uuid(), candidateName: z.string(), company: z.string().nullable(), role: z.string().nullable(),
  status: z.enum(['not_booked', 'booked', 'held', 'cancelled']), startsAt: iso.nullable(), minutes: z.number().int().nullable(),
  joinPage: z.string().regex(/^https:\/\/[^/]+\/room\/\?i=[0-9a-f-]{36}&e=\d+&t=[A-Za-z0-9_-]{43}$/).nullable(), recorded: z.boolean() }).strict();
const Offer = z.object({ id: z.string().uuid(), groupId: z.string().uuid(), version: z.number().int().positive(), enrollmentId: z.string().uuid(), candidateName: z.string(),
  role: z.string(), payBasis: z.enum(['yearly', 'hourly']), salaryCents: z.number().int().nullable(), hourlyRateCents: z.number().int().nullable(),
  hoursPerWeek: z.number().nullable(), firstYearCents: z.number().int(), feeRateBp: z.number().int(), feeCents: z.number().int(), startDate: z.string().nullable(),
  respondBy: iso.nullable(), status: z.string(), invoiceStatus: z.enum(['not_invoiced', 'invoiced', 'paid']).nullable(), sentAt: iso }).strict();
export const CandidatesResponse = z.object({ candidates: z.array(Candidate) }).strict();
export const CandidateResponse = z.object({ candidate: Candidate }).strict();
export const InterviewsResponse = z.object({ interviews: z.array(Interview) }).strict();
export const OffersResponse = z.object({ offers: z.array(Offer) }).strict();
export const OfferResponse = z.object({ offer: Offer, replay: z.boolean() }).strict();

const NOT_FOUND = { error: 'Not found' };
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the offer and try again.';

type Handler = (req: ClientRequest, res: Response) => Promise<void>;

/** Every data route: a store or service failure is a logged 500 with one plain message, never a crash. */
const data = (event: string, run: Handler) => async (req: Request, res: Response): Promise<void> => {
  try { await run(req as ClientRequest, res); } catch (err) {
    logFailure(`hire_client_${event}_failed`, err);
    res.status(500).json({ error: 'Could not load this right now. Try again in a moment.' });
  }
};
const noQuery = (req: Request, res: Response): boolean => {
  if (NoQuery.safeParse(req.query).success) return true;
  res.status(400).json({ error: 'This takes no query parameters.' });
  return false;
};

const listCandidates: Handler = async (req, res) => {
  if (!noQuery(req, res)) return;
  sendValidated(res, CandidatesResponse, { candidates: (await store.clientCandidates(req.hireClient!.clientId)).map(candidateView) }, 'hire_client_candidates');
};
const oneCandidate: Handler = async (req, res) => {
  const p = EnrollmentParam.safeParse(req.params);
  if (!p.success) { res.status(404).json(NOT_FOUND); return; }
  if (!noQuery(req, res)) return;
  const row = await store.clientCandidate(req.hireClient!.clientId, p.data.enrollmentId);
  if (!row) { res.status(404).json(NOT_FOUND); return; }
  sendValidated(res, CandidateResponse, { candidate: candidateView(row) }, 'hire_client_candidate');
};
const listInterviews: Handler = async (req, res) => {
  if (!noQuery(req, res)) return;
  sendValidated(res, InterviewsResponse, { interviews: (await store.clientInterviews(req.hireClient!.clientId)).map(interviewView) }, 'hire_client_interviews');
};
const listOffers: Handler = async (req, res) => {
  if (!noQuery(req, res)) return;
  sendValidated(res, OffersResponse, { offers: (await store.clientOffers(req.hireClient!.clientId)).map(offerView) }, 'hire_client_offers');
};

/** Make an offer for a candidate put forward to THIS client; the fee is computed by the server, never read from the page. */
const makeOffer: Handler = async (req, res) => {
  const b = MakeOfferBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: firstIssue(b.error) }); return; }
  const s = req.hireClient!;
  const body = b.data;
  if (!(await store.clientCandidate(s.clientId, body.enrollmentId))) { res.status(404).json(NOT_FOUND); return; }
  if (body.interviewId && !(await store.clientInterviews(s.clientId, body.interviewId)).some((i) => i.enrollment_id === body.enrollmentId)) {
    res.status(404).json(NOT_FOUND); return;
  }
  const who = `hire_client_member:${s.memberId}`;
  const out = await createOffer({ enrollmentId: body.enrollmentId, interviewId: body.interviewId ?? null, clientId: s.clientId, company: s.clientName, role: body.role,
    pay: body.pay, startDate: body.startDate ?? null, respondBy: body.respondBy ?? null, feeAgreed: body.agreed, agreedBy: who,
    agreementTextVersion: body.agreementTextVersion, createdBy: who }, body.clientKey);
  if (out.status === 'invalid') { res.status(400).json({ error: out.reason }); return; }
  if (out.status !== 'ok') { res.status(404).json(NOT_FOUND); return; }
  // Re-read through THIS client's scope: a client key replayed from another client's offer finds nothing here (404).
  const row = (await store.clientOffers(s.clientId)).find((o) => o.id === out.offer.id);
  if (!row) { res.status(404).json(NOT_FOUND); return; }
  res.status(out.replay ? 200 : 201);
  sendValidated(res, OfferResponse, { offer: offerView(row), replay: out.replay }, 'hire_client_make_offer');
};

export function createHireClientRouter(opts: { read?: Read } = {}): Router {
  const r = Router();
  const guard = requireHireClient(opts.read);
  r.use('/api/hire/client', (_req: Request, res: Response, next: () => void) => { res.set('Cache-Control', 'no-store'); next(); });
  r.post('/api/hire/client/auth/request-link', async (req: Request, res: Response) => {
    await requestLink((req.body as { email?: unknown } | undefined)?.email, { read: opts.read });
    res.status(202).json({ message: REQUEST_LINK_RESPONSE });
  });
  r.post('/api/hire/client/auth/redeem', async (req: Request, res: Response) => {
    const out = await redeemLink((req.body as { token?: unknown } | undefined)?.token, { read: opts.read });
    if (!out.ok) { res.status(401).json({ error: LINK_INVALID }); return; }
    res.json({ token: out.token, expiresIn: out.expiresIn, clientName: out.clientName });
  });
  r.get('/api/hire/client/candidates', guard, data('candidates', listCandidates));
  r.get('/api/hire/client/candidates/:enrollmentId', guard, data('candidate', oneCandidate));
  r.get('/api/hire/client/interviews', guard, data('interviews', listInterviews));
  r.get('/api/hire/client/offers', guard, data('offers', listOffers));
  r.post('/api/hire/client/offers', guard, data('make_offer', makeOffer));
  return r;
}

export default createHireClientRouter();
