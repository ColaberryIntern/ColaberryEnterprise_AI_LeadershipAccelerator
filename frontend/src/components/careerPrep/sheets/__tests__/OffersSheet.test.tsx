import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { CandidateOffer } from '../../offersApi';
import { aboutAYear, NO_COST, OffersSheet, payText, startText, waitingLine } from '../OffersSheet';
import { OPEN_OFFERS_CARD, offerNotice } from '../../useOfferNotice';

/**
 * CP10.4 (kit F7): the #offers sheet shows the pay and three answers, never anything the employer pays; a stale or final
 * answer shows the server's words and the current version; a failed load is an alert, never an empty list.
 */
const mockFetch = jest.fn();
const mockAnswer = jest.fn();
jest.mock('../../offersApi', () => ({ fetchOffersApi: (...a: unknown[]) => mockFetch(...a), answerOfferApi: (...a: unknown[]) => mockAnswer(...a) }));

const acme: CandidateOffer = { id: 'o-1', groupId: 'g-1', version: 1, company: 'Acme', role: 'Data Analyst', payBasis: 'yearly', salaryCents: 10_500_000,
  hourlyRateCents: null, hoursPerWeek: null, startDate: '2026-12-07', respondBy: '2026-12-01T23:00:00.000Z', status: 'sent' };
const beta: CandidateOffer = { ...acme, id: 'o-2', groupId: 'g-2', company: 'Beta', role: 'Analyst', payBasis: 'hourly', salaryCents: null, hourlyRateCents: 5000,
  hoursPerWeek: 37.5, startDate: null, respondBy: null, status: 'talk_first' };

let host: HTMLDivElement | null = null;
let root: Root | null = null;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function mount(): Promise<HTMLDivElement> {
  const h = document.createElement('div'); document.body.appendChild(h);
  const r = createRoot(h); host = h; root = r;
  act(() => { r.render(<OffersSheet />); });
  await flush();
  return h;
}
const q = (h: HTMLElement, id: string) => h.querySelector(`[data-testid="${id}"]`);
const click = async (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); await flush(); };
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });
beforeEach(() => { mockFetch.mockReset(); mockAnswer.mockReset(); });

describe('the #offers sheet (CP10.4)', () => {
  it('pay, start, reply-by in Central, the Waiting on you line and "There\'s no cost to you."; never a fee', async () => {
    mockFetch.mockResolvedValue([acme, beta]);
    const h = await mount();
    expect(NO_COST).toBe("There's no cost to you.");
    expect(q(h, 'cp-offers-good-to-know')?.textContent).toBe("Good to knowThere's no cost to you. Employers pay Refactored.ai when they hire.");
    expect(q(h, 'cp-offer-year-o-1')).toBeNull(); // a salary needs no "About a year"
    expect(q(h, 'cp-offer-year-o-2')?.textContent).toBe('About a year: $97,500'); // $50.00 x 37.5 x 52
    expect(q(h, 'cp-offer-decline-o-1')?.className).toBe('cp-ghost cp-danger');
    expect(q(h, 'cp-offer-pay-o-1')?.textContent).toBe('$105,000 a year');
    expect(q(h, 'cp-offer-pay-o-2')?.textContent).toBe('$50.00 an hour, 37.5 hours a week');
    expect(q(h, 'cp-offer-o-1')?.textContent).toContain('Starts Mon, Dec 7, 2026');
    expect(q(h, 'cp-offer-o-1')?.textContent).toContain('Reply by Tue, Dec 1, 5:00 PM Central');
    expect(q(h, 'cp-offers-waiting')?.textContent).toBe('Waiting on you: 1 offer to answer, the first by Tue, Dec 1, 5:00 PM Central.');
    expect(q(h, 'cp-offer-status-o-2')?.textContent).toBe('Talking to your recruiter first');
    expect(h.textContent).not.toMatch(/\bfees?\b|invoice|placement charge/i);
  });

  it('three answers on a new offer; talk first is gone once asked; Accept asks once more, then sends the version read', async () => {
    mockFetch.mockResolvedValue([acme, beta]);
    const h = await mount();
    expect([...(q(h, 'cp-offer-actions-o-1')?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Accept', 'Talk to my recruiter first', 'Decline']);
    expect([...(q(h, 'cp-offer-actions-o-2')?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Accept', 'Decline']);
    await click(q(h, 'cp-offer-accept-o-1'));
    expect(mockAnswer).not.toHaveBeenCalled();
    expect(q(h, 'cp-offer-yes-o-1')?.textContent).toBe('Yes, accept the offer from Acme');
    mockAnswer.mockResolvedValue({ ok: true, offer: { ...acme, status: 'accepted' } });
    await click(q(h, 'cp-offer-yes-o-1'));
    expect(mockAnswer).toHaveBeenCalledWith(acme, 'accept');
    expect(q(h, 'cp-offer-status-o-1')?.textContent).toBe('Accepted');
    expect(q(h, 'cp-offer-actions-o-1')).toBeNull();
    expect(q(h, 'cp-offers-waiting')).toBeNull();
  });

  it('Not yet cancels a decline; talk first sends at once', async () => {
    mockFetch.mockResolvedValue([acme]);
    const h = await mount();
    await click(q(h, 'cp-offer-decline-o-1'));
    expect(mockAnswer).not.toHaveBeenCalled(); // Decline is behind the confirm step, and the confirmation is the danger button too
    expect([q(h, 'cp-offer-yes-o-1')?.textContent, q(h, 'cp-offer-yes-o-1')?.className]).toEqual(['Yes, decline the offer from Acme', 'cp-ghost cp-danger']);
    await click([...h.querySelectorAll('button')].find((b) => b.textContent === 'Not yet') ?? null);
    expect(mockAnswer).not.toHaveBeenCalled();
    mockAnswer.mockResolvedValue({ ok: true, offer: { ...acme, status: 'talk_first' } });
    await click(q(h, 'cp-offer-talk-o-1'));
    expect(mockAnswer).toHaveBeenCalledWith(acme, 'talk-first');
    expect(q(h, 'cp-offer-o-1')?.textContent).toContain('You asked to talk to your recruiter first.');
  });

  it('a stale answer shows the server\'s words and the NEW version in place of the old one', async () => {
    mockFetch.mockResolvedValue([acme]);
    const h = await mount();
    const v2 = { ...acme, id: 'o-1b', version: 2, salaryCents: 11_000_000 };
    mockAnswer.mockResolvedValue({ ok: false, message: 'The employer updated this offer after you opened it. Read the new details before you answer.', offer: v2 });
    await click(q(h, 'cp-offer-accept-o-1'));
    await click(q(h, 'cp-offer-yes-o-1'));
    expect(q(h, 'cp-offer-pay-o-1b')?.textContent).toBe('$110,000 a year');
    expect(q(h, 'cp-offer-note-o-1b')?.textContent).toContain('The employer updated this offer');
    expect(q(h, 'cp-offer-accept-o-1b')).not.toBeNull();
  });

  it('a failed answer says nothing changed; a failed load is an alert; no offers says so', async () => {
    mockFetch.mockResolvedValue([acme]);
    let h = await mount();
    mockAnswer.mockRejectedValue(new Error('network'));
    await click(q(h, 'cp-offer-talk-o-1'));
    expect(q(h, 'cp-offer-note-o-1')?.textContent).toBe('Could not save your answer. Nothing changed. Try again in a moment.');
    expect(q(h, 'cp-offer-status-o-1')?.textContent).toBe('Waiting on you');
    act(() => root?.unmount()); root = null; host?.remove();
    mockFetch.mockRejectedValue(new Error('500'));
    h = await mount();
    expect(q(h, 'cp-offers-failed')?.getAttribute('role')).toBe('alert');
    act(() => root?.unmount()); root = null; host?.remove();
    mockFetch.mockResolvedValue([]);
    h = await mount();
    expect(q(h, 'cp-offers-empty')).not.toBeNull();
  });
});

describe('pure parts', () => {
  it('aboutAYear: rate x hours x 52 for hourly only, from the pay fields', () => {
    expect(aboutAYear({ ...beta, hourlyRateCents: 4800, hoursPerWeek: 40 })).toBe('$99,840');
    expect(aboutAYear({ ...beta, hourlyRateCents: 2533, hoursPerWeek: 37.5 })).toBe('$49,394'); // 4,939,350 cents rounds to the dollar
    expect(aboutAYear(acme)).toBeNull();
    expect(aboutAYear({ ...beta, hoursPerWeek: null })).toBeNull();
  });
  it('payText, startText (the calendar day, never shifted) and waitingLine', () => {
    expect(payText({ ...beta, hourlyRateCents: 4250, hoursPerWeek: 40 })).toBe('$42.50 an hour, 40 hours a week');
    expect(startText('2027-01-01')).toBe('Fri, Jan 1, 2027');
    expect(waitingLine([beta])).toBeNull();
    expect(waitingLine([acme, { ...acme, groupId: 'g-3', respondBy: '2026-11-30T23:00:00.000Z' }])).toBe('Waiting on you: 2 offers to answer, the first by Mon, Nov 30, 5:00 PM Central.');
    expect(waitingLine([{ ...acme, respondBy: null }])).toBe('Waiting on you: 1 offer to answer.');
  });
  it('Cora\'s card: only for an offer waiting on the student, opening the #offers sheet', () => {
    expect(offerNotice([beta, { ...acme, status: 'accepted' }])).toEqual([]);
    const items = offerNotice([acme]);
    expect(items[0]).toMatchObject({ kind: 'cora', text: "You have an offer from Acme for Data Analyst. It is waiting on you. There's no cost to you." });
    expect(items[1]).toMatchObject({ kind: 'cards', cards: [OPEN_OFFERS_CARD] });
    expect(OPEN_OFFERS_CARD.id).toBe('sheet:offers');
    expect(offerNotice([acme, { ...acme, groupId: 'g-9' }])[0]).toMatchObject({ text: "You have 2 offers waiting on you. There's no cost to you." });
  });
});
