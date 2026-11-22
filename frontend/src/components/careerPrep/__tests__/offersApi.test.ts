import portalApi from '../../../utils/portalApi';
import { answerOfferApi, fetchOffersApi, type CandidateOffer } from '../offersApi';

/** CP10.4: the offers client. A missing list is a failed load; a 409 is the server's answer, anything else a failure. */
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = portalApi.get as jest.Mock;
const post = portalApi.post as jest.Mock;
const o: CandidateOffer = { id: 'o-1', groupId: 'g/1', version: 3, company: 'Acme', role: 'Analyst', payBasis: 'yearly', salaryCents: 100_000_00, hourlyRateCents: null,
  hoursPerWeek: null, startDate: null, respondBy: null, status: 'sent' };

describe('offersApi (CP10.4)', () => {
  it('returns the list; a body without one throws instead of reading as no offers', async () => {
    get.mockResolvedValueOnce({ data: { offers: [o] } });
    expect(await fetchOffersApi()).toEqual([o]);
    get.mockResolvedValueOnce({ data: {} });
    await expect(fetchOffersApi()).rejects.toThrow('ContractViolation');
    get.mockResolvedValueOnce({ data: '<html>' });
    await expect(fetchOffersApi()).rejects.toThrow('ContractViolation');
  });
  it('posts the version read to the encoded group; 409 is an answer with the current offer; 500 throws', async () => {
    post.mockResolvedValueOnce({ data: { offer: { ...o, status: 'accepted' }, replay: false } });
    expect(await answerOfferApi(o, 'accept')).toEqual({ ok: true, offer: { ...o, status: 'accepted' } });
    expect(post).toHaveBeenCalledWith('/api/portal/career-prep/offers/g%2F1/accept', { version: 3 });
    post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Updated.', reason: 'stale', offer: { ...o, version: 4 } } } });
    expect(await answerOfferApi(o, 'decline')).toEqual({ ok: false, message: 'Updated.', offer: { ...o, version: 4 } });
    post.mockRejectedValueOnce({ response: { status: 500, data: { error: 'x' } } });
    await expect(answerOfferApi(o, 'talk-first')).rejects.toMatchObject({ response: { status: 500 } });
  });
});
