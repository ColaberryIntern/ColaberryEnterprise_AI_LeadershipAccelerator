import { useEffect } from 'react';
import type { ChatItem } from './CoraChat';
import { fetchOffersApi, type CandidateOffer } from './offersApi';
import { cards, cora } from './useRoomLog';

/**
 * Career Prep v27, CP10.4 (kit F7): when the room opens and an offer is waiting on the student (status sent), Cora says
 * so in the chat with one card that opens the #offers sheet ("sheet:offers", handled by usePickCard). An offer the
 * student already answered, or one the employer withdrew, says nothing. If the offers cannot be read, Cora stays quiet:
 * the Offers sheet itself shows the failure when it is opened, so the room never claims "no offers" it did not check.
 */
export const OPEN_OFFERS_CARD = { id: 'sheet:offers', icon: 'briefcase-4-line', title: 'Open my offers', line: 'Accept, talk to your recruiter first, or decline.' };

export function offerNotice(list: CandidateOffer[]): ChatItem[] {
  const open = list.filter((o) => o.status === 'sent');
  if (!open.length) return [];
  const text = open.length === 1
    ? `You have an offer from ${open[0].company} for ${open[0].role}. It is waiting on you. There's no cost to you.`
    : `You have ${open.length} offers waiting on you. There's no cost to you.`;
  return [cora(text), cards('Your offers', [OPEN_OFFERS_CARD])];
}

export function useOfferNotice(push: (...items: ChatItem[]) => void): void {
  useEffect(() => {
    let live = true;
    Promise.resolve().then(fetchOffersApi)
      .then((list) => { if (live && Array.isArray(list)) push(...offerNotice(list)); })
      .catch(() => undefined); // deliberate: see the header (the sheet reports the failure; the chat makes no claim)
    return () => { live = false; };
  }, [push]);
}
