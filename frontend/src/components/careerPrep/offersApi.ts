import portalApi from '../../utils/portalApi';

/**
 * Career Prep v27, CP10.4 (kit F7): the signed-in student's own offers (backend routes/careerPrepOfferRoutes.ts). The
 * server sends the pay and the dates, nothing the employer pays us: the shape below is all there is. An answer names
 * the version the student read; if the employer changed the offer since, the server answers 409 with the current
 * version and the sheet shows it instead (OfferConflict).
 */
export type OfferStatus = 'sent' | 'accepted' | 'declined' | 'talk_first' | 'withdrawn';
export type OfferDecision = 'accept' | 'decline' | 'talk-first';
export interface CandidateOffer {
  id: string; groupId: string; version: number; company: string; role: string; payBasis: 'yearly' | 'hourly';
  salaryCents: number | null; hourlyRateCents: number | null; hoursPerWeek: number | null; startDate: string | null; respondBy: string | null; status: OfferStatus;
}
export type AnswerResult = { ok: true; offer: CandidateOffer } | { ok: false; message: string; offer: CandidateOffer | null };

/** A body without the list (a proxy page, an older server) is a failed load, never "no offers". */
export async function fetchOffersApi(): Promise<CandidateOffer[]> {
  const offers = (await portalApi.get('/api/portal/career-prep/offers')).data?.offers;
  if (!Array.isArray(offers)) throw new Error('ContractViolation: the offers list is missing');
  return offers;
}

/** A 409 (stale or already final) is an answer, not a failure: it carries the server's words and the current offer. */
export async function answerOfferApi(o: CandidateOffer, decision: OfferDecision): Promise<AnswerResult> {
  try {
    const r = await portalApi.post(`/api/portal/career-prep/offers/${encodeURIComponent(o.groupId)}/${decision}`, { version: o.version });
    return { ok: true, offer: r.data.offer };
  } catch (err) {
    const res = (err as { response?: { status?: number; data?: { error?: string; offer?: CandidateOffer | null } } }).response;
    if (res?.status === 409 && res.data?.error) return { ok: false, message: res.data.error, offer: res.data.offer ?? null };
    throw err;
  }
}
